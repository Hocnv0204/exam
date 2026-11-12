// Giao diện Mochi màn A (danh sách lớp học thử) và màn B (bài học trong một lớp).
// Sự kiện vẫn do bindTrialEvents (views/trial.js) gắn qua các hook id/class.
import { escapeHtml } from '../../utils/download-helper.js'
import { renderMascot } from '../../components/mascot.js'

if (typeof document !== 'undefined' && document.head) {
  import('../../../css/mochi/trial-browse.css')
}

/**
 * Đoán môn học từ tên lớp để hiển thị icon và màu sắc phù hợp.
 * 'Toán' -> fa-square-root-variable, 'Hóa' -> fa-flask, khác -> fa-graduation-cap
 */
function getSubjectMeta(className = '') {
  const name = String(className || '').toLowerCase()
  if (name.includes('toán') || name.includes('toan')) {
    return {
      icon: 'fa-solid fa-square-root-variable',
      typeClass: 'is-math'
    }
  }
  if (name.includes('hóa') || name.includes('hoa')) {
    return {
      icon: 'fa-solid fa-flask',
      typeClass: 'is-chem'
    }
  }
  return {
    icon: 'fa-solid fa-graduation-cap',
    typeClass: 'is-general'
  }
}

/**
 * Màn A: Danh sách lớp học thử
 * @param {object} props
 * @param {Array} props.classes Danh sách lớp: [{ id, name, lessons: [lesson], totalHomeworks }]
 */
export function renderMochiTrialClasses({ classes = [] } = {}) {
  const safeClasses = Array.isArray(classes) ? classes : []

  return `
    <section class="m-trial-classes" aria-label="Danh sách lớp học trải nghiệm miễn phí">
      <!-- Đầu trang -->
      <header class="m-trial-header">
        <div class="m-trial-badge">
          <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
          <span>100% miễn phí, không cần đăng nhập</span>
        </div>
        <h1 class="m-trial-title">Lớp học trải nghiệm miễn phí</h1>
        <p class="m-trial-subtitle">
          Chọn một lớp học để khám phá các bài giảng mẫu, tài liệu lý thuyết và làm thử các bài tập kiểm tra trắc nghiệm.
        </p>
      </header>

      <!-- Danh sách lớp hoặc trạng thái rỗng -->
      ${safeClasses.length === 0 ? `
        <div class="m-trial-empty-card" role="status">
          <div class="m-trial-empty-mascot">
            ${renderMascot({ mood: 'wink', size: 96 })}
          </div>
          <h2 class="m-trial-empty-title">Hiện tại chưa có lớp học thử nào</h2>
          <p class="m-trial-empty-desc">Vui lòng quay lại sau hoặc liên hệ quản trị viên để mở bài học thử.</p>
        </div>
      ` : `
        <div class="m-trial-classes-grid">
          ${safeClasses.map(c => {
            const classId = String(c?.id || '')
            const className = String(c?.name || 'Lớp học thử')
            const lessons = Array.isArray(c?.lessons) ? c.lessons : []
            const lessonCount = lessons.length
            const hwCount = c?.totalHomeworks != null
              ? Number(c.totalHomeworks)
              : lessons.reduce((sum, l) => sum + (Array.isArray(l?.homeworks) ? l.homeworks.length : 0), 0)
            const meta = getSubjectMeta(className)

            return `
              <div class="m-trial-class-card select-trial-class-card"
                   data-id="${escapeHtml(classId)}"
                   role="button" tabindex="0"
                   aria-label="Lớp ${escapeHtml(className)}: ${lessonCount} bài học thử, ${hwCount} bài tập tự luyện"
                   onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}">
                <div class="m-trial-card-top">
                  <div class="m-trial-subj-icon ${meta.typeClass}" aria-hidden="true">
                    <i class="${meta.icon}"></i>
                  </div>
                  <div class="m-trial-pill-badge">
                    <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
                    <span>Học thử</span>
                  </div>
                </div>

                <h2 class="m-trial-card-title">${escapeHtml(className)}</h2>

                <div class="m-trial-card-stats">
                  <div class="m-trial-card-stat-item">
                    <i class="fa-solid fa-book-open" aria-hidden="true"></i>
                    <span><strong>${lessonCount}</strong> bài học thử</span>
                  </div>
                  <div class="m-trial-card-stat-item">
                    <i class="fa-solid fa-list-check" aria-hidden="true"></i>
                    <span><strong>${hwCount}</strong> bài tập tự luyện</span>
                  </div>
                </div>

                <div class="m-trial-card-bottom">
                  <span class="m-trial-card-free-chip">Miễn phí 100%</span>
                  <span class="m-trial-card-action">
                    <span>Vào học thử</span>
                    <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                  </span>
                </div>
              </div>
            `
          }).join('')}
        </div>
      `}

      <!-- Banner quảng bá cuối trang -->
      <aside class="m-trial-banner" aria-label="Đăng ký học chính thức">
        <div class="m-trial-banner-content">
          <div class="m-trial-banner-icon" aria-hidden="true">
            <i class="fa-solid fa-rocket"></i>
          </div>
          <div class="m-trial-banner-text">
            <h2 class="m-trial-banner-title">Bứt phá điểm số cùng EduPortal</h2>
            <p class="m-trial-banner-desc">
              Hàng trăm video bài giảng chất lượng, ngân hàng đề thi trắc nghiệm bám sát đề thi chính thức và chấm điểm tự động.
            </p>
          </div>
        </div>
        <div class="m-trial-banner-action">
          <button type="button"
                  class="m-trial-btn-register"
                  onclick="window.showTrialRegistrationModal()"
                  aria-label="Đăng ký học chính thức">
            <span>Đăng ký học chính thức</span>
            <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
          </button>
        </div>
      </aside>
    </section>
  `
}

/**
 * Màn B: Bài học trong một lớp
 * @param {object} props
 * @param {object} props.selectedClass Thông tin lớp: { id, name, totalHomeworks, ... }
 * @param {Array} props.classLessons Danh sách bài học: [lesson]
 */
export function renderMochiTrialClass({ selectedClass, classLessons = [] } = {}) {
  const safeLessons = Array.isArray(classLessons) ? classLessons : []
  const className = String(selectedClass?.name || 'Lớp học thử')
  const totalHomeworks = selectedClass?.totalHomeworks != null
    ? Number(selectedClass.totalHomeworks)
    : safeLessons.reduce((sum, l) => sum + (Array.isArray(l?.homeworks) ? l.homeworks.length : 0), 0)
  const meta = getSubjectMeta(className)

  return `
    <section class="m-trial-class" aria-label="Chi tiết lớp ${escapeHtml(className)}">
      <!-- Nút quay lại danh sách lớp học -->
      <div class="m-trial-nav-back">
        <button type="button"
                id="back-to-trial-classes-btn"
                class="m-trial-btn-back"
                aria-label="Quay lại danh sách lớp học">
          <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
          <span>Quay lại danh sách lớp học</span>
        </button>
      </div>

      <!-- Banner thông tin lớp -->
      <header class="m-trial-class-banner">
        <div class="m-trial-class-banner-main">
          <div class="m-trial-class-banner-icon ${meta.typeClass}" aria-hidden="true">
            <i class="${meta.icon}"></i>
          </div>
          <div class="m-trial-class-banner-info">
            <div class="m-trial-pill-badge">
              <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
              <span>Học thử miễn phí</span>
            </div>
            <h1 class="m-trial-class-title">${escapeHtml(className)}</h1>
            <div class="m-trial-class-meta">
              <span>
                <i class="fa-solid fa-book-open" aria-hidden="true"></i>
                <strong>${safeLessons.length}</strong> bài học thử
              </span>
              <span>
                <i class="fa-solid fa-list-check" aria-hidden="true"></i>
                <strong>${totalHomeworks}</strong> bài tập tự luyện
              </span>
            </div>
          </div>
        </div>
        <div class="m-trial-class-banner-action">
          <button type="button"
                  class="m-trial-btn-register"
                  onclick="window.showTrialRegistrationModal()"
                  aria-label="Đăng ký học chính thức">
            <i class="fa-solid fa-user-plus" aria-hidden="true"></i>
            <span>Đăng ký học chính thức</span>
          </button>
        </div>
      </header>

      <!-- Thân màn B: Cột chính danh sách bài và Cột phụ hướng dẫn -->
      <div class="m-trial-class-body">
        <!-- Cột chính: Danh sách bài học thử -->
        <div class="m-trial-lessons-column">
          <div class="m-trial-column-header">
            <h2 class="m-trial-column-title">
              <i class="fa-solid fa-book-open" aria-hidden="true"></i>
              <span>Danh sách bài học thử (${safeLessons.length})</span>
            </h2>
          </div>

          ${safeLessons.length === 0 ? `
            <div class="m-trial-empty-card" role="status">
              <div class="m-trial-empty-mascot">
                ${renderMascot({ mood: 'wink', size: 84 })}
              </div>
              <p class="m-trial-empty-desc">Lớp này chưa có bài học thử nào.</p>
            </div>
          ` : `
            <div class="m-trial-lessons-list" role="list">
              ${safeLessons.map((l, idx) => {
                const lessonId = String(l?.id || '')
                const lessonTitle = String(l?.title || `Bài học ${idx + 1}`)
                const hasVideo = Boolean(l?.videoUrl)
                const docCount = Array.isArray(l?.theoryFiles) ? l.theoryFiles.length : 0
                const hwCount = Array.isArray(l?.homeworks) ? l.homeworks.length : 0
                const orderNumber = l?.orderIndex != null ? l.orderIndex : (idx + 1)
                const dateStr = l?.createdAt ? new Date(l.createdAt).toLocaleDateString('vi-VN') : ''

                return `
                  <div class="m-trial-lesson-card trial-lesson-item"
                       data-id="${escapeHtml(lessonId)}"
                       role="button" tabindex="0"
                       aria-label="Bài ${orderNumber}: ${escapeHtml(lessonTitle)}"
                       onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}">
                    <div class="m-trial-lesson-left">
                      <span class="m-trial-lesson-order" aria-hidden="true">${orderNumber}</span>
                      <div class="m-trial-lesson-content">
                        <div class="m-trial-lesson-headline">
                          <h3 class="m-trial-lesson-title">${escapeHtml(lessonTitle)}</h3>
                          ${hasVideo ? `
                            <span class="m-trial-badge-video" title="Có video bài giảng">
                              <i class="fa-solid fa-play" aria-hidden="true"></i>
                              <span>Video</span>
                            </span>
                          ` : ''}
                          ${dateStr ? `
                            <span class="m-trial-badge-date">
                              <i class="fa-regular fa-calendar" aria-hidden="true"></i>
                              <span>${escapeHtml(dateStr)}</span>
                            </span>
                          ` : ''}
                        </div>
                        <div class="m-trial-lesson-tags">
                          <span class="m-trial-tag">
                            <i class="fa-solid fa-list-check" aria-hidden="true"></i>
                            <span>${hwCount} bài tập</span>
                          </span>
                          <span class="m-trial-tag">
                            <i class="fa-solid fa-paperclip" aria-hidden="true"></i>
                            <span>${docCount} tài liệu</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div class="m-trial-lesson-right">
                      <span class="m-trial-lesson-cta">
                        <span>Vào học</span>
                        <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                      </span>
                    </div>
                  </div>
                `
              }).join('')}
            </div>
          `}
        </div>

        <!-- Cột phụ: Hướng dẫn học thử (>= 1024px) -->
        <aside class="m-trial-guide-column" aria-label="Hướng dẫn học thử">
          <div class="m-trial-guide-card">
            <div class="m-trial-guide-head">
              <div class="m-trial-guide-mascot">
                ${renderMascot({ mood: 'cheer', size: 64 })}
              </div>
              <h2 class="m-trial-guide-title">
                <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
                <span>Trải nghiệm học thử</span>
              </h2>
            </div>
            <p class="m-trial-guide-desc">
              Chọn bất kỳ bài học nào ở danh sách bên trái để:
            </p>
            <ul class="m-trial-guide-list">
              <li>
                <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
                <span>Xem trực tiếp video bài giảng chi tiết</span>
              </li>
              <li>
                <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
                <span>Đọc và tải tài liệu lý thuyết chuẩn</span>
              </li>
              <li>
                <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
                <span>Làm bài tập trắc nghiệm và chấm điểm ngay lập tức</span>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  `
}
