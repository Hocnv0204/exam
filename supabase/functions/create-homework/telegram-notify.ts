type HomeworkNotice = {
  id: string
  lesson_id: string
  title: string
  type?: string
  is_published: boolean
  deadline?: string | null
}

export function homeworkNotificationEvent(previous: Pick<HomeworkNotice, 'is_published' | 'deadline'> | null, current: HomeworkNotice): 'published' | 'deadline' | null {
  if (current.is_published !== true) return null
  if (!previous || previous.is_published === false) return 'published'
  const normalized = (value?: string | null) => value ? new Date(value).getTime() : null
  return normalized(previous.deadline) !== normalized(current.deadline) ? 'deadline' : null
}

// Bound input BEFORE escaping, so truncation cannot split an HTML entity or tag.
function safeText(value: unknown) {
  return Array.from(String(value ?? '')).slice(0, 250).join('')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function formatHomeworkNotification(homework: HomeworkNotice, className: string, event: 'published' | 'deadline', targeted: boolean) {
  const deadline = homework.deadline ? new Date(homework.deadline) : null
  const deadlineText = deadline && Number.isFinite(deadline.getTime())
    ? deadline.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' (giờ Việt Nam)'
    : 'Không có hạn nộp'
  return `${event === 'deadline' ? '⏰ <b>CẬP NHẬT HẠN NỘP</b>' : '📣 <b>BÀI MỚI ĐƯỢC CÔNG BỐ</b>'}\n` +
    `🏫 <b>Lớp:</b> ${safeText(className)}\n` +
    `📝 <b>${homework.type === 'EXAM' ? 'Bài thi' : 'Bài tập'}:</b> ${safeText(homework.title)}\n` +
    `${targeted ? 'Giao cho một số học sinh.' : 'Giao cho lớp.'}\n` +
    `⏳ <b>Hạn nộp:</b> ${deadlineText}`
}

export async function notifyHomeworkTelegram(client: any, homework: HomeworkNotice, event: 'published' | 'deadline', options: {
  token?: string
  fetcher?: typeof fetch
} = {}) {
  try {
    const token = options.token
    if (!token || homework.is_published !== true || !homework.lesson_id) return
    const { data: lesson, error: lessonError } = await client.from('lessons')
      .select('chapters(class_id, classes(name))').eq('id', homework.lesson_id).maybeSingle()
    if (lessonError) throw new Error('lesson lookup')
    const chapter = lesson?.chapters
    const classId = chapter?.class_id
    if (!classId) return
    const { data: configs, error: configError } = await client.from('telegram_configs')
      .select('class_id, chat_id, is_enabled').eq('class_id', classId).eq('is_enabled', true)
    if (configError) throw new Error('config lookup')
    const chats = [...new Set<string>((configs || [])
      .filter((c: any) => c.class_id === classId && c.is_enabled === true && c.chat_id)
      .map((c: any) => String(c.chat_id)))]
    if (!chats.length) return
    const { data: targets, error: targetError } = await client.from('homework_targets')
      .select('student_id').eq('homework_id', homework.id).limit(1)
    if (targetError) throw new Error('target lookup')
    const text = formatHomeworkNotification(homework, chapter.classes?.name || 'Lớp học', event, !!targets?.length)
    await Promise.all(chats.map(async (chatId) => {
      try {
        const response = await (options.fetcher || fetch)(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
          signal: AbortSignal.timeout(10000),
        })
        // Do not log response bodies, URLs or thrown fetch errors: they may contain the token.
        if (!response.ok) console.warn('[create-homework] Telegram HTTP failure:', response.status)
      } catch (_) {
        console.warn('[create-homework] Telegram delivery failed')
      }
    }))
  } catch (_) {
    console.warn('[create-homework] Telegram notification skipped: lookup failed')
  }
}

export function scheduleHomeworkTelegram(client: any, homework: HomeworkNotice, previous: Pick<HomeworkNotice, 'is_published' | 'deadline'> | null = null) {
  try {
    const event = homeworkNotificationEvent(previous, homework)
    if (!event) return
    // No synchronous fallback: notification delivery must never delay a successful write response.
    const runtime = (globalThis as any).EdgeRuntime
    const token = (globalThis as any).Deno?.env.get('TELEGRAM_BOT_TOKEN')
    if (!token || typeof runtime?.waitUntil !== 'function') return
    runtime.waitUntil(notifyHomeworkTelegram(client, homework, event, { token }))
  } catch (_) {
    console.warn('[create-homework] Telegram scheduling failed')
  }
}
