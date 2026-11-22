/**
 * Mochi Student Tour Engine — fe/src/js/utils/mochi-tour.js
 *
 * Engine hướng dẫn học sinh cho giao diện Mochi:
 * - Bước 0: Màn chào mừng (không spotlight, linh vật lớn 96px, 3 gạch đầu dòng, Bắt đầu / Để sau).
 * - Các bước tiếp theo: Spotlight khoanh vùng phần tử [data-tour="..."] đang hiển thị (padding 8px).
 * - Bong bóng hướng dẫn: linh vật 56px, tiêu đề, Bước x/y, chấm tiến độ, Bỏ qua / Quay lại / Tiếp (hoặc Hoàn thành).
 * - Đáp ứng mobile <= 640px: thẻ đáy màn hình (bottom sheet), cuộn phần tử lên vùng thoáng phía trên.
 * - Chuẩn tiếp cận a11y: role="dialog", aria-modal="true", trap Tab, Esc=Bỏ qua, ←/→ đổi bước, focus management.
 * - Đánh dấu đã xem CHỈ khi đóng bằng 'done' hoặc 'skip'. Không ghi khi đổi route / thay thế tour / mượn phiên.
 */

if (typeof document !== 'undefined' && document.head) {
  import('../../css/mochi/tour.css')
}

import { isMochiUI } from '../ui-flag.js'
import { isImpersonating } from './impersonate.js'
import { state } from '../state.js'
import { api } from '../api.js'
import { showToast } from '../components/toast.js'
import { renderMascot } from '../components/mascot.js'
import { escapeHtml } from './download-helper.js'

const STORAGE_SEEN_PREFIX = 'edu_mtour_seen_'

let activeTourState = null
let autoStartTimer = null
let routeListenerInstalled = false

/**
 * Kiểm tra phần tử có đang hiển thị thực tế trên màn hình hay không.
 * (getClientRects().length > 0 và computed visibility != hidden và display != none).
 * @param {Element|null} el
 * @returns {boolean}
 */
export function isVisible(el) {
  if (!el || typeof el.getClientRects !== 'function') return false
  try {
    if (el.getClientRects().length === 0) return false
    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
      const style = window.getComputedStyle(el)
      if (style && (style.visibility === 'hidden' || style.display === 'none')) {
        return false
      }
    }
    return true
  } catch {
    return false
  }
}

/**
 * Tìm phần tử đầu tiên đang hiển thị khớp [data-tour="<target>"].
 * @param {string} target
 * @returns {Element|null}
 */
function findFirstVisibleTarget(target) {
  if (!target || typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') {
    return null
  }
  try {
    const candidates = document.querySelectorAll(`[data-tour="${target}"]`)
    for (let i = 0; i < candidates.length; i++) {
      if (isVisible(candidates[i])) {
        return candidates[i]
      }
    }
  } catch {}
  return null
}

/**
 * Kiểm tra xem phần tử đích hoặc tổ tiên của nó có computed position: fixed hay không.
 * @param {Element|null} el
 * @returns {boolean}
 */
export function isFixedElement(el) {
  if (!el || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
    return false
  }
  let curr = el
  while (curr && curr !== document.body && curr !== document.documentElement) {
    try {
      const style = window.getComputedStyle(curr)
      if (style && style.position === 'fixed') {
        return true
      }
    } catch {}
    curr = curr.parentElement || curr.parentNode
  }
  return false
}

/**
 * Đo vị trí đáy của header cố định (hoặc sticky) ở đỉnh màn hình:
 * tìm .m-shell-topbar, .m-shell-header hoặc phần tử fixed/sticky ở top; nếu không tìm thấy dùng 72px.
 * @returns {number}
 */
export function getHeaderBottom() {
  if (typeof document === 'undefined') return 72
  try {
    const candidates = document.querySelectorAll(
      '.m-shell-topbar, .m-shell-header, .lw-topbar, .m-rm-topbar, header'
    )
    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i]
      if (isVisible(el)) {
        const rect = el.getBoundingClientRect()
        if (rect && rect.top <= 10 && rect.bottom > 20 && rect.bottom <= 200) {
          return rect.bottom
        }
      }
    }
    const allHeaders = document.querySelectorAll('[class*="topbar"], [class*="header"]')
    for (let i = 0; i < allHeaders.length; i++) {
      const el = allHeaders[i]
      if (isVisible(el) && typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
        const style = window.getComputedStyle(el)
        if (style && (style.position === 'fixed' || style.position === 'sticky')) {
          const rect = el.getBoundingClientRect()
          if (rect && rect.top <= 10 && rect.bottom > 20 && rect.bottom <= 200) {
            return rect.bottom
          }
        }
      }
    }
  } catch {}
  return 72
}

/**
 * Chọn vị trí hiển thị cho thẻ bubble trên màn hình mobile (<= 640px).
 *
 * @param {object} params
 * @param {number} params.targetTop - getBoundingClientRect().top của phần tử
 * @param {number} params.targetBottom - getBoundingClientRect().bottom của phần tử
 * @param {number} [params.viewportH] - Chiều cao khung nhìn (window.innerHeight)
 * @param {number} [params.sheetH] - Chiều cao thực của thẻ bubble
 * @param {number} [params.headerBottom] - Vị trí đáy của header cố định (mặc định 72)
 * @param {number} [params.pad] - Padding spotlight (mặc định 8)
 * @returns {'top' | 'bottom'}
 */
export function chooseSheetPlacement({
  targetTop,
  targetBottom,
  viewportH,
  sheetH,
  headerBottom,
  pad = 8
} = {}) {
  const vh = Number.isFinite(viewportH) ? viewportH : (typeof window !== 'undefined' ? window.innerHeight : 600)
  const sH = Number.isFinite(sheetH) ? sheetH : 220
  const hBottom = Number.isFinite(headerBottom) ? headerBottom : 72
  const p = Number.isFinite(pad) ? pad : 8

  if (!Number.isFinite(targetTop) || !Number.isFinite(targetBottom)) {
    return 'bottom'
  }

  const targetH = targetBottom - targetTop

  // Vùng trống khả dụng giữa header và sheet đáy:
  // Nếu phần tử quá cao (cao hơn ~ innerHeight - sheetH - 24 hoặc cao hơn vùng trống thực tế)
  // thì giữ sheet ở đáy và cuộn mép trên phần tử nằm dưới header.
  const clearH = Math.max(0, vh - sH - (hBottom > 0 ? hBottom : 24))
  const tallThreshold = Math.min(vh - sH - 24, clearH)
  if (targetH > tallThreshold) {
    return 'bottom'
  }

  // Nếu phần tử (kể cả padding spotlight) giao với vùng sheet ở đáy:
  // r.bottom + pad > innerHeight - sheetH
  if (targetBottom + p > vh - sH) {
    return 'top'
  }

  return 'bottom'
}

/**
 * Kiểm tra điều kiện tự động mở tour cho học sinh:
 * - Role học sinh
 * - Giao diện Mochi bật
 * - Không đang mượn phiên (admin)
 * - Chưa có key trong seenTours của tài khoản
 * - Chưa có cờ localStorage 'edu_mtour_seen_<key>' === '1'
 * @param {string} key
 * @param {object} [user]
 * @returns {boolean}
 */
export function shouldAutoStart(key, user = state.user) {
  if (!key) return false
  if (user?.role !== 'STUDENT') return false
  if (!isMochiUI()) return false
  if (isImpersonating()) return false
  if (Array.isArray(user?.seenTours) && user.seenTours.includes(key)) return false

  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_SEEN_PREFIX + key) === '1') {
      return false
    }
  } catch {
    return false
  }
  return true
}

/**
 * Chỉ các lý do đóng này mới được đánh dấu đã xem:
 * - 'done': Hoàn thành bước cuối
 * - 'skip': Bỏ qua, Esc, nút "Để sau", hoặc bấm ra ngoài nền
 * @param {string} reason
 * @returns {boolean}
 */
export function closeReasonMarksSeen(reason) {
  return reason === 'done' || reason === 'skip'
}

/**
 * Đánh dấu tour đã xem vào localStorage và đồng bộ máy chủ nếu không mượn phiên.
 * Tách tham số phụ thuộc để kiểm thử đơn vị độc lập.
 */
export function markTourSeen(key, {
  isImpersonatingFn = isImpersonating,
  apiObj = api,
  userState = state.user
} = {}) {
  if (!key) return
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_SEEN_PREFIX + key, '1')
    }
  } catch {}

  const impersonating = typeof isImpersonatingFn === 'function' ? isImpersonatingFn() : false
  if (!impersonating) {
    if (userState && Array.isArray(userState.seenTours) && !userState.seenTours.includes(key)) {
      userState.seenTours.push(key)
    }
    if (apiObj && typeof apiObj.completeOnboarding === 'function') {
      try {
        const res = apiObj.completeOnboarding(key)
        if (res && typeof res.catch === 'function') {
          res.catch(() => {})
        }
      } catch {}
    }
  }
}

/**
 * Huỷ timer tự động mở tour đang chờ (nếu có).
 */
export function cancelScheduledTour() {
  if (autoStartTimer !== null) {
    clearTimeout(autoStartTimer)
    autoStartTimer = null
  }
}

/**
 * Lắng nghe hashchange để tự dọn dẹp tour đang mở và timer (không rò rỉ).
 */
function ensureRouteListener() {
  if (routeListenerInstalled) return
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return
  routeListenerInstalled = true
  window.addEventListener('hashchange', () => {
    cancelScheduledTour()
    if (activeTourState) {
      endActiveTourInternal('route')
    }
  })
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  ensureRouteListener()
}

/**
 * Kiểm tra xem có tour nào đang hiển thị hay không.
 * @returns {boolean}
 */
export function isTourActive() {
  return Boolean(activeTourState)
}

/**
 * Đóng tour đang mở (không đánh dấu đã xem).
 * @returns {boolean}
 */
export function endMochiTour() {
  return endActiveTourInternal('end')
}

/**
 * Đóng tour nội bộ với lý do cụ thể.
 * @param {'done'|'skip'|'replaced'|'route'|'end'} reason
 * @returns {boolean}
 */
function endActiveTourInternal(reason) {
  const current = activeTourState
  if (!current) return false
  activeTourState = null

  // Huỷ timer định vị hoặc animation frame đang chờ
  if (current.positionTimer) {
    clearTimeout(current.positionTimer)
    current.positionTimer = null
  }
  if (current.rafId) {
    if (typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(current.rafId)
    }
    current.rafId = null
  }

  // Tháo gỡ các event listener
  if (typeof window !== 'undefined') {
    if (current.onViewportChange) {
      window.removeEventListener('resize', current.onViewportChange)
      window.removeEventListener('scroll', current.onViewportChange, true)
    }
    if (current.onKeydown) {
      window.removeEventListener('keydown', current.onKeydown, true)
    }
  }

  // Xoá phần tử DOM của tour khỏi body
  if (current.rootEl && typeof current.rootEl.remove === 'function') {
    current.rootEl.remove()
  }

  // Đánh dấu đã xem nếu lý do hợp lệ
  if (closeReasonMarksSeen(reason) && current.key) {
    markTourSeen(current.key)
  }

  // Gọi callback onClose nếu có
  if (typeof current.opts?.onClose === 'function' && (reason === 'done' || reason === 'skip')) {
    try {
      current.opts.onClose(reason)
    } catch (err) {
      console.error('[mochi-tour] onClose error:', err)
    }
  }

  // Trả focus về phần tử trước khi mở tour
  if (current.previousFocusedEl && typeof current.previousFocusedEl.focus === 'function') {
    try {
      current.previousFocusedEl.focus()
    } catch {}
  }

  return true
}

/**
 * Hẹn tự động mở tour sau khoảng thời gian `delay` ms (chống stale async).
 * @param {object} tour
 * @param {{ delay?: number, guard?: Element }} [options]
 */
export function autoStartMochiTour(tour, { delay = 700, guard } = {}) {
  cancelScheduledTour()
  ensureRouteListener()

  const expectedHash = typeof window !== 'undefined' && window.location ? String(window.location.hash || '') : ''
  const waitMs = Number.isFinite(delay) ? Math.max(0, delay) : 700

  autoStartTimer = setTimeout(() => {
    autoStartTimer = null
    const currentHash = typeof window !== 'undefined' && window.location ? String(window.location.hash || '') : ''
    if (currentHash !== expectedHash) return
    if (guard && guard.isConnected === false) return
    if (isTourActive()) return
    if (!shouldAutoStart(tour?.key)) return

    startMochiTour(tour, { auto: true })
  }, waitMs)

  return autoStartTimer
}

/**
 * Khởi chạy tour hướng dẫn Mochi.
 * @param {{
 *   key: string,
 *   welcome?: { title: string, lines: string[], startLabel?: string, laterLabel?: string, mood?: string },
 *   steps: Array<{ target: string, title: string, text: string, mood?: string }>
 * }} tour
 * @param {{ auto?: boolean, onClose?: (reason: 'done'|'skip') => void }} [opts]
 * @returns {boolean}
 */
export function startMochiTour(tour, opts = {}) {
  // Chỉ 1 tour cùng lúc: mở tour mới thì đóng tour cũ (không gọi markSeen cho tour cũ)
  if (activeTourState) {
    endActiveTourInternal('replaced')
  }

  cancelScheduledTour()
  ensureRouteListener()

  if (!tour || typeof tour !== 'object') return false

  const rawSteps = Array.isArray(tour.steps) ? tour.steps : []
  // Lọc các bước có phần tử đích đang hiển thị lúc bắt đầu
  const validSteps = rawSteps.filter(s => s && findFirstVisibleTarget(s.target) !== null)

  const hasWelcome = Boolean(
    tour.welcome && (tour.welcome.title || (Array.isArray(tour.welcome.lines) && tour.welcome.lines.length > 0))
  )

  // Không còn bước nào và không có welcome → trả false
  if (validSteps.length === 0 && !hasWelcome) {
    if (!opts?.auto) {
      showToast('Trang này chưa có gì để hướng dẫn', 'info')
    }
    return false
  }

  if (typeof document === 'undefined' || !document.body) {
    return false
  }

  const previousFocusedEl = document.activeElement

  // Tạo cây DOM gốc <div class="m-tour" ...>
  const rootEl = document.createElement('div')
  rootEl.className = 'm-tour'
  rootEl.setAttribute('role', 'region')
  rootEl.setAttribute('aria-label', 'Hướng dẫn sử dụng')

  const backdropEl = document.createElement('div')
  backdropEl.className = 'm-tour-backdrop'
  rootEl.appendChild(backdropEl)

  const spotlightEl = document.createElement('div')
  spotlightEl.className = 'm-tour-spotlight'
  spotlightEl.setAttribute('aria-hidden', 'true')
  spotlightEl.style.display = 'none'
  rootEl.appendChild(spotlightEl)

  const bubbleEl = document.createElement('div')
  bubbleEl.className = 'm-tour-bubble'
  bubbleEl.setAttribute('role', 'dialog')
  bubbleEl.setAttribute('aria-modal', 'true')
  bubbleEl.style.display = 'none'
  rootEl.appendChild(bubbleEl)

  const welcomeEl = document.createElement('div')
  welcomeEl.className = 'm-tour-welcome'
  welcomeEl.setAttribute('role', 'dialog')
  welcomeEl.setAttribute('aria-modal', 'true')
  welcomeEl.style.display = 'none'
  rootEl.appendChild(welcomeEl)

  document.body.appendChild(rootEl)

  // Trạng thái điều hướng
  let isWelcomeActive = hasWelcome
  let currentStepIndex = 0
  let currentTargetEl = null

  // Đối tượng quản lý tour hiện tại
  const currentTour = {
    key: tour.key,
    opts,
    rootEl,
    backdropEl,
    spotlightEl,
    bubbleEl,
    welcomeEl,
    previousFocusedEl,
    positionTimer: null,
    rafId: null,
    onViewportChange: null,
    onKeydown: null
  }
  activeTourState = currentTour

  // Click ra nền → Bỏ qua (reason 'skip')
  backdropEl.addEventListener('click', () => {
    endActiveTourInternal('skip')
  })

  // Định vị spotlight và bong bóng
  function updatePositions({ canScroll, isFinalCheck } = {}) {
    if (isWelcomeActive || !currentTargetEl || !currentTargetEl.isConnected) return

    const pad = 8
    const r = currentTargetEl.getBoundingClientRect()

    spotlightEl.style.top = Math.max(0, r.top - pad) + 'px'
    spotlightEl.style.left = Math.max(0, r.left - pad) + 'px'
    spotlightEl.style.width = (r.width + pad * 2) + 'px'
    spotlightEl.style.height = (r.height + pad * 2) + 'px'

    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 640
    if (isMobile) {
      // Mobile: vị trí thẻ do CSS bottom sheet hoặc top sheet định vị
      bubbleEl.style.top = ''
      bubbleEl.style.left = ''

      // Đo sheetH thực tế sau khi đã render nội dung bước hiện tại
      const sheetH = bubbleEl.offsetHeight || bubbleEl.getBoundingClientRect()?.height || 220
      const headerBottom = getHeaderBottom()
      const vh = (typeof window !== 'undefined' && window.innerHeight) || 600

      const placement = chooseSheetPlacement({
        targetTop: r.top,
        targetBottom: r.bottom,
        viewportH: vh,
        sheetH,
        headerBottom,
        pad
      })

      // Áp dụng class m-tour-bubble--top:
      // 1. Sau khi cuộn xong (isFinalCheck)
      // 2. Hoặc khi phần tử không thể cuộn (fixed hoặc đã ở đáy trang, canScroll === false)
      // 3. Hoặc khi gọi từ onViewportChange (resize / cuộn tay của người dùng)
      if (isFinalCheck || canScroll === false || canScroll === undefined) {
        if (placement === 'top') {
          bubbleEl.classList.add('m-tour-bubble--top')
        } else {
          bubbleEl.classList.remove('m-tour-bubble--top')
        }
      } else {
        // canScroll === true và chưa qua timer: giữ sheet ở đáy để thử cuộn
        bubbleEl.classList.remove('m-tour-bubble--top')
      }
      return
    }

    // Desktop (>640px): giữ nguyên hành vi hiện tại
    bubbleEl.classList.remove('m-tour-bubble--top')

    // Desktop: đặt cạnh phần tử (dưới, nếu không đủ chỗ thì trên), không tràn khung nhìn
    const bubbleRect = bubbleEl.getBoundingClientRect()
    const bubbleW = bubbleRect.width || 360
    const bubbleH = bubbleRect.height || 220
    const gap = 12
    const vh = window.innerHeight || 800
    const vw = window.innerWidth || 1200

    let top = r.bottom + pad + gap
    if (top + bubbleH > vh - 12) {
      // Không đủ chỗ phía dưới, thử đặt phía trên
      if (r.top - pad - gap - bubbleH >= 12) {
        top = r.top - pad - gap - bubbleH
      } else {
        top = Math.max(12, Math.min(top, vh - bubbleH - 12))
      }
    }

    let left = r.left
    left = Math.max(12, Math.min(left, vw - bubbleW - 12))

    bubbleEl.style.top = top + 'px'
    bubbleEl.style.left = left + 'px'
  }

  // Cuộn phần tử vào khung nhìn với reduced-motion fallback
  function scrollToTarget(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return

    const prefersReduced = typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const behavior = prefersReduced ? 'auto' : 'smooth'

    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 640
    let canScroll = true

    if (isMobile) {
      const isFixed = isFixedElement(el)
      if (isFixed) {
        // Phần tử position:fixed -> không cuộn, chỉ chọn vị trí sheet theo quy tắc 1
        canScroll = false
      } else {
        const vh = (typeof window !== 'undefined' && window.innerHeight) || 600
        const sheetH = bubbleEl.offsetHeight || bubbleEl.getBoundingClientRect()?.height || 220
        const headerBottom = getHeaderBottom()
        const pad = 8
        const r = el.getBoundingClientRect()
        const targetH = r.height || (r.bottom - r.top)
        const clearH = vh - sheetH - (headerBottom > 0 ? headerBottom : 24)
        const isTall = targetH > (vh - sheetH - 24) || targetH > clearH

        let deltaY = 0
        if (isTall) {
          // Đặt mép trên phần tử ngay dưới header (không căn giữa) nếu nó cao
          const desiredTop = headerBottom + pad + 8
          deltaY = r.top - desiredTop
        } else {
          // Nếu thấp, căn giữa trong vùng [headerBottom, innerHeight - sheetH]
          const desiredCenter = (headerBottom + (vh - sheetH)) / 2
          const targetCenter = r.top + targetH / 2
          deltaY = targetCenter - desiredCenter
        }

        // Phát hiện không cuộn được (đã ở cuối trang và muốn cuộn tiếp xuống)
        const docEl = (typeof document !== 'undefined' && document.documentElement) || {}
        const scrollY = (typeof window !== 'undefined' && (window.scrollY ?? window.pageYOffset)) || 0
        const scrollH = docEl.scrollHeight || 0
        const maxScroll = Math.max(0, scrollH - vh)
        if (deltaY > 0 && maxScroll > 0 && scrollY >= maxScroll - 2) {
          canScroll = false
        }

        if (Math.abs(deltaY) > 2) {
          if (typeof window.scrollBy === 'function') {
            window.scrollBy({ top: deltaY, behavior })
          } else if (typeof el.scrollIntoView === 'function') {
            el.scrollIntoView({ behavior, block: isTall ? 'start' : 'center' })
          }
        }
      }
    } else {
      if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior, block: 'center' })
      }
    }

    // Huỷ timer định vị cũ trước khi đặt timer mới
    if (currentTour.positionTimer) {
      clearTimeout(currentTour.positionTimer)
      currentTour.positionTimer = null
    }

    updatePositions({ canScroll })
    currentTour.positionTimer = setTimeout(() => {
      currentTour.positionTimer = null
      updatePositions({ isFinalCheck: true })
    }, prefersReduced ? 0 : 220)
  }

  // Listener resize / scroll dùng requestAnimationFrame không rò rỉ
  currentTour.onViewportChange = () => {
    if (currentTour.rafId) return
    if (typeof requestAnimationFrame === 'function') {
      currentTour.rafId = requestAnimationFrame(() => {
        currentTour.rafId = null
        updatePositions()
      })
    } else {
      updatePositions()
    }
  }

  window.addEventListener('resize', currentTour.onViewportChange)
  window.addEventListener('scroll', currentTour.onViewportChange, true)

  // Hiển thị màn chào mừng (bước 0)
  function showWelcome() {
    isWelcomeActive = true
    currentTargetEl = null

    rootEl.classList.remove('m-tour--has-spotlight')
    spotlightEl.style.display = 'none'
    bubbleEl.style.display = 'none'

    const welcome = tour.welcome || {}
    const titleId = 'm-tour-welcome-title'
    const mascotHtml = renderMascot({ mood: welcome.mood || 'cheer', size: 96 })
    const lines = Array.isArray(welcome.lines) ? welcome.lines : []
    const linesHtml = lines.map(line => `<li>${escapeHtml(line)}</li>`).join('')

    welcomeEl.innerHTML = `
      <div class="m-tour-welcome-mascot">${mascotHtml}</div>
      <h2 id="${titleId}" class="m-tour-welcome-title">${escapeHtml(welcome.title || 'Chào mừng bạn!')}</h2>
      ${linesHtml ? `<ul class="m-tour-welcome-lines">${linesHtml}</ul>` : ''}
      <div class="m-tour-welcome-actions">
        <button type="button" class="m-tour-btn m-tour-btn--primary m-tour-welcome-start">${escapeHtml(welcome.startLabel || 'Bắt đầu tham quan')}</button>
        <button type="button" class="m-tour-btn m-tour-btn--skip m-tour-welcome-later">${escapeHtml(welcome.laterLabel || 'Để sau')}</button>
      </div>
    `
    welcomeEl.setAttribute('aria-labelledby', titleId)
    welcomeEl.style.display = 'block'

    const btnStart = welcomeEl.querySelector('.m-tour-welcome-start')
    const btnLater = welcomeEl.querySelector('.m-tour-welcome-later')

    if (btnStart) {
      btnStart.onclick = () => {
        isWelcomeActive = false
        if (validSteps.length === 0) {
          endActiveTourInternal('done')
        } else {
          currentStepIndex = 0
          showStep(0)
        }
      }
      btnStart.focus()
    }

    if (btnLater) {
      btnLater.onclick = () => {
        endActiveTourInternal('skip')
      }
    }
  }

  // Hiển thị bước spotlight
  function showStep(index, direction = 1) {
    isWelcomeActive = false
    welcomeEl.style.display = 'none'

    // Kiểm tra lại phần tử khi tới bước; nếu ẩn → bỏ qua
    let target = null
    let targetIdx = index
    while (targetIdx >= 0 && targetIdx < validSteps.length) {
      target = findFirstVisibleTarget(validSteps[targetIdx].target)
      if (target) break
      targetIdx += direction
    }

    // Không còn bước nào khả dụng
    if (!target) {
      if (direction >= 0) {
        endActiveTourInternal('done')
      } else if (hasWelcome) {
        showWelcome()
      } else {
        endActiveTourInternal('done')
      }
      return
    }

    currentStepIndex = targetIdx
    currentTargetEl = target
    rootEl.classList.add('m-tour--has-spotlight')

    const step = validSteps[currentStepIndex]
    const stepNum = currentStepIndex + 1
    const totalSteps = validSteps.length
    const isLast = (currentStepIndex === validSteps.length - 1)
    const titleId = `m-tour-step-title-${currentStepIndex}`

    const mascotHtml = renderMascot({ mood: step.mood || 'happy', size: 56 })
    const dotsHtml = validSteps
      .map((_, i) => `<span class="m-tour-dot ${i === currentStepIndex ? 'm-tour-dot--active' : ''}"></span>`)
      .join('')

    bubbleEl.innerHTML = `
      <div class="m-tour-header">
        <div class="m-tour-mascot-wrap">${mascotHtml}</div>
        <div class="m-tour-header-text">
          <h2 id="${titleId}" class="m-tour-title">${escapeHtml(step.title)}</h2>
          <div class="m-tour-step-count" aria-live="polite">Bước ${stepNum}/${totalSteps}</div>
        </div>
      </div>
      <div class="m-tour-body">${escapeHtml(step.text)}</div>
      <div class="m-tour-footer">
        <div class="m-tour-dots" aria-hidden="true">${dotsHtml}</div>
        <div class="m-tour-actions">
          <button type="button" class="m-tour-btn m-tour-btn--skip">Bỏ qua</button>
          <button type="button" class="m-tour-btn m-tour-btn--back" ${currentStepIndex === 0 ? 'hidden style="display:none;"' : ''}>Quay lại</button>
          <button type="button" class="m-tour-btn m-tour-btn--primary m-tour-btn--next">${isLast ? 'Hoàn thành' : 'Tiếp'}</button>
        </div>
      </div>
    `
    bubbleEl.setAttribute('aria-labelledby', titleId)
    bubbleEl.style.display = 'block'
    spotlightEl.style.display = 'block'

    const btnSkip = bubbleEl.querySelector('.m-tour-btn--skip')
    const btnBack = bubbleEl.querySelector('.m-tour-btn--back')
    const btnNext = bubbleEl.querySelector('.m-tour-btn--next')

    if (btnSkip) {
      btnSkip.onclick = () => endActiveTourInternal('skip')
    }

    if (btnBack) {
      btnBack.onclick = () => {
        if (currentStepIndex > 0) {
          showStep(currentStepIndex - 1, -1)
        }
      }
    }

    if (btnNext) {
      btnNext.onclick = () => {
        if (isLast) {
          endActiveTourInternal('done')
        } else {
          showStep(currentStepIndex + 1, 1)
        }
      }
      btnNext.focus()
    }

    bubbleEl.classList.remove('m-tour-bubble--top')
    scrollToTarget(target)
  }

  // Quản lý bàn phím & Trap focus
  currentTour.onKeydown = (e) => {
    if (!activeTourState) return

    if (e.key === 'Escape') {
      e.preventDefault()
      endActiveTourInternal('skip')
      return
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (isWelcomeActive) {
        const btn = welcomeEl.querySelector('.m-tour-welcome-start')
        if (btn) btn.click()
      } else {
        const btn = bubbleEl.querySelector('.m-tour-btn--next')
        if (btn) btn.click()
      }
      return
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      if (!isWelcomeActive && currentStepIndex > 0) {
        const btn = bubbleEl.querySelector('.m-tour-btn--back')
        if (btn && !btn.hidden) btn.click()
      }
      return
    }

    // Trap focus Tab / Shift+Tab trong thẻ đang hiển thị
    if (e.key === 'Tab') {
      const activeCard = isWelcomeActive ? welcomeEl : bubbleEl
      const focusables = Array.from(
        activeCard.querySelectorAll('button:not([disabled]):not([hidden]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])')
      ).filter(el => {
        return el.style.display !== 'none' && !el.hasAttribute('hidden')
      })

      if (focusables.length === 0) {
        e.preventDefault()
        return
      }

      const first = focusables[0]
      const last = focusables[focusables.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
  }

  window.addEventListener('keydown', currentTour.onKeydown, true)

  // Khởi động bước đầu
  if (hasWelcome) {
    showWelcome()
  } else {
    showStep(0, 1)
  }

  return true
}
