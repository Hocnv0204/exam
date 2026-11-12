import { escapeHtml } from '../../utils/download-helper.js'
import { renderMascot } from '../../components/mascot.js'
import { formatDuration, getEmbedUrl, theoryFileDisplayName } from '../../utils/trial-helpers.js'

if (typeof document !== 'undefined' && document.head) {
  import('../../../css/mochi/trial-detail.css')
}

const isSafeActionId = value => /^[A-Za-z0-9-]+$/.test(String(value || ''))

function formatDate(value) {
  if (!value) return 'Vừa xong'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Vừa xong' : date.toLocaleString('vi-VN')
}

function displayNumber(value, fallback = 0) {
  const number = Number(value)
  return escapeHtml(Number.isFinite(number) ? number : fallback)
}

function renderHomework(homework) {
  const hw = homework || {}
  const id = String(hw.id || '')
  const canAct = isSafeActionId(id)
  return `
    <article class="m-trial-homework-card">
      <h3>${escapeHtml(hw.title || 'Bài tập tự luyện')}</h3>
      <dl class="m-trial-homework-meta">
        <div><dt><i class="fa-regular fa-clock" aria-hidden="true"></i> Thời gian</dt><dd>${displayNumber(hw.durationMinutes, 45)} phút</dd></div>
        <div><dt><i class="fa-solid fa-star" aria-hidden="true"></i> Thang điểm</dt><dd>${displayNumber(hw.maxScore, 10)} điểm</dd></div>
      </dl>
      ${canAct ? `
        <div class="m-trial-homework-actions">
          <button type="button" class="m-rm-btn m-rm-btn-outline" onclick="window.downloadHomeworkPdf('${escapeHtml(id)}')" title="Tải file PDF đề bài ${escapeHtml(hw.title || '')}">
            <i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i> Tải PDF
          </button>
          <button type="button" class="m-rm-btn m-rm-btn-primary" onclick="window.confirmStartTrialHomework('${escapeHtml(id)}')">
            Bắt đầu làm bài thử <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
          </button>
        </div>
      ` : '<p class="m-trial-inline-note">Bài tập này hiện chưa thể mở. Vui lòng chọn bài khác.</p>'}
    </article>
  `
}

export function renderMochiTrialLesson({ selectedClass, classLessons = [], activeLesson } = {}) {
  const lesson = activeLesson || {}
  const lessons = Array.isArray(classLessons) ? classLessons : []
  const theoryFiles = Array.isArray(lesson.theoryFiles) ? lesson.theoryFiles : []
  const homeworks = Array.isArray(lesson.homeworks) ? lesson.homeworks : []
  const embedUrl = getEmbedUrl(lesson.videoUrl || '')
  const createdAt = lesson.createdAt ? new Date(lesson.createdAt) : null
  const createdText = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toLocaleDateString('vi-VN') : ''

  return `
    <section class="m-trial-lesson" aria-labelledby="m-trial-lesson-title">
      <button type="button" id="btn-back-to-trial-lessons" class="m-rm-btn m-rm-btn-outline m-trial-back">
        <i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Quay lại bài học trong lớp
      </button>
      <div class="m-trial-lesson-grid">
        <div class="m-trial-lesson-primary">
          <div class="m-trial-video-wrap">
            ${embedUrl ? `
              <iframe src="${escapeHtml(embedUrl)}" title="Video bài giảng: ${escapeHtml(lesson.title || 'Bài học thử')}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen referrerpolicy="no-referrer"></iframe>
            ` : `
              <div class="m-trial-video-empty">
                ${renderMascot({ mood: 'happy', size: 72 })}
                <p>Bài học này chưa có video bài giảng.</p>
              </div>
            `}
          </div>
          <article class="m-trial-detail-card m-trial-lesson-info">
            <div class="m-trial-detail-eyebrow">
              <span><i class="fa-solid fa-graduation-cap" aria-hidden="true"></i> ${escapeHtml(selectedClass?.name || 'Lớp học thử')}</span>
              ${createdText ? `<span><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${escapeHtml(createdText)}</span>` : ''}
            </div>
            <h1 id="m-trial-lesson-title">${escapeHtml(lesson.title || 'Bài học thử')}</h1>
            <p class="m-trial-lesson-content">${escapeHtml(lesson.content || 'Bài giảng lý thuyết và hướng dẫn phương pháp giải bài tập chi tiết.')}</p>
          </article>
          <section class="m-trial-detail-card m-trial-theory" aria-labelledby="m-trial-theory-title">
            <h2 id="m-trial-theory-title"><i class="fa-solid fa-paperclip" aria-hidden="true"></i> Tài liệu lý thuyết <span>(${theoryFiles.length})</span></h2>
            ${theoryFiles.length ? `<div class="m-trial-theory-list">${theoryFiles.map(file => `
              <div class="m-trial-theory-item">
                <span class="m-trial-theory-name"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i> ${escapeHtml(theoryFileDisplayName(file))}</span>
                <span class="m-trial-theory-actions">
                  <button type="button" class="btn-preview-theory m-rm-btn m-rm-btn-outline" data-file="${escapeHtml(file)}"><i class="fa-solid fa-eye" aria-hidden="true"></i> Xem</button>
                  <button type="button" class="btn-download-theory m-rm-btn m-rm-btn-secondary" data-file="${escapeHtml(file)}"><i class="fa-solid fa-download" aria-hidden="true"></i> Tải</button>
                </span>
              </div>
            `).join('')}</div>` : '<p class="m-trial-empty-copy">Bài học này chưa đính kèm tài liệu lý thuyết.</p>'}
          </section>
        </div>
        <aside class="m-trial-lesson-aside">
          <section class="m-trial-detail-card m-trial-homeworks" aria-labelledby="m-trial-homeworks-title">
            <h2 id="m-trial-homeworks-title"><i class="fa-solid fa-list-check" aria-hidden="true"></i> Bài tập tự luyện <span>(${homeworks.length})</span></h2>
            ${homeworks.length ? `<div class="m-trial-homework-list">${homeworks.map(renderHomework).join('')}</div>` : '<p class="m-trial-empty-copy">Bài học này chưa có bài tập tự luyện.</p>'}
          </section>
          <section class="m-trial-detail-card m-trial-other-lessons" aria-labelledby="m-trial-other-lessons-title">
            <h2 id="m-trial-other-lessons-title"><i class="fa-solid fa-layer-group" aria-hidden="true"></i> Bài học khác trong lớp</h2>
            ${lessons.length ? `<div class="m-trial-other-list">${lessons.map((item, index) => {
              const current = String(item?.id || '') === String(lesson.id || '')
              return `<div class="trial-lesson-item m-trial-other-item${current ? ' is-current' : ''}" data-id="${escapeHtml(item?.id || '')}" role="button" tabindex="0"${current ? ' aria-current="page"' : ''} onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}">
                <span class="m-trial-other-index">${displayNumber(item?.orderIndex, index + 1)}</span>
                <span>${escapeHtml(item?.title || 'Bài học thử')}</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
              </div>`
            }).join('')}</div>` : '<p class="m-trial-empty-copy">Lớp học này chưa có bài học khác.</p>'}
          </section>
        </aside>
      </div>
    </section>
  `
}

function renderHistoryItem(item) {
  const data = item || {}
  const passed = data.isPassed !== false
  const sourceLocal = data.source === 'local'
  return `
    <article class="m-trial-history-item">
      <div class="m-trial-history-item-head">
        <div><h2>${escapeHtml(data.homeworkTitle || 'Bài tập học thử')}</h2><p>${data.lessonTitle ? `Bài: ${escapeHtml(data.lessonTitle)}` : 'Bài tập tự luyện học thử'}</p></div>
        <span class="m-trial-status ${passed ? 'is-passed' : 'is-failed'}">${passed ? 'Đạt' : 'Chưa đạt'}</span>
      </div>
      <dl class="m-trial-result-grid">
        <div><dt>Thời gian nộp</dt><dd>${escapeHtml(formatDate(data.submittedAt))}</dd></div>
        <div><dt>Điểm số</dt><dd class="m-trial-score ${passed ? 'is-passed' : 'is-failed'}">${displayNumber(data.score)}<small>/${displayNumber(data.maxScore, 10)}</small></dd></div>
        <div><dt>Đúng / sai</dt><dd>${displayNumber(data.correctCount)} đúng · ${displayNumber(data.wrongCount)} sai</dd></div>
        <div><dt>Thời gian làm</dt><dd>${escapeHtml(formatDuration(Number(data.durationSecondsTaken) || 0))}</dd></div>
        <div><dt>Nguồn</dt><dd><span class="m-trial-source">${sourceLocal ? 'Máy này' : 'Đồng bộ SĐT'}</span></dd></div>
      </dl>
      <div class="m-trial-history-actions">
        <button type="button" class="btn-view-trial-review m-rm-btn m-rm-btn-outline" data-subid="${escapeHtml(data.submissionId || '')}"><i class="fa-solid fa-eye" aria-hidden="true"></i> Xem lại</button>
        <button type="button" class="btn-retake-trial m-rm-btn m-rm-btn-primary" data-hwid="${escapeHtml(data.homeworkId || '')}"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Làm lại</button>
      </div>
    </article>
  `
}

export function renderMochiTrialHistory({ historyList = [], savedPhone = '', stats = {} } = {}) {
  const list = Array.isArray(historyList) ? historyList : []
  const hasLocal = list.some(item => item?.source === 'local')
  return `
    <section class="m-trial-history" aria-labelledby="m-trial-history-title">
      <header class="m-trial-page-header">
        <div><span class="m-trial-kicker"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> Kết quả học thử</span><h1 id="m-trial-history-title">Lịch sử làm bài học thử</h1><p>Xem lại kết quả, lời giải chi tiết và ôn luyện lại khi bạn sẵn sàng.</p></div>
        <div class="m-trial-header-mascot">${renderMascot({ mood: 'cheer', size: 88 })}</div>
      </header>
      <section class="m-trial-lookup" aria-labelledby="m-trial-lookup-title">
        <div><h2 id="m-trial-lookup-title"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> Tra cứu lịch sử theo số điện thoại</h2><p>Nhập số điện thoại đã dùng khi nộp bài để đồng bộ kết quả từ máy chủ.</p></div>
        <div class="m-trial-lookup-form"><label for="input-trial-phone-lookup">Số điện thoại</label><input type="tel" id="input-trial-phone-lookup" value="${escapeHtml(savedPhone)}" placeholder="Ví dụ: 0912345678" autocomplete="tel" inputmode="tel"><button type="button" id="btn-sync-phone-history" class="m-rm-btn m-rm-btn-primary"><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i> Tra cứu &amp; đồng bộ</button></div>
      </section>
      <div class="m-trial-history-stats" aria-label="Thống kê lịch sử làm bài">
        <div><span>Tổng bài đã làm</span><strong>${displayNumber(stats.totalDone)}</strong></div>
        <div><span>Điểm trung bình</span><strong>${displayNumber(stats.avgScore)}<small>/10</small></strong></div>
        <div><span>Điểm cao nhất</span><strong>${displayNumber(stats.highestScore)}<small>/10</small></strong></div>
        <div><span>Tỷ lệ đạt</span><strong>${displayNumber(stats.passRate)}<small>% (${displayNumber(stats.passCount)}/${displayNumber(stats.totalDone)})</small></strong></div>
      </div>
      <section class="m-trial-history-list-wrap" aria-labelledby="m-trial-history-list-title">
        <div class="m-trial-history-list-head"><h2 id="m-trial-history-list-title">Bài tập đã làm <span>(${list.length})</span></h2>${hasLocal ? '<button type="button" id="btn-clear-local-history" class="m-rm-btn m-trial-danger"><i class="fa-regular fa-trash-can" aria-hidden="true"></i> Xóa lịch sử máy này</button>' : ''}</div>
        ${list.length ? `<div class="m-trial-history-list">${list.map(renderHistoryItem).join('')}</div>` : `
          <div class="m-trial-empty-state">${renderMascot({ mood: 'happy', size: 104 })}<h2>Bạn chưa làm bài tập thử nào</h2><p>Chọn một bài học thử để bắt đầu kiểm tra kiến thức ngay nhé!</p><a href="#trial?tab=lessons" class="m-rm-btn m-rm-btn-primary"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Về danh sách học thử</a></div>
        `}
      </section>
    </section>
  `
}

export function renderMochiTrialRevoked() {
  return `
    <section class="m-trial-revoked m-trial-empty-state">
      ${renderMascot({ mood: 'wink', size: 128 })}
      <h1>Bài học thử này đã được thu hồi hoặc không còn khả dụng</h1>
      <p>Link bạn mở có thể đã được quản trị viên thu hồi, hoặc bài học không còn nằm trong danh sách học thử.</p>
      <a href="#trial?tab=lessons" class="m-rm-btn m-rm-btn-primary"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Xem danh sách bài học thử</a>
    </section>
  `
}
