/**
 * test-student-intro-first-login.mjs — Cờ auto tour giới thiệu chỉ dùng 1 lần.
 *
 * Chạy: node supabase/scripts/test-student-intro-first-login.mjs
 *
 * Gồm 2 lớp:
 *  1. Contract tĩnh: migration + login Edge Function phải giữ đúng bất biến
 *     (default true, backfill tài khoản cũ, CAS atomically, STUDENT only, fail closed).
 *  2. Oracle DB thật (nếu có container Postgres local `educenter-postgres`):
 *     tạo DATABASE TẠM, dựng schema tối thiểu auth.users/profiles/user_activity_logs,
 *     chạy chính file migration, seed fixture rồi kiểm tra kết quả backfill.
 *     Không dùng dữ liệu thật; database tạm bị drop sau test.
 *
 * Nếu không có Docker/Postgres local, phần 2 được skip rõ ràng — phần 1 vẫn chạy.
 */

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptsDir, '..', '..')
const migrationPath = resolve(repoRoot, 'supabase/migrations/20261031000001_student_intro_first_login.sql')
const loginPath = resolve(repoRoot, 'supabase/functions/login/index.ts')

const migration = readFileSync(migrationPath, 'utf-8')
const loginSrc = readFileSync(loginPath, 'utf-8')

let passed = 0
let failed = 0

function check(name, condition, extra = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.log(`  ✗ ${name}${extra ? ` -> ${extra}` : ''}`)
  }
}

console.log('\n=== 1. Migration contract ===')
{
  check(
    'thêm cột auto_intro_pending BOOLEAN NOT NULL DEFAULT TRUE',
    /add\s+column\s+if\s+not\s+exists\s+auto_intro_pending\s+boolean\s+not\s+null\s+default\s+true/i.test(migration)
  )
  check('có backfill UPDATE public.profiles', /update\s+public\.profiles\s+p/i.test(migration))
  check('backfill dùng auth.users.last_sign_in_at', /auth\.users[\s\S]*last_sign_in_at\s+is\s+not\s+null/i.test(migration))
  check('backfill dùng log LOGIN', /user_activity_logs[\s\S]*action\s*=\s*'LOGIN'/i.test(migration))
  check('backfill dùng seen_tours (kể cả khi rỗng thì không khớp)', /cardinality\(p\.seen_tours\)/i.test(migration))
  check('backfill chỉ hạ true -> false (không bật lại)', /set\s+auto_intro_pending\s*=\s*false[\s\S]*where\s+p\.auto_intro_pending\s*=\s*true/i.test(migration))
}

console.log('\n=== 2. Login Edge Function contract ===')
{
  check('profile query select auto_intro_pending', /select\('id, username, full_name, role, class_id, is_locked, seen_tours, auto_intro_pending'\)/.test(loginSrc))
  check('autoIntro mặc định false (fail closed)', /let\s+autoIntro\s*=\s*false/.test(loginSrc))
  check('chỉ xét role STUDENT', /profile\.role\s*===\s*'STUDENT'\s*&&\s*\(profile as any\)\.auto_intro_pending\s*===\s*true/.test(loginSrc))
  check('CAS update WHERE auto_intro_pending = true', /\.update\(\{\s*auto_intro_pending:\s*false\s*\}\)[\s\S]*?\.eq\('auto_intro_pending',\s*true\)/.test(loginSrc))
  check('CAS giới hạn role STUDENT ở câu update', /\.eq\('role',\s*'STUDENT'\)/.test(loginSrc))
  check('CAS trả row đã update (.select + maybeSingle)', /\.select\('id'\)[\s\S]*?\.maybeSingle\(\)/.test(loginSrc))
  check('chỉ claim autoIntro khi update trúng row', /else\s+if\s+\(consumed\)\s*\{\s*autoIntro\s*=\s*true/.test(loginSrc))
  check('lỗi consume chỉ warn, không throw/chặn login', /if\s+\(consumeError\)\s*\{[\s\S]*?console\.warn\([\s\S]*?\}\s*else\s+if\s+\(consumed\)/.test(loginSrc))
  check('response user có autoIntro', /classIds,\s*autoIntro,\s*seenTours:/.test(loginSrc))

  const patchBranchEnd = loginSrc.indexOf("if (req.method !== 'POST')")
  const patchBranch = patchBranchEnd > 0 ? loginSrc.slice(0, patchBranchEnd) : loginSrc
  check('PATCH seen_tours không đụng cờ auto_intro_pending', !patchBranch.includes('auto_intro_pending'))

  const authSuccessIdx = loginSrc.indexOf('sessionData = retrySignIn.data')
  const consumeIdx = loginSrc.indexOf('update({ auto_intro_pending: false })')
  check('chỉ tiêu thụ cờ SAU khi xác thực thành công', authSuccessIdx >= 0 && consumeIdx > authSuccessIdx)
}

console.log('\n=== 3. Oracle backfill trên Postgres tạm (nếu có) ===')
{
  const container = 'educenter-postgres'
  let dockerReady = false
  try {
    const running = execFileSync('docker', ['inspect', container, '--format', '{{.State.Running}}'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim()
    dockerReady = running === 'true'
  } catch {
    dockerReady = false
  }

  if (!dockerReady) {
    console.log('  SKIP: không tìm thấy container Postgres local đang chạy; bỏ qua oracle DB.')
  } else {
    const dbName = `intro_test_${process.pid}_${Date.now()}`.replace(/[^a-z0-9_]/g, '')

    function psql(db, sql) {
      return execFileSync(
        'docker',
        ['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-U', 'postgres', '-d', db],
        { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      )
    }

    function createDatabase() {
      psql('postgres', `create database ${dbName};\n`)
    }

    function dropDatabase() {
      try {
        psql('postgres', `drop database if exists ${dbName};\n`)
      } catch (err) {
        console.log(`  WARN: không drop được database tạm ${dbName}: ${err.message}`)
      }
    }

    const setupSql = `
create schema if not exists auth;

create table auth.users (
  id uuid primary key,
  last_sign_in_at timestamptz
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'STUDENT',
  seen_tours text[] not null default '{}'
);

create table public.user_activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);

insert into auth.users (id, last_sign_in_at) values
  ('00000000-0000-4000-8000-000000000001', now()),   -- cũ: có last_sign_in_at, seen_tours rỗng
  ('00000000-0000-4000-8000-000000000002', null),    -- cũ: chỉ có log LOGIN
  ('00000000-0000-4000-8000-000000000003', null),    -- cũ: chỉ có seen_tours
  ('00000000-0000-4000-8000-000000000004', null),    -- mới: chưa từng login
  ('00000000-0000-4000-8000-000000000005', null);    -- TEACHER chưa login, có activity khác

insert into public.profiles (id, role, seen_tours) values
  ('00000000-0000-4000-8000-000000000001', 'STUDENT', '{}'),
  ('00000000-0000-4000-8000-000000000002', 'STUDENT', '{}'),
  ('00000000-0000-4000-8000-000000000003', 'STUDENT', '{student-dashboard}'),
  ('00000000-0000-4000-8000-000000000004', 'STUDENT', '{}'),
  ('00000000-0000-4000-8000-000000000005', 'TEACHER', '{}');

insert into public.user_activity_logs (user_id, action) values
  ('00000000-0000-4000-8000-000000000002', 'LOGIN'),
  ('00000000-0000-4000-8000-000000000005', 'LESSON_VIEW');
`

    try {
      createDatabase()
      psql(dbName, setupSql)
      psql(dbName, migration)
      // Idempotent: chạy lại lần 2 không lỗi, không bật lại cờ đã hạ.
      psql(dbName, migration)

      const raw = psql(
        dbName,
        `select json_object_agg(id::text, auto_intro_pending order by id::text)::text from public.profiles;\n`
      ).trim()
      const result = JSON.parse(raw)

      const expected = {
        '00000000-0000-4000-8000-000000000001': false,
        '00000000-0000-4000-8000-000000000002': false,
        '00000000-0000-4000-8000-000000000003': false,
        '00000000-0000-4000-8000-000000000004': true,
        '00000000-0000-4000-8000-000000000005': true
      }

      check(
        'tài khoản cũ có last_sign_in_at + seen_tours rỗng => false',
        result['00000000-0000-4000-8000-000000000001'] === false
      )
      check(
        'tài khoản cũ chỉ có log LOGIN + seen_tours rỗng => false',
        result['00000000-0000-4000-8000-000000000002'] === false
      )
      check(
        'tài khoản cũ chỉ có seen_tours => false',
        result['00000000-0000-4000-8000-000000000003'] === false
      )
      check(
        'tài khoản chưa từng login + seen_tours rỗng => true (first login)',
        result['00000000-0000-4000-8000-000000000004'] === true
      )
      check(
        'tài khoản TEACHER chưa login + activity khác: cờ vẫn true (login sẽ không claim)',
        result['00000000-0000-4000-8000-000000000005'] === true
      )
      check('toàn bộ fixture khớp oracle', JSON.stringify(result) === JSON.stringify(expected))

      const consumeStudent = `
with consumed as (
  update public.profiles
  set auto_intro_pending = false
  where id = '00000000-0000-4000-8000-000000000004'
    and role = 'STUDENT'
    and auto_intro_pending = true
  returning 1
)
select count(*) from consumed;
`
      const firstConsume = psql(dbName, consumeStudent).trim()
      check('login đầu tiên của STUDENT tiêu thụ cờ đúng 1 lần (row count = 1)', firstConsume === '1', `got ${firstConsume}`)
      const secondConsume = psql(dbName, consumeStudent).trim()
      check('login sau / concurrent login không tiêu thụ lại (row count = 0)', secondConsume === '0', `got ${secondConsume}`)

      const consumeTeacher = `
with consumed as (
  update public.profiles
  set auto_intro_pending = false
  where id = '00000000-0000-4000-8000-000000000005'
    and role = 'STUDENT'
    and auto_intro_pending = true
  returning 1
)
select count(*) from consumed;
`
      const teacherConsume = psql(dbName, consumeTeacher).trim()
      check('CAS không tiêu thụ cờ của TEACHER (STUDENT only)', teacherConsume === '0', `got ${teacherConsume}`)
      const teacherFlag = psql(
        dbName,
        `select auto_intro_pending from public.profiles where id = '00000000-0000-4000-8000-000000000005';\n`
      ).trim()
      check('cờ của TEACHER vẫn nguyên true sau CAS sai role', teacherFlag === 't', `got ${teacherFlag}`)

      psql(
        dbName,
        `insert into auth.users (id) values ('00000000-0000-4000-8000-000000000006');
insert into public.profiles (id) values ('00000000-0000-4000-8000-000000000006');
`
      )
      const newRow = psql(
        dbName,
        `select auto_intro_pending from public.profiles where id = '00000000-0000-4000-8000-000000000006';\n`
      ).trim()
      check('profile tạo sau migration mặc định true', newRow === 't', `got ${newRow}`)
    } catch (err) {
      failed++
      console.log(`  ✗ Oracle DB lỗi: ${err.stderr || err.message}`)
    } finally {
      dropDatabase()
    }
  }
}

console.log('\n========================================')
console.log(`Kết quả: ${passed} passed, ${failed} failed`)
console.log('========================================\n')

if (failed > 0) process.exit(1)
