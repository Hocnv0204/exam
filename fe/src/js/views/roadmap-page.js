// Điểm vào cho các route lộ trình (#roadmap, #roadmap-12, #roadmap-11, #roadmap-math-12, #roadmap-math-11).
// Mochi (mặc định) => trang lộ trình Mochi dùng chung cho 4 môn.
// ?ui=classic => Hóa giữ nguyên trang cũ (trial.js); Toán chỉ có bản Mochi nên vẫn dùng Mochi.
import { isMochiUI } from '../ui-flag.js'
import { renderTrialView, bindTrialEvents } from './trial.js'
import { renderMochiRoadmap, bindMochiRoadmapEvents } from './mochi/roadmap.js'
import { getRoadmapSubjectByRoute } from '../data/roadmaps/index.js'

const MOCHI_ONLY_ROUTES = new Set(['roadmap-math-12', 'roadmap-math-11'])

function currentRoute() {
  return window.location.hash.replace('#', '').split('?')[0] || 'roadmap'
}

export function useMochiRoadmap(route = currentRoute()) {
  return MOCHI_ONLY_ROUTES.has(route) || isMochiUI()
}

export function renderRoadmapPage() {
  const route = currentRoute()
  return useMochiRoadmap(route) ? renderMochiRoadmap(getRoadmapSubjectByRoute(route)) : renderTrialView()
}

export function bindRoadmapPage() {
  const route = currentRoute()
  if (!useMochiRoadmap(route)) return bindTrialEvents()
  const root = document.querySelector('.m-roadmap')
  if (root) bindMochiRoadmapEvents(root, getRoadmapSubjectByRoute(route))
}

// Route #trial: khi không chỉ định tab (hoặc tab là lộ trình) trial.js mặc định hiện lộ trình Hóa cũ.
// Ở Mochi chuyển sang route lộ trình tương ứng (giữ nguyên trang bài học thử / lịch sử).
const TRIAL_TAB_TO_ROUTE = {
  roadmap: 'roadmap',
  'roadmap-12': 'roadmap',
  'roadmap-11': 'roadmap-11',
  'roadmap-math-12': 'roadmap-math-12',
  'roadmap-math-11': 'roadmap-math-11'
}

export function resolveTrialRoadmapRoute(hash = window.location.hash) {
  const [routePath, queryString] = String(hash || '').replace('#', '').split('?')
  if (routePath !== 'trial') return null
  const params = new URLSearchParams(queryString || '')
  const tab = params.get('tab')
  if (tab) return TRIAL_TAB_TO_ROUTE[tab] || null
  if (params.get('classId') || params.get('lessonId')) return null
  return 'roadmap'
}

function trialMochiTarget() {
  const target = resolveTrialRoadmapRoute()
  return target && isMochiUI() ? target : null
}

export function renderTrialRoute() {
  const target = trialMochiTarget()
  if (!target) return renderTrialView()
  // Đổi URL tại chỗ (không tạo hashchange) để tab môn, nút quay lại và chia sẻ link đúng.
  try { window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${target}`) } catch (_) {}
  return renderMochiRoadmap(getRoadmapSubjectByRoute(target))
}

export function bindTrialRoute() {
  // Trang học thử Mochi cũng có gốc .m-roadmap (.m-trial) → phân biệt bằng data-roadmap-id.
  const root = document.querySelector('.m-roadmap[data-roadmap-id]')
  if (!root) return bindTrialEvents()
  bindMochiRoadmapEvents(root, getRoadmapSubjectByRoute(currentRoute()))
}
