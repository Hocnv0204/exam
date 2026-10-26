/**
 * Edge Function quản lý học thử (ADMIN ONLY) — module "Quản lý học thử".
 *
 * Vai trò: điểm quản trị tập trung cho video/bài học công khai. Nguồn public
 * vẫn là `create-lesson?isTrial=true` (không đổi): chỉ bài có is_trial=true
 * mới mở công khai, kèm homework đã xuất bản. Function này KHÔNG phục vụ
 * public, chỉ ADMIN gọi qua FE (không query PostgREST trực tiếp từ FE).
 *
 * Ngữ nghĩa dữ liệu (khóa với FE):
 * - "Thu hồi" (revoke) = chỉ đặt is_trial=false, GIỮ NGUYÊN video_url nội bộ.
 *   Link công khai cũ mất hiệu lực vì public source lọc is_trial=true.
 * - "Lưu nháp" (save-video) = chỉ lưu video_url, GIỮ NGUYÊN is_trial.
 * - "Xuất bản" (publish) = lưu video_url + is_trial=true TRONG MỘT update.
 *   Publish bắt buộc có video hợp lệ (từ body, hoặc video đã lưu sẵn).
 * - Revoke lặp là idempotent: đã is_trial=false thì trả success +
 *   alreadyRevoked=true mà không ghi thêm.
 *
 * Bảo mật:
 * - config verify_jwt = true; function tự requireAuth + kiểm tra role ADMIN
 *   TRƯỚC mọi truy vấn DB (401 khi thiếu/sai auth, 403 khi không phải ADMIN).
 * - Video URL validate server-side theo allowlist HTTPS: YouTube
 *   (youtube.com / www.youtube.com / m.youtube.com / youtu.be) và Google
 *   Drive (drive.google.com). Mọi host khác, http, thiếu video id, URL quá
 *   dài đều bị chặn (400). URL lưu ở dạng canonical.
 * - Không lộ raw DB error: mọi lỗi DB trả message chung (500).
 * - Không tự retry thao tác ghi: lỗi ghi trả về để client quyết định.
 *
 * API contract:
 *   GET    /trial-management[?q=&classId=&chapterId=&status=public|draft&video=with|without]
 *     200 -> { lessons: [TrialLesson], kpis, total, filtered,
 *              classes: [{id,name}], chapters: [{id,title,classId}] }
 *     TrialLesson = { id, title, orderIndex, chapterId, chapterTitle,
 *       classId, className, videoUrl, hasVideo, videoKind, isTrial,
 *       theoryFilesCount, homeworksCount, publishedHomeworksCount,
 *       createdAt, updatedAt }
 *     kpis (tính trên TOÀN BỘ catalog, không theo filter):
 *       { total, publicCount, draftWithVideoCount, missingVideoCount }
 *       - publicCount: is_trial=true ("đang công khai")
 *       - draftWithVideoCount: is_trial=false và có video ("có video chưa công khai")
 *       - missingVideoCount: is_trial=false và chưa có video ("thiếu video")
 *       Ba nhóm rời nhau, cộng lại = total. Bài đang công khai nhưng thiếu
 *       video (tồn tại từ luồng bật tay cũ) vẫn hiện ở list với cảnh báo
 *       riêng, không nằm trong missingVideoCount.
 *   PATCH  /trial-management
 *     body: { lessonId, action: 'save-video'|'publish'|'revoke', videoUrl? }
 *     200 -> { lesson: TrialLessonSummary, action, alreadyRevoked?, alreadyPublished? }
 *     TrialLessonSummary = { id, title, chapterId, chapterTitle, classId,
 *       className, videoUrl, hasVideo, videoKind, isTrial, updatedAt }
 *     400 validation (UUID/action/URL/publish thiếu video) /
 *     401 auth / 403 non-admin / 404 lesson không tồn tại / 500 chung.
 *
 *   OPTIONS: CORS preflight. Method khác -> 405.
 *
 * Không cần migration: schema hiện tại đã đủ (lessons.video_url,
 * lessons.is_trial, lessons.updated_at, homeworks.is_published).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireAuth } from '../../shared/auth-middleware.ts'
import { handleCors, jsonResponse, errorResponse } from '../../shared/response-helper.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/
const DRIVE_ID_RE = /^[A-Za-z0-9_-]+$/
const MAX_URL_LENGTH = 2048

type VideoKind = 'youtube' | 'drive' | 'unsupported' | 'empty'

interface ClassifiedVideo {
  kind: VideoKind
  videoId: string | null
  canonicalUrl: string | null
  embedUrl: string | null
}

const EMPTY_VIDEO: ClassifiedVideo = { kind: 'empty', videoId: null, canonicalUrl: null, embedUrl: null }
const UNSUPPORTED_VIDEO: ClassifiedVideo = { kind: 'unsupported', videoId: null, canonicalUrl: null, embedUrl: null }

/**
 * Phân loại + chuẩn hoá URL video theo allowlist. FE mirror đúng logic này
 * (fe/src/js/utils/trial-management.js); server mới là nguồn chân lý.
 * - YouTube: watch?v=<11 ký tự>, /embed/, /shorts/, /live/, /v/, youtu.be/<id>
 *   -> canonical https://www.youtube.com/watch?v=<id>
 * - Drive: /file/d/<id> -> canonical https://drive.google.com/file/d/<id>/view
 * - Mọi trường hợp khác (http, host lạ, thiếu id, quá dài, parse lỗi)
 *   -> unsupported. URL có userinfo (youtube.com@evil.com) bị loại vì
 *   hostname sau parse là evil.com, không khớp allowlist.
 */
function classifyVideoUrl(raw: unknown): ClassifiedVideo {
  if (typeof raw !== 'string') return EMPTY_VIDEO
  const url = raw.trim()
  if (!url) return EMPTY_VIDEO
  if (url.length > MAX_URL_LENGTH) return UNSUPPORTED_VIDEO
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return UNSUPPORTED_VIDEO
  }
  if (parsed.protocol !== 'https:') return UNSUPPORTED_VIDEO
  const host = parsed.hostname.toLowerCase()

  if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com') {
    const v = parsed.searchParams.get('v')
    if (v && YOUTUBE_ID_RE.test(v)) {
      return {
        kind: 'youtube',
        videoId: v,
        canonicalUrl: `https://www.youtube.com/watch?v=${v}`,
        embedUrl: `https://www.youtube.com/embed/${v}`,
      }
    }
    const m = parsed.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})(?:\/|$)/)
    if (m) {
      return {
        kind: 'youtube',
        videoId: m[1],
        canonicalUrl: `https://www.youtube.com/watch?v=${m[1]}`,
        embedUrl: `https://www.youtube.com/embed/${m[1]}`,
      }
    }
    return UNSUPPORTED_VIDEO
  }

  if (host === 'youtu.be') {
    const m = parsed.pathname.match(/^\/([A-Za-z0-9_-]{11})(?:\/|$)/)
    if (m) {
      return {
        kind: 'youtube',
        videoId: m[1],
        canonicalUrl: `https://www.youtube.com/watch?v=${m[1]}`,
        embedUrl: `https://www.youtube.com/embed/${m[1]}`,
      }
    }
    return UNSUPPORTED_VIDEO
  }

  if (host === 'drive.google.com' || host === 'www.drive.google.com') {
    const m = parsed.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)(?:\/|$)/)
    if (m && DRIVE_ID_RE.test(m[1])) {
      return {
        kind: 'drive',
        videoId: m[1],
        canonicalUrl: `https://drive.google.com/file/d/${m[1]}/view`,
        embedUrl: `https://drive.google.com/file/d/${m[1]}/preview`,
      }
    }
    return UNSUPPORTED_VIDEO
  }

  return UNSUPPORTED_VIDEO
}

function isValidUuid(raw: unknown): raw is string {
  return typeof raw === 'string' && UUID_RE.test(raw)
}

interface LessonRow {
  id: string
  title: string
  order_index: number
  chapter_id: string
  video_url: string | null
  theory_files: string[] | null
  is_trial: boolean
  created_at: string
  updated_at: string
  chapters: {
    id: string
    title: string
    class_id: string
    classes: { id: string; name: string } | null
  } | null
  homeworks: { id: string; is_published: boolean }[] | null
}

function toCatalogItem(row: LessonRow) {
  const ch = row.chapters
  const cls = ch?.classes
  const homeworks = row.homeworks || []
  const video = classifyVideoUrl(row.video_url)
  return {
    id: row.id,
    title: row.title,
    orderIndex: row.order_index,
    chapterId: ch?.id || row.chapter_id,
    chapterTitle: ch?.title || '',
    classId: cls?.id || ch?.class_id || null,
    className: cls?.name || '',
    videoUrl: row.video_url || null,
    hasVideo: video.kind === 'youtube' || video.kind === 'drive',
    videoKind: video.kind,
    isTrial: row.is_trial === true,
    theoryFilesCount: Array.isArray(row.theory_files) ? row.theory_files.length : 0,
    homeworksCount: homeworks.length,
    // Public trial chỉ hiện homework đã xuất bản (khớp create-lesson?isTrial=true).
    publishedHomeworksCount: homeworks.filter((h) => h.is_published !== false).length,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

type CatalogItem = ReturnType<typeof toCatalogItem>

function toSummaryItem(row: LessonRow, overrides: Partial<LessonRow> = {}) {
  const merged = { ...row, ...overrides } as LessonRow
  const item = toCatalogItem(merged)
  return {
    id: item.id,
    title: item.title,
    chapterId: item.chapterId,
    chapterTitle: item.chapterTitle,
    classId: item.classId,
    className: item.className,
    videoUrl: item.videoUrl,
    hasVideo: item.hasVideo,
    videoKind: item.videoKind,
    isTrial: item.isTrial,
    updatedAt: item.updatedAt,
  }
}

function computeKpis(items: CatalogItem[]) {
  let publicCount = 0
  let draftWithVideoCount = 0
  let missingVideoCount = 0
  for (const item of items) {
    if (item.isTrial) {
      publicCount += 1
    } else if (item.hasVideo) {
      draftWithVideoCount += 1
    } else {
      missingVideoCount += 1
    }
  }
  return {
    total: items.length,
    publicCount,
    draftWithVideoCount,
    missingVideoCount,
  }
}

function applyFilters(items: CatalogItem[], url: URL): CatalogItem[] {
  const q = (url.searchParams.get('q') || '').trim().toLowerCase()
  const classId = url.searchParams.get('classId') || ''
  const chapterId = url.searchParams.get('chapterId') || ''
  const status = url.searchParams.get('status') || ''
  const video = url.searchParams.get('video') || ''

  return items.filter((item) => {
    if (classId && item.classId !== classId) return false
    if (chapterId && item.chapterId !== chapterId) return false
    if (status === 'public' && !item.isTrial) return false
    if (status === 'draft' && item.isTrial) return false
    if (video === 'with' && !item.hasVideo) return false
    if (video === 'without' && item.hasVideo) return false
    if (q) {
      const haystack = `${item.title} ${item.chapterTitle} ${item.className}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })
}

serve(async (req: Request) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    if (req.method !== 'GET' && req.method !== 'PATCH') {
      return errorResponse('Method not allowed', 405)
    }

    // Auth + ADMIN trước mọi truy vấn DB (theo pattern student-report-shares:
    // auth lỗi -> 401, sai role -> 403; không dùng requireAdmin để tránh
    // throw 'Forbidden' rơi vào catch-all 500).
    let serviceRoleClient: Awaited<ReturnType<typeof requireAuth>>['serviceRoleClient']
    try {
      const auth = await requireAuth(req)
      if (auth.user.role !== 'ADMIN') {
        return errorResponse('Forbidden: Admin access required', 403)
      }
      serviceRoleClient = auth.serviceRoleClient
    } catch {
      return errorResponse('Unauthorized', 401)
    }

    // ------------------------------------------------------------ GET: catalog
    if (req.method === 'GET') {
      const url = new URL(req.url)
      const { data, error } = await serviceRoleClient
        .from('lessons')
        .select(`
          id,
          title,
          order_index,
          chapter_id,
          video_url,
          theory_files,
          is_trial,
          created_at,
          updated_at,
          chapters (
            id,
            title,
            class_id,
            classes (
              id,
              name
            )
          ),
          homeworks (
            id,
            is_published
          )
        `)
        .order('updated_at', { ascending: false })

      if (error) return errorResponse('Failed to load trial catalog', 500)

      const items = (data as LessonRow[] | null || []).map(toCatalogItem)
      const filtered = applyFilters(items, url)

      const classMap = new Map<string, string>()
      const chapterMap = new Map<string, { id: string; title: string; classId: string | null }>()
      for (const item of items) {
        if (item.classId && item.className) classMap.set(item.classId, item.className)
        if (item.chapterId) {
          chapterMap.set(item.chapterId, { id: item.chapterId, title: item.chapterTitle, classId: item.classId })
        }
      }

      return jsonResponse({
        lessons: filtered,
        kpis: computeKpis(items),
        total: items.length,
        filtered: filtered.length,
        classes: Array.from(classMap.entries()).map(([id, name]) => ({ id, name })),
        chapters: Array.from(chapterMap.values()),
      })
    }

    // ---------------------------------------------------------- PATCH: actions
    let body: Record<string, unknown> | null = null
    try {
      body = await req.json()
    } catch {
      return errorResponse('Request body must be valid JSON', 400)
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return errorResponse('Request body must be a JSON object', 400)
    }

    const lessonId = body.lessonId
    if (!isValidUuid(lessonId)) {
      return errorResponse('lessonId must be a valid UUID', 400)
    }
    const action = body.action
    if (action !== 'save-video' && action !== 'publish' && action !== 'revoke') {
      return errorResponse('action must be one of: save-video, publish, revoke', 400)
    }

    const { data: lesson, error: loadErr } = await serviceRoleClient
      .from('lessons')
      .select(`
        id,
        title,
        order_index,
        chapter_id,
        video_url,
        theory_files,
        is_trial,
        created_at,
        updated_at,
        chapters (
          id,
          title,
          class_id,
          classes (
            id,
            name
          )
        ),
        homeworks (
          id,
          is_published
        )
      `)
      .eq('id', lessonId)
      .maybeSingle()

    if (loadErr) return errorResponse('Failed to load lesson', 500)
    if (!lesson) return errorResponse('Lesson not found', 404)
    const row = lesson as LessonRow

    // ------------------------------------------------------------ REVOKE
    if (action === 'revoke') {
      // Idempotent: đã thu hồi thì không ghi thêm, trả trạng thái hiện tại.
      if (row.is_trial !== true) {
        return jsonResponse({
          lesson: toSummaryItem(row),
          action: 'revoke',
          alreadyRevoked: true,
        })
      }
      const { data: updated, error: updateErr } = await serviceRoleClient
        .from('lessons')
        .update({ is_trial: false })
        .eq('id', lessonId)
        .select('updated_at')
        .maybeSingle()
      if (updateErr) return errorResponse('Failed to revoke trial lesson', 500)
      return jsonResponse({
        lesson: toSummaryItem(row, { is_trial: false, updated_at: (updated as { updated_at?: string } | null)?.updated_at || row.updated_at }),
        action: 'revoke',
        alreadyRevoked: false,
      })
    }

    // ------------------------------------------- SAVE-VIDEO / PUBLISH (video)
    const rawVideoUrl = body.videoUrl
    // save-video: URL rỗng/null = xoá video nháp (giữ is_trial). URL có nội
    // dung phải hợp lệ. publish: URL body ưu tiên, thiếu thì dùng video đã lưu.
    let effective: ClassifiedVideo | null = null
    if (action === 'save-video') {
      if (rawVideoUrl === undefined || rawVideoUrl === null || (typeof rawVideoUrl === 'string' && rawVideoUrl.trim() === '')) {
        effective = null // xoá video
      } else if (typeof rawVideoUrl === 'string') {
        const classified = classifyVideoUrl(rawVideoUrl)
        if (classified.kind !== 'youtube' && classified.kind !== 'drive') {
          return errorResponse('videoUrl is not a supported video URL (HTTPS YouTube or Google Drive only)', 400)
        }
        effective = classified
      } else {
        return errorResponse('videoUrl must be a string', 400)
      }
    } else {
      // publish
      if (typeof rawVideoUrl === 'string' && rawVideoUrl.trim() !== '') {
        const classified = classifyVideoUrl(rawVideoUrl)
        if (classified.kind !== 'youtube' && classified.kind !== 'drive') {
          return errorResponse('videoUrl is not a supported video URL (HTTPS YouTube or Google Drive only)', 400)
        }
        effective = classified
      } else if (rawVideoUrl !== undefined && rawVideoUrl !== null && rawVideoUrl !== '') {
        return errorResponse('videoUrl must be a string', 400)
      } else {
        // Không gửi URL mới: dùng video đã lưu sẵn; thiếu/không hợp lệ -> chặn.
        const stored = classifyVideoUrl(row.video_url)
        if (stored.kind !== 'youtube' && stored.kind !== 'drive') {
          return errorResponse('Publish requires a valid video URL', 400)
        }
        effective = stored
      }
    }

    if (action === 'save-video') {
      const { data: updated, error: updateErr } = await serviceRoleClient
        .from('lessons')
        .update({ video_url: effective ? effective.canonicalUrl : null })
        .eq('id', lessonId)
        .select('updated_at')
        .maybeSingle()
      if (updateErr) return errorResponse('Failed to save trial video', 500)
      return jsonResponse({
        lesson: toSummaryItem(row, {
          video_url: effective ? effective.canonicalUrl : null,
          updated_at: (updated as { updated_at?: string } | null)?.updated_at || row.updated_at,
        }),
        action: 'save-video',
      })
    }

    // publish: MỘT update duy nhất (URL + is_trial=true) để không có trạng
    // thái dở dang "đã lưu URL nhưng chưa public" / ngược lại.
    const alreadyPublished = row.is_trial === true
    const { data: updated, error: updateErr } = await serviceRoleClient
      .from('lessons')
      .update({ video_url: (effective as ClassifiedVideo).canonicalUrl, is_trial: true })
      .eq('id', lessonId)
      .select('updated_at')
      .maybeSingle()
    if (updateErr) return errorResponse('Failed to publish trial lesson', 500)
    return jsonResponse({
      lesson: toSummaryItem(row, {
        video_url: (effective as ClassifiedVideo).canonicalUrl,
        is_trial: true,
        updated_at: (updated as { updated_at?: string } | null)?.updated_at || row.updated_at,
      }),
      action: 'publish',
      alreadyPublished,
    })
  } catch {
    // Catch-all: không lộ raw message (kể cả lỗi DB/env) ra client.
    return errorResponse('Internal server error', 500)
  }
})
