import { renderMascot } from '../components/mascot.js'

/**
 * Render the full-screen notice shown while an active exam loses focus.
 * The caller owns its visibility and updates the timer placeholder.
 */
export function renderExamFocusShield({ mochi = false } = {}) {
  const illustration = mochi
    ? `<div class="exam-focus-shield__mascot">${renderMascot({ mood: 'wink', size: 120 })}</div>`
    : '<div class="exam-focus-shield__icon" aria-hidden="true"><i class="fas fa-eye-slash"></i></div>'

  const title = mochi ? 'Mochi đang đợi bạn quay lại nè!' : 'Bạn ơi, quay lại làm bài nhé!'

  return `<div id="exam-focus-shield" class="exam-focus-shield" role="alert" aria-live="assertive" hidden>
    <section class="exam-focus-shield__banner" aria-labelledby="exam-focus-shield-title">
      <div class="exam-focus-shield__illustration">
        ${illustration}
      </div>
      <h2 id="exam-focus-shield-title" class="exam-focus-shield__title">${title}</h2>
      <p class="exam-focus-shield__description">Đề thi đang tạm ẩn vì bạn vừa rời màn hình. Quay lại cửa sổ này là làm tiếp được ngay thôi!</p>
      <p class="exam-focus-shield__timer">Thời gian còn lại: <strong data-exam-shield-timer>--:--</strong></p>
      <p class="exam-focus-shield__note">Đồng hồ vẫn đang chạy, nhanh tay lên nha</p>
    </section>
  </div>`
}
