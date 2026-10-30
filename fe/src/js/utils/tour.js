/**
 * Tour hướng dẫn newbie: spotlight từng khu vực + tooltip giải thích.
 * Dùng cho giao diện học sinh.
 *
 * - Tour dashboard chỉ tự mở ở lần đăng nhập đầu tiên (cờ server auto_intro_pending
 *   được login tiêu thụ một lần; xem claimAutoIntro bên dưới).
 * - Tour bài tập / bài học chỉ mở khi bấm nút "Hướng dẫn" (không auto).
 * - Server (seen_tours) là nguồn ưu tiên cho trạng thái đã xem; localStorage chỉ
 *   là lớp chống lặp trong cùng trình duyệt.
 */
const SEEN_PREFIX = 'edu_tour_seen_'
const AUTO_INTRO_PREFIX = 'edu_auto_intro_consumed_'

async function getServerSeen() {
  try {
    const { state } = await import('../state.js')
    const seen = state.user?.seenTours
    return Array.isArray(seen) ? seen : null
  } catch {
    return null
  }
}

function getLocalSeen(key) {
  try {
    return localStorage.getItem(SEEN_PREFIX + key) === '1'
  } catch {
    return false
  }
}

/** Ưu tiên cờ server (đăng nhập máy nào cũng chỉ hiện lần đầu), fallback localStorage. */
export async function hasSeenTour(key) {
  const serverSeen = await getServerSeen()
  if (serverSeen !== null) return serverSeen.includes(key)
  return getLocalSeen(key)
}

export function markTourSeen(key) {
  try {
    localStorage.setItem(SEEN_PREFIX + key, '1')
  } catch {}
  try {
    import('../state.js').then(({ state }) => {
      const seen = state.user?.seenTours
      if (Array.isArray(seen) && !seen.includes(key)) seen.push(key)
    })
  } catch {}
  import('../api.js').then(({ api }) => {
    api.completeOnboarding(key).catch(() => {})
  }).catch(() => {})
}

export function resetTour(key) {
  try {
    localStorage.removeItem(SEEN_PREFIX + key)
  } catch {}
}

/* -------------------------------------------------------------------------
 * Auto intro một lần cho học sinh.
 *
 * Server quyết định "có phải lần đăng nhập đầu tiên" bằng cờ
 * profiles.auto_intro_pending (login trả user.autoIntro = true đúng 1 lần).
 * Ở client, các marker dưới đây chỉ để chống mở lặp khi reload/mở tab mới
 * trong cùng trình duyệt; không dùng làm nguồn quyết định eligibility.
 * ---------------------------------------------------------------------- */

const memoryConsumed = new Set()
let scheduledIntroTimer = null
let routeListenerInstalled = false

function safeStorage(name) {
  try {
    const store = typeof globalThis !== 'undefined' ? globalThis[name] : null
    return store && typeof store.getItem === 'function' ? store : null
  } catch {
    return null
  }
}

function isConsumedIn(store, key) {
  try {
    return store?.getItem(key) === '1'
  } catch {
    return false
  }
}

function markConsumedIn(store, key) {
  try {
    store?.setItem(key, '1')
  } catch {}
}

/** Chỉ học sinh được server cấp autoIntro mới đủ điều kiện tự mở tour. */
export function isAutoIntroEligible(user) {
  return Boolean(user && user.role === 'STUDENT' && user.autoIntro === true)
}

/**
 * Tiêu thụ lượt auto intro một lần. Trả false nếu không đủ điều kiện hoặc
 * trình duyệt này đã mở rồi (chống reload/mở tab lặp).
 * `opts.stores` chỉ dùng cho test.
 */
export function claimAutoIntro(user, opts = {}) {
  if (!isAutoIntroEligible(user)) return false
  const userId = user && user.id != null ? String(user.id) : ''
  if (!userId) return false

  const key = AUTO_INTRO_PREFIX + userId
  const stores = Array.isArray(opts.stores)
    ? opts.stores.filter(Boolean)
    : [safeStorage('sessionStorage'), safeStorage('localStorage')].filter(Boolean)

  if (memoryConsumed.has(userId)) return false
  if (stores.some(store => isConsumedIn(store, key))) return false

  memoryConsumed.add(userId)
  stores.forEach(store => markConsumedIn(store, key))
  return true
}

function currentRouteHash() {
  try {
    return typeof window !== 'undefined' && window.location ? String(window.location.hash || '') : ''
  } catch {
    return ''
  }
}

/** Huỷ timer auto tour đang chờ (đổi route / view bị thay thế). */
export function cancelScheduledIntro() {
  if (scheduledIntroTimer !== null) {
    clearTimeout(scheduledIntroTimer)
    scheduledIntroTimer = null
  }
}

function ensureRouteChangeCancels() {
  if (routeListenerInstalled) return
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return
  routeListenerInstalled = true
  window.addEventListener('hashchange', () => {
    cancelScheduledIntro()
    endActiveTour()
  })
}

/**
 * Hẹn mở tour auto sau `delay` ms, có chống stale:
 * - Chỉ chạy nếu hash hiện tại vẫn là hash lúc bind view.
 * - Chỉ chạy nếu guard element (view đã render) còn trong DOM.
 * - Không chồng lên tour đang mở; mỗi lúc chỉ có 1 timer.
 *
 * opts: { user, key, delay, hash, guard, start (test), stores (test) }
 */
export function scheduleAutoIntroTour(steps, opts = {}) {
  const expectedHash = typeof opts.hash === 'string' ? opts.hash : currentRouteHash()
  const guard = opts.guard || null

  // Stale async: view cũ bind xong sau khi đã đổi route/render view mới.
  if (currentRouteHash() !== expectedHash) return false
  if (guard && guard.isConnected === false) return false

  cancelScheduledIntro()
  ensureRouteChangeCancels()

  const delay = Number.isFinite(opts.delay) ? Math.max(0, opts.delay) : 800
  scheduledIntroTimer = setTimeout(() => {
    scheduledIntroTimer = null
    if (currentRouteHash() !== expectedHash) return
    if (guard && guard.isConnected === false) return
    if (typeof document !== 'undefined' && document.getElementById('newbie-tour-overlay')) return
    if (!claimAutoIntro(opts.user, opts)) return
    const start = typeof opts.start === 'function' ? opts.start : startTour
    start(steps, opts.key ? { key: opts.key } : {})
  }, delay)
  return true
}

let activeTourCleanup = null

/** Đóng tour đang mở (overlay + tooltip nằm ngoài vùng render của router). */
export function endActiveTour() {
  const cleanup = activeTourCleanup
  activeTourCleanup = null
  if (cleanup) cleanup()
}

/**
 * steps: [{ selector, title, text }]
 * opts: { key, onDone }
 */
export function startTour(steps, opts = {}) {
  const valid = (steps || []).filter(s => s && document.querySelector(s.selector))
  if (valid.length === 0) return false
  if (opts.key) markTourSeen(opts.key)
  endActiveTour()

  const overlay = document.createElement('div')
  overlay.id = 'newbie-tour-overlay'
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,0.55);'
  const ring = document.createElement('div')
  ring.style.cssText = 'position:fixed;z-index:10001;border-radius:12px;box-shadow:0 0 0 9999px rgba(15,23,42,0.55), 0 0 0 3px #0066cc, 0 0 24px rgba(0,102,204,0.55);pointer-events:none;transition:all 0.25s ease;animation:tourPulse 1.6s ease-in-out infinite;'
  const tip = document.createElement('div')
  tip.style.cssText = 'position:fixed;z-index:10002;width:300px;max-width:calc(100vw - 32px);background:#ffffff;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,0.3);padding:16px 18px;transition:all 0.25s ease;'
  const style = document.createElement('style')
  style.textContent = '@keyframes tourPulse{0%,100%{box-shadow:0 0 0 9999px rgba(15,23,42,0.55),0 0 0 3px #0066cc,0 0 12px rgba(0,102,204,0.4);}50%{box-shadow:0 0 0 9999px rgba(15,23,42,0.55),0 0 0 5px #0066cc,0 0 30px rgba(0,102,204,0.7);}}'
  document.head.appendChild(style)
  document.body.appendChild(overlay)
  document.body.appendChild(ring)
  document.body.appendChild(tip)

  let idx = 0
  const cleanup = () => {
    window.removeEventListener('resize', place)
    window.removeEventListener('scroll', place, true)
    overlay.remove()
    ring.remove()
    tip.remove()
    style.remove()
    if (activeTourCleanup === cleanup) activeTourCleanup = null
    if (opts.onDone) opts.onDone()
  }
  activeTourCleanup = cleanup

  const place = () => {
    const step = valid[idx]
    const el = step && document.querySelector(step.selector)
    if (!el) {
      next()
      return
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Đợi scroll xong mới đo vị trí
    setTimeout(() => {
      const r = el.getBoundingClientRect()
      const pad = 8
      ring.style.left = Math.max(8, r.left - pad) + 'px'
      ring.style.top = Math.max(8, r.top - pad) + 'px'
      ring.style.width = (r.width + pad * 2) + 'px'
      ring.style.height = (r.height + pad * 2) + 'px'

      const tipH = tip.offsetHeight || 180
      let top = r.bottom + pad + 10
      if (top + tipH > window.innerHeight - 12) {
        top = Math.max(12, r.top - pad - 10 - tipH)
      }
      let left = Math.min(Math.max(12, r.left), window.innerWidth - 312)
      tip.style.left = left + 'px'
      tip.style.top = Math.max(12, top) + 'px'
    }, 350)
  }

  const render = () => {
    const step = valid[idx]
    tip.innerHTML = `
      <div style="font-size:11px; font-weight:800; color:#0066cc; text-transform:uppercase; margin-bottom:4px;">Bước ${idx + 1}/${valid.length}</div>
      <div style="font-size:15px; font-weight:800; color:#0f172a; margin-bottom:6px;">${step.title}</div>
      <div style="font-size:13px; color:#475569; line-height:1.55; margin-bottom:12px;">${step.text}</div>
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <button data-tour-act="skip" style="background:none; border:none; color:#94a3b8; font-size:12px; font-weight:600; cursor:pointer;">Bỏ qua</button>
        <div style="display:flex; gap:8px;">
          ${idx > 0 ? `<button data-tour-act="back" style="padding:7px 14px; font-size:12px; font-weight:700; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#475569; cursor:pointer;">Quay lại</button>` : ''}
          <button data-tour-act="next" style="padding:7px 16px; font-size:12px; font-weight:700; border-radius:8px; border:none; background:#0066cc; color:#ffffff; cursor:pointer;">${idx === valid.length - 1 ? 'Hoàn thành 🎉' : 'Tiếp tục'}</button>
        </div>
      </div>
    `
    tip.querySelector('[data-tour-act="skip"]').addEventListener('click', cleanup)
    tip.querySelector('[data-tour-act="next"]').addEventListener('click', () => {
      if (idx >= valid.length - 1) cleanup()
      else {
        idx++
        render()
        place()
      }
    })
    tip.querySelector('[data-tour-act="back"]')?.addEventListener('click', () => {
      if (idx > 0) {
        idx--
        render()
        place()
      }
    })
  }

  const next = () => {
    if (idx >= valid.length - 1) cleanup()
    else {
      idx++
      render()
      place()
    }
  }

  overlay.addEventListener('click', cleanup)
  window.addEventListener('resize', place)
  window.addEventListener('scroll', place, true)
  render()
  place()
  return true
}
