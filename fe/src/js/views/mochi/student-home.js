if (typeof document !== 'undefined' && document.head) {
  import('../../../css/mochi/achievements.css')
}
import { renderSidebar } from '../../components/sidebar.js'
import { renderNavbar } from '../../components/navbar.js'
import { renderMascot } from '../../components/mascot.js'
import { escapeHtml } from '../../utils/download-helper.js'
import { mountHomeAchievementsWidget, renderHomeAchievementsSkeleton } from '../../components/progress-widgets.js'
import { MOCHI_FEATURES } from '../../ui-flag.js'

let currentStudentHomeClasses = []

function firstName(user) {
  const name = String(user?.fullName || user?.full_name || user?.username || 'bạn').trim()
  return name.split(/\s+/).at(-1) || 'bạn'
}

export function renderMochiStudentHome({ classes = [], user } = {}) {
  currentStudentHomeClasses = classes
  const firstClass = classes[0]
  const fallbackClassId = firstClass?.id ? escapeHtml(firstClass.id) : ''
  const today = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long', day: '2-digit', month: '2-digit'
  }).format(new Date())

  const hasAchievementsFeature = Boolean(
    MOCHI_FEATURES.xp || MOCHI_FEATURES.streak || MOCHI_FEATURES.badges || MOCHI_FEATURES.leaderboard
  )

  return `
    <div class="app-layout navy-student m-student-page m-student-home">
      ${renderSidebar('student-dashboard')}
      <div class="main-content">
        ${renderNavbar('Học tập / Trang chủ')}
        <main class="content-body">
          <div class="m-page-wrap">
            <div id="student-tuition-notice" aria-live="polite"></div>
            <section class="m-home-hero" aria-labelledby="m-home-title">
              <div class="m-home-hero-copy">
                <span class="m-chip m-chip--accent2">${escapeHtml(today)}</span>
                <h1 id="m-home-title">Chào ${escapeHtml(firstName(user))}! Hôm nay mình học gì nhé?</h1>
                <p>Chọn một bài tập cần làm hoặc tiếp tục khám phá lớp học của bạn.</p>
                <div class="m-home-actions">
                  <button type="button" class="m-btn m-btn--primary" id="m-home-continue" data-fallback-class-id="${fallbackClassId}">
                    <i class="fa-solid fa-play" aria-hidden="true"></i> Tiếp tục
                  </button>
                  <a class="m-btn m-btn--secondary" href="${firstClass?.id ? `#my-classes?classId=${fallbackClassId}` : '#my-classes'}">Xem bản đồ bài học</a>
                </div>
              </div>
              <div class="m-home-mascot">
                <p>Mochi tin bạn làm được! Cố lên nào!</p>
                ${renderMascot({ mood: 'cheer', size: 160 })}
              </div>
            </section>

            ${hasAchievementsFeature ? `
              <section class="m-card m-home-achievements" id="m-home-achievements-card" aria-labelledby="m-achievements-title">
                <div class="m-section-heading">
                  <h2 id="m-achievements-title">Thành tích &amp; Hoạt động</h2>
                  <a href="#achievements">Xem tất cả</a>
                </div>
                <div id="student-home-achievements" aria-live="polite">
                  ${renderHomeAchievementsSkeleton()}
                </div>
              </section>
            ` : ''}

            <section class="m-card m-home-progress" aria-labelledby="m-progress-title">
              <div class="m-section-heading">
                <h2 id="m-progress-title">Tiến độ bài tập</h2>
              </div>
              <div id="student-dashboard-stats" aria-live="polite">Đang tải tiến độ học tập...</div>
            </section>

            <div class="m-home-grid">
              <section class="m-card" id="tour-latest-hw" aria-labelledby="m-todo-title">
                <div class="m-section-heading">
                  <h2 id="m-todo-title">Bài tập cần làm</h2>
                  <a href="#my-homeworks">Xem tất cả</a>
                </div>
                <div id="latest-homeworks-container" aria-live="polite">
                  <p class="m-loading"><i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Đang tải bài tập...</p>
                </div>
              </section>

              <section class="m-card" aria-labelledby="m-review-title">
                <div class="m-section-heading">
                  <h2 id="m-review-title">Mochi gợi ý ôn lại</h2>
                </div>
                <p class="m-section-description">Các chương bạn thường làm sai nhất</p>
                <div id="weak-topics-container" aria-live="polite">
                  <p class="m-loading"><i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Đang phân tích kết quả...</p>
                </div>
              </section>
            </div>

            <section class="m-card" id="inprogress-drafts-card" style="display:none" aria-labelledby="m-drafts-title">
              <div class="m-section-heading"><h2 id="m-drafts-title">Bài đang làm dở</h2></div>
              <div id="inprogress-drafts-container"></div>
            </section>

            <section class="m-card" aria-labelledby="m-scores-title">
              <div class="m-section-heading"><h2 id="m-scores-title">Điểm 10 bài nộp gần nhất</h2></div>
              <div id="student-dashboard-scores" aria-live="polite">Đang tải biểu đồ điểm số...</div>
            </section>

            <button type="button" class="m-btn m-btn--ghost m-tour-button" id="btn-replay-tour">
              <i class="fa-solid fa-circle-question" aria-hidden="true"></i> Xem hướng dẫn
            </button>
          </div>
        </main>
      </div>
    </div>`
}

export function bindMochiStudentHome({ loadStats, loadScores, loadHomeworks, loadWeakTopics, loadDrafts, startTour } = {}) {
  const continueButton = document.getElementById('m-home-continue')
  continueButton?.addEventListener('click', () => {
    if (continueButton.dataset.homeworkId) {
      window.confirmStartHomework(continueButton.dataset.homeworkId, continueButton.dataset.homeworkType || 'PRACTICE')
      return
    }
    const classId = continueButton.dataset.fallbackClassId
    window.location.hash = classId ? `#my-classes?classId=${classId}` : '#my-classes'
  })
  loadStats?.()
  loadScores?.()
  loadHomeworks?.()
  loadWeakTopics?.()
  loadDrafts?.()
  startTour?.()

  // Nạp bất đồng bộ khối thành tích & thi đua
  if (MOCHI_FEATURES.xp || MOCHI_FEATURES.streak || MOCHI_FEATURES.badges || MOCHI_FEATURES.leaderboard) {
    mountHomeAchievementsWidget({ classes: currentStudentHomeClasses })
  }
}
