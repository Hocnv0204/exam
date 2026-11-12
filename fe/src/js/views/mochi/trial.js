// Khung trang HỌC THỬ giao diện Mochi (công khai). Gốc dùng chung token + thanh trên với trang lộ trình:
//   <div class="m-roadmap m-trial" data-roadmap-theme="…" data-trial-screen="…">
// Nội dung từng màn do 2 module riêng render (hàm thuần, nhận dữ liệu đã chuẩn bị):
//   - trial-browse.js : màn A danh sách lớp, màn B bài học trong lớp
//   - trial-detail.js : màn C chi tiết bài học, màn D lịch sử làm bài, trạng thái link bị thu hồi
// Sự kiện vẫn do bindTrialEvents (views/trial.js) gắn qua các id/class cũ — xem HỢP ĐỒNG trong từng module.
import { escapeHtml } from '../../utils/download-helper.js'
import { getStudentTheme } from '../../theme.js'
import { renderMochiPublicTopbar } from '../../components/mochi-public-topbar.js'
import { renderMascot } from '../../components/mascot.js'
import { computeTrialHistoryStats } from '../../utils/trial-helpers.js'
import { renderMochiTrialClasses, renderMochiTrialClass } from './trial-browse.js'
import { renderMochiTrialLesson, renderMochiTrialHistory, renderMochiTrialRevoked } from './trial-detail.js'

if (typeof document !== 'undefined' && document.head) {
  import('../../../css/mochi/trial-shell.css')
}

export const MOCHI_TRIAL_SCREENS = ['loading', 'revoked', 'history', 'lesson', 'class', 'classes']

/** Chọn màn hình theo cùng thứ tự ưu tiên với bản cũ (riêng lịch sử không phải chờ tải bài học). */
export function resolveMochiTrialScreen({ activeTab, loading, revoked, selectedClass, activeLesson }) {
  if (activeTab === 'history') return 'history'
  if (loading) return 'loading'
  if (revoked && activeTab === 'lessons') return 'revoked'
  if (selectedClass && activeLesson) return 'lesson'
  if (selectedClass) return 'class'
  return 'classes'
}

function renderLoading() {
  return `
    <section class="m-trial-loading" aria-busy="true" aria-label="Đang tải danh sách bài học thử">
      <div class="m-trial-loading-mascot">${renderMascot({ mood: 'happy', size: 96 })}</div>
      <h2>Đang tải danh sách bài học thử…</h2>
      <p>Vui lòng đợi trong giây lát</p>
      <div class="m-trial-skeleton" aria-hidden="true"><span></span><span></span><span></span></div>
    </section>
  `
}

/**
 * @param {object} ctx
 *  screen: một trong MOCHI_TRIAL_SCREENS
 *  classes, selectedClass, classLessons, activeLesson, historyList, savedPhone
 */
export function renderMochiTrialView(ctx = {}) {
  const screen = MOCHI_TRIAL_SCREENS.includes(ctx.screen) ? ctx.screen : 'classes'
  const historyList = Array.isArray(ctx.historyList) ? ctx.historyList : []
  const isHistory = screen === 'history'

  let content
  switch (screen) {
    case 'loading': content = renderLoading(); break
    case 'revoked': content = renderMochiTrialRevoked(); break
    case 'history': content = renderMochiTrialHistory({ historyList, savedPhone: ctx.savedPhone || '', stats: computeTrialHistoryStats(historyList) }); break
    case 'lesson': content = renderMochiTrialLesson({ selectedClass: ctx.selectedClass, classLessons: ctx.classLessons || [], activeLesson: ctx.activeLesson }); break
    case 'class': content = renderMochiTrialClass({ selectedClass: ctx.selectedClass, classLessons: ctx.classLessons || [] }); break
    default: content = renderMochiTrialClasses({ classes: ctx.classes || [] })
  }

  return `
    <div class="m-roadmap m-trial" data-roadmap-theme="${escapeHtml(getStudentTheme())}" data-trial-screen="${screen}">
      ${renderMochiPublicTopbar({ active: 'trial' })}
      <main class="m-trial-main" id="m-trial-main">
        <nav class="m-trial-subnav" aria-label="Học thử">
          <button type="button" id="btn-tab-trial-lessons" class="m-trial-subtab${isHistory ? '' : ' is-active'}" ${isHistory ? '' : 'aria-current="page"'}>
            <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Lớp học thử
          </button>
          <button type="button" id="btn-tab-trial-history" class="m-trial-subtab${isHistory ? ' is-active' : ''}" ${isHistory ? 'aria-current="page"' : ''}>
            <i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> Lịch sử làm bài
            ${historyList.length ? `<span class="m-trial-subtab-count">${historyList.length}</span>` : ''}
          </button>
        </nav>
        ${content}
      </main>
    </div>
  `
}
