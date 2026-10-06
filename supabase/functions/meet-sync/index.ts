import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createServiceRoleClient } from '../../shared/supabase-client.ts'
import { requireAdmin } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import {
  getAccessToken,
  listConferenceRecordsForSpace,
  listRecordings,
} from '../_shared/google.ts'

const SYNC_BATCH_LIMIT = 20
const EXPIRE_AFTER_DAYS = 7

interface MeetingSession {
  id: string
  lesson_id: string | null
  space_name: string
  created_at: string
}

interface SyncOutcome {
  outcome: 'READY' | 'PENDING' | 'EXPIRED'
}

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', 405)
    }

    const supabase = createServiceRoleClient()

    // Xác thực 1 trong 2 chế độ:
    // - Cron: header x-cron-secret khớp CRON_SECRET -> quét batch.
    // - Thủ công: admin đăng nhập kích "Đồng bộ ngay" -> quét 1 session.
    const cronSecret = Deno.env.get('CRON_SECRET') || ''
    const provided = req.headers.get('x-cron-secret') || ''
    const isCron = Boolean(cronSecret) && Boolean(provided) && provided === cronSecret

    if (!isCron) {
      return await handleManualSync(req, supabase)
    }

    // 2. Quét tối đa 20 sessions PENDING, ưu tiên last_synced_at cũ nhất.
    const { data: sessions, error: sessErr } = await supabase
      .from('meeting_sessions')
      .select('id, lesson_id, space_name, created_at')
      .eq('status', 'PENDING')
      .order('last_synced_at', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true })
      .limit(SYNC_BATCH_LIMIT)
    if (sessErr) return errorResponse(sessErr.message, 500)

    if (!sessions || sessions.length === 0) {
      return jsonResponse({ checked: 0, ready: 0, expired: 0, errors: 0 })
    }

    let accessToken: string
    try {
      accessToken = await getAccessToken()
    } catch (e) {
      return errorResponse(`Google auth failed: ${(e as Error).message}`, 502)
    }

    let ready = 0
    let expired = 0
    let errors = 0
    const now = Date.now()
    const readyLessons: Array<{ lessonId: string; title: string }> = []
    const errorLessons: Array<{ lessonId: string | null; message: string }> = []
    const checkedLessonIds: string[] = []

    for (const s of sessions as MeetingSession[]) {
      if (s.lesson_id && !checkedLessonIds.includes(s.lesson_id)) {
        checkedLessonIds.push(s.lesson_id)
      }
      try {
        const { outcome } = await syncSingleSession(supabase, accessToken, s, now)
        if (outcome === 'READY') {
          ready++
          if (s.lesson_id) readyLessons.push({ lessonId: s.lesson_id, title: '' })
        } else if (outcome === 'EXPIRED') {
          expired++
        }
      } catch (e) {
        errors++
        const errMsg = (e as Error).message?.slice(0, 1000)
        errorLessons.push({ lessonId: s.lesson_id, message: errMsg || 'Unknown error' })
        await supabase
          .from('meeting_sessions')
          .update({
            last_synced_at: new Date().toISOString(),
            last_error: errMsg,
          })
          .eq('id', s.id)
      }
    }

    const summary = { checked: sessions.length, ready, expired, errors }
    // Thông báo Telegram kết quả quét (chạy nền, không chặn response cron)
    const notifyTask = sendSyncReport(supabase, summary, readyLessons, errorLessons, checkedLessonIds)
      .catch((e) => console.error('[meet-sync] notify failed:', (e as Error)?.message))
    // @ts-ignore EdgeRuntime is available in Supabase Edge Functions
    if (typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') {
      EdgeRuntime.waitUntil(notifyTask)
    } else {
      await notifyTask
    }

    return jsonResponse(summary)
  } catch (err: unknown) {
    return errorResponse((err as Error).message || 'Internal Server Error', 500)
  }
})

// Chế độ thủ công: admin kích "Đồng bộ ngay" từ UI, quét đúng 1 session
// của bài học mà không cần đợi cron. Không gửi Telegram (UI đã báo trực tiếp).
async function handleManualSync(
  req: Request,
  supabase: ReturnType<typeof createServiceRoleClient>,
): Promise<Response> {
  try {
    await requireAdmin(req)
  } catch {
    return errorResponse('Unauthorized: admin login or valid cron secret required', 401)
  }

  const body = await req.json().catch(() => ({}))
  const lessonId: string | undefined = body.lesson_id || body.lessonId
  const sessionId: string | undefined = body.session_id || body.sessionId
  if (!lessonId && !sessionId) return errorResponse('Missing lesson_id or session_id', 400)

  let target: MeetingSession | null = null
  if (sessionId) {
    const { data } = await supabase
      .from('meeting_sessions')
      .select('id, lesson_id, space_name, created_at')
      .eq('id', sessionId)
      .maybeSingle()
    target = (data as MeetingSession | null) || null
  } else {
    const { data } = await supabase
      .from('meeting_sessions')
      .select('id, lesson_id, space_name, created_at')
      .eq('lesson_id', lessonId as string)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    target = (data as MeetingSession | null) || null
  }
  if (!target) return errorResponse('Meeting session not found', 404)

  let accessToken: string
  try {
    accessToken = await getAccessToken()
  } catch (e) {
    return errorResponse(`Google auth failed: ${(e as Error).message}`, 502)
  }

  try {
    const { outcome } = await syncSingleSession(supabase, accessToken, target, Date.now())
    return jsonResponse({
      checked: 1,
      ready: outcome === 'READY' ? 1 : 0,
      expired: outcome === 'EXPIRED' ? 1 : 0,
      errors: 0,
      outcome,
      session_id: target.id,
    })
  } catch (e) {
    const errMsg = (e as Error).message?.slice(0, 1000) || 'Unknown error'
    await supabase
      .from('meeting_sessions')
      .update({ last_synced_at: new Date().toISOString(), last_error: errMsg })
      .eq('id', target.id)
    return jsonResponse({ checked: 1, ready: 0, expired: 0, errors: 1, outcome: 'ERROR', message: errMsg })
  }
}

// Quét 1 session: conference records theo space -> recordings ->
// chốt FILE_GENERATED + có file Drive -> READY + gắn lessons.video_url.
async function syncSingleSession(
  supabase: ReturnType<typeof createServiceRoleClient>,
  accessToken: string,
  s: MeetingSession,
  now: number,
): Promise<SyncOutcome> {
  // Lọc conference records theo space.name.
  const records = await listConferenceRecordsForSpace(s.space_name, accessToken)

  // Quá hạn: sau 7 ngày vẫn không có conference record -> EXPIRED.
  if (records.length === 0) {
    const ageMs = now - new Date(s.created_at).getTime()
    if (ageMs > EXPIRE_AFTER_DAYS * 24 * 60 * 60 * 1000) {
      await supabase
        .from('meeting_sessions')
        .update({ status: 'EXPIRED', last_synced_at: new Date().toISOString() })
        .eq('id', s.id)
      return { outcome: 'EXPIRED' }
    }
    await supabase
      .from('meeting_sessions')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', s.id)
    return { outcome: 'PENDING' }
  }

  let bestExportUri: string | null = null
  let bestEndTime = ''

  // Với mỗi conference record, lấy danh sách recordings.
  for (const rec of records) {
    const recs = await listRecordings(rec.name, accessToken)
    for (const r of recs) {
      // UPSERT recording (khóa recording_name).
      await supabase.from('meeting_recordings').upsert(
        {
          session_id: s.id,
          recording_name: r.name,
          conference_record: rec.name,
          state: r.state,
          start_time: r.startTime ? new Date(r.startTime).toISOString() : null,
          end_time: r.endTime ? new Date(r.endTime).toISOString() : null,
          drive_file_id: r.driveDestination?.file || null,
          drive_url: r.driveDestination?.exportUri || null,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'recording_name' },
      )

      // Điều kiện chốt: FILE_GENERATED + có file Drive.
      const exportUri = r.driveDestination?.exportUri
      const hasFile = Boolean(r.driveDestination?.file || exportUri)
      if (r.state === 'FILE_GENERATED' && hasFile && exportUri) {
        const endTime = r.endTime || ''
        if (!bestExportUri || endTime >= bestEndTime) {
          bestExportUri = exportUri
          bestEndTime = endTime
        }
      }
    }
  }

  if (bestExportUri) {
    await supabase
      .from('meeting_sessions')
      .update({
        status: 'READY',
        last_synced_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('id', s.id)

    // TỰ ĐỘNG GẮN BÀI HỌC: đổ exportUri vào lessons.video_url.
    if (s.lesson_id) {
      await supabase
        .from('lessons')
        .update({ video_url: bestExportUri })
        .eq('id', s.lesson_id)
    }
    return { outcome: 'READY' }
  }

  // Chưa có file -> chỉ cập nhật mốc quét.
  await supabase
    .from('meeting_sessions')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', s.id)
  return { outcome: 'PENDING' }
}

function escapeHtmlForTelegram(str: string): string {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Gửi báo cáo kết quả quét vào nhóm Telegram của các lớp liên quan.
// Chỉ gửi khi có lớp liên kết Telegram; không có thì bỏ qua êm.
async function sendSyncReport(
  supabase: ReturnType<typeof createServiceRoleClient>,
  summary: { checked: number; ready: number; expired: number; errors: number },
  readyLessons: Array<{ lessonId: string; title: string }>,
  errorLessons: Array<{ lessonId: string | null; message: string }>,
  checkedLessonIds: string[],
): Promise<void> {
  if (summary.checked === 0) return
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (!botToken) {
    console.warn('[meet-sync] TELEGRAM_BOT_TOKEN not set, skip report')
    return
  }
  if (checkedLessonIds.length === 0) return

  // Resolve lessons -> chapters -> classes (1 hop)
  const { data: lessons } = await supabase
    .from('lessons')
    .select('id, title, chapters(class_id, classes(id, name))')
    .in('id', checkedLessonIds)
  const lessonMap = new Map<string, { title: string; classId: string | null; className: string }>()
  const classIds: string[] = []
  for (const l of (lessons || []) as Array<{ id: string; title: string; chapters: { class_id: string; classes: { id: string; name: string } | null } | null }>) {
    const classId = l.chapters?.class_id || null
    const className = l.chapters?.classes?.name || 'N/A'
    lessonMap.set(l.id, { title: l.title, classId, className })
    if (classId && !classIds.includes(classId)) classIds.push(classId)
  }
  if (classIds.length === 0) return

  const { data: tgConfigs } = await supabase
    .from('telegram_configs')
    .select('chat_id')
    .in('class_id', classIds)
    .eq('is_enabled', true)
  const targetChatIds = [...new Set((tgConfigs || []).map((c: { chat_id: string }) => c.chat_id).filter(Boolean))]
  if (targetChatIds.length === 0) return

  const timeStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
  const lines: string[] = [
    `🎥 <b>ĐỒNG BỘ GOOGLE MEET</b>`,
    `⏰ <b>Thời gian:</b> ${escapeHtmlForTelegram(timeStr)}`,
    `🔍 <b>Đã quét:</b> ${summary.checked} buổi`,
  ]
  if (summary.ready > 0) {
    lines.push(`✅ <b>Có video mới:</b> ${summary.ready} buổi`)
    for (const r of readyLessons.slice(0, 10)) {
      const info = lessonMap.get(r.lessonId)
      const t = escapeHtmlForTelegram(info?.title || r.lessonId)
      const c = escapeHtmlForTelegram(info?.className || '')
      lines.push(`   • ${t}${c && c !== 'N/A' ? ` (${c})` : ''}`)
    }
    if (readyLessons.length > 10) lines.push(`   • ... và ${readyLessons.length - 10} buổi khác`)
  }
  const pending = summary.checked - summary.ready - summary.expired - summary.errors
  if (pending > 0) lines.push(`⏳ <b>Đang chờ bản ghi:</b> ${pending} buổi`)
  if (summary.expired > 0) lines.push(`❌ <b>Hết hạn (quá 7 ngày):</b> ${summary.expired} buổi`)
  if (summary.errors > 0) {
    lines.push(`⚠️ <b>Lỗi:</b> ${summary.errors} buổi`)
    for (const e of errorLessons.slice(0, 5)) {
      const info = e.lessonId ? lessonMap.get(e.lessonId) : null
      const t = escapeHtmlForTelegram(info?.title || e.lessonId || 'Không rõ buổi')
      lines.push(`   • ${t}: ${escapeHtmlForTelegram(e.message.slice(0, 120))}`)
    }
  }

  const message = lines.join('\n')
  await Promise.all(targetChatIds.map(async (chatId) => {
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
      })
    } catch (e) {
      console.error('[meet-sync] send to chat failed:', chatId, (e as Error)?.message)
    }
  }))
}
