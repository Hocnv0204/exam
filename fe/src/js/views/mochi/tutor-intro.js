import { api } from '../../api.js'
import { renderMochiPublicTopbar, bindMochiPublicTopbar } from '../../components/mochi-public-topbar.js'
import { getStudentTheme } from '../../theme.js'
import { TUTOR_PROFILE, PLATFORM_BENEFITS } from '../../data/tutor-profile.js'
import { escapeHtml } from '../../utils/curriculum-search.js'

if (typeof document !== 'undefined' && document.head) {
  import('../../../css/mochi/tutor-intro.css')
}

let classesRequestId = 0

const asCount = value => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0
}

export function formatScheduleSlot({ day, start, end } = {}) {
  const dayNumber = Number(day)
  const dayLabel = dayNumber === 7
    ? 'Chủ nhật'
    : (dayNumber >= 1 && dayNumber <= 6 ? `Thứ ${dayNumber + 1}` : '')
  if (!dayLabel || !start || !end) return ''
  return `${dayLabel} · ${String(start)}–${String(end)}`
}

export function renderIntroClassesError() {
  return `
    <div class="m-intro-classes-state m-intro-classes-state-error" role="alert">
      <i class="fa-solid fa-cloud-arrow-down" aria-hidden="true"></i>
      <p>Chưa tải được lịch lớp</p>
      <button type="button" class="m-intro-btn m-intro-btn-outline" data-action="retry-classes">
        <i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Thử lại
      </button>
    </div>
  `
}

export function renderIntroClassesEmpty() {
  return `
    <div class="m-intro-classes-state">
      <i class="fa-solid fa-calendar-day" aria-hidden="true"></i>
      <p>Hiện chưa có lớp mở công khai — liên hệ để được xếp lớp</p>
      <a class="m-intro-btn m-intro-btn-outline" href="tel:${TUTOR_PROFILE.phone}">
        <i class="fa-solid fa-phone" aria-hidden="true"></i> Liên hệ ngay
      </a>
    </div>
  `
}

export function renderIntroClassCards(data = {}) {
  const classes = Array.isArray(data?.classes) ? data.classes : []
  if (classes.length === 0) return renderIntroClassesEmpty()

  const totalClasses = asCount(data?.totals?.classes)
  const totalStudents = asCount(data?.totals?.activeStudents)
  const cards = classes.map(item => {
    const activeStudents = asCount(item?.activeStudents)
    const sessionsHeld = asCount(item?.sessionsHeld)
    const parsedMax = Number(item?.maxStudents)
    const hasCapacity = Number.isFinite(parsedMax) && parsedMax > 0
    const maxStudents = hasCapacity ? Math.trunc(parsedMax) : 0
    const seatsLeft = hasCapacity ? Math.max(0, maxStudents - activeStudents) : 0
    const isFull = hasCapacity && seatsLeft === 0
    const occupancy = hasCapacity ? Math.min(100, Math.round((activeStudents / maxStudents) * 100)) : 0
    const schedule = Array.isArray(item?.schedule)
      ? item.schedule.map(formatScheduleSlot).filter(Boolean)
      : []

    return `
      <article class="m-intro-class-card">
        <div class="m-intro-class-head">
          <span class="m-intro-grade">${escapeHtml(item?.gradeBlock || 'Lớp học')}</span>
          ${sessionsHeld > 0 ? `<span class="m-intro-sessions">Đã học ${sessionsHeld} buổi</span>` : ''}
        </div>
        <h3>${escapeHtml(item?.name || 'Lớp học')}</h3>
        ${item?.description ? `<p class="m-intro-class-description">${escapeHtml(item.description)}</p>` : ''}
        <div class="m-intro-schedule">
          <i class="fa-regular fa-clock" aria-hidden="true"></i>
          ${schedule.length > 0
            ? `<ul>${schedule.map(slot => `<li>${escapeHtml(slot)}</li>`).join('')}</ul>`
            : '<span>Lịch học: liên hệ</span>'}
        </div>
        <div class="m-intro-student-count">
          <i class="fa-solid fa-user-group" aria-hidden="true"></i>
          <span><strong>${activeStudents}</strong> học sinh đang theo học</span>
        </div>
        ${hasCapacity ? `
          <div class="m-intro-capacity">
            <div class="m-intro-capacity-label">
              <span>Sĩ số ${activeStudents}/${maxStudents}</span>
              <strong class="${isFull ? 'is-full' : ''}">${isFull ? 'Đã đủ sĩ số' : `Còn ${seatsLeft} chỗ`}</strong>
            </div>
            <div class="m-intro-meter" role="progressbar" aria-label="Sĩ số lớp" aria-valuemin="0" aria-valuemax="${maxStudents}" aria-valuenow="${Math.min(activeStudents, maxStudents)}">
              <span style="width:${occupancy}%"></span>
            </div>
          </div>
        ` : ''}
      </article>
    `
  }).join('')

  return `
    <div class="m-intro-totals" aria-label="Tổng quan lớp đang mở">
      <span><i class="fa-solid fa-chalkboard" aria-hidden="true"></i> <strong>${totalClasses}</strong> lớp đang mở</span>
      <span><i class="fa-solid fa-user-graduate" aria-hidden="true"></i> <strong>${totalStudents}</strong> học sinh đang học</span>
    </div>
    <div class="m-intro-class-grid">${cards}</div>
  `
}

function renderClassesSkeleton() {
  return `
    <div class="m-intro-class-grid" aria-label="Đang tải lịch lớp" aria-busy="true">
      ${Array.from({ length: 3 }, () => `
        <div class="m-intro-class-card m-intro-skeleton" aria-hidden="true">
          <span></span><span></span><span></span><span></span>
        </div>
      `).join('')}
    </div>
  `
}

export function renderTutorIntroView() {
  const profile = TUTOR_PROFILE
  return `
    <div class="m-roadmap m-intro" data-roadmap-theme="${escapeHtml(getStudentTheme())}">
      ${renderMochiPublicTopbar({ active: 'gioi-thieu' })}
      <main>
        <section class="m-intro-hero" aria-labelledby="m-intro-title">
          <div class="m-intro-hero-card">
            <div class="m-intro-avatar" aria-label="Ảnh đại diện chữ ${escapeHtml(profile.initials)}">${escapeHtml(profile.initials)}</div>
            <div class="m-intro-hero-copy">
              <span class="m-intro-eyebrow"><i class="fa-solid fa-book-open-reader" aria-hidden="true"></i> Đồng hành học chắc, tiến bộ thật</span>
              <h1 id="m-intro-title">${escapeHtml(profile.name)}</h1>
              <p class="m-intro-role">${escapeHtml(profile.title)}</p>
              <p class="m-intro-lead">Học tập có lộ trình, luyện tập thường xuyên và theo dõi tiến bộ rõ ràng trên EduPortal.</p>
              <div class="m-intro-actions">
                <a class="m-intro-btn m-intro-btn-primary" href="tel:${profile.phone}"><i class="fa-solid fa-phone" aria-hidden="true"></i> Gọi ${profile.phone}</a>
                <a class="m-intro-btn m-intro-btn-zalo" href="${profile.zalo}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-comment-dots" aria-hidden="true"></i> Zalo</a>
                <a class="m-intro-btn m-intro-btn-outline" href="mailto:${profile.email}"><i class="fa-solid fa-envelope" aria-hidden="true"></i> Email</a>
              </div>
            </div>
          </div>
        </section>

        <section class="m-intro-section" aria-labelledby="m-intro-education-title">
          <div class="m-intro-section-heading">
            <span class="m-intro-section-icon"><i class="fa-solid fa-graduation-cap" aria-hidden="true"></i></span>
            <div><span>Hồ sơ chuyên môn</span><h2 id="m-intro-education-title">Học vấn</h2></div>
          </div>
          <div class="m-intro-education-card">
            <div class="m-intro-education-main">
              <span>${escapeHtml(profile.education.period)}</span>
              <h3>${escapeHtml(profile.education.major)}</h3>
              <p>${escapeHtml(profile.education.institution)}</p>
              <div class="m-intro-chips"><span>${escapeHtml(profile.education.classification)}</span><span>${escapeHtml(profile.education.cpa)}</span></div>
            </div>
            <div class="m-intro-education-details">
              <div><i class="fa-solid fa-award" aria-hidden="true"></i><p>${profile.education.scholarships.map(escapeHtml).join('<br>')}</p></div>
              <div><i class="fa-solid fa-square-poll-vertical" aria-hidden="true"></i><p><strong>Điểm thi THPT 2022:</strong> ${profile.education.examScores.map(escapeHtml).join(' · ')}</p></div>
              <div><i class="fa-solid fa-trophy" aria-hidden="true"></i><p>${escapeHtml(profile.education.award)}</p></div>
            </div>
          </div>
        </section>

        <section class="m-intro-section" aria-labelledby="m-intro-experience-title">
          <div class="m-intro-section-heading">
            <span class="m-intro-section-icon"><i class="fa-solid fa-briefcase" aria-hidden="true"></i></span>
            <div><span>Quá trình giảng dạy</span><h2 id="m-intro-experience-title">Kinh nghiệm</h2></div>
          </div>
          <div class="m-intro-timeline">
            ${profile.experiences.map(experience => `
              <article class="m-intro-experience">
                <span class="m-intro-timeline-dot" aria-hidden="true"></span>
                <div class="m-intro-experience-head">
                  <h3>${escapeHtml(experience.title)}</h3>
                  ${experience.period ? `<span>${escapeHtml(experience.period)}</span>` : ''}
                </div>
                ${experience.organization ? `<p>${escapeHtml(experience.organization)}</p>` : ''}
                ${Array.isArray(experience.achievements) ? `<ul>${experience.achievements.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
              </article>
            `).join('')}
          </div>
        </section>

        <section class="m-intro-section" aria-labelledby="m-intro-classes-title">
          <div class="m-intro-section-heading">
            <span class="m-intro-section-icon"><i class="fa-solid fa-chalkboard-user" aria-hidden="true"></i></span>
            <div><span>Lịch học cập nhật</span><h2 id="m-intro-classes-title">Lớp đang mở</h2></div>
          </div>
          <div id="m-intro-classes" aria-live="polite">${renderClassesSkeleton()}</div>
        </section>

        <section class="m-intro-section" aria-labelledby="m-intro-benefits-title">
          <div class="m-intro-section-heading">
            <span class="m-intro-section-icon"><i class="fa-solid fa-star" aria-hidden="true"></i></span>
            <div><span>EduPortal hỗ trợ</span><h2 id="m-intro-benefits-title">Quyền lợi khi học</h2></div>
          </div>
          <div class="m-intro-benefit-grid">
            ${PLATFORM_BENEFITS.map(benefit => `
              <article class="m-intro-benefit-card">
                <span><i class="${escapeHtml(benefit.icon)}" aria-hidden="true"></i></span>
                <h3>${escapeHtml(benefit.title)}</h3>
                <p>${escapeHtml(benefit.description)}</p>
              </article>
            `).join('')}
          </div>
        </section>

        <section class="m-intro-final-cta" aria-labelledby="m-intro-cta-title">
          <span class="m-intro-eyebrow">Bắt đầu ngay hôm nay</span>
          <h2 id="m-intro-cta-title">Sẵn sàng học chắc Toán, Hóa?</h2>
          <p>Học thử miễn phí hoặc liên hệ trực tiếp để được tư vấn lớp phù hợp.</p>
          <div class="m-intro-actions">
            <a class="m-intro-btn m-intro-btn-primary" href="#trial?tab=lessons"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Học thử miễn phí</a>
            <a class="m-intro-btn m-intro-btn-outline" href="#roadmap"><i class="fa-solid fa-route" aria-hidden="true"></i> Xem lộ trình</a>
            <a class="m-intro-btn m-intro-btn-outline" href="#login"><i class="fa-solid fa-arrow-right-to-bracket" aria-hidden="true"></i> Đăng nhập</a>
            <a class="m-intro-btn m-intro-btn-outline" href="tel:${profile.phone}"><i class="fa-solid fa-phone" aria-hidden="true"></i> Gọi</a>
            <a class="m-intro-btn m-intro-btn-zalo" href="${profile.zalo}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-comment-dots" aria-hidden="true"></i> Zalo</a>
          </div>
        </section>
      </main>
    </div>
  `
}

export function bindTutorIntroEvents() {
  bindMochiPublicTopbar(document.querySelector('.m-intro'))
  const container = document.getElementById('m-intro-classes')
  if (!container) return

  const loadClasses = async () => {
    const requestId = ++classesRequestId
    const retryButton = container.querySelector('[data-action="retry-classes"]')
    if (retryButton) {
      retryButton.disabled = true
      retryButton.setAttribute('aria-busy', 'true')
    }
    try {
      const data = await api.getPublicIntro()
      if (requestId !== classesRequestId || document.getElementById('m-intro-classes') !== container) return
      container.innerHTML = Array.isArray(data?.classes) && data.classes.length > 0
        ? renderIntroClassCards(data)
        : renderIntroClassesEmpty()
    } catch (_) {
      if (requestId !== classesRequestId || document.getElementById('m-intro-classes') !== container) return
      container.innerHTML = renderIntroClassesError()
    }
  }

  container.addEventListener('click', event => {
    const retryButton = event.target.closest?.('[data-action="retry-classes"]')
    if (!retryButton || retryButton.disabled) return
    loadClasses()
  })

  loadClasses()
}
