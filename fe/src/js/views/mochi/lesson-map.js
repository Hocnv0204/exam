import { renderSidebar } from '../../components/sidebar.js'
import { renderNavbar } from '../../components/navbar.js'
import { escapeHtml } from '../../utils/download-helper.js'
import { sortMochiChapters } from './lesson-order.js'

let selectedByClass = new Map()

function homeworkIsDone(homework) {
  const status = String(homework?.status || homework?.submissionStatus || '').toUpperCase()
  return Boolean(homework?.isSubmitted || homework?.submittedAt || homework?.submitted_at || homework?.completedAt || ['SUBMITTED', 'GRADED', 'COMPLETED'].includes(status))
}

export function lessonHasCompletionEvidence(lesson) {
  const homeworks = Array.isArray(lesson?.homeworks) ? lesson.homeworks : []
  return homeworks.length > 0 && homeworks.every(homeworkIsDone)
}

function lessonMeta(lesson) {
  const homeworks = Array.isArray(lesson?.homeworks) ? lesson.homeworks : []
  const facts = []
  if (lesson?.videoUrl || lesson?.video_url) facts.push('Có video')
  if (Array.isArray(lesson?.theoryFiles) && lesson.theoryFiles.length) facts.push(`${lesson.theoryFiles.length} tài liệu`)
  if (homeworks.length) facts.push(`${homeworks.length} bài tập`)
  return facts.join(' · ') || 'Nội dung bài học'
}

export function renderMochiLessonMap({ classes = [], classChapters = [], classId } = {}) {
  const selectedClass = classes.find(item => item.id === classId) || classes[0]
  const sortedChapters = sortMochiChapters(classChapters)
  const remembered = selectedByClass.get(classId)
  const activeChapter = sortedChapters.find(chapter => chapter.id === remembered) || sortedChapters[0]
  if (activeChapter?.id) selectedByClass.set(classId, activeChapter.id)
  const lessons = activeChapter?.lessons || []
  const doneCount = lessons.filter(lessonHasCompletionEvidence).length
  const progress = lessons.length ? Math.round(doneCount / lessons.length * 100) : null

  return `
    <div class="app-layout navy-student m-student-page m-lesson-map-page">
      ${renderSidebar('my-classes')}
      <div class="main-content">
        ${renderNavbar(`Học tập / ${selectedClass?.name || 'Lớp học'}`)}
        <main class="content-body">
          <div class="m-page-wrap">
            <a class="m-back-link" href="#my-classes"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i> Về danh sách lớp</a>
            <header class="m-map-header">
              <div>
                <p class="m-eyebrow">${escapeHtml(selectedClass?.name || 'Lớp học của tôi')}</p>
                <h1>${escapeHtml(activeChapter?.title || 'Bản đồ bài học')}</h1>
                ${progress === null ? '<p class="m-muted">Chưa có bài học trong chương này.</p>' : `
                  <div class="m-map-progress"><div class="m-progress" aria-label="Đã hoàn thành ${doneCount} trên ${lessons.length} bài"><span style="--m-progress:${progress}%"></span></div><strong>${doneCount}/${lessons.length} bài</strong></div>`}
              </div>
              <div class="m-tabs m-map-chapters" role="tablist" aria-label="Chọn chương">
                ${sortedChapters.map((chapter, index) => `<button type="button" class="m-tab m-chapter-tab" role="tab" aria-selected="${chapter.id === activeChapter?.id}" data-chapter-id="${escapeHtml(chapter.id)}">Chương ${index + 1}</button>`).join('')}
              </div>
            </header>

            ${!activeChapter ? `
              <section class="m-card m-empty-state"><h2>Chưa có nội dung bài học</h2><p>Lớp học này chưa cập nhật chương và bài học.</p></section>
            ` : lessons.length === 0 ? `
              <section class="m-card m-empty-state"><h2>Chương chưa có bài học</h2><p>Hãy quay lại sau khi giáo viên cập nhật nội dung.</p></section>
            ` : `
              <ol class="m-lesson-path" aria-label="Lộ trình bài học">
                ${lessons.map((lesson, index) => {
                  const done = lessonHasCompletionEvidence(lesson)
                  return `<li class="m-path-row ${done ? 'is-done' : ''}">
                    <div class="m-path-rail" aria-hidden="true"><span>${done ? '✓' : index + 1}</span>${index < lessons.length - 1 ? '<i></i>' : ''}</div>
                    <a class="m-path-card" href="#my-classes?classId=${escapeHtml(classId)}&lessonId=${escapeHtml(lesson.id)}">
                      <div><span class="m-chip ${done ? 'm-chip--ok' : ''}">${done ? 'Đã xong' : 'Bài học'}</span><small>${escapeHtml(lessonMeta(lesson))}</small></div>
                      <h2>${escapeHtml(lesson.title || `Bài ${index + 1}`)}</h2>
                      <span class="m-path-action">Vào bài học <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span>
                    </a>
                  </li>`
                }).join('')}
              </ol>`}
          </div>
        </main>
      </div>
    </div>`
}

export function bindMochiLessonMap({ classId, rerender } = {}) {
  document.querySelectorAll('.m-chapter-tab').forEach(button => {
    button.addEventListener('click', () => {
      selectedByClass.set(classId, button.dataset.chapterId)
      rerender?.()
    })
  })
}
