// Gắn tutorial Mochi (spec 006) vào router: nút "Hướng dẫn" (event delegation, nên vẫn chạy
// khi view tự render lại) và tự mở tour lần đầu vào trang. Chỉ học sinh trên giao diện Mochi;
// classic (?ui=classic) vẫn dùng utils/tour.js như cũ.
import { state } from '../state.js'
import { isMochiUI } from '../ui-flag.js'
import { STUDENT_TOURS, tourKeyForRoute } from '../data/student-tours.js'

// Trang tải dữ liệu chậm: chờ phần tử này xuất hiện (tối đa READY_TIMEOUT_MS) rồi mới tự mở,
// để các bước trỏ vào dữ liệu không bị bỏ qua. Hết giờ chờ vẫn mở với các bước đang có.
const READY_TARGET = {
  'm2-attendance': 'att-overview',
  'm2-achievements': 'ach-xp'
}
const READY_TIMEOUT_MS = 6000
const READY_POLL_MS = 250

let delegationInstalled = false

function isMochiStudent() {
  return state.user?.role === 'STUDENT' && isMochiUI()
}

function installReplayDelegation() {
  if (delegationInstalled || typeof document === 'undefined') return
  delegationInstalled = true
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('[data-tour-replay]')
    if (!button || !isMochiStudent()) return
    const tour = STUDENT_TOURS[button.dataset.tourReplay]
    if (!tour) return
    event.preventDefault()
    import('./mochi-tour.js').then(({ startMochiTour }) => startMochiTour(tour)).catch(() => {})
  })
}

function waitForTarget(target, guard) {
  return new Promise(resolve => {
    if (!target) return resolve()
    const started = Date.now()
    const check = () => {
      if (guard && guard.isConnected === false) return resolve()
      if (document.querySelector(`[data-tour="${target}"]`) || Date.now() - started >= READY_TIMEOUT_MS) return resolve()
      setTimeout(check, READY_POLL_MS)
    }
    check()
  })
}

/** Gọi sau mỗi lần router bind xong một view. */
export async function attachStudentTour(route, params = new URLSearchParams()) {
  if (!isMochiStudent()) return
  installReplayDelegation()

  const key = tourKeyForRoute(route, params)
  const tour = key ? STUDENT_TOURS[key] : null
  if (!tour) return

  // Chụp guard NGAY (trước mọi await) để không hẹn tour cho view đã bị thay thế.
  const guard = document.getElementById('app')?.firstElementChild || null
  const { autoStartMochiTour, shouldAutoStart } = await import('./mochi-tour.js')
  if (!shouldAutoStart(tour.key)) return
  await waitForTarget(READY_TARGET[tour.key], guard)
  if (guard && guard.isConnected === false) return
  autoStartMochiTour(tour, { guard, delay: READY_TARGET[tour.key] ? 300 : 900 })
}
