import { api, SUPABASE_URL } from '../api.js'
import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { openModal } from '../components/modal.js'
import { renderPdfViewer } from '../components/pdf-viewer.js'
import { showToast } from '../components/toast.js'

let cachedTrialLessons = []
let isLoadingTrial = false
let trialLoaded = false
let serverTrialHistory = []
let isSyncingPhone = false

function getEmbedUrl(url) {
  if (!url) return null
  let match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/)
  if (match && match[1]) {
    return `https://www.youtube.com/embed/${match[1]}`
  }
  match = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (match && match[1]) {
    return `https://drive.google.com/file/d/${match[1]}/preview`
  }
  return url
}

window.confirmStartTrialHomework = (homeworkId) => {
  openModal(
    'Bắt đầu làm bài tập thử',
    `<p style="font-size:15px; color:#475569; line-height:1.6; margin:0;">
      Bạn có chắc chắn muốn bắt đầu làm bài tập thử này?<br>
      Thời gian làm bài sẽ <strong>bắt đầu đếm ngược ngay lập tức</strong>!
     </p>`,
    () => {
      window.location.hash = `#homework-attempt?homeworkId=${homeworkId}&trial=true`
      return true
    }
  )
}

function getLocalTrialHistory() {
  try {
    const raw = localStorage.getItem('trial_submissions_history')
    return raw ? JSON.parse(raw) : []
  } catch (e) {
    return []
  }
}

function getAllMergedTrialHistory() {
  const localList = getLocalTrialHistory()
  const map = new Map()

  // Add local history first
  localList.forEach(item => {
    if (item.submissionId) {
      map.set(item.submissionId, { ...item, source: 'local' })
    }
  })

  // Merge server history if fetched
  serverTrialHistory.forEach(item => {
    const subId = item.submissionId || item.id
    if (subId) {
      map.set(subId, {
        submissionId: subId,
        homeworkId: item.homeworkId,
        homeworkTitle: item.homeworkTitle || 'Bài tập học thử',
        lessonTitle: item.lessonTitle || '',
        score: item.score,
        maxScore: item.maxScore || 10,
        passScore: item.passScore || 5,
        isPassed: item.isPassed,
        correctCount: item.correctCount,
        wrongCount: item.wrongCount,
        durationSecondsTaken: item.durationSecondsTaken || 0,
        guestName: item.guestName || item.studentName || 'Học sinh trải nghiệm',
        guestPhone: item.guestPhone || '',
        submittedAt: item.submittedAt,
        source: 'server'
      })
    }
  })

  const merged = Array.from(map.values())
  merged.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
  return merged
}

function groupTrialLessonsByClass(lessons) {
  const map = {}
  lessons.forEach(l => {
    const cId = l.classId || 'general'
    const cName = l.className || 'Lớp học chung'
    if (!map[cId]) {
      map[cId] = {
        id: cId,
        name: cName,
        lessons: [],
        totalHomeworks: 0
      }
    }
    map[cId].lessons.push(l)
    map[cId].totalHomeworks += (l.homeworks?.length || 0)
  })

  // Sort lessons inside each class by orderIndex
  Object.values(map).forEach(c => {
    c.lessons.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
  })

  return Object.values(map)
}

function formatDuration(seconds = 0) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins === 0) return `${secs} giây`
  return `${mins} phút ${secs}s`
}

export function renderTrialView() {
  const hashUrl = window.location.hash.replace('#', '')
  const [_, queryString] = hashUrl.split('?')
  const params = new URLSearchParams(queryString || '')
  let classId = params.get('classId')
  const lessonId = params.get('lessonId')
  const activeTab = params.get('tab') || 'lessons' // 'lessons' | 'history'

  const classes = groupTrialLessonsByClass(cachedTrialLessons)
  const historyList = getAllMergedTrialHistory()
  const savedPhone = localStorage.getItem('trial_guest_phone') || ''

  // If lessonId is given without classId, try to find classId from lesson
  if (!classId && lessonId) {
    const found = cachedTrialLessons.find(l => l.id === lessonId)
    if (found) {
      classId = found.classId || 'general'
    }
  }

  const selectedClass = classId ? classes.find(c => c.id === classId) : null
  const classLessons = selectedClass ? selectedClass.lessons : []

  let activeLesson = null
  if (lessonId) {
    activeLesson = classLessons.find(l => l.id === lessonId) || cachedTrialLessons.find(l => l.id === lessonId)
  }

  // Loading state
  if (isLoadingTrial || (!trialLoaded && cachedTrialLessons.length === 0)) {
    return `
      <div class="app-layout">
        ${renderSidebar('trial')}
        <div class="main-content">
          ${renderNavbar('Học thử / Đang tải dữ liệu...')}
          <div class="content-body" style="text-align: center; padding: 80px 20px;">
            <div style="display: inline-block; width: 44px; height: 44px; border: 3px solid #e2e8f0; border-top-color: #16a34a; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 16px;"></div>
            <h3 style="font-family: var(--font-heading); color: #0f172a; font-size: 18px; margin: 0 0 8px 0;">Đang tải danh sách bài học thử...</h3>
            <p style="color: #64748b; font-size: 14px; margin: 0;">Vui lòng đợi trong giây lát</p>
          </div>
        </div>
      </div>
    `
  }

  // TAB 2: TRIAL SUBMISSIONS HISTORY VIEW
  if (activeTab === 'history') {
    const totalDone = historyList.length
    const totalScores = historyList.reduce((acc, h) => acc + (Number(h.score) || 0), 0)
    const avgScore = totalDone > 0 ? (Math.round((totalScores / totalDone) * 10) / 10) : 0
    const highestScore = totalDone > 0 ? Math.max(...historyList.map(h => Number(h.score) || 0)) : 0
    const passCount = historyList.filter(h => h.isPassed).length
    const passRate = totalDone > 0 ? Math.round((passCount / totalDone) * 100) : 0

    return `
      <div class="app-layout">
        ${renderSidebar('trial-history')}
        <div class="main-content">
          ${renderNavbar('Học thử / Lịch sử làm bài')}
          <div class="content-body">
            
            <!-- Tab Switcher Header -->
            <div style="display:flex; gap:12px; margin-bottom:24px; border-bottom:1px solid #e2e8f0; padding-bottom:12px; flex-wrap:wrap; align-items:center; justify-content:space-between;">
              <div style="display:flex; gap:10px;">
                <button class="btn-secondary tab-trial-nav" id="btn-tab-trial-lessons" style="padding:8px 18px; font-weight:700; font-size:13px; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; gap:8px;">
                  <i class="fa-solid fa-sparkles" style="color:#16a34a;"></i> Bài học & Luyện tập
                </button>
                <button class="btn-primary tab-trial-nav" id="btn-tab-trial-history" style="padding:8px 18px; font-weight:700; font-size:13px; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; gap:8px; background:#16a34a; border-color:#16a34a;">
                  <i class="fa-solid fa-clock-rotate-left"></i> Lịch sử làm bài của bạn
                  <span style="font-size:11px; padding:2px 7px; border-radius:10px; background:#ffffff; color:#16a34a; font-weight:800;">${totalDone}</span>
                </button>
              </div>

              <div>
                <button class="btn-secondary" onclick="window.location.hash='#login'" style="padding:8px 16px; font-size:13px; font-weight:600; cursor:pointer; color:#0066cc; border-color:#bfdbfe; background:#eff6ff;">
                  <i class="fa-solid fa-user-plus"></i> Đăng ký tài khoản chính thức
                </button>
              </div>
            </div>

            <!-- Page Title Header -->
            <div class="page-header" style="margin-bottom:20px;">
              <div>
                <h1 class="page-title" style="font-size:22px; margin:0 0 4px 0;">Lịch sử làm bài học thử</h1>
                <p class="page-description" style="margin:0;">Xem lại kết quả các bài tập bạn đã làm, kiểm tra đáp án chi tiết và ôn luyện lại.</p>
              </div>
            </div>

            <!-- Lookup by Phone Bar -->
            <div class="card" style="margin-bottom:24px; padding:18px 20px; background:#ffffff; border:1px solid #bfdbfe; border-radius:12px; box-shadow:0 2px 8px rgba(0,102,204,0.04);">
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
                <div style="display:flex; align-items:center; gap:12px;">
                  <div style="width:40px; height:40px; border-radius:10px; background:#eff6ff; color:#0066cc; display:flex; align-items:center; justify-content:center; font-size:18px;">
                    <i class="fa-solid fa-magnifying-glass"></i>
                  </div>
                  <div>
                    <div style="font-weight:700; font-size:14px; color:#0f172a;">Tra cứu lịch sử theo Số điện thoại</div>
                    <div style="font-size:12px; color:#64748b;">Nhập số điện thoại đã dùng khi nộp bài để đồng bộ tất cả bài làm từ máy chủ</div>
                  </div>
                </div>

                <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                  <div class="search-box" style="width:240px; margin:0;">
                    <i class="fa-solid fa-phone"></i>
                    <input type="tel" id="input-trial-phone-lookup" placeholder="Ví dụ: 0912345678" value="${savedPhone}">
                  </div>
                  <button class="btn-primary" id="btn-sync-phone-history" style="padding:9px 16px; font-size:13px; font-weight:600; cursor:pointer; border-radius:8px; display:inline-flex; align-items:center; gap:6px; background:#0066cc; border-color:#0066cc;">
                    <i class="fa-solid fa-arrows-rotate ${isSyncingPhone ? 'fa-spin' : ''}"></i> ${isSyncingPhone ? 'Đang tra cứu...' : 'Tra cứu & Đồng bộ'}
                  </button>
                </div>
              </div>
            </div>

            <!-- Stats Overview Cards -->
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:14px; margin-bottom:24px;">
              <div class="card" style="padding:16px; border:1px solid #bbf7d0; background:#f0fdf4;">
                <div style="font-size:11px; font-weight:700; color:#15803d; text-transform:uppercase;">
                  <i class="fa-solid fa-list-check"></i> Đã hoàn thành
                </div>
                <div style="font-size:24px; font-weight:800; color:#15803d; margin-top:4px;">${totalDone} <span style="font-size:13px; font-weight:600;">bài</span></div>
              </div>

              <div class="card" style="padding:16px; border:1px solid #bfdbfe; background:#eff6ff;">
                <div style="font-size:11px; font-weight:700; color:#0369a1; text-transform:uppercase;">
                  <i class="fa-solid fa-star"></i> Điểm trung bình
                </div>
                <div style="font-size:24px; font-weight:800; color:#0284c7; margin-top:4px;">
                  ${avgScore}<span style="font-size:13px; font-weight:600; color:#64748b;">/10</span>
                </div>
              </div>

              <div class="card" style="padding:16px; border:1px solid #fde68a; background:#fffbeb;">
                <div style="font-size:11px; font-weight:700; color:#b45309; text-transform:uppercase;">
                  <i class="fa-solid fa-trophy"></i> Điểm cao nhất
                </div>
                <div style="font-size:24px; font-weight:800; color:#d97706; margin-top:4px;">
                  ${highestScore}<span style="font-size:13px; font-weight:600; color:#64748b;">/10</span>
                </div>
              </div>

              <div class="card" style="padding:16px; border:1px solid #e2e8f0; background:#ffffff;">
                <div style="font-size:11px; font-weight:700; color:#475569; text-transform:uppercase;">
                  <i class="fa-solid fa-circle-check"></i> Tỷ lệ đạt (>= 5đ)
                </div>
                <div style="font-size:24px; font-weight:800; color:#0f172a; margin-top:4px;">
                  ${passRate}% <span style="font-size:13px; font-weight:600; color:#64748b;">(${passCount}/${totalDone})</span>
                </div>
              </div>
            </div>

            <!-- Submissions Table Card -->
            <div class="card">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
                <h3 style="font-family:var(--font-heading); font-size:16px; font-weight:700; color:#0f172a; margin:0;">
                  Danh sách bài tập học thử đã làm (${historyList.length})
                </h3>

                ${historyList.length > 0 ? `
                  <button class="btn-secondary" id="btn-clear-local-history" style="font-size:12px; padding:5px 10px; cursor:pointer; color:#dc2626; border-color:#fecaca;">
                    <i class="fa-regular fa-trash-can"></i> Xóa lịch sử tạm thời trên máy
                  </button>
                ` : ''}
              </div>

              <div class="table-responsive">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Tên bài tập</th>
                      <th>Thời gian nộp</th>
                      <th>Điểm số</th>
                      <th>Số câu đúng / sai</th>
                      <th>Thời gian làm</th>
                      <th style="text-align:center;">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${historyList.length === 0 ? `
                      <tr>
                        <td colspan="6" style="text-align:center; padding:50px 20px; color:#64748b;">
                          <i class="fa-regular fa-clipboard" style="font-size:44px; color:#cbd5e1; margin-bottom:12px; display:block;"></i>
                          <h4 style="font-size:16px; font-weight:700; color:#0f172a; margin:0 0 6px 0;">Bạn chưa làm bài tập thử nào</h4>
                          <p style="font-size:13px; margin:0 0 16px 0;">Hãy chọn một bài học thử để bắt đầu làm bài và kiểm tra kiến thức ngay!</p>
                          <button class="btn-primary" onclick="window.location.hash='#trial'" style="padding:8px 18px; font-size:13px; font-weight:600; cursor:pointer; background:#16a34a; border-color:#16a34a;">
                            <i class="fa-solid fa-sparkles"></i> Khám phá bài học thử
                          </button>
                        </td>
                      </tr>
                    ` : historyList.map(item => {
                      const isPassed = item.isPassed !== false
                      const dateStr = item.submittedAt ? new Date(item.submittedAt).toLocaleString('vi-VN') : 'Vừa xong'
                      const durStr = formatDuration(item.durationSecondsTaken)

                      return `
                        <tr>
                          <td>
                            <div style="font-weight:700; color:#0f172a; font-size:14px; margin-bottom:2px;">
                              ${item.homeworkTitle}
                            </div>
                            <div style="font-size:12px; color:#64748b;">
                              ${item.lessonTitle ? `Bài: ${item.lessonTitle}` : 'Bài tập tự luyện học thử'}
                            </div>
                          </td>
                          <td style="color:#64748b; font-size:13px;">
                            ${dateStr}
                          </td>
                          <td>
                            <span style="font-family:var(--font-heading); font-size:16px; font-weight:800; color:${isPassed ? '#16a34a' : '#dc2626'};">
                              ${item.score}
                            </span>
                            <span style="font-size:12px; color:#64748b; font-weight:600;">/ ${item.maxScore || 10}</span>
                            <div style="margin-top:2px;">
                              <span style="font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px; ${isPassed ? 'background:#dcfce7; color:#15803d; border:1px solid #86efac;' : 'background:#fee2e2; color:#dc2626; border:1px solid #fecaca;'}">
                                ${isPassed ? 'ĐẠT YÊU CẦU' : 'CHƯA ĐẠT'}
                              </span>
                            </div>
                          </td>
                          <td style="font-size:13px;">
                            <span style="color:#16a34a; font-weight:700;">${item.correctCount || 0} đúng</span>
                            <span style="color:#cbd5e1; margin:0 4px;">/</span>
                            <span style="color:#dc2626; font-weight:600;">${item.wrongCount || 0} sai</span>
                          </td>
                          <td style="color:#475569; font-size:13px; font-weight:600;">
                            ${durStr}
                          </td>
                          <td style="text-align:center; white-space:nowrap;">
                            <div style="display:flex; gap:8px; justify-content:center;">
                              <button class="btn-primary btn-view-trial-review" data-subid="${item.submissionId}" style="padding:6px 12px; font-size:12px; font-weight:600; cursor:pointer; border-radius:6px; background:#0066cc; border-color:#0066cc; display:inline-flex; align-items:center; gap:4px;">
                                <i class="fa-solid fa-eye"></i> Xem bài làm & Lời giải
                              </button>
                              <button class="btn-secondary btn-retake-trial" data-hwid="${item.homeworkId}" style="padding:6px 12px; font-size:12px; font-weight:600; cursor:pointer; border-radius:6px; color:#16a34a; border-color:#86efac; background:#f0fdf4; display:inline-flex; align-items:center; gap:4px;">
                                <i class="fa-solid fa-rotate-right"></i> Làm lại
                              </button>
                            </div>
                          </td>
                        </tr>
                      `
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      </div>
    `
  }

  // TAB 1: LESSONS AND HOMEWORKS (DEFAULT)
  // Case 1: Specific Class is selected (Show lessons in class or active lesson)
  if (classId && selectedClass) {
    return `
      <div class="app-layout">
        ${renderSidebar('trial')}
        <div class="main-content">
          ${renderNavbar(`Học thử / ${selectedClass.name}`)}
          <div class="content-body">

            <!-- Tab Switcher Header -->
            <div style="display:flex; gap:12px; margin-bottom:20px; border-bottom:1px solid #e2e8f0; padding-bottom:12px; flex-wrap:wrap; align-items:center; justify-content:space-between;">
              <div style="display:flex; gap:10px;">
                <button class="btn-primary tab-trial-nav" id="btn-tab-trial-lessons" style="padding:8px 18px; font-weight:700; font-size:13px; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; gap:8px; background:#16a34a; border-color:#16a34a;">
                  <i class="fa-solid fa-sparkles"></i> Bài học & Luyện tập
                </button>
                <button class="btn-secondary tab-trial-nav" id="btn-tab-trial-history" style="padding:8px 18px; font-weight:700; font-size:13px; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; gap:8px;">
                  <i class="fa-solid fa-clock-rotate-left"></i> Lịch sử làm bài của bạn
                  <span style="font-size:11px; padding:2px 7px; border-radius:10px; background:#cbd5e1; color:#0f172a; font-weight:800;">${historyList.length}</span>
                </button>
              </div>

              <div>
                <button class="btn-secondary" onclick="window.location.hash='#login'" style="padding:8px 16px; font-size:13px; font-weight:600; cursor:pointer; color:#0066cc; border-color:#bfdbfe; background:#eff6ff;">
                  <i class="fa-solid fa-user-plus"></i> Đăng ký tài khoản chính thức
                </button>
              </div>
            </div>

            ${activeLesson ? '' : `
              <!-- Back button to class list -->
              <div style="margin-bottom: 16px;">
                <button class="btn-secondary" id="back-to-trial-classes-btn" style="padding: 6px 14px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                  <i class="fa-solid fa-arrow-left"></i> Quay lại danh sách lớp học
                </button>
              </div>

              <!-- Class Banner -->
              <div class="card" style="background: linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%); border: 1px solid #bbf7d0; padding: 24px; margin-bottom: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
                  <div style="display: flex; align-items: center; gap: 20px;">
                    <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #16a34a, #059669); color: #ffffff; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 28px; box-shadow: 0 4px 12px rgba(22,163,74,0.25);">
                      <i class="fa-solid fa-graduation-cap"></i>
                    </div>
                    <div>
                      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                        <span style="font-size: 11px; font-weight: 700; background: #dcfce7; color: #15803d; border: 1px solid #86efac; padding: 2px 8px; border-radius: 12px; display: inline-flex; align-items: center; gap: 4px;">
                          <i class="fa-solid fa-sparkles"></i> HỌC THỬ MIỄN PHÍ
                        </span>
                      </div>
                      <h1 class="page-title" style="font-size: 22px; margin: 0;">${selectedClass.name}</h1>
                      <div style="font-size: 13px; color: #64748b; margin-top: 4px; display: flex; gap: 16px;">
                        <span><i class="fa-solid fa-book-open" style="color: #16a34a;"></i> ${classLessons.length} bài học thử</span>
                        <span><i class="fa-solid fa-list-check" style="color: #0066cc;"></i> ${selectedClass.totalHomeworks} bài tập tự luyện</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <button class="btn-primary" onclick="window.location.hash='#login'" style="padding: 8px 16px; font-size: 13px; font-weight: 600; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;">
                      <i class="fa-solid fa-user-plus"></i> Đăng ký lớp chính thức
                    </button>
                  </div>
                </div>
              </div>
            `}

            <!-- Active Lesson View (Embedded Video, Theory Docs, Homework List) -->
            ${activeLesson ? (() => {
              const embedUrl = getEmbedUrl(activeLesson.videoUrl)
              const homeworks = activeLesson.homeworks || []
              const theoryFiles = activeLesson.theoryFiles || []
              const createdDateStr = activeLesson.createdAt ? new Date(activeLesson.createdAt).toLocaleDateString('vi-VN') : ''

              return `
                <div style="margin-bottom: 16px;">
                  <button class="btn-secondary" id="btn-back-to-trial-lessons" style="padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; width: auto; display: inline-flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-arrow-left"></i> Quay lại danh sách bài học của ${selectedClass.name}
                  </button>
                </div>

                <div class="grid-3" style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px;">
                  <!-- Left Column: Directly Embedded Video & Lesson Info -->
                  <div>
                    <!-- Video Embed Player directly rendered without button -->
                    ${embedUrl ? `
                      <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 10px; background: #000000; box-shadow: 0 4px 16px rgba(0,0,0,0.1);">
                        <iframe src="${embedUrl}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" allowfullscreen allow="autoplay; encrypted-media; fullscreen" referrerpolicy="no-referrer"></iframe>
                      </div>
                      <div style="margin-bottom: 20px; display: flex; justify-content: flex-end;">
                        <a href="${activeLesson.videoUrl}" target="_blank" rel="noopener noreferrer" style="font-size: 12px; color: #0066cc; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; background: #eff6ff; border: 1px solid #bfdbfe; padding: 5px 12px; border-radius: 6px; font-weight: 500;">
                          <i class="fa-solid fa-arrow-up-right-from-square"></i> Mở video tab mới (nếu bị chặn hoặc lỗi 403)
                        </a>
                      </div>
                    ` : `
                      <div style="padding: 48px 16px; border: 1px dashed #cbd5e1; border-radius: 12px; text-align: center; color: #64748b; margin-bottom: 20px; background: #ffffff;">
                        <i class="fa-solid fa-video-slash" style="font-size: 36px; color: #94a3b8; margin-bottom: 12px;"></i>
                        <p style="font-weight: 600; font-size: 14px; margin: 0;">Bài học này không có video bài giảng</p>
                      </div>
                    `}

                    <!-- Lesson Information -->
                    <div class="card" style="padding: 24px; margin-bottom: 20px;">
                      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; flex-wrap: wrap;">
                        <div>
                          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                            <span style="font-size: 11px; font-weight: 700; background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 6px;">
                              ${selectedClass.name}
                            </span>
                            ${createdDateStr ? `
                              <span style="font-size: 12px; color: #64748b; display: inline-flex; align-items: center; gap: 4px;">
                                <i class="fa-regular fa-calendar"></i> ${createdDateStr}
                              </span>
                            ` : ''}
                          </div>
                          <h2 style="font-family: var(--font-heading); font-size: 20px; font-weight: 700; color: #0f172a; margin: 0;">${activeLesson.title}</h2>
                        </div>
                      </div>

                      <div style="font-size: 14px; color: #475569; line-height: 1.6; margin-bottom: 20px;">
                        ${activeLesson.content || 'Bài giảng lý thuyết và hướng dẫn phương pháp giải bài tập chi tiết.'}
                      </div>

                      <!-- Attached Theory Documents -->
                      <h3 style="font-family: var(--font-heading); font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 12px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
                        <i class="fa-solid fa-paperclip" style="color: #0066cc;"></i> Tài liệu lý thuyết đính kèm (${theoryFiles.length})
                      </h3>

                      ${theoryFiles.length === 0 ? `
                        <p style="font-size: 13px; color: #64748b; font-style: italic; margin: 0;">Bài học này chưa đính kèm tài liệu lý thuyết.</p>
                      ` : `
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                          ${theoryFiles.map(file => {
                            const dispName = file.split('_').slice(1).join('_') || file
                            return `
                              <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
                                <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
                                  <i class="fa-solid fa-file-pdf" style="color: #ef4444; font-size: 16px; flex-shrink: 0;"></i>
                                  <span style="font-size: 13px; font-weight: 600; color: #334155; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${dispName}</span>
                                </div>
                                <div style="display: flex; gap: 6px; flex-shrink: 0;">
                                  <button class="btn-secondary btn-preview-theory" data-file="${file}" style="padding: 5px 12px; font-size: 12px; cursor: pointer; background: #ffffff; border-color: #0066cc; color: #0066cc; font-weight: 600;">
                                    <i class="fa-solid fa-eye"></i> Xem
                                  </button>
                                  <button class="btn-secondary btn-download-theory" data-file="${file}" style="padding: 5px 12px; font-size: 12px; cursor: pointer; font-weight: 600;">
                                    <i class="fa-solid fa-download"></i> Tải về
                                  </button>
                                </div>
                              </div>
                            `
                          }).join('')}
                        </div>
                      `}
                    </div>
                  </div>

                  <!-- Right Column: Lesson Homework & Other Lessons -->
                  <div style="display: flex; flex-direction: column; gap: 20px;">
                    <!-- Homework List -->
                    <div class="card" style="padding: 20px;">
                      <h3 style="font-family: var(--font-heading); font-size: 16px; font-weight: 700; margin: 0 0 16px 0; color: #0f172a; display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-list-check" style="color: #16a34a;"></i> Bài tập tự luyện (${homeworks.length})
                      </h3>

                      ${homeworks.length === 0 ? `
                        <div style="text-align: center; padding: 24px 16px; border: 1px dashed #cbd5e1; border-radius: 8px; color: #64748b; font-size: 13px;">
                          <i class="fa-regular fa-clipboard" style="font-size: 28px; color: #cbd5e1; margin-bottom: 8px; display: block;"></i>
                          Bài học này chưa có bài tập tự luyện.
                        </div>
                      ` : `
                        <div style="display: flex; flex-direction: column; gap: 12px;">
                          ${homeworks.map(hw => `
                            <div style="padding: 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;">
                              <div style="font-weight: 700; font-size: 14px; color: #0f172a; margin-bottom: 6px; line-height: 1.4;">${hw.title}</div>
                              <div style="font-size: 12px; color: #64748b; margin-bottom: 12px; display: flex; flex-direction: column; gap: 4px;">
                                <span><i class="fa-regular fa-clock" style="color: #0284c7;"></i> Thời gian: <strong>${hw.durationMinutes || 45} phút</strong></span>
                                <span><i class="fa-solid fa-star" style="color: #f59e0b;"></i> Thang điểm: <strong>${hw.maxScore || 10} điểm</strong></span>
                              </div>
                              <button class="btn-primary" onclick="window.confirmStartTrialHomework('${hw.id}')" style="width: 100%; padding: 9px 14px; font-size: 13px; font-weight: 600; cursor: pointer; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 6px; background:#16a34a; border-color:#16a34a;">
                                Vào làm bài ngay <i class="fa-solid fa-arrow-right"></i>
                              </button>
                            </div>
                          `).join('')}
                        </div>
                      `}
                    </div>

                    <!-- Other Lessons In This Class -->
                    <div class="card" style="padding: 20px;">
                      <h4 style="font-family: var(--font-heading); font-size: 15px; font-weight: 700; margin: 0 0 12px 0; color: #0f172a; display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-layer-group" style="color: #0066cc;"></i> Bài học khác trong lớp
                      </h4>
                      <div style="display: flex; flex-direction: column; gap: 8px; max-height: 280px; overflow-y: auto;">
                        ${classLessons.map((l, idx) => {
                          const isCur = l.id === activeLesson.id
                          return `
                            <div class="trial-lesson-item" data-id="${l.id}" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 8px; cursor: pointer; background: ${isCur ? '#e0f2fe' : '#f8fafc'}; border: 1px solid ${isCur ? '#0066cc' : 'transparent'}; transition: all 0.15s ease;">
                              <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
                                <span style="width: 24px; height: 24px; border-radius: 50%; background: #ffffff; border: 1px solid ${isCur ? '#0066cc' : '#cbd5e1'}; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: ${isCur ? '#0066cc' : '#475569'};">${l.orderIndex || (idx + 1)}</span>
                                <span style="font-size: 13px; font-weight: 600; color: ${isCur ? '#0369a1' : '#334155'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${l.title}</span>
                              </div>
                              <i class="fa-solid fa-chevron-right" style="font-size: 11px; color: ${isCur ? '#0066cc' : '#94a3b8'};"></i>
                            </div>
                          `
                        }).join('')}
                      </div>
                    </div>
                  </div>
                </div>
              `
            })() : `
              <!-- Class Lessons List (When no lesson is active) -->
              <div class="grid-3" style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px;">
                <!-- Left: Lessons in Class -->
                <div>
                  <div class="page-header" style="margin-bottom: 16px;">
                    <h2 style="font-family: var(--font-heading); font-size: 18px; font-weight: 700; color: #0f172a; margin: 0;">
                      <i class="fa-solid fa-book-open" style="color: #16a34a;"></i> Danh sách bài học thử (${classLessons.length})
                    </h2>
                  </div>

                  ${classLessons.length === 0 ? `
                    <div class="card" style="text-align: center; padding: 40px 20px; color: #64748b;">
                      <i class="fa-solid fa-folder-open" style="font-size: 36px; color: #94a3b8; margin-bottom: 12px;"></i>
                      <p style="font-weight: 600; margin: 0;">Lớp này chưa có bài học thử nào.</p>
                    </div>
                  ` : `
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                      ${classLessons.map((l, idx) => {
                        const createdDateStr = l.createdAt ? new Date(l.createdAt).toLocaleDateString('vi-VN') : ''
                        const hwCount = (l.homeworks || []).length
                        const docCount = (l.theoryFiles || []).length
                        const hasVideo = !!l.videoUrl

                        return `
                          <div class="trial-lesson-item card" data-id="${l.id}" style="padding: 16px 18px; margin: 0; cursor: pointer; border-radius: 10px; transition: all 0.15s ease; border-left: 4px solid #16a34a; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                              <div style="display: flex; align-items: center; gap: 14px; flex: 1;">
                                <span style="width: 32px; height: 32px; background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0;">
                                  ${l.orderIndex || (idx + 1)}
                                </span>
                                <div>
                                  <div style="font-weight: 700; font-size: 15px; color: #0f172a; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px;">
                                    <span>${l.title}</span>
                                    ${hasVideo ? `
                                      <span style="font-size: 10px; font-weight: 700; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;">
                                        <i class="fa-solid fa-play"></i> VIDEO
                                      </span>
                                    ` : ''}
                                    ${createdDateStr ? `
                                      <span style="font-size: 11px; color: #64748b; font-weight: 500;">
                                        <i class="fa-regular fa-calendar"></i> ${createdDateStr}
                                      </span>
                                    ` : ''}
                                  </div>
                                  <div style="font-size: 12px; color: #64748b; display: flex; gap: 14px; align-items: center;">
                                    <span><i class="fa-solid fa-list-check" style="color: #0066cc;"></i> ${hwCount} Bài tập</span>
                                    <span><i class="fa-solid fa-paperclip" style="color: #0284c7;"></i> ${docCount} Tài liệu lý thuyết</span>
                                  </div>
                                </div>
                              </div>
                              <div style="color: #16a34a; font-weight: 700; font-size: 13px; display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                                <span>Vào học</span>
                                <i class="fa-solid fa-chevron-right"></i>
                              </div>
                            </div>
                          </div>
                        `
                      }).join('')}
                    </div>
                  `}
                </div>

                <!-- Right: Guidelines & Class info -->
                <div>
                  <div class="card" style="padding: 20px; margin-bottom: 20px;">
                    <h3 style="font-family: var(--font-heading); font-size: 16px; font-weight: 700; margin-bottom: 12px; color: #0f172a; display: flex; align-items: center; gap: 8px;">
                      <i class="fa-solid fa-circle-info" style="color: #16a34a;"></i> Trải nghiệm học thử
                    </h3>
                    <p style="font-size: 13px; color: #475569; line-height: 1.6; margin: 0 0 16px 0;">
                      Chọn bất kỳ bài học nào ở danh sách bên trái để:
                    </p>
                    <div style="display: flex; flex-direction: column; gap: 10px; font-size: 13px; color: #334155;">
                      <div style="display: flex; align-items: flex-start; gap: 8px;">
                        <i class="fa-solid fa-circle-check" style="color: #16a34a; margin-top: 3px;"></i>
                        <span>Xem trực tiếp video bài giảng chi tiết</span>
                      </div>
                      <div style="display: flex; align-items: flex-start; gap: 8px;">
                        <i class="fa-solid fa-circle-check" style="color: #16a34a; margin-top: 3px;"></i>
                        <span>Đọc và tải tài liệu lý thuyết chuẩn</span>
                      </div>
                      <div style="display: flex; align-items: flex-start; gap: 8px;">
                        <i class="fa-solid fa-circle-check" style="color: #16a34a; margin-top: 3px;"></i>
                        <span>Làm bài tập trắc nghiệm và chấm điểm ngay lập tức</span>
                      </div>
                    </div>
                  </div>

                  <div class="card" style="padding: 20px; background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%); border: 1px solid #bfdbfe;">
                    <div style="font-weight: 700; font-size: 14px; color: #0f172a; margin-bottom: 8px;">
                      Yêu thích chương trình học?
                    </div>
                    <p style="font-size: 12px; color: #475569; line-height: 1.5; margin-bottom: 14px;">
                      Đăng ký tài khoản ngay để theo dõi tiến độ học tập, làm đầy đủ bài tập và nhận hỗ trợ từ thầy cô.
                    </p>
                    <button class="btn-primary" onclick="window.location.hash='#login'" style="width: 100%; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 6px;">
                      Đăng ký ngay <i class="fa-solid fa-arrow-right"></i>
                    </button>
                  </div>
                </div>
              </div>
            `}

          </div>
        </div>
      </div>
    `
  }

  // Case 2: List of All Classes offering trial lessons
  return `
    <div class="app-layout">
      ${renderSidebar('trial')}
      <div class="main-content">
        ${renderNavbar('Học thử / Danh sách lớp trải nghiệm')}
        <div class="content-body">

          <!-- Tab Switcher Header -->
          <div style="display:flex; gap:12px; margin-bottom:20px; border-bottom:1px solid #e2e8f0; padding-bottom:12px; flex-wrap:wrap; align-items:center; justify-content:space-between;">
            <div style="display:flex; gap:10px;">
              <button class="btn-primary tab-trial-nav" id="btn-tab-trial-lessons" style="padding:8px 18px; font-weight:700; font-size:13px; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; gap:8px; background:#16a34a; border-color:#16a34a;">
                <i class="fa-solid fa-sparkles"></i> Bài học & Luyện tập
              </button>
              <button class="btn-secondary tab-trial-nav" id="btn-tab-trial-history" style="padding:8px 18px; font-weight:700; font-size:13px; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; gap:8px;">
                <i class="fa-solid fa-clock-rotate-left"></i> Lịch sử làm bài của bạn
                <span style="font-size:11px; padding:2px 7px; border-radius:10px; background:#cbd5e1; color:#0f172a; font-weight:800;">${historyList.length}</span>
              </button>
            </div>

            <div>
              <button class="btn-secondary" onclick="window.location.hash='#login'" style="padding:8px 16px; font-size:13px; font-weight:600; cursor:pointer; color:#0066cc; border-color:#bfdbfe; background:#eff6ff;">
                <i class="fa-solid fa-user-plus"></i> Đăng ký tài khoản chính thức
              </button>
            </div>
          </div>

          <!-- Page Header -->
          <div class="page-header" style="margin-bottom: 24px;">
            <div>
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                <span style="font-size: 11px; font-weight: 700; background: #dcfce7; color: #15803d; border: 1px solid #86efac; padding: 2px 8px; border-radius: 12px; display: inline-flex; align-items: center; gap: 4px;">
                  <i class="fa-solid fa-sparkles"></i> 100% MIỄN PHÍ KHÔNG CẦN ĐĂNG NHẬP
                </span>
              </div>
              <h1 class="page-title" style="font-size: 24px; margin: 0;">Lớp học trải nghiệm miễn phí</h1>
              <p class="page-description" style="margin-top: 4px;">
                Chọn một lớp học để khám phá các bài giảng mẫu, tài liệu lý thuyết và làm thử các bài tập kiểm tra trắc nghiệm.
              </p>
            </div>
            <div style="display: flex; gap: 10px;">
              <button class="btn-primary" onclick="window.location.hash='#login'" style="padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer;">
                <i class="fa-solid fa-arrow-right-to-bracket"></i> Đăng nhập hệ thống
              </button>
            </div>
          </div>

          <!-- Classes Grid -->
          ${classes.length === 0 ? `
            <div class="card" style="text-align: center; padding: 60px 20px; color: #64748b;">
              <i class="fa-solid fa-graduation-cap" style="font-size: 44px; color: #cbd5e1; margin-bottom: 16px;"></i>
              <h3 style="font-family: var(--font-heading); font-size: 18px; color: #0f172a; margin-bottom: 8px;">Hiện tại chưa có lớp học thử nào</h3>
              <p style="font-size: 14px; margin: 0;">Vui lòng quay lại sau hoặc liên hệ quản trị viên để mở bài học thử.</p>
            </div>
          ` : `
            <div class="grid-4" style="margin-bottom: 28px;">
              ${classes.map(c => `
                <div class="class-card select-trial-class-card" data-id="${c.id}" style="cursor: pointer; padding: 20px; transition: all 0.2s ease;">
                  <div class="class-card-body" style="padding: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                      <div style="width: 46px; height: 46px; background: linear-gradient(135deg, #eff6ff, #dbeafe); color: #0066cc; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px; box-shadow: 0 2px 6px rgba(0,102,204,0.1);">
                        <i class="fa-solid fa-graduation-cap"></i>
                      </div>
                      <span style="font-size: 11px; font-weight: 700; background: #dcfce7; color: #15803d; border: 1px solid #86efac; padding: 3px 8px; border-radius: 12px; display: inline-flex; align-items: center; gap: 4px;">
                        <i class="fa-solid fa-sparkles"></i> Học thử
                      </span>
                    </div>

                    <h3 class="class-title" style="margin-bottom: 8px; font-size: 16px; font-weight: 700; color: #0f172a; line-height: 1.4;">${c.name}</h3>

                    <div style="font-size: 13px; color: #64748b; margin-bottom: 16px; display: flex; flex-direction: column; gap: 6px;">
                      <span><i class="fa-solid fa-book-open" style="color: #16a34a; width: 16px;"></i> <strong>${c.lessons.length}</strong> bài học thử</span>
                      <span><i class="fa-solid fa-list-check" style="color: #0066cc; width: 16px;"></i> <strong>${c.totalHomeworks}</strong> bài tập tự luyện</span>
                    </div>

                    <div class="class-footer" style="padding-top: 12px; border-top: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;">
                      <span style="font-size: 12px; color: #94a3b8;">Miễn phí 100%</span>
                      <div style="color: #16a34a; font-weight: 700; font-size: 13px; display: flex; align-items: center; gap: 6px;">
                        Vào học thử <i class="fa-solid fa-arrow-right"></i>
                      </div>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          `}

          <!-- Bottom Summary & Promotion Banner -->
          <div class="card" style="background: linear-gradient(135deg, #ffffff 0%, #f0f7ff 100%); border: 1px solid #bfdbfe; padding: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
              <div>
                <h3 style="font-family: var(--font-heading); font-size: 17px; font-weight: 700; margin: 0 0 6px 0; color: #0f172a;">
                  <i class="fa-solid fa-rocket" style="color: #0066cc;"></i> Bứt phá điểm số cùng EduPortal
                </h3>
                <p style="font-size: 13px; color: #475569; margin: 0; line-height: 1.5;">
                  Hàng trăm video bài giảng chất lượng, ngân hàng đề thi trắc nghiệm bám sát đề thi chính thức và chấm điểm tự động.
                </p>
              </div>
              <div>
                <button class="btn-primary" onclick="window.location.hash='#login'" style="padding: 10px 20px; font-size: 14px; font-weight: 600; cursor: pointer; border-radius: 8px;">
                  Đăng ký tài khoản ngay <i class="fa-solid fa-arrow-right"></i>
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  `
}

export function bindTrialEvents() {
  bindSidebarEvents()

  const hashUrl = window.location.hash.replace('#', '')
  const [_, queryString] = hashUrl.split('?')
  const params = new URLSearchParams(queryString || '')
  let classId = params.get('classId')

  // Switch Tab to Lessons
  document.getElementById('btn-tab-trial-lessons')?.addEventListener('click', () => {
    window.location.hash = classId ? `#trial?classId=${classId}&tab=lessons` : '#trial?tab=lessons'
  })

  // Switch Tab to History
  document.getElementById('btn-tab-trial-history')?.addEventListener('click', () => {
    window.location.hash = '#trial?tab=history'
  })

  // Phone sync / lookup button in Trial History
  document.getElementById('btn-sync-phone-history')?.addEventListener('click', async () => {
    const input = document.getElementById('input-trial-phone-lookup')
    const phone = input?.value?.trim() || ''
    if (!phone) {
      showToast('Vui lòng nhập số điện thoại để tra cứu bài làm!', 'warning')
      return
    }

    localStorage.setItem('trial_guest_phone', phone)
    isSyncingPhone = true
    const app = document.getElementById('app')
    if (app) {
      app.innerHTML = renderTrialView()
      bindTrialEvents()
    }

    try {
      showToast('Đang tra cứu lịch sử làm bài từ máy chủ...', 'info')
      const result = await api.getStudentHistory(`isTrial=true&phone=${encodeURIComponent(phone)}`)
      const fetched = result?.history || []
      serverTrialHistory = fetched

      if (fetched.length === 0) {
        showToast(`Không tìm thấy bài làm nào với số điện thoại ${phone}`, 'info')
      } else {
        showToast(`Đã tìm thấy ${fetched.length} bài làm của số điện thoại ${phone}!`, 'success')
      }
    } catch (e) {
      console.warn('[Trial] Phone sync error:', e)
      showToast(`Không thể tra cứu: ${e.message}`, 'error')
    } finally {
      isSyncingPhone = false
      if (app) {
        app.innerHTML = renderTrialView()
        bindTrialEvents()
      }
    }
  })

  // Clear local history button
  document.getElementById('btn-clear-local-history')?.addEventListener('click', () => {
    openModal(
      'Xóa lịch sử trên thiết bị này',
      '<p style="margin:0; font-size:14px; color:#475569;">Bạn có chắc chắn muốn xóa danh sách lịch sử làm bài tạm thời đã lưu trên thiết bị này không?</p>',
      () => {
        localStorage.removeItem('trial_submissions_history')
        serverTrialHistory = []
        showToast('Đã xóa lịch sử tạm thời trên thiết bị!', 'info')
        const app = document.getElementById('app')
        if (app) {
          app.innerHTML = renderTrialView()
          bindTrialEvents()
        }
        return true
      }
    )
  })

  // View review detail button
  document.querySelectorAll('.btn-view-trial-review').forEach(btn => {
    btn.addEventListener('click', () => {
      const subId = btn.getAttribute('data-subid')
      if (subId) {
        window.location.hash = `#assignment-review?trial=true&submissionId=${subId}`
      }
    })
  })

  // Retake trial homework button
  document.querySelectorAll('.btn-retake-trial').forEach(btn => {
    btn.addEventListener('click', () => {
      const hwId = btn.getAttribute('data-hwid')
      if (hwId) {
        window.confirmStartTrialHomework(hwId)
      }
    })
  })

  // Click on a Class Card -> Route to trial with classId
  document.querySelectorAll('.select-trial-class-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-id')
      if (id) {
        window.location.hash = `#trial?classId=${id}`
      }
    })
  })

  // Back button: Class details -> Class List
  document.getElementById('back-to-trial-classes-btn')?.addEventListener('click', () => {
    window.location.hash = '#trial'
  })

  // Back button: Active lesson -> Class Lessons List
  document.getElementById('btn-back-to-trial-lessons')?.addEventListener('click', () => {
    if (classId) {
      window.location.hash = `#trial?classId=${classId}`
    } else {
      window.location.hash = '#trial'
    }
  })

  // Click on a lesson in the list -> Route to trial with classId & lessonId
  document.querySelectorAll('.trial-lesson-item').forEach(item => {
    item.addEventListener('click', () => {
      const lessonId = item.getAttribute('data-id')
      if (lessonId) {
        if (!classId) {
          const l = cachedTrialLessons.find(x => x.id === lessonId)
          classId = l?.classId || 'general'
        }
        window.location.hash = `#trial?classId=${classId}&lessonId=${lessonId}`
      }
    })
  })

  // Preview theory PDF modal
  document.querySelectorAll('.btn-preview-theory').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation()
      const file = btn.getAttribute('data-file')
      if (!file) return
      const displayName = file.split('_').slice(1).join('_') || file
      const fileUrl = `${SUPABASE_URL}/storage/v1/object/public/pdf-files/${file}`
      const mappedUrl = fileUrl.replace(/https?:\/\/kong:8000/g, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321')
      openModal(
        displayName,
        `<div id="modal-trial-pdf-container" style="width:100%; height:65vh; overflow-y:auto; -webkit-overflow-scrolling:touch; border-radius:8px;"></div>
         <div style="margin-top:12px; display:flex; justify-content:flex-end;">
           <a href="${mappedUrl}" target="_blank" rel="noopener noreferrer" class="btn-secondary" style="font-size:12px; padding:6px 12px; display:inline-flex; align-items:center; gap:6px; text-decoration:none; background:#eff6ff; color:#0066cc; border:1px solid #bfdbfe; border-radius:8px;">
             <i class="fa-solid fa-up-right-from-square"></i> Mở file PDF trong tab mới
           </a>
         </div>`
      )
      const container = document.getElementById('modal-trial-pdf-container')
      if (container) {
        renderPdfViewer(container, mappedUrl)
      }
      const mc = document.querySelector('#modal-container .modal-content')
      if (mc) {
        mc.style.maxWidth = '900px'
      }
    }
  })

  // Download theory confirmation popup
  document.querySelectorAll('.btn-download-theory').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation()
      const file = btn.getAttribute('data-file')
      if (!file) return
      const displayName = file.split('_').slice(1).join('_') || file
      openModal(
        'Xác nhận tải tài liệu',
        `<p style="font-size:15px; color:#475569; line-height:1.6; margin:0;">
          Bạn có chắc chắn muốn tải xuống tài liệu lý thuyết <strong>"${displayName}"</strong> không?
         </p>`,
        () => {
          const fileUrl = `${SUPABASE_URL}/storage/v1/object/public/pdf-files/${file}`
          const mappedUrl = fileUrl.replace(/https?:\/\/kong:8000/g, import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321')
          window.open(mappedUrl, '_blank')
          return true
        }
      )
    }
  })

  // Fetch trial lessons if not loaded
  if (!trialLoaded && !isLoadingTrial) {
    isLoadingTrial = true
    try {
      api.getTrialLessons().then(lessons => {
        cachedTrialLessons = lessons || []
        isLoadingTrial = false
        trialLoaded = true
        const app = document.getElementById('app')
        if (app) {
          app.innerHTML = renderTrialView()
          bindTrialEvents()
        }
      }).catch(err => {
        console.error('[Trial] Error loading trial lessons:', err)
        isLoadingTrial = false
        trialLoaded = true
      })
    } catch (err) {
      isLoadingTrial = false
      trialLoaded = true
    }
  }
}
