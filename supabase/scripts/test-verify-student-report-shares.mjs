/**
 * Test DYNAMIC cho supabase/scripts/verify-student-report-shares.mjs:
 * chạy script thật với stub server local (không mạng, không cloud, không token thật),
 * assert exit code + output theo từng kịch bản.
 *
 * Chạy: node supabase/scripts/test-verify-student-report-shares.mjs
 */

import { spawn } from 'node:child_process'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const scriptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'verify-student-report-shares.mjs')

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

function runVerify(envOverrides) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env }
    delete env.SUPABASE_URL
    delete env.SUPABASE_ANON_KEY
    delete env.SUPABASE_ADMIN_TOKEN
    Object.assign(env, envOverrides)
    const proc = spawn(process.execPath, [scriptPath], { env })
    let out = ''
    proc.stdout.on('data', (d) => { out += d })
    proc.stderr.on('data', (d) => { out += d })
    const timer = setTimeout(() => {
      proc.kill()
      reject(new Error('verify script timeout'))
    }, 15000)
    proc.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, out })
    })
    proc.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

const behavior = {
  rest: { status: 200, body: [] },
  fn: { status: 401, body: { error: 'Unauthorized' } },
}
const server = http.createServer((req, res) => {
  const b = req.url.startsWith('/rest/v1/student_report_shares') ? behavior.rest : behavior.fn
  res.writeHead(b.status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(b.body))
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`
const ANON = 'test-anon-key'
const ADMIN = 'test-admin-token'

try {
  // 1. Chỉ local: ĐẠT LOCAL, không xác nhận cloud, exit 0.
  {
    const r = await runVerify({})
    check('chỉ local -> exit 0', r.code === 0, `code=${r.code}`)
    check('chỉ local -> in ĐẠT LOCAL', r.out.includes('ĐẠT LOCAL'), r.out)
    check('chỉ local -> ghi rõ KHÔNG xác nhận cloud', r.out.includes('KHÔNG xác nhận cloud'), r.out)
    check('chỉ local -> không in ĐẠT CLOUD', !r.out.includes('ĐẠT CLOUD'), r.out)
  }

  // 2. Có URL nhưng thiếu anon key: không kết luận được cloud -> exit nonzero, không ĐẠT.
  {
    const r = await runVerify({ SUPABASE_URL: base })
    check('URL nhưng thiếu anon key -> exit nonzero', r.code !== 0, `code=${r.code}`)
    check('URL nhưng thiếu anon key -> không ĐẠT CLOUD', !r.out.includes('ĐẠT CLOUD'), r.out)
    check('URL nhưng thiếu anon key -> CHƯA XÁC NHẬN CLOUD', r.out.includes('CHƯA XÁC NHẬN CLOUD'), r.out)
  }

  // 3. Schema probe 403 + 42501/permission denied = bảng TỒN TẠI -> ĐẠT CLOUD (fn 401 chỉ là INFO).
  {
    behavior.rest = { status: 403, body: { code: '42501', message: 'permission denied for table student_report_shares' } }
    behavior.fn = { status: 401, body: { error: 'Unauthorized' } }
    const r = await runVerify({ SUPABASE_URL: base, SUPABASE_ANON_KEY: ANON })
    check('403 + 42501 permission denied -> exit 0', r.code === 0, `code=${r.code}\n${r.out}`)
    check('403 + 42501 -> ĐẠT CLOUD', r.out.includes('ĐẠT CLOUD'), r.out)
  }

  // 4. Schema probe PGRST205 = migration chưa apply -> FAIL, exit 1.
  {
    behavior.rest = { status: 404, body: { code: 'PGRST205', message: "Could not find the table 'public.student_report_shares' in the schema cache" } }
    behavior.fn = { status: 401, body: { error: 'Unauthorized' } }
    const r = await runVerify({ SUPABASE_URL: base, SUPABASE_ANON_KEY: ANON })
    check('PGRST205 -> exit 1', r.code === 1, `code=${r.code}`)
    check('PGRST205 -> không ĐẠT CLOUD', !r.out.includes('ĐẠT CLOUD'), r.out)
  }

  // 5. Schema probe HTTP lạ (500) = không kết luận được -> exit nonzero, không ĐẠT.
  {
    behavior.rest = { status: 500, body: {} }
    behavior.fn = { status: 401, body: { error: 'Unauthorized' } }
    const r = await runVerify({ SUPABASE_URL: base, SUPABASE_ANON_KEY: ANON })
    check('schema probe 500 -> exit nonzero', r.code !== 0, `code=${r.code}`)
    check('schema probe 500 -> không ĐẠT CLOUD', !r.out.includes('ĐẠT CLOUD'), r.out)
    check('schema probe 500 -> CHƯA XÁC NHẬN CLOUD', r.out.includes('CHƯA XÁC NHẬN CLOUD'), r.out)
  }

  // 6. Schema probe 200 + fn 401 (INFO) -> ĐẠT CLOUD.
  {
    behavior.rest = { status: 200, body: [] }
    behavior.fn = { status: 401, body: { error: 'Unauthorized' } }
    const r = await runVerify({ SUPABASE_URL: base, SUPABASE_ANON_KEY: ANON })
    check('schema 200 + fn 401 INFO -> exit 0', r.code === 0, `code=${r.code}\n${r.out}`)
    check('schema 200 + fn 401 INFO -> ĐẠT CLOUD', r.out.includes('ĐẠT CLOUD'), r.out)
  }

  // 7. Có admin token nhưng fn 503 SETUP_REQUIRED -> FAIL, exit 1.
  {
    behavior.rest = { status: 200, body: [] }
    behavior.fn = { status: 503, body: { code: 'SETUP_REQUIRED', error: 'Report sharing is not initialized yet.' } }
    const r = await runVerify({ SUPABASE_URL: base, SUPABASE_ANON_KEY: ANON, SUPABASE_ADMIN_TOKEN: ADMIN })
    check('fn 503 SETUP_REQUIRED -> exit 1', r.code === 1, `code=${r.code}`)
    check('fn 503 SETUP_REQUIRED -> không ĐẠT CLOUD', !r.out.includes('ĐẠT CLOUD'), r.out)
  }

  // 8. Có admin token, schema 200, fn 200 -> ĐẠT CLOUD.
  {
    behavior.rest = { status: 200, body: [] }
    behavior.fn = { status: 200, body: { success: true, data: { shares: [] } } }
    const r = await runVerify({ SUPABASE_URL: base, SUPABASE_ANON_KEY: ANON, SUPABASE_ADMIN_TOKEN: ADMIN })
    check('schema 200 + fn 200 -> exit 0', r.code === 0, `code=${r.code}\n${r.out}`)
    check('schema 200 + fn 200 -> ĐẠT CLOUD', r.out.includes('ĐẠT CLOUD'), r.out)
  }

  // 9. Có admin token nhưng fn 403 (token không phải admin) = không kết luận được -> exit nonzero.
  {
    behavior.rest = { status: 200, body: [] }
    behavior.fn = { status: 403, body: { error: 'Forbidden' } }
    const r = await runVerify({ SUPABASE_URL: base, SUPABASE_ANON_KEY: ANON, SUPABASE_ADMIN_TOKEN: ADMIN })
    check('fn 403 token lạ -> exit nonzero', r.code !== 0, `code=${r.code}`)
    check('fn 403 token lạ -> không ĐẠT CLOUD', !r.out.includes('ĐẠT CLOUD'), r.out)
  }
} finally {
  server.close()
}

console.log(`\nKết quả: ${passed} PASS, ${failed} FAIL`)
if (failed > 0) process.exit(1)
console.log('TẤT CẢ KIỂM THỬ VERIFY SHARE ĐỀU ĐẠT! ✅')
