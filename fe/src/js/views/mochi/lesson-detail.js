import { renderSidebar } from '../../components/sidebar.js'
import { renderNavbar } from '../../components/navbar.js'
import { escapeHtml } from '../../utils/download-helper.js'
import { canViewHomeworkPdf } from '../../utils/homework-pdf-policy.js'
import { sortMochiChapters } from './lesson-order.js'

function getEmbedUrl(url) {
  if (!url) return null
  let match = url.match(/(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/ ]{11})/)
  if (match?.[1]) return `https://www.youtube.com/embed/${match[1]}`
  match = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (match?.[1]) return `https://drive.google.com/file/d/${match[1]}/preview`
  return url
}

function homeworkIsDone(homework) {
  const status = String(homework?.status || homework?.submissionStatus || '').toUpperCase()
  return Boolean(homework?.isSubmitted || homework?.submittedAt || homework?.submitted_at || homework?.completedAt || ['SUBMITTED', 'GRADED', 'COMPLETED'].includes(status))
}

function fileName(file) {
  const raw = String(file || '').startsWith('http') ? (String(file).split('/').pop() || file) : file
  return String(raw || '').split('_').slice(1).join('_') || raw || 'Tài liệu'
}

function renderHomework(homework, role) {
  const isExam = homework.type === 'EXAM'
  const done = homeworkIsDone(homework)
  const expired = homework.deadline && new Date() > new Date(homework.deadline)
  return `<article class="m-lesson-homework ${done ? 'is-done' : ''}">
    <div>
      <span class="m-chip ${done ? 'm-chip--ok' : (isExam ? 'm-chip--warn' : '')}">${done ? 'Đã nộp' : (isExam ? 'Bài thi' : 'Bài tập')}</span>
      <h3>${escapeHtml(homework.title || 'Bài tập')}</h3>
      <p>${homework.durationMinutes || 45} phút${homework.deadline ? ` · ${expired ? 'Đã quá hạn' : 'Hạn'} ${new Date(homework.deadline).toLocaleString('vi-VN')}` : ''}</p>
    </div>
    <div class="m-homework-actions">
      ${canViewHomeworkPdf(role, homework) ? `<button type="button" class="m-btn m-btn--secondary m-btn--compact" onclick="window.downloadHomeworkPdf('${escapeHtml(homework.id)}')"><i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i> Tải PDF</button>` : ''}
      <button type="button" class="m-btn m-btn--primary m-btn--compact" onclick="window.confirmStartHomework('${escapeHtml(homework.id)}', '${isExam ? 'EXAM' : (escapeHtml(homework.type || 'PRACTICE'))}')">${isExam ? 'Vào phòng thi' : (done ? 'Làm lại' : 'Làm bài')}</button>
    </div>
  </article>`
}

export function renderMochiLessonDetail({ classes = [], classChapters = [], activeLesson, activeLessonHomeworks = [], classId, role } = {}) {
  const selectedClass = classes.find(item => item.id === classId) || classes[0]
  const sortedChapters = sortMochiChapters(classChapters)
  const chapter = sortedChapters.find(item => (item.lessons || []).some(lesson => lesson.id === activeLesson?.id))
  const lessons = chapter?.lessons || []
  const lessonIndex = lessons.findIndex(lesson => lesson.id === activeLesson?.id)
  const previous = lessonIndex > 0 ? lessons[lessonIndex - 1] : null
  const next = lessonIndex >= 0 && lessonIndex < lessons.length - 1 ? lessons[lessonIndex + 1] : null
  const files = Array.isArray(activeLesson?.theoryFiles) ? activeLesson.theoryFiles : []
  const videoUrl = activeLesson?.videoUrl || activeLesson?.video_url || ''
  const embedUrl = getEmbedUrl(videoUrl)
  const allHomeworkDone = activeLessonHomeworks.length > 0 && activeLessonHomeworks.every(homeworkIsDone)
  const initialTab = embedUrl ? 'video' : 'theory'
  const firstHomework = activeLessonHomeworks[0]

  return `
    <div class="app-layout navy-student m-student-page m-lesson-detail-page">
      ${renderSidebar('my-classes')}
      <div class="main-content">
        ${renderNavbar(`Học tập / ${selectedClass?.name || 'Bài học'}`)}
        <main class="content-body">
          <div class="m-page-wrap">
            <nav class="m-breadcrumb" aria-label="Đường dẫn">
              <a href="#student-dashboard">Trang chủ</a><span aria-hidden="true">›</span>
              <a href="#my-classes?classId=${escapeHtml(classId)}">${escapeHtml(selectedClass?.name || 'Lớp học')}</a><span aria-hidden="true">›</span>
              <span aria-current="page">${escapeHtml(activeLesson?.title || 'Bài học')}</span>
            </nav>

            <header class="m-detail-header">
              <div class="m-detail-title-row">
                <div class="m-detail-heading">
                  <span class="m-chip">${escapeHtml(chapter?.title || 'Bài học')}</span>
                  <h1>${escapeHtml(activeLesson?.title || 'Chi tiết bài học')}</h1>
                </div>
                <button type="button" class="m-btn m-btn--ghost" id="btn-replay-lesson-tour"><i class="fa-solid fa-circle-question" aria-hidden="true"></i> Hướng dẫn</button>
              </div>
              <ol class="m-lesson-steps" aria-label="Các bước của bài học">
                <li><span>1</span><div><strong>Xem video</strong><small>${embedUrl ? 'Chưa có dữ liệu đã xem' : 'Không có video'}</small></div></li>
                <li><span>2</span><div><strong>Đọc lý thuyết</strong><small>${activeLesson?.content || files.length ? 'Chưa có dữ liệu đã đọc' : 'Chưa có nội dung'}</small></div></li>
                <li class="${allHomeworkDone ? 'is-done' : ''}"><span>${allHomeworkDone ? '✓' : '3'}</span><div><strong>Làm bài tập</strong><small>${allHomeworkDone ? 'Đã hoàn thành' : (activeLessonHomeworks.length ? 'Chưa hoàn thành' : 'Chưa có bài tập')}</small></div></li>
              </ol>
            </header>

            <div class="m-detail-grid">
              <div class="m-detail-main" id="tour-lesson-left">
                <section class="m-card m-lesson-content">
                  <div class="m-tabs" role="tablist" aria-label="Nội dung bài học">
                    ${embedUrl ? `<button type="button" class="m-tab" role="tab" aria-selected="${initialTab === 'video'}" aria-controls="m-panel-video" data-lesson-content-tab="video">Video</button>` : ''}
                    <button type="button" class="m-tab" role="tab" aria-selected="${initialTab === 'theory'}" aria-controls="m-panel-theory" data-lesson-content-tab="theory">Lý thuyết</button>
                  </div>
                  ${embedUrl ? `<div id="m-panel-video" class="m-tab-panel" role="tabpanel" data-lesson-content-panel="video" ${initialTab !== 'video' ? 'hidden' : ''}>
                    <div class="m-video-frame"><iframe src="${escapeHtml(embedUrl)}" title="Video bài giảng ${escapeHtml(activeLesson?.title || '')}" allowfullscreen allow="autoplay; encrypted-media; fullscreen" referrerpolicy="no-referrer"></iframe></div>
                    <div class="m-video-link"><span>Video không phát được?</span><a class="m-btn m-btn--secondary m-btn--compact" href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i> ${/drive\.google\.com/.test(videoUrl) ? 'Mở trong Google Drive' : 'Mở video trong tab mới'}</a></div>
                  </div>` : ''}
                  <div id="m-panel-theory" class="m-tab-panel m-theory-panel" role="tabpanel" data-lesson-content-panel="theory" ${initialTab !== 'theory' ? 'hidden' : ''}>
                    ${activeLesson?.content ? `<div class="m-theory-content">${activeLesson.content}</div>` : '<p class="m-empty-copy">Bài học này chưa có nội dung lý thuyết.</p>'}
                  </div>
                </section>

                <nav class="m-lesson-pager" aria-label="Điều hướng bài học">
                  ${previous ? `<a class="m-btn m-btn--secondary" href="#my-classes?classId=${escapeHtml(classId)}&lessonId=${escapeHtml(previous.id)}">← ${escapeHtml(previous.title || 'Bài trước')}</a>` : '<span></span>'}
                  ${next ? `<a class="m-btn m-btn--secondary" href="#my-classes?classId=${escapeHtml(classId)}&lessonId=${escapeHtml(next.id)}">${escapeHtml(next.title || 'Bài sau')} →</a>` : ''}
                </nav>
              </div>

              <aside class="m-detail-side" id="tour-lesson-right">
                <section class="m-card m-card--strong" id="tour-lesson-homeworks">
                  <div class="m-section-heading"><h2>Bài tập của bài</h2></div>
                  ${activeLessonHomeworks.length ? activeLessonHomeworks.map(homework => renderHomework(homework, role)).join('') : '<p class="m-empty-copy">Bài học này chưa có bài tập.</p>'}
                </section>
                <section class="m-card" id="tour-lesson-files">
                  <div class="m-section-heading"><h2>Tài liệu</h2></div>
                  ${files.length ? `<ul class="m-resource-list">${files.map(file => `<li><span>${escapeHtml(fileName(file))}</span><div><button type="button" class="m-btn m-btn--secondary m-btn--compact btn-preview-theory" data-file="${escapeHtml(file)}">Xem</button><button type="button" class="m-btn m-btn--ghost m-btn--compact btn-download-theory" data-file="${escapeHtml(file)}">Tải xuống</button></div></li>`).join('')}</ul>` : '<p class="m-empty-copy">Chưa có tài liệu đính kèm.</p>'}
                </section>
              </aside>
            </div>
            ${firstHomework ? `<div class="m-lesson-bottom-action"><button type="button" class="m-btn m-btn--primary" onclick="window.confirmStartHomework('${escapeHtml(firstHomework.id)}', '${firstHomework.type === 'EXAM' ? 'EXAM' : escapeHtml(firstHomework.type || 'PRACTICE')}')">${firstHomework.type === 'EXAM' ? 'Vào phòng thi' : 'Làm bài tập'}</button></div>` : ''}
          </div>
        </main>
      </div>
    </div>`
}

export function bindMochiLessonDetail() {
  const tabs = [...document.querySelectorAll('[data-lesson-content-tab]')]
  tabs.forEach(tab => tab.addEventListener('click', () => {
    const target = tab.dataset.lessonContentTab
    tabs.forEach(item => item.setAttribute('aria-selected', String(item === tab)))
    document.querySelectorAll('[data-lesson-content-panel]').forEach(panel => {
      panel.hidden = panel.dataset.lessonContentPanel !== target
    })
  }))
}
