/**
 * Verify READ-ONLY cho tính năng chia sẻ báo cáo, chạy SAU KHI deploy.
 *
 * Mục đích: xác nhận migration đã lên cloud, schema cache đã biết bảng, và
 * function GET còn sống — TRƯỚC KHI tạo link thật (tránh lặp lại bug production:
 * functions deploy trước migration khiến PostgREST trả PGRST205).
 *
 * TUYỆT ĐỐI KHÔNG POST / DELETE / sửa dữ liệu. Không in token/key ra output.
 * Không chứa token trong file này: mọi credential (nếu cần) lấy từ biến môi trường.
 *
 * Cách chạy:
 *   # Chỉ kiểm tra local (không cần mạng):
 *   node supabase/scripts/verify-student-report-shares.mjs
 *
 *   # Kiểm tra cả cloud (read-only):
 *   SUPABASE_URL=https://<project-ref>.supabase.co \
 *   SUPABASE_ANON_KEY=<anon-key-public> \
 *   node supabase/scripts/verify-student-report-shares.mjs
 *
 *   # Thêm kiểm tra function có auth (token admin, chỉ dùng để GET list):
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_ADMIN_TOKEN=<admin-jwt> \
 *   node supabase/scripts/verify-student-report-shares.mjs
 *
 * Ngữ nghĩa kết quả (siết sau review trước deploy):
 *   - PASS: đã kết luận được là tốt.
 *   - FAIL: đã kết luận được là xấu (vd PGRST205, 503 SETUP_REQUIRED).
 *   - INFO: kết luận được một phần, KHÔNG dùng để chứng minh cloud sẵn sàng.
 *     Vd function chưa auth trả 401 chỉ chứng minh đã deploy + auth guard,
 *     KHÔNG chứng minh bảng tồn tại.
 *   - INCONCLUSIVE: không kết luận được (vd thiếu anon key, lỗi mạng, HTTP lạ).
 *   - SKIP: check không chạy (chỉ khi không set SUPABASE_URL).
 *
 * Verdict:
 *   - Có FAIL -> exit 1, in CHƯA ĐẠT.
 *   - Đã set SUPABASE_URL nhưng schema probe chưa PASS hoặc còn INCONCLUSIVE
 *     -> exit 1, in CHƯA XÁC NHẬN CLOUD (tuyệt đối không in ĐẠT).
 *   - Đã set SUPABASE_URL, schema probe PASS, không còn INCONCLUSIVE
 *     -> exit 0, in ĐẠT CLOUD.
 *   - Chỉ local (không set SUPABASE_URL): local ok -> exit 0, in ĐẠT LOCAL và
 *     ghi rõ KHÔNG xác nhận cloud. Local FAIL -> exit 1.
 *
 * Nếu FAIL ở bước schema cache / function 503 SETUP_REQUIRED, thứ tự sửa trên cloud:
 *   1. npx supabase db push            (apply migration 20261024000000 trước)
 *   2. npx supabase functions deploy student-report-shares student-history
 *   3. Chạy lại script này cho tới khi ĐẠT CLOUD rồi mới tạo link.
 */

import { readFileSync, readdirSync } from 'node:fs'

const results = []
function record(name, outcome, detail = '') {
  results.push({ name, outcome, detail })
  const mark = outcome === 'PASS' ? '✓' : outcome === 'FAIL' ? '✗' : outcome === 'INFO' ? 'i' : '–'
  console.log(`[${outcome}] ${mark} ${name}${detail ? ` — ${detail}` : ''}`)
}

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '')
const ANON_KEY = process.env.SUPABASE_ANON_KEY || ''
const ADMIN_TOKEN = process.env.SUPABASE_ADMIN_TOKEN || ''
const DUMMY_STUDENT_ID = '00000000-0000-4000-8000-000000000000'

/** Đọc code/message lỗi PostgREST/Edge mà không throw khi body không phải JSON. */
async function readErrorBody(res) {
  try {
    const body = await res.clone().json()
    return { code: String(body?.code || ''), message: String(body?.message || body?.error || '') }
  } catch {
    return { code: '', message: '' }
  }
}

/* --- 1. Local: migration discover + FK trỏ tới bảng thật --- */
try {
  const migDir = new URL('../migrations/', import.meta.url)
  const files = readdirSync(migDir).filter((f) => /^\d{14}_.*\.sql$/.test(f)).sort()
  const shareMig = '20261024000000_student_report_shares.sql'
  record('migration share discover được (tên đúng quy ước CLI)', files.includes(shareMig) ? 'PASS' : 'FAIL', files.includes(shareMig) ? shareMig : 'không thấy file')
  record('migration share là mới nhất (deploy sau cùng)', files[files.length - 1] === shareMig ? 'PASS' : 'FAIL', files[files.length - 1] || '(không có migration)')
  const migration = readFileSync(new URL(`../migrations/${shareMig}`, import.meta.url), 'utf8')
  const initial = readFileSync(new URL('../migrations/20260801000000_initial_schema.sql', import.meta.url), 'utf8')
  const fkOk = /references public\.profiles\(id\)/.test(migration) &&
    /references public\.classes\(id\)/.test(migration) &&
    /CREATE TABLE IF NOT EXISTS public\.profiles/.test(initial) &&
    /CREATE TABLE IF NOT EXISTS public\.classes/.test(initial)
  record('migration share FK trỏ tới bảng thật (profiles/classes)', fkOk ? 'PASS' : 'FAIL')
} catch (err) {
  record('kiểm tra migration local', 'FAIL', `không đọc được file: ${err.message}`)
}

/* --- 2. Remote read-only: PostgREST schema cache biết bảng? --- */
let schemaOutcome = 'SKIP'
if (!SUPABASE_URL) {
  record('schema cache cloud (cần SUPABASE_URL)', 'SKIP', 'chưa set SUPABASE_URL, chỉ kiểm tra local')
} else if (!ANON_KEY) {
  schemaOutcome = 'INCONCLUSIVE'
  record('schema cache cloud (cần SUPABASE_ANON_KEY)', 'INCONCLUSIVE', 'thiếu anon key nên không kết luận được cloud')
} else {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/student_report_shares?select=id&limit=1`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    })
    const { code, message } = await readErrorBody(res)
    if (res.status === 200) {
      schemaOutcome = 'PASS'
      record('schema cache cloud biết bảng student_report_shares', 'PASS', 'PostgREST trả 200 (RLS lọc row, không lỗi)')
    } else if (res.status === 404 && code === 'PGRST205') {
      schemaOutcome = 'FAIL'
      record('schema cache cloud biết bảng student_report_shares', 'FAIL', 'PGRST205: migration chưa apply lên cloud')
    } else if ((res.status === 401 || res.status === 403) &&
      (code === '42501' || message.toLowerCase().includes('permission denied'))) {
      // Quan hệ ĐÃ có trong schema cache: PostgREST tìm thấy bảng rồi mới chặn quyền.
      // (RLS không policy / revoke anon cũng cho dạng này, khác hẳn PGRST205.)
      schemaOutcome = 'PASS'
      record('schema cache cloud biết bảng student_report_shares', 'PASS', `bảng tồn tại nhưng bị chặn quyền (HTTP ${res.status}, code ${code || 'permission denied'})`)
    } else {
      schemaOutcome = 'INCONCLUSIVE'
      record('schema cache cloud biết bảng student_report_shares', 'INCONCLUSIVE', `không kết luận được (HTTP ${res.status}${code ? `, code ${code}` : ''})`)
    }
  } catch (err) {
    schemaOutcome = 'INCONCLUSIVE'
    record('schema cache cloud', 'INCONCLUSIVE', `không gọi được PostgREST: ${err.message}`)
  }
}

/* --- 3. Remote read-only: function GET còn sống? (không POST/DELETE) --- */
if (!SUPABASE_URL) {
  record('function student-report-shares GET (cần SUPABASE_URL)', 'SKIP', 'chưa set SUPABASE_URL')
} else {
  try {
    const headers = ADMIN_TOKEN ? { Authorization: `Bearer ${ADMIN_TOKEN}` } : {}
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/student-report-shares?studentId=${DUMMY_STUDENT_ID}`,
      { headers },
    )
    const { code } = await readErrorBody(res)
    if (!ADMIN_TOKEN) {
      if (res.status === 401) {
        // INFO, không phải PASS: chỉ chứng minh function đã deploy + auth guard
        // (verify_jwt=true) đang chặn, KHÔNG chứng minh bảng tồn tại.
        record('function student-report-shares GET (chưa auth)', 'INFO', 'đã deploy, gateway chặn đúng 401; bảng phải do schema probe kết luận')
      } else {
        record('function student-report-shares GET (chưa auth)', 'INCONCLUSIVE', `không kết luận được (HTTP ${res.status})`)
      }
    } else if (res.status === 200) {
      record('function student-report-shares GET (có admin token)', 'PASS', 'trả 200, bảng đã sẵn sàng')
    } else if (res.status === 503 && code === 'SETUP_REQUIRED') {
      record('function student-report-shares GET (có admin token)', 'FAIL', '503 SETUP_REQUIRED: migration chưa apply')
    } else {
      record('function student-report-shares GET (có admin token)', 'INCONCLUSIVE', `token không phải admin/hết hạn hoặc HTTP lạ (HTTP ${res.status})`)
    }
  } catch (err) {
    record('function student-report-shares GET', 'INCONCLUSIVE', `không gọi được function: ${err.message}`)
  }
}

/* --- Verdict --- */
const failed = results.filter((r) => r.outcome === 'FAIL')
const inconclusive = results.filter((r) => r.outcome === 'INCONCLUSIVE')
const nPass = results.filter((r) => r.outcome === 'PASS').length
console.log(`\nKết quả verify: ${nPass} PASS, ${failed.length} FAIL, ${inconclusive.length} INCONCLUSIVE, ${results.filter((r) => r.outcome === 'INFO' || r.outcome === 'SKIP').length} INFO/SKIP`)

if (failed.length > 0) {
  console.log('CHƯA ĐẠT: đừng tạo link chia sẻ. Sửa theo thứ tự: db push -> deploy functions -> chạy lại script.')
  process.exit(1)
}
if (SUPABASE_URL) {
  if (schemaOutcome !== 'PASS' || inconclusive.length > 0) {
    const names = inconclusive.map((r) => r.name).join('; ') || 'schema probe chưa PASS'
    console.log(`CHƯA XÁC NHẬN CLOUD: remote chưa kiểm chứng đủ (${names}). Không được coi là sẵn sàng, không tạo link.`)
    process.exit(1)
  }
  console.log('ĐẠT CLOUD: migration đã apply, schema cache biết bảng, function sẵn sàng. Có thể tạo link chia sẻ.')
  process.exit(0)
}
console.log('ĐẠT LOCAL — KHÔNG xác nhận cloud: chỉ kiểm tra file local, chưa kiểm chứng remote. Muốn xác nhận cloud phải chạy lại với SUPABASE_URL + SUPABASE_ANON_KEY.')
