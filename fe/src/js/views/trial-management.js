/**
 * View ADMIN "Quản lý học thử" (#trial-management).
 *
 * Điểm quản trị tập trung cho video/bài học công khai. Mọi thay đổi đi qua
 * Edge Function trial-management (không query PostgREST trực tiếp):
 * - GET catalog (toàn bộ lessons + join chapter/class + metadata homework),
 *   lọc/tìm kiếm phía client cho phản hồi tức thì.
 * - PATCH save-video (lưu nháp, giữ is_trial), publish (URL + is_trial=true
 *   trong một update, bắt buộc video hợp lệ), revoke (chỉ is_trial=false,
 *   giữ video_url, idempotent).
 *
 * Trạng thái trang: loading / error + thử lại / empty / danh sách.
 * KPI (tính trên toàn bộ catalog, không theo filter): đang công khai,
 * có video chưa công khai, thiếu video (3 nhóm rời nhau, cộng lại = tổng).
 *
 * An toàn async (theo chuẩn repo):
 * - loadGen: response catalog cũ (đổi route / tải lại) bị bỏ qua.
 * - modalGuard: response của modal video cũ không được đóng modal mới hay
 *   ghi đè state mới.
 * - Nút submit khóa trong lúc pending (chống duplicate submit); lỗi ghi
 *   KHÔNG tự retry, người dùng quyết định thử lại.
 * - Preview video chỉ iframe embedUrl do classifier trả ra (YouTube embed /
 *   Drive preview); URL khác chỉ hiện cảnh báo, không iframe URL thô.
 */

import { api } from '../api.js'
import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { openModal, closeModal } from '../components/modal.js'
import { showToast } from '../components/toast.js'
import { escapeHtml } from '../utils/download-helper.js'
import {
  classifyVideoUrl,
  isValidVideoUrl,
  getSafeEmbedUrl,
  buildTrialLessonLink,
  canCopyTrialLink,
  hasSupportedVideo,
  computeTrialKpis,
  filterTrialCatalog,
  createWriteGuard,
  formatTrialUpdatedAt,
} from '../utils/trial-management.js'

let allLessons = []
let filterMeta = { classes: [], chapters: [] }
let serverKpis = null
let viewState = 'loading' // 'loading' | 'error' | 'ready'
let loadErrorMessage = ''
let loadGen = 0
let filters = { q: '', classId: '', chapterId: '', status: 'all', video: 'all' }
let highlightLessonId = ''
let highlightNotice = ''
let highlightScrolled = false
const modalGuard = createWriteGuard()

function getRouteLessonId() {
  try {
    const hashUrl = window.location.hash.replace('#', '')
    const queryString = hashUrl.split('?')[1] || ''
    return new URLSearchParams(queryString).get('lessonId') || ''
  } catch {
    return ''
  }
}

function currentKpis() {
  if (serverKpis && typeof serverKpis.total === 'number') return serverKpis
  return computeTrialKpis(allLessons)
}

function deriveFilterMeta() {
  const classMap = new Map()
  const chapterMap = new Map()
  for (const lesson of allLessons) {
    if (lesson.classId && lesson.className) classMap.set(lesson.classId, lesson.className)
    if (lesson.chapterId) {
      chapterMap.set(lesson.chapterId, { id: lesson.chapterId, title: lesson.chapterTitle || 'Chương', classId: lesson.classId || null })
    }
  }
  filterMeta = {
    classes: Array.from(classMap.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    chapters: Array.from(chapterMap.values()).sort((a, b) => (a.title || '').localeCompare(b.title || '', 'vi')),
  }
}

function chapterOptionsForClass() {
  const list = filters.classId
    ? filterMeta.chapters.filter((c) => c.classId === filters.classId)
    : filterMeta.chapters
  return list
}

function renderKpis() {
  const el = document.getElementById('trial-kpis')
  if (!el) return
  const kpis = currentKpis()
  const cards = [
    { label: 'Tổng số bài học', value: kpis.total, icon: 'fa-book-open', color: '#0369a1', bg: '#eff6ff', border: '#bfdbfe' },
    { label: 'Đang công khai', value: kpis.publicCount, icon: 'fa-earth-asia', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
    { label: 'Có video, chưa công khai', value: kpis.draftWithVideoCount, icon: 'fa-video', color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
    { label: 'Thiếu video', value: kpis.missingVideoCount, icon: 'fa-video-slash', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  ]
  el.innerHTML = cards.map((c) => `
    <div class="card" style="padding:16px; border:1px solid ${c.border}; background:${c.bg};">
      <div style="font-size:11px; font-weight:700; color:${c.color}; text-transform:uppercase;">
        <i class="fa-solid ${c.icon}"></i> ${c.label}
      </div>
      <div style="font-size:26px; font-weight:800; color:${c.color}; margin-top:4px;">${c.value}</div>
    </div>
  `).join('')
}

function renderFilterOptions() {
  const classSel = document.getElementById('trial-filter-class')
  const chapterSel = document.getElementById('trial-filter-chapter')
  if (classSel) {
    const prev = classSel.value || filters.classId
    classSel.innerHTML = `<option value="">Tất cả lớp</option>` + filterMeta.classes.map((c) =>
      `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('')
    classSel.value = filterMeta.classes.some((c) => c.id === prev) ? prev : ''
    filters.classId = classSel.value
  }
  if (chapterSel) {
    const chapters = chapterOptionsForClass()
    if (!chapters.some((c) => c.id === filters.chapterId)) filters.chapterId = ''
    chapterSel.innerHTML = `<option value="">Tất cả chương</option>` + chapters.map((c) =>
      `<option value="${escapeHtml(c.id)}">${escapeHtml(c.title)}</option>`).join('')
    chapterSel.value = filters.chapterId
  }
  const statusSel = document.getElementById('trial-filter-status')
  if (statusSel) statusSel.value = filters.status
  const videoSel = document.getElementById('trial-filter-video')
  if (videoSel) videoSel.value = filters.video
  const qInput = document.getElementById('trial-filter-q')
  if (qInput && document.activeElement !== qInput) qInput.value = filters.q
}

function videoBadge(lesson) {
  const kind = lesson.videoKind || (hasSupportedVideo(lesson) ? 'video' : 'empty')
  if (kind === 'youtube') {
    return `<span style="font-size:11px; font-weight:700; background:#fef2f2; color:#dc2626; border:1px solid #fecaca; padding:2px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;"><i class="fa-brands fa-youtube"></i> YouTube</span>`
  }
  if (kind === 'drive') {
    return `<span style="font-size:11px; font-weight:700; background:#eff6ff; color:#0369a1; border:1px solid #bfdbfe; padding:2px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;"><i class="fa-brands fa-google-drive"></i> Google Drive</span>`
  }
  if (lesson.isTrial === true) {
    return `<span style="font-size:11px; font-weight:700; background:#fef2f2; color:#dc2626; border:1px solid #fecaca; padding:2px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;" title="Bài đang công khai nhưng chưa có video hợp lệ"><i class="fa-solid fa-triangle-exclamation"></i> Thiếu video</span>`
  }
  return `<span style="font-size:11px; font-weight:600; background:#f1f5f9; color:#64748b; border:1px solid #e2e8f0; padding:2px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid fa-video-slash"></i> Chưa có video</span>`
}

function publicBadge(lesson) {
  if (lesson.isTrial === true) {
    return `<span style="font-size:11px; font-weight:700; background:#dcfce7; color:#15803d; border:1px solid #86efac; padding:2px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid fa-earth-asia"></i> Đang công khai</span>`
  }
  return `<span style="font-size:11px; font-weight:600; background:#f1f5f9; color:#475569; border:1px solid #e2e8f0; padding:2px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid fa-lock"></i> Chưa công khai</span>`
}

function updateList() {
  const container = document.getElementById('trial-mgmt-list')
  if (!container) return

  if (viewState === 'loading') {
    container.innerHTML = `
      <div style="text-align:center; padding:60px 20px;">
        <div style="display:inline-block; width:40px; height:40px; border:3px solid #e2e8f0; border-top-color:#16a34a; border-radius:50%; animation:spin 0.8s linear infinite; margin-bottom:14px;"></div>
        <h3 style="font-size:16px; font-weight:700; color:#0f172a; margin:0 0 6px 0;">Đang tải danh sách bài học...</h3>
        <p style="color:#64748b; font-size:13px; margin:0;">Vui lòng đợi trong giây lát</p>
      </div>
    `
    return
  }

  if (viewState === 'error') {
    container.innerHTML = `
      <div style="text-align:center; padding:60px 20px;">
        <i class="fa-solid fa-triangle-exclamation" style="font-size:40px; color:#f59e0b; margin-bottom:14px;"></i>
        <h3 style="font-size:16px; font-weight:700; color:#0f172a; margin:0 0 6px 0;">Không tải được danh sách bài học thử</h3>
        <p style="color:#64748b; font-size:13px; margin:0 0 16px 0;">${escapeHtml(loadErrorMessage || 'Đã xảy ra lỗi, vui lòng thử lại.')}</p>
        <button class="btn-primary" id="btn-trial-retry" style="width:auto; padding:9px 20px; font-size:13px; font-weight:700; cursor:pointer; border-radius:8px;">
          <i class="fa-solid fa-rotate-right"></i> Thử lại
        </button>
      </div>
    `
    return
  }

  const filtered = filterTrialCatalog(allLessons, filters)
  const countEl = document.getElementById('trial-count')
  if (countEl) countEl.textContent = `Hiển thị ${filtered.length} / ${allLessons.length} bài học`

  if (allLessons.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:60px 20px; color:#64748b;">
        <i class="fa-solid fa-graduation-cap" style="font-size:40px; color:#cbd5e1; margin-bottom:14px;"></i>
        <h3 style="font-size:16px; font-weight:700; color:#0f172a; margin:0 0 6px 0;">Chưa có bài học nào</h3>
        <p style="font-size:13px; margin:0;">Tạo bài học trong chương trình học trước, rồi quay lại đây để quản lý học thử.</p>
      </div>
    `
    return
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:60px 20px; color:#64748b;">
        <i class="fa-solid fa-magnifying-glass" style="font-size:36px; color:#cbd5e1; margin-bottom:14px;"></i>
        <h3 style="font-size:16px; font-weight:700; color:#0f172a; margin:0 0 6px 0;">Không tìm thấy bài học phù hợp</h3>
        <p style="font-size:13px; margin:0 0 16px 0;">Thử đổi từ khóa hoặc xóa bớt điều kiện lọc.</p>
        <button class="btn-secondary" id="btn-trial-reset-filters" style="width:auto; padding:8px 18px; font-size:13px; font-weight:600; cursor:pointer; border-radius:8px;">Xóa bộ lọc</button>
      </div>
    `
    return
  }

  container.innerHTML = `
    <div class="table-responsive">
      <table class="data-table">
        <thead>
          <tr>
            <th>Bài học</th>
            <th>Video</th>
            <th>Trạng thái</th>
            <th>Tài liệu / Bài tập</th>
            <th>Cập nhật</th>
            <th style="text-align:center;">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map((lesson) => {
            const isPublic = lesson.isTrial === true
            const updated = formatTrialUpdatedAt(lesson.updatedAt)
            return `
              <tr data-lesson-row="${escapeHtml(lesson.id)}" class="${lesson.id === highlightLessonId ? 'trial-row-highlight' : ''}">
                <td>
                  <div style="font-weight:700; color:#0f172a; font-size:14px; line-height:1.4;">${escapeHtml(lesson.title)}</div>
                  <div style="font-size:12px; color:#64748b; margin-top:2px;">${escapeHtml(lesson.className || 'Lớp học')} &middot; ${escapeHtml(lesson.chapterTitle || 'Chương')}</div>
                </td>
                <td style="white-space:nowrap;">${videoBadge(lesson)}</td>
                <td style="white-space:nowrap;">${publicBadge(lesson)}</td>
                <td style="font-size:13px; color:#475569; white-space:nowrap;">
                  <span title="Tài liệu lý thuyết đính kèm"><i class="fa-solid fa-paperclip" style="color:#0284c7;"></i> ${lesson.theoryFilesCount || 0}</span>
                  <span style="margin:0 6px; color:#cbd5e1;">|</span>
                  <span title="Bài tập đã xuất bản / tổng số bài tập"><i class="fa-solid fa-list-check" style="color:#16a34a;"></i> ${lesson.publishedHomeworksCount || 0}/${lesson.homeworksCount || 0}</span>
                </td>
                <td style="font-size:12px; color:#64748b; white-space:nowrap;">${escapeHtml(updated)}</td>
                <td style="text-align:center; white-space:nowrap;">
                  <div style="display:flex; gap:6px; justify-content:center; flex-wrap:wrap;">
                    ${isPublic ? `
                      <button class="btn-secondary trial-row-action" data-action="open" data-lesson-id="${escapeHtml(lesson.id)}" style="width:auto; padding:6px 10px; font-size:12px; font-weight:600; cursor:pointer; border-radius:6px;" title="Mở trang học thử công khai của bài này">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> Mở trang học thử
                      </button>
                      <button class="btn-secondary trial-row-action" data-action="copy" data-lesson-id="${escapeHtml(lesson.id)}" style="width:auto; padding:6px 10px; font-size:12px; font-weight:600; cursor:pointer; border-radius:6px;" title="Sao chép link học thử công khai">
                        <i class="fa-regular fa-copy"></i> Sao chép link
                      </button>
                    ` : ''}
                    <button class="btn-secondary trial-row-action" data-action="edit" data-lesson-id="${escapeHtml(lesson.id)}" style="width:auto; padding:6px 10px; font-size:12px; font-weight:600; cursor:pointer; border-radius:6px; color:#0066cc; border-color:#bfdbfe; background:#eff6ff;">
                      <i class="fa-solid fa-video"></i> Sửa video
                    </button>
                    ${isPublic ? `
                      <button class="btn-secondary trial-row-action" data-action="revoke" data-lesson-id="${escapeHtml(lesson.id)}" style="width:auto; padding:6px 10px; font-size:12px; font-weight:600; cursor:pointer; border-radius:6px; color:#dc2626; border-color:#fecaca; background:#fef2f2;">
                        <i class="fa-solid fa-ban"></i> Thu hồi
                      </button>
                    ` : ''}
                  </div>
                </td>
              </tr>
            `
          }).join('')}
        </tbody>
      </table>
    </div>
  `

  // Highlight + cuộn tới bài từ link curriculum (?lessonId=...) — chỉ 1 lần.
  if (highlightLessonId && !highlightScrolled) {
    const row = container.querySelector(`[data-lesson-row="${highlightLessonId}"]`)
    if (row) {
      highlightScrolled = true
      row.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }
}

function renderNotice() {
  const el = document.getElementById('trial-notice')
  if (!el) return
  el.innerHTML = highlightNotice ? `
    <div style="padding:12px 16px; background:#fffbeb; border:1px solid #fde68a; border-radius:10px; font-size:13px; color:#92400e; margin-bottom:16px;">
      <i class="fa-solid fa-circle-info"></i> ${escapeHtml(highlightNotice)}
    </div>
  ` : ''
}

async function loadCatalog() {
  const gen = ++loadGen
  viewState = 'loading'
  loadErrorMessage = ''
  updateList()
  try {
    const res = await api.getTrialCatalog()
    if (gen !== loadGen) return // stale response: đã đổi route / tải lại
    allLessons = Array.isArray(res?.lessons) ? res.lessons : (Array.isArray(res) ? res : [])
    serverKpis = res && typeof res === 'object' && res.kpis ? res.kpis : null
    deriveFilterMeta()
    if (highlightLessonId && !allLessons.some((l) => l.id === highlightLessonId)) {
      highlightNotice = 'Không tìm thấy bài học trong danh sách (có thể bài đã thu hồi hoặc chưa thuộc catalog).'
    } else {
      highlightNotice = ''
    }
    viewState = 'ready'
    renderKpis()
    renderFilterOptions()
    renderNotice()
    updateList()
  } catch (err) {
    if (gen !== loadGen) return
    viewState = 'error'
    loadErrorMessage = err?.message || 'Đã xảy ra lỗi, vui lòng thử lại.'
    renderKpis()
    updateList()
  }
}

function setModalPending(pending) {
  const draftBtn = document.getElementById('btn-trial-save-draft')
  const publishBtn = document.getElementById('btn-trial-publish')
  if (draftBtn) {
    draftBtn.disabled = pending
    draftBtn.innerHTML = pending ? '<i class="fa-solid fa-circle-notch fa-spin"></i> Đang lưu...' : '<i class="fa-regular fa-floppy-disk"></i> Lưu nháp'
  }
  if (publishBtn) {
    publishBtn.disabled = pending
    publishBtn.innerHTML = pending ? '<i class="fa-solid fa-circle-notch fa-spin"></i> Đang xuất bản...' : '<i class="fa-solid fa-earth-asia"></i> Lưu &amp; xuất bản'
  }
  const urlInput = document.getElementById('trial-video-url')
  if (urlInput) urlInput.disabled = pending
}

function setModalError(message) {
  const el = document.getElementById('trial-video-error')
  if (el) el.textContent = message || ''
}

function renderVideoPreview(url) {
  const box = document.getElementById('trial-video-preview')
  if (!box) return
  const trimmed = (url || '').trim()
  if (!trimmed) {
    box.innerHTML = `<div style="padding:28px 16px; text-align:center; color:#64748b; font-size:13px; border:1px dashed #cbd5e1; border-radius:10px;">Nhập URL video YouTube hoặc Google Drive để xem trước.</div>`
    return
  }
  const embedUrl = getSafeEmbedUrl(trimmed)
  if (!embedUrl) {
    box.innerHTML = `<div style="padding:16px; border:1px solid #fde68a; background:#fffbeb; border-radius:10px; font-size:13px; color:#92400e; line-height:1.6;">URL này chưa được hỗ trợ xem trước. Chỉ hỗ trợ video HTTPS từ YouTube (youtube.com / youtu.be) và Google Drive. Video sẽ không được nhúng từ URL tùy ý.</div>`
    return
  }
  box.innerHTML = `
    <div style="position:relative; padding-bottom:56.25%; height:0; overflow:hidden; border-radius:10px; border:1px solid #e2e8f0; background:#000;">
      <iframe src="${escapeHtml(embedUrl)}" style="position:absolute; top:0; left:0; width:100%; height:100%; border:0;" allowfullscreen allow="autoplay; encrypted-media; fullscreen" referrerpolicy="no-referrer"></iframe>
    </div>
  `
}

function openVideoModal(lesson) {
  const gen = modalGuard.begin()
  const currentUrl = lesson.videoUrl || ''
  openModal(
    'Sửa video bài học',
    `
      <div style="padding:14px 16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; margin-bottom:16px;">
        <div style="font-size:12px; font-weight:600; color:#0066cc; margin-bottom:4px;">${escapeHtml(lesson.className || 'Lớp học')} &middot; ${escapeHtml(lesson.chapterTitle || 'Chương')}</div>
        <div style="font-weight:700; color:#0f172a; font-size:15px; line-height:1.4;">${escapeHtml(lesson.title)}</div>
        <div style="font-size:12px; color:#64748b; margin-top:6px;">Trạng thái hiện tại: ${lesson.isTrial === true ? 'Đang công khai' : 'Chưa công khai'} &middot; Video hiện tại: ${lesson.videoUrl ? escapeHtml(lesson.videoUrl) : 'chưa có'}</div>
      </div>

      <label style="display:block; font-size:13px; font-weight:700; color:#0f172a; margin-bottom:6px;">URL video (YouTube hoặc Google Drive)</label>
      <input type="url" id="trial-video-url" value="${escapeHtml(currentUrl)}" placeholder="https://www.youtube.com/watch?v=... hoặc https://drive.google.com/file/d/.../view" style="width:100%; padding:10px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:14px; box-sizing:border-box;">
      <div style="font-size:12px; color:#64748b; margin-top:6px; line-height:1.5;">
        Lưu nháp chỉ lưu URL, không đổi trạng thái công khai. Lưu &amp; xuất bản lưu URL và công khai bài ngay (bắt buộc có video hợp lệ).
      </div>
      <div id="trial-video-error" style="font-size:13px; color:#dc2626; font-weight:600; margin-top:10px; min-height:18px;"></div>
      <div id="trial-video-preview" style="margin-top:12px;"></div>

      <div style="display:flex; gap:10px; margin-top:18px; flex-wrap:wrap;">
        <button class="btn-secondary" id="btn-trial-save-draft" style="width:auto; padding:10px 18px; font-size:13px; font-weight:700; cursor:pointer; border-radius:8px;">
          <i class="fa-regular fa-floppy-disk"></i> Lưu nháp
        </button>
        <button class="btn-primary" id="btn-trial-publish" style="width:auto; padding:10px 20px; font-size:13px; font-weight:700; cursor:pointer; border-radius:8px; background:#16a34a; border-color:#16a34a;">
          <i class="fa-solid fa-earth-asia"></i> Lưu &amp; xuất bản
        </button>
      </div>
    `,
    null,
    { contentStyle: 'max-width:720px;' }
  )

  renderVideoPreview(currentUrl)
  document.getElementById('trial-video-url')?.addEventListener('input', (e) => {
    setModalError('')
    renderVideoPreview(e.target.value)
  })

  const handleSave = async (action) => {
    const input = document.getElementById('trial-video-url')
    const url = input ? input.value : ''
    setModalError('')
    // Validate sớm phía client (server validate lại, server mới là chân lý).
    if (action === 'publish' && !isValidVideoUrl(url)) {
      setModalError('Xuất bản cần một URL video hợp lệ (HTTPS YouTube hoặc Google Drive).')
      return
    }
    if (url.trim() !== '' && !isValidVideoUrl(url)) {
      setModalError('URL video chưa được hỗ trợ. Chỉ hỗ trợ HTTPS YouTube (youtube.com / youtu.be) và Google Drive.')
      return
    }
    setModalPending(true)
    try {
      const res = action === 'publish'
        ? await api.publishTrialLesson(lesson.id, url)
        : await api.saveTrialVideo(lesson.id, url)
      // Modal đã bị thay thế / mở lại: bỏ qua response cũ.
      if (!modalGuard.isCurrent(gen)) return
      closeModal()
      showToast(action === 'publish' ? 'Đã xuất bản bài học thử.' : 'Đã lưu nháp video bài học.', 'success')
      await loadCatalog()
    } catch (err) {
      // Response của modal cũ sau khi đã mở modal mới: bỏ qua.
      if (!modalGuard.isCurrent(gen)) return
      // Không tự retry thao tác ghi: báo lỗi, mở lại nút để admin quyết định.
      setModalPending(false)
      setModalError(err?.message || 'Không lưu được video, vui lòng thử lại.')
      showToast(`Không lưu được video: ${err?.message || 'Đã xảy ra lỗi'}`, 'error')
    }
  }

  document.getElementById('btn-trial-save-draft')?.addEventListener('click', () => handleSave('save-video'))
  document.getElementById('btn-trial-publish')?.addEventListener('click', () => handleSave('publish'))
}

function openRevokeModal(lesson) {
  openModal(
    'Thu hồi bài học thử',
    `
      <p style="font-size:14px; color:#475569; line-height:1.6; margin:0 0 12px 0;">
        Bạn có chắc chắn muốn thu hồi bài học thử này không?
      </p>
      <div style="padding:12px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; margin-bottom:12px;">
        <div style="font-weight:700; color:#0f172a; font-size:14px;">${escapeHtml(lesson.title)}</div>
        <div style="font-size:12px; color:#64748b; margin-top:2px;">${escapeHtml(lesson.className || 'Lớp học')} &middot; ${escapeHtml(lesson.chapterTitle || 'Chương')}</div>
      </div>
      <ul style="font-size:13px; color:#475569; line-height:1.7; margin:0; padding-left:18px;">
        <li>Link học thử công khai của bài này sẽ <strong>mất hiệu lực ngay</strong> — học sinh mở link cũ sẽ thấy trạng thái "Bài học thử này đã được thu hồi hoặc không còn khả dụng".</li>
        <li>Video bài giảng <strong>vẫn được giữ nội bộ, không bị xóa</strong> — có thể xuất bản lại bất cứ lúc nào từ module này.</li>
        <li>Tài liệu và bài tập của bài học không bị thay đổi.</li>
      </ul>
    `,
    async () => {
      try {
        await api.revokeTrialLesson(lesson.id)
        showToast('Đã thu hồi bài học thử.', 'success')
        await loadCatalog()
        return true
      } catch (err) {
        showToast(`Thu hồi thất bại: ${err?.message || 'Đã xảy ra lỗi'}`, 'error')
        return false
      }
    },
    { confirmLabel: 'Thu hồi' }
  )
}

async function handleCopyLink(lesson) {
  const link = buildTrialLessonLink(window.location.origin, window.location.pathname, lesson.id)
  // 1. Clipboard API (cần secure context + quyền).
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(link)
      showToast('Đã sao chép link học thử.', 'success')
      return
    }
  } catch {}
  // 2. Fallback: textarea tạm + execCommand.
  try {
    const ta = document.createElement('textarea')
    ta.value = link
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    if (ok) {
      showToast('Đã sao chép link học thử.', 'success')
      return
    }
  } catch {}
  // 3. Fallback thân thiện: hiện link để sao chép thủ công.
  openModal(
    'Sao chép link học thử',
    `
      <p style="font-size:14px; color:#475569; line-height:1.6; margin:0 0 12px 0;">
        Trình duyệt đã chặn sao chép tự động. Bạn bấm vào ô dưới đây rồi sao chép link thủ công:
      </p>
      <input type="text" readonly value="${escapeHtml(link)}" onclick="this.select()" style="width:100%; padding:10px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; box-sizing:border-box;">
    `,
    null
  )
}

export function renderTrialManagementView() {
  // Mỗi lần router vào route: reset state lọc/highlight theo hash hiện tại.
  filters = { q: '', classId: '', chapterId: '', status: 'all', video: 'all' }
  highlightLessonId = getRouteLessonId()
  highlightNotice = ''
  highlightScrolled = false
  viewState = 'loading'
  loadErrorMessage = ''
  serverKpis = null

  return `
    <div class="app-layout">
      ${renderSidebar('trial-management')}
      <div class="main-content">
        ${renderNavbar('Quản lý học thử')}
        <div class="content-body" style="padding-top:16px;">
          <div class="page-header" style="margin-bottom:20px;">
            <div>
              <h1 class="page-title" style="font-size:22px; margin:0 0 4px 0;">Quản lý học thử</h1>
              <p class="page-description" style="margin:0;">Quản lý tập trung video và trạng thái công khai của các bài học thử. Link học thử mở được mà không cần đăng nhập.</p>
            </div>
          </div>

          <div id="trial-kpis" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:14px; margin-bottom:20px;"></div>

          <div class="card" style="padding:16px 18px; margin-bottom:20px;">
            <div class="trial-filter-bar" style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
              <div style="flex:1 1 220px;">
                <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Tìm kiếm</label>
                <input type="text" id="trial-filter-q" placeholder="Tên bài học, chương, lớp..." style="width:100%; padding:9px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; box-sizing:border-box;">
              </div>
              <div style="flex:1 1 160px;">
                <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Lớp</label>
                <select id="trial-filter-class" style="width:100%; padding:9px 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; background:#fff;">
                  <option value="">Tất cả lớp</option>
                </select>
              </div>
              <div style="flex:1 1 160px;">
                <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Chương</label>
                <select id="trial-filter-chapter" style="width:100%; padding:9px 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; background:#fff;">
                  <option value="">Tất cả chương</option>
                </select>
              </div>
              <div style="flex:1 1 150px;">
                <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Trạng thái</label>
                <select id="trial-filter-status" style="width:100%; padding:9px 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; background:#fff;">
                  <option value="all">Tất cả trạng thái</option>
                  <option value="public">Đang công khai</option>
                  <option value="draft">Chưa công khai</option>
                </select>
              </div>
              <div style="flex:1 1 150px;">
                <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Video</label>
                <select id="trial-filter-video" style="width:100%; padding:9px 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; background:#fff;">
                  <option value="all">Tất cả video</option>
                  <option value="with">Có video</option>
                  <option value="without">Thiếu video</option>
                </select>
              </div>
              <button class="btn-secondary" id="btn-trial-reset-filters-top" style="width:auto; padding:9px 14px; font-size:13px; font-weight:600; cursor:pointer; border-radius:8px;">Xóa bộ lọc</button>
            </div>
            <div id="trial-count" style="font-size:12px; color:#64748b; margin-top:12px;"></div>
          </div>

          <div id="trial-notice"></div>

          <div class="card" style="padding:0; overflow:hidden;">
            <div id="trial-mgmt-list"></div>
          </div>
        </div>
      </div>
    </div>
  `
}

export function bindTrialManagementEvents() {
  bindSidebarEvents()

  const qInput = document.getElementById('trial-filter-q')
  qInput?.addEventListener('input', (e) => {
    filters.q = e.target.value || ''
    updateList()
  })

  document.getElementById('trial-filter-class')?.addEventListener('change', (e) => {
    filters.classId = e.target.value || ''
    // Đổi lớp -> chương cũ có thể không còn hợp lệ: renderFilterOptions tự reset.
    renderFilterOptions()
    updateList()
  })

  document.getElementById('trial-filter-chapter')?.addEventListener('change', (e) => {
    filters.chapterId = e.target.value || ''
    updateList()
  })

  document.getElementById('trial-filter-status')?.addEventListener('change', (e) => {
    filters.status = e.target.value || 'all'
    updateList()
  })

  document.getElementById('trial-filter-video')?.addEventListener('change', (e) => {
    filters.video = e.target.value || 'all'
    updateList()
  })

  const resetFilters = () => {
    filters = { q: '', classId: '', chapterId: '', status: 'all', video: 'all' }
    const q = document.getElementById('trial-filter-q')
    if (q) q.value = ''
    renderFilterOptions()
    updateList()
  }
  document.getElementById('btn-trial-reset-filters-top')?.addEventListener('click', resetFilters)

  // Delegation trên container list: bao phủ cả nút thử lại / xóa bộ lọc
  // trong các trạng thái rỗng/lỗi và nút hành động từng dòng.
  document.getElementById('trial-mgmt-list')?.addEventListener('click', (e) => {
    const retryBtn = e.target.closest('#btn-trial-retry')
    if (retryBtn) {
      loadCatalog()
      return
    }
    const resetBtn = e.target.closest('#btn-trial-reset-filters')
    if (resetBtn) {
      resetFilters()
      return
    }
    const actionBtn = e.target.closest('.trial-row-action')
    if (!actionBtn) return
    const lessonId = actionBtn.getAttribute('data-lesson-id')
    const lesson = allLessons.find((l) => l.id === lessonId)
    if (!lesson) return
    const action = actionBtn.getAttribute('data-action')
    if (action === 'open') {
      const link = buildTrialLessonLink(window.location.origin, window.location.pathname, lesson.id)
      window.open(link, '_blank', 'noopener')
    } else if (action === 'copy') {
      if (!canCopyTrialLink(lesson)) {
        showToast('Bài chưa công khai nên chưa có link học thử để sao chép.', 'warning')
        return
      }
      handleCopyLink(lesson)
    } else if (action === 'edit') {
      openVideoModal(lesson)
    } else if (action === 'revoke') {
      openRevokeModal(lesson)
    }
  })

  loadCatalog()
}
