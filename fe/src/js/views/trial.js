import { api, SUPABASE_URL } from '../api.js'
import { openModal } from '../components/modal.js'
import { renderPdfViewer } from '../components/pdf-viewer.js'
import { showToast } from '../components/toast.js'

let cachedTrialLessons = []
let selectedLessonId = null
let isLoadingTrial = false
let trialLoaded = false

export function renderTrialView() {
  const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '')
  const paramLessonId = urlParams.get('lessonId')

  if (paramLessonId && cachedTrialLessons.some(l => l.id === paramLessonId)) {
    selectedLessonId = paramLessonId
  } else if (!selectedLessonId && cachedTrialLessons.length > 0) {
    selectedLessonId = cachedTrialLessons[0].id
  }

  const activeLesson = cachedTrialLessons.find(l => l.id === selectedLessonId) || cachedTrialLessons[0] || null

  return `
    <div style="min-height: 100vh; background: #f8fafc; display: flex; flex-direction: column;">
      <!-- Top Navigation Bar for Public Guests -->
      <header style="height: 64px; background: #ffffff; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; position: sticky; top: 0; z-index: 50; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 38px; height: 38px; border-radius: 10px; background: linear-gradient(135deg, #0066cc, #0284c7); display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 18px; box-shadow: 0 4px 10px rgba(0,102,204,0.3);">
            <i class="fa-solid fa-graduation-cap"></i>
          </div>
          <div>
            <h1 style="font-family: var(--font-heading); font-size: 16px; font-weight: 700; color: #0f172a; margin: 0; line-height: 1.2;">
              Học & Phát Triển
            </h1>
            <span style="font-size: 11px; color: #64748b; font-weight: 500;">Không gian học thử miễn phí</span>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 12px;">
          <button id="btn-login-redirect" class="btn-secondary" style="font-size: 13px; padding: 8px 16px; display: inline-flex; align-items: center; gap: 6px; border-radius: 8px;">
            <i class="fa-solid fa-right-to-bracket"></i> Đăng nhập học viên
          </button>
        </div>
      </header>

      <!-- Hero Header Banner -->
      <section style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; padding: 36px 24px; position: relative; overflow: hidden; border-bottom: 1px solid #334155;">
        <div style="max-width: 1200px; margin: 0 auto; position: relative; z-index: 2;">
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(14, 165, 233, 0.15); border: 1px solid rgba(56, 189, 248, 0.3); color: #38bdf8; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.5px;">
            <i class="fa-solid fa-sparkles"></i> Trải nghiệm học thử không giới hạn
          </div>
          <h2 style="font-family: var(--font-heading); font-size: 26px; font-weight: 800; margin: 0 0 8px 0; color: #ffffff;">
            Khám Phá Các Bài Học Công Khai
          </h2>
          <p style="font-size: 14px; color: #94a3b8; margin: 0; max-width: 650px; line-height: 1.5;">
            Trải nghiệm video giảng dạy trực quan, tài liệu tóm tắt lý thuyết chuẩn chỉnh và làm bài tập trắc nghiệm / tự luận với hệ thống chấm điểm tức thì.
          </p>
        </div>
      </section>

      <!-- Main Learning Container -->
      <main style="flex: 1; max-width: 1200px; width: 100%; margin: 0 auto; padding: 24px; box-sizing: border-box;">
        ${isLoadingTrial ? `
          <div style="text-align: center; padding: 60px 20px; color: #64748b;">
            <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 36px; color: #0066cc; margin-bottom: 16px;"></i>
            <div style="font-size: 15px; font-weight: 600;">Đang tải danh sách bài học thử...</div>
          </div>
        ` : (cachedTrialLessons.length === 0 ? `
          <div class="card" style="text-align: center; padding: 48px 24px; max-width: 600px; margin: 40px auto; border-radius: 12px;">
            <i class="fa-regular fa-folder-open" style="font-size: 48px; color: #cbd5e1; margin-bottom: 16px;"></i>
            <h3 style="font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 8px;">Chưa có bài học thử nào được mở</h3>
            <p style="font-size: 14px; color: #64748b; margin-bottom: 20px;">
              Giáo viên đang hoàn thiện nội dung các bài học thử công khai. Vui lòng quay lại sau hoặc liên hệ trung tâm để nhận bài học trải nghiệm!
            </p>
            <button onclick="window.location.hash='#login'" class="btn-primary" style="display: inline-flex; align-items: center; gap: 8px; margin: 0 auto;">
              <i class="fa-solid fa-arrow-left"></i> Về trang đăng nhập
            </button>
          </div>
        ` : `
          <div class="grid-3" style="display: grid; grid-template-columns: minmax(280px, 1fr) minmax(0, 2fr); gap: 24px; align-items: start;">
            
            <!-- Left: Lessons Menu Sidebar -->
            <div style="display: flex; flex-direction: column; gap: 12px;">
              <div style="font-size: 13px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
                Danh sách bài học thử (${cachedTrialLessons.length})
              </div>

              ${cachedTrialLessons.map((l, idx) => {
                const isSelected = activeLesson?.id === l.id
                const createdDateStr = l.createdAt ? new Date(l.createdAt).toLocaleDateString('vi-VN') : ''
                const hwCount = (l.homeworks || []).length
                const docCount = (l.theoryFiles || []).length

                return `
                  <div class="trial-lesson-item card" data-id="${l.id}" style="padding: 14px 16px; margin: 0; cursor: pointer; border-radius: 10px; transition: all 0.2s ease; border-left: 4px solid ${isSelected ? '#0066cc' : '#cbd5e1'}; background: ${isSelected ? '#f0f9ff' : '#ffffff'}; box-shadow: ${isSelected ? '0 4px 12px rgba(0,102,204,0.1)' : '0 1px 3px rgba(0,0,0,0.02)'};">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 4px;">
                      <span style="font-size: 11px; font-weight: 700; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px;">
                        ${l.className || 'Lớp học'}
                      </span>
                      ${createdDateStr ? `
                        <span style="font-size: 11px; color: #94a3b8;">
                          <i class="fa-regular fa-calendar"></i> ${createdDateStr}
                        </span>
                      ` : ''}
                    </div>
                    <div style="font-weight: 700; font-size: 14px; color: ${isSelected ? '#0066cc' : '#0f172a'}; margin-bottom: 8px; line-height: 1.4;">
                      ${l.title}
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px; font-size: 12px; color: #64748b;">
                      <span><i class="fa-solid fa-list-check" style="color: #10b981;"></i> ${hwCount} bài tập</span>
                      <span><i class="fa-solid fa-file-pdf" style="color: #ef4444;"></i> ${docCount} tài liệu</span>
                    </div>
                  </div>
                `
              }).join('')}
            </div>

            <!-- Right: Active Lesson Details & Actions -->
            <div style="display: flex; flex-direction: column; gap: 20px;">
              ${activeLesson ? `
                <!-- Lesson Header Card -->
                <div class="card" style="padding: 20px; margin: 0; border-radius: 12px;">
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <span class="badge badge-published" style="font-size: 11px; padding: 4px 10px; font-weight: 700;">
                      <i class="fa-solid fa-sparkles"></i> BÀI HỌC THỬ CÔNG KHAI
                    </span>
                    <span style="font-size: 12px; color: #64748b; font-weight: 500;">
                      ${activeLesson.className ? `Khóa: ${activeLesson.className}` : ''}
                    </span>
                  </div>
                  <h3 style="font-family: var(--font-heading); font-size: 20px; font-weight: 800; color: #0f172a; margin: 0 0 10px 0;">
                    ${activeLesson.title}
                  </h3>
                  ${activeLesson.content ? `
                    <p style="font-size: 14px; color: #475569; margin: 0; line-height: 1.6;">
                      ${activeLesson.content}
                    </p>
                  ` : ''}
                </div>

                <!-- Video Player / Embed Section -->
                <div class="card" style="padding: 20px; margin: 0; border-radius: 12px;">
                  <h4 style="font-size: 15px; font-weight: 700; color: #0f172a; margin: 0 0 14px 0; display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-video" style="color: #0066cc;"></i> 1. Video Bài Giảng
                  </h4>
                  ${renderVideoEmbed(activeLesson.videoUrl)}
                </div>

                <!-- Theory Documents Section -->
                <div class="card" style="padding: 20px; margin: 0; border-radius: 12px;">
                  <h4 style="font-size: 15px; font-weight: 700; color: #0f172a; margin: 0 0 14px 0; display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-file-pdf" style="color: #ef4444;"></i> 2. Tài Liệu Lý Thuyết (${(activeLesson.theoryFiles || []).length})
                  </h4>
                  ${(!activeLesson.theoryFiles || activeLesson.theoryFiles.length === 0) ? `
                    <div style="font-size: 13px; color: #94a3b8; font-style: italic;">Bài học này không đính kèm tài liệu lý thuyết riêng.</div>
                  ` : `
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                      ${activeLesson.theoryFiles.map(file => {
                        const displayName = file.split('_').slice(1).join('_') || file
                        const fileUrl = `${SUPABASE_URL}/storage/v1/object/public/pdf-files/${file}`.replace(/https?:\/\/kong:8000/g, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321')
                        return `
                          <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
                            <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
                              <i class="fa-solid fa-file-pdf" style="color: #ef4444; font-size: 18px; flex-shrink: 0;"></i>
                              <span style="font-size: 13px; font-weight: 600; color: #334155; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${displayName}">
                                ${displayName}
                              </span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                              <button class="btn-secondary btn-view-theory-doc" data-name="${displayName}" data-url="${fileUrl}" style="padding: 6px 12px; font-size: 12px; cursor: pointer; border-radius: 6px;">
                                <i class="fa-solid fa-eye"></i> Xem trước
                              </button>
                              <a href="${fileUrl}" target="_blank" download="${displayName}" class="btn-secondary" style="padding: 6px 12px; font-size: 12px; text-decoration: none; border-radius: 6px;">
                                <i class="fa-solid fa-download"></i> Tải về
                              </a>
                            </div>
                          </div>
                        `
                      }).join('')}
                    </div>
                  `}
                </div>

                <!-- Homework / Exercises Section -->
                <div class="card" style="padding: 20px; margin: 0; border-radius: 12px;">
                  <h4 style="font-size: 15px; font-weight: 700; color: #0f172a; margin: 0 0 14px 0; display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-list-check" style="color: #10b981;"></i> 3. Bài Tập Trải Nghiệm (${(activeLesson.homeworks || []).length})
                  </h4>
                  ${(!activeLesson.homeworks || activeLesson.homeworks.length === 0) ? `
                    <div style="font-size: 13px; color: #94a3b8; font-style: italic;">Chưa có bài tập cho bài học này.</div>
                  ` : `
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                      ${activeLesson.homeworks.map(hw => `
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.02); flex-wrap: wrap; gap: 12px;">
                          <div>
                            <div style="font-weight: 700; font-size: 15px; color: #0f172a; margin-bottom: 4px;">
                              ${hw.title}
                            </div>
                            <div style="font-size: 12px; color: #64748b; display: flex; align-items: center; gap: 12px;">
                              <span><i class="fa-regular fa-clock"></i> ${hw.durationMinutes || 45} phút</span>
                              <span><i class="fa-solid fa-award"></i> Thang điểm: ${hw.maxScore || 10}</span>
                              <span class="badge ${hw.type === 'EXAM' ? 'badge-exam' : 'badge-practice'}" style="font-size: 10px; padding: 2px 6px;">
                                ${hw.type === 'EXAM' ? 'Đề thi' : 'Luyện tập'}
                              </span>
                            </div>
                          </div>
                          <button class="btn-primary btn-start-trial-hw" data-hwid="${hw.id}" style="padding: 10px 18px; font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; gap: 8px; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,102,204,0.25);">
                            <i class="fa-solid fa-play"></i> Làm bài tập ngay
                          </button>
                        </div>
                      `).join('')}
                    </div>
                  `}
                </div>
              ` : ''}
            </div>

          </div>
        `)}
      </main>

      <!-- Footer CTA -->
      <footer style="background: #ffffff; border-top: 1px solid #e2e8f0; padding: 24px; text-align: center; margin-top: 40px;">
        <div style="font-size: 13px; color: #64748b;">
          Hệ thống Học & Luyện Thi Trực Tuyến © 2026. Mọi trải nghiệm học thử đều hoàn toàn miễn phí.
        </div>
      </footer>
    </div>
  `
}

function renderVideoEmbed(videoUrl) {
  if (!videoUrl) {
    return `
      <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 32px; text-align: center; color: #94a3b8;">
        <i class="fa-solid fa-video-slash" style="font-size: 32px; margin-bottom: 8px; display: block; color: #cbd5e1;"></i>
        <span style="font-size: 13px;">Bài học này không có video giảng dạy</span>
      </div>
    `
  }

  // Check if Youtube URL
  let embedUrl = null
  if (videoUrl.includes('youtube.com/watch?v=')) {
    const videoId = videoUrl.split('v=')[1]?.split('&')[0]
    if (videoId) embedUrl = `https://www.youtube.com/embed/${videoId}`
  } else if (videoUrl.includes('youtu.be/')) {
    const videoId = videoUrl.split('youtu.be/')[1]?.split('?')[0]
    if (videoId) embedUrl = `https://www.youtube.com/embed/${videoId}`
  } else if (videoUrl.includes('drive.google.com/file/d/')) {
    const fileId = videoUrl.split('/d/')[1]?.split('/')[0]
    if (fileId) embedUrl = `https://drive.google.com/file/d/${fileId}/preview`
  }

  if (embedUrl) {
    return `
      <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 8px; background: #000000; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
        <iframe src="${embedUrl}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;" allowfullscreen></iframe>
      </div>
    `
  }

  return `
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; display: flex; align-items: center; justify-content: space-between;">
      <div style="font-size: 13px; color: #1e3a8a;">
        <i class="fa-solid fa-link"></i> Link bài giảng bên ngoài
      </div>
      <a href="${videoUrl}" target="_blank" rel="noopener noreferrer" class="btn-primary" style="font-size: 12px; padding: 6px 14px; text-decoration: none;">
        Xem video ngay <i class="fa-solid fa-arrow-up-right-from-square"></i>
      </a>
    </div>
  `
}

export async function bindTrialEvents() {
  document.getElementById('btn-login-redirect')?.addEventListener('click', () => {
    window.location.hash = '#login'
  })

  // Click on a lesson item in the menu
  document.querySelectorAll('.trial-lesson-item').forEach(item => {
    item.addEventListener('click', () => {
      const lessonId = item.getAttribute('data-id')
      if (lessonId) {
        selectedLessonId = lessonId
        const app = document.getElementById('app')
        if (app) {
          app.innerHTML = renderTrialView()
          bindTrialEvents()
        }
      }
    })
  })

  // View theory documents in modal with PDF viewer
  document.querySelectorAll('.btn-view-theory-doc').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.getAttribute('data-name')
      const url = btn.getAttribute('data-url')
      if (url) {
        openModal(
          name || 'Tài liệu lý thuyết',
          `<div id="trial-pdf-modal-container" style="width: 100%; height: 65vh; border-radius: 8px; overflow: hidden; position: relative;"></div>
           <div style="margin-top: 12px; display: flex; justify-content: flex-end;">
             <a href="${url}" target="_blank" rel="noopener noreferrer" class="btn-secondary" style="font-size: 12px; padding: 6px 14px; display: inline-flex; align-items: center; gap: 6px; text-decoration: none;">
               <i class="fa-solid fa-up-right-from-square"></i> Mở trong tab mới
             </a>
           </div>`
        )
        const mc = document.querySelector('#modal-container .modal-content')
        if (mc) mc.style.maxWidth = '900px'
        const container = document.getElementById('trial-pdf-modal-container')
        if (container) {
          renderPdfViewer(container, url)
        }
      }
    })
  })

  // Start homework button
  document.querySelectorAll('.btn-start-trial-hw').forEach(btn => {
    btn.addEventListener('click', () => {
      const hwId = btn.getAttribute('data-hwid')
      if (hwId) {
        window.location.hash = `#homework-attempt?homeworkId=${hwId}&trial=true`
      }
    })
  })

  // Fetch trial lessons if not loaded
  if (!trialLoaded && !isLoadingTrial) {
    isLoadingTrial = true
    try {
      cachedTrialLessons = await api.getTrialLessons()
      if (cachedTrialLessons.length > 0 && !selectedLessonId) {
        selectedLessonId = cachedTrialLessons[0].id
      }
    } catch (err) {
      console.error('[Trial] Error loading trial lessons:', err)
      showToast('Không thể tải bài học thử: ' + err.message, 'error')
    } finally {
      isLoadingTrial = false
      trialLoaded = true
      const app = document.getElementById('app')
      if (app) {
        app.innerHTML = renderTrialView()
        bindTrialEvents()
      }
    }
  }
}
