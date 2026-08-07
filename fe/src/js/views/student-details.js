import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { state } from '../state.js'
import { api } from '../api.js'
import { showToast } from '../components/toast.js'

let selectedSessionDates = new Set()

export function renderStudentDetailsView() {
  const hashUrl = window.location.hash.replace('#', '')
  const [_, queryString] = hashUrl.split('?')
  const params = new URLSearchParams(queryString || '')
  const studentId = params.get('studentId')
  
  const student = state.students.find(s => s.id === studentId)
  if (!student) {
    return `
      <div class="app-layout">
        ${renderSidebar('students')}
        <div class="main-content">
          ${renderNavbar('Nền tảng / Bảng điều khiển')}
          <div class="content-body">
            <div class="card" style="text-align:center; padding:40px; color:#ef4444;">
              <i class="fa-solid fa-triangle-exclamation" style="font-size:36px; margin-bottom:12px;"></i>
              <p style="font-weight:600;">Không tìm thấy thông tin học sinh!</p>
              <a href="#classes-admin" class="btn-primary" style="display:inline-block; margin-top:16px; width:auto; text-decoration:none;">Quay lại danh sách lớp</a>
            </div>
          </div>
        </div>
      </div>
    `
  }

  const studentClassIds = student.classIds || (student.classId ? [student.classId] : [])
  const classId = params.get('classId') || studentClassIds[0]
  const currentClass = state.classes.find(c => c.id === classId)

  if (!currentClass) {
    return `
      <div class="app-layout">
        ${renderSidebar('students')}
        <div class="main-content">
          ${renderNavbar('Nền tảng / Bảng điều khiển')}
          <div class="content-body">
            <div class="card" style="text-align:center; padding:40px; color:#ef4444;">
              <i class="fa-solid fa-triangle-exclamation" style="font-size:36px; margin-bottom:12px;"></i>
              <p style="font-weight:600;">Không tìm thấy thông tin lớp học!</p>
              <a href="#classes-admin" class="btn-primary" style="display:inline-block; margin-top:16px; width:auto; text-decoration:none;">Quay lại danh sách lớp</a>
            </div>
          </div>
        </div>
      </div>
    `
  }

  const studentClasses = state.classes.filter(c => studentClassIds.includes(c.id))
  let classSelectorHTML = ''
  if (studentClasses.length > 1) {
    classSelectorHTML = `
      <div style="margin-top:12px; display:flex; align-items:center; gap:8px;">
        <span style="font-size:13px; color:#64748b; font-weight:600;"><i class="fa-solid fa-graduation-cap"></i> Chọn lớp học:</span>
        <select id="details-class-selector" class="form-input" style="width:auto; padding:4px 10px; margin:0; font-size:13px; font-weight:600; background:#ffffff; cursor:pointer;">
          ${studentClasses.map(c => `
            <option value="${c.id}" ${c.id === classId ? 'selected' : ''}>${c.name}</option>
          `).join('')}
        </select>
      </div>
    `
  }

  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  return `
    <div class="app-layout">
      ${renderSidebar('students')}
      <div class="main-content">
        ${renderNavbar('Nền tảng / Chi tiết học sinh')}
        <div class="content-body">
          <!-- Back button -->
          <div style="margin-bottom:16px;">
            <a href="#class-details?classId=${classId}" class="btn-secondary" style="padding:6px 14px; font-size:13px; font-weight:600; text-decoration:none; display:inline-flex; align-items:center; gap:6px;">
              <i class="fa-solid fa-arrow-left"></i> Quay lại chi tiết lớp học
            </a>
          </div>

          <!-- Student Profile Banner -->
          <div class="card" style="background:linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%); padding:20px; border:1px solid #e2e8f0; border-radius:16px; margin-bottom:24px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
              <div>
                <h1 class="page-title" style="font-size:24px; margin:0 0 6px 0; font-weight:800; color:#0f172a;">${student.fullName}</h1>
                <div style="font-size:13px; color:#64748b;">
                  <i class="fa-regular fa-user"></i> Username: <strong>${student.username}</strong> | 
                  <i class="fa-solid fa-graduation-cap"></i> Lớp đang cấu hình: <strong>${currentClass.name}</strong>
                </div>
                ${classSelectorHTML}
              </div>
              <div style="text-align:right;">
                <div style="font-size:12px; color:#64748b; margin-bottom:4px;">Học phí quy định</div>
                <strong style="font-size:20px; color:#10b981;"><i class="fa-solid fa-money-bill-wave"></i> ${(currentClass.tuitionFee || 0).toLocaleString('vi-VN')} VND / Buổi</strong>
              </div>
            </div>
          </div>

          <!-- Calendar Scheduler & Metrics -->
          <div class="grid-3" style="gap:24px;">
            <!-- Left Side: Scheduler & Date Assignment (Span 2) -->
            <div style="grid-column: span 2; display:flex; flex-direction:column; gap:24px;">
              <div class="card" style="padding:20px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:10px;">
                  <h2 style="font-family:var(--font-heading); font-size:17px; font-weight:700; color:#0f172a; margin:0; display:flex; align-items:center; gap:8px;">
                    <i class="fa-solid fa-calendar-check" style="color:#0066cc;"></i> Gán lịch học trong tháng
                  </h2>
                  <input type="month" id="details-month-picker" class="form-input" style="width:180px; padding:6px 12px; margin:0;" value="${defaultMonth}">
                </div>

                <div id="student-calendar-grid-container">
                  <!-- Loaded via JS -->
                </div>

                <div style="margin-top:20px; display:flex; justify-content:flex-end;">
                  <button class="btn-primary" id="save-student-sessions-btn" style="width:auto; cursor:pointer; padding:10px 20px; border-radius:10px; font-weight:700;">
                    <i class="fa-solid fa-save"></i> Lưu lịch học học sinh
                  </button>
                </div>
              </div>
            </div>

            <!-- Right Side: Tuition & Tests Summary -->
            <div style="display:flex; flex-direction:column; gap:24px;">
              <!-- Tuition Card -->
              <div class="card" style="border:1px solid #10b981; background:#f0fdf4; padding:20px; border-radius:16px; position:relative; overflow:hidden;">
                <div style="font-size:12px; color:#047857; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;">
                  <i class="fa-solid fa-calculator"></i> Học phí trong tháng
                </div>
                <div style="font-size:28px; font-weight:900; color:#065f46;" id="tuition-amount-display">0 VND</div>
                <div style="font-size:12px; color:#047857; margin-top:8px;" id="tuition-formula-display">0 buổi &times; 0 VND/buổi</div>
              </div>

              <!-- Metrics / Sessions count -->
              <div class="card" style="border:1px solid #0284c7; background:#f0f9ff; padding:20px; border-radius:16px;">
                <div style="font-size:12px; color:#0369a1; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;">
                  <i class="fa-solid fa-calendar-days"></i> Tổng số buổi học
                </div>
                <div style="font-size:28px; font-weight:900; color:#075985;" id="sessions-count-display">0 Buổi</div>
                <div style="font-size:12px; color:#0369a1; margin-top:8px;">Lịch học cá nhân được phân bổ</div>
              </div>
            </div>
          </div>

          <!-- Bottom: Completed & Uncompleted Homework Statistics -->
          <div class="card" style="padding:20px; margin-top:24px;">
            <h3 style="font-family:var(--font-heading); font-size:17px; font-weight:700; color:#0f172a; margin:0 0 16px 0; display:flex; align-items:center; gap:8px;">
              <i class="fa-solid fa-square-poll-vertical" style="color:#0066cc;"></i> Thống kê làm bài tập trong lớp
            </h3>
            <div id="student-homework-stats-container">
              <!-- Loaded via JS -->
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}

export function bindStudentDetailsEvents() {
  bindSidebarEvents()

  const hashUrl = window.location.hash.replace('#', '')
  const [_, queryString] = hashUrl.split('?')
  const params = new URLSearchParams(queryString || '')
  const studentId = params.get('studentId')
  const student = state.students.find(s => s.id === studentId)
  const studentClassIds = student?.classIds || (student?.classId ? [student.classId] : [])
  const classId = params.get('classId') || studentClassIds[0]

  const monthPicker = document.getElementById('details-month-picker')
  if (monthPicker) {
    monthPicker.onchange = () => {
      loadStudentSchedule(studentId, classId, monthPicker.value)
    }
  }

  // Save button click
  const saveBtn = document.getElementById('save-student-sessions-btn')
  if (saveBtn) {
    saveBtn.onclick = async () => {
      try {
        const month = monthPicker.value
        showToast('Đang lưu lịch học...', 'info')
        await api.setStudentSessions(studentId, classId, Array.from(selectedSessionDates), month)
        showToast('Đã cập nhật lịch học của học sinh thành công!', 'success')
        
        // Recalculate and reload UI
        updateSummaryMetrics(currentClassTuitionFee())
      } catch (e) {
        showToast(`Lưu lịch học thất bại: ${e.message}`, 'error')
      }
    }
  }

  // Class selection change
  const classSelector = document.getElementById('details-class-selector')
  if (classSelector) {
    classSelector.onchange = () => {
      const newClassId = classSelector.value
      window.location.hash = `#student-details?studentId=${studentId}&classId=${newClassId}`
    }
  }

  // Initial schedule loading
  if (studentId && classId && monthPicker) {
    loadStudentSchedule(studentId, classId, monthPicker.value)
  }
}

function currentClassTuitionFee() {
  const hashUrl = window.location.hash.replace('#', '')
  const [_, queryString] = hashUrl.split('?')
  const params = new URLSearchParams(queryString || '')
  const studentId = params.get('studentId')
  const student = state.students.find(s => s.id === studentId)
  const studentClassIds = student?.classIds || (student?.classId ? [student.classId] : [])
  const classId = params.get('classId') || studentClassIds[0]
  const currentClass = state.classes.find(c => c.id === classId)
  return currentClass?.tuitionFee || 0
}

async function loadStudentSchedule(studentId, classId, month) {
  const gridContainer = document.getElementById('student-calendar-grid-container')
  const statsContainer = document.getElementById('student-homework-stats-container')
  if (!gridContainer) return

  gridContainer.innerHTML = `
    <div style="text-align:center; padding:30px; color:#64748b;">
      <i class="fa-solid fa-circle-notch fa-spin" style="font-size:28px; color:#0066cc; margin-bottom:10px;"></i>
      <p style="font-weight:600;">Đang tải lịch học & dữ liệu...</p>
    </div>
  `

  if (statsContainer) {
    statsContainer.innerHTML = `
      <div style="text-align:center; padding:24px; color:#64748b;">
        <i class="fa-solid fa-circle-notch fa-spin" style="font-size:24px; color:#0066cc; margin-bottom:8px;"></i>
        Đang tải thống kê làm bài tập...
      </div>
    `
  }

  try {
    // 1. Fetch Student Sessions
    const sessions = await api.getStudentSessions(studentId, classId, month)
    selectedSessionDates = new Set(sessions)

    const [year, m] = month.split('-').map(Number)
    const totalDays = new Date(year, m, 0).getDate()

    let daysHTML = `
      <div style="font-size:12px; color:#64748b; margin-bottom:12px;">
        <i class="fa-solid fa-circle-info"></i> Nhấp chuột vào các ô ngày để gán lịch học cá nhân cho học sinh (màu xanh).
      </div>
      <div style="display:grid; grid-template-columns: repeat(7, 1fr); gap:8px;">
    `

    const weekdays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
    weekdays.forEach(day => {
      daysHTML += `<div style="text-align:center; font-weight:700; font-size:11px; color:#94a3b8; padding:6px 0;">${day}</div>`
    })

    let startDayIdx = new Date(year, m - 1, 1).getDay()
    startDayIdx = startDayIdx === 0 ? 6 : startDayIdx - 1

    for (let i = 0; i < startDayIdx; i++) {
      daysHTML += `<div></div>`
    }

    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const isSelected = selectedSessionDates.has(dateStr)
      const bgColor = isSelected ? '#0066cc' : '#ffffff'
      const textColor = isSelected ? '#ffffff' : '#334155'
      const border = isSelected ? '1px solid #0066cc' : '1px solid #e2e8f0'

      daysHTML += `
        <button class="calendar-day-btn" data-date="${dateStr}" style="
          background:${bgColor};
          color:${textColor};
          border:${border};
          border-radius:10px;
          height:42px;
          font-weight:700;
          font-size:14px;
          cursor:pointer;
          display:flex;
          align-items:center;
          justify-content:center;
          transition: all 0.15s ease;
        " onmouseover="this.style.filter='brightness(0.9)'" onmouseout="this.style.filter='none'">
          ${day}
        </button>
      `
    }

    daysHTML += `</div>`
    gridContainer.innerHTML = daysHTML

    // Bind Calendar click toggle events
    document.querySelectorAll('.calendar-day-btn').forEach(btn => {
      btn.onclick = () => {
        const dateStr = btn.getAttribute('data-date')
        const tuitionFee = currentClassTuitionFee()
        if (selectedSessionDates.has(dateStr)) {
          selectedSessionDates.delete(dateStr)
          btn.style.background = '#ffffff'
          btn.style.color = '#334155'
          btn.style.border = '1px solid #e2e8f0'
        } else {
          selectedSessionDates.add(dateStr)
          btn.style.background = '#0066cc'
          btn.style.color = '#ffffff'
          btn.style.border = '1px solid #0066cc'
        }
        updateSummaryMetrics(tuitionFee)
      }
    })

    // Update Summary Metrics
    updateSummaryMetrics(currentClassTuitionFee())

    // 2. Fetch homeworks under this class
    const chapters = await api.getChapters(classId) || []
    const lessonsPromises = chapters.map(ch => api.getLessons(ch.id))
    const lessonsLists = await Promise.all(lessonsPromises)
    const lessons = lessonsLists.flat()

    const homeworksPromises = lessons.map(l => api.getHomeworks(l.id))
    const homeworksLists = await Promise.all(homeworksPromises)
    
    const homeworksWithMeta = []
    for (let i = 0; i < lessons.length; i++) {
      const lesson = lessons[i]
      const chapter = chapters.find(ch => ch.id === lesson.chapter_id)
      const hwList = homeworksLists[i] || []
      hwList.forEach(hw => {
        homeworksWithMeta.push({
          ...hw,
          lessonTitle: lesson.title,
          chapterTitle: chapter?.title || ''
        })
      })
    }

    // 3. Fetch Student Submissions History
    const historyResult = await api.getStudentHistory(`studentId=${studentId}`)
    const submissions = historyResult?.history || []

    // Calculate completed & uncompleted
    const completedHomeworks = homeworksWithMeta.filter(hw => 
      submissions.some(sub => sub.homeworkId === hw.id)
    )

    const uncompletedHomeworks = homeworksWithMeta.filter(hw => 
      !submissions.some(sub => sub.homeworkId === hw.id)
    )

    if (statsContainer) {
      renderHomeworkStats(statsContainer, completedHomeworks, uncompletedHomeworks, submissions)
    }

  } catch (e) {
    gridContainer.innerHTML = `
      <div style="text-align:center; padding:20px; color:#ef4444;">
        <i class="fa-solid fa-triangle-exclamation" style="font-size:24px; margin-bottom:8px; display:block;"></i>
        Tải dữ liệu thất bại: ${e.message}
      </div>
    `
  }
}

function renderHomeworkStats(container, completed, uncompleted, submissions) {
  container.innerHTML = `
    <!-- Stats Cards Grid -->
    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:16px; margin-bottom:20px;">
      <!-- Total Homeworks -->
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; display:flex; align-items:center; gap:16px;">
        <div style="width:48px; height:48px; background:#e2e8f0; color:#475569; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:20px;">
          <i class="fa-solid fa-book"></i>
        </div>
        <div>
          <div style="font-size:12px; color:#64748b; font-weight:600; text-transform:uppercase;">Tổng số bài tập</div>
          <strong style="font-size:20px; color:#1e293b;">${completed.length + uncompleted.length}</strong>
        </div>
      </div>

      <!-- Completed -->
      <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:16px; display:flex; align-items:center; gap:16px;">
        <div style="width:48px; height:48px; background:#dcfce7; color:#16a34a; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:20px;">
          <i class="fa-solid fa-circle-check"></i>
        </div>
        <div>
          <div style="font-size:12px; color:#16a34a; font-weight:600; text-transform:uppercase;">Bài tập đã làm</div>
          <strong style="font-size:20px; color:#15803d;">${completed.length}</strong>
        </div>
      </div>

      <!-- Uncompleted -->
      <div style="background:#fff1f2; border:1px solid #fecdd3; border-radius:12px; padding:16px; display:flex; align-items:center; gap:16px;">
        <div style="width:48px; height:48px; background:#ffe4e6; color:#e11d48; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:20px;">
          <i class="fa-solid fa-circle-xmark"></i>
        </div>
        <div>
          <div style="font-size:12px; color:#e11d48; font-weight:600; text-transform:uppercase;">Bài tập chưa làm</div>
          <strong style="font-size:20px; color:#be123c;">${uncompleted.length}</strong>
        </div>
      </div>
    </div>

    <!-- Toggle Action Buttons -->
    <div style="display:flex; gap:12px; margin-bottom:20px;">
      <button id="btn-show-completed" class="btn-secondary" style="padding:8px 16px; font-weight:600; font-size:13px; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
        <i class="fa-solid fa-list-check"></i> Xem chi tiết
      </button>
      <button id="btn-show-uncompleted" class="btn-secondary" style="padding:8px 16px; font-weight:600; font-size:13px; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
        <i class="fa-solid fa-list-ol"></i> Xem bài tập chưa làm
      </button>
    </div>

    <!-- Details Container -->
    <div id="homework-stats-details" style="display:none; transition: all 0.2s ease;"></div>
  `

  const showCompletedBtn = container.querySelector('#btn-show-completed')
  const showUncompletedBtn = container.querySelector('#btn-show-uncompleted')
  const detailsDiv = container.querySelector('#homework-stats-details')

  let currentView = null

  const toggleView = (viewType) => {
    if (currentView === viewType) {
      detailsDiv.style.display = 'none'
      currentView = null
      
      showCompletedBtn.style.background = ''
      showCompletedBtn.style.color = ''
      showCompletedBtn.style.borderColor = ''
      showUncompletedBtn.style.background = ''
      showUncompletedBtn.style.color = ''
      showUncompletedBtn.style.borderColor = ''
      return
    }

    currentView = viewType
    detailsDiv.style.display = 'block'
    
    if (viewType === 'completed') {
      showCompletedBtn.style.background = '#0066cc'
      showCompletedBtn.style.color = '#ffffff'
      showCompletedBtn.style.borderColor = '#0066cc'
      
      showUncompletedBtn.style.background = ''
      showUncompletedBtn.style.color = ''
      showUncompletedBtn.style.borderColor = ''

      const completedHomeworkIds = new Set(completed.map(hw => hw.id))
      const relevantSubmissions = submissions.filter(sub => completedHomeworkIds.has(sub.homeworkId))

      if (relevantSubmissions.length === 0) {
        detailsDiv.innerHTML = `
          <div style="text-align:center; padding:24px; color:#64748b; font-style:italic; font-size:13px; background:#f8fafc; border-radius:12px; border:1px solid #e2e8f0;">
            Chưa thực hiện bài tập nào trong lớp này.
          </div>
        `
      } else {
        detailsDiv.innerHTML = `
          <div style="border:1px solid #e2e8f0; border-radius:12px; overflow:hidden;">
            <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">
              <thead>
                <tr style="background:#f1f5f9; border-bottom:1px solid #e2e8f0;">
                  <th style="padding:12px 16px;">Tên bài kiểm tra</th>
                  <th style="padding:12px 16px; text-align:center;">Điểm số</th>
                  <th style="padding:12px 16px; text-align:center;">Kết quả</th>
                  <th style="padding:12px 16px;">Thời gian làm bài</th>
                  <th style="padding:12px 16px;">Ngày nộp</th>
                </tr>
              </thead>
              <tbody>
                ${relevantSubmissions.map(sub => {
                  const subDateStr = new Date(sub.submittedAt).toLocaleString('vi-VN')
                  const passStatusHTML = sub.isPassed
                    ? `<span style="background:#dcfce7; color:#15803d; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600;">ĐẠT</span>`
                    : `<span style="background:#fee2e2; color:#b91c1c; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600;">CHƯA ĐẠT</span>`
                  const durationText = sub.durationSecondsTaken
                    ? `${Math.floor(sub.durationSecondsTaken / 60)} phút ${sub.durationSecondsTaken % 60} giây`
                    : 'Không rõ'

                  return `
                    <tr style="border-bottom:1px solid #f1f5f9;">
                      <td style="padding:12px 16px; font-weight:700; color:#1e293b;">${sub.homeworkTitle}</td>
                      <td style="padding:12px 16px; text-align:center; font-weight:700; color:#0f172a;">${sub.score}/${sub.maxScore}</td>
                      <td style="padding:12px 16px; text-align:center;">${passStatusHTML}</td>
                      <td style="padding:12px 16px; color:#475569;">${durationText}</td>
                      <td style="padding:12px 16px; color:#64748b;">${subDateStr}</td>
                    </tr>
                  `
                }).join('')}
              </tbody>
            </table>
          </div>
        `
      }
    } else {
      showUncompletedBtn.style.background = '#e11d48'
      showUncompletedBtn.style.color = '#ffffff'
      showUncompletedBtn.style.borderColor = '#e11d48'
      
      showCompletedBtn.style.background = ''
      showCompletedBtn.style.color = ''
      showCompletedBtn.style.borderColor = ''

      if (uncompleted.length === 0) {
        detailsDiv.innerHTML = `
          <div style="text-align:center; padding:24px; color:#64748b; font-style:italic; font-size:13px; background:#f8fafc; border-radius:12px; border:1px solid #e2e8f0;">
            Chúc mừng! Tất cả bài tập đã được hoàn thành.
          </div>
        `
      } else {
        detailsDiv.innerHTML = `
          <div style="border:1px solid #e2e8f0; border-radius:12px; overflow:hidden;">
            <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">
              <thead>
                <tr style="background:#f1f5f9; border-bottom:1px solid #e2e8f0;">
                  <th style="padding:12px 16px;">Tên bài tập</th>
                  <th style="padding:12px 16px;">Bài học / Chương</th>
                  <th style="padding:12px 16px; text-align:center;">Điểm đạt yêu cầu</th>
                  <th style="padding:12px 16px; text-align:center;">Thời gian tối đa</th>
                </tr>
              </thead>
              <tbody>
                ${uncompleted.map(hw => {
                  return `
                    <tr style="border-bottom:1px solid #f1f5f9;">
                      <td style="padding:12px 16px; font-weight:700; color:#e11d48;">${hw.title}</td>
                      <td style="padding:12px 16px; color:#475569;">
                        <strong>${hw.lessonTitle}</strong><br>
                        <span style="font-size:11px; color:#64748b;">${hw.chapterTitle}</span>
                      </td>
                      <td style="padding:12px 16px; text-align:center; color:#0f172a; font-weight:600;">${hw.pass_score}/${hw.max_score}</td>
                      <td style="padding:12px 16px; text-align:center; color:#475569;">${hw.duration_minutes} phút</td>
                    </tr>
                  `
                }).join('')}
              </tbody>
            </table>
          </div>
        `
      }
    }
  }

  showCompletedBtn.onclick = () => toggleView('completed')
  showUncompletedBtn.onclick = () => toggleView('uncompleted')
}

function updateSummaryMetrics(tuitionFee) {
  const sessionsCount = selectedSessionDates.size
  const totalTuition = sessionsCount * tuitionFee

  const sessionsDisplay = document.getElementById('sessions-count-display')
  const tuitionDisplay = document.getElementById('tuition-amount-display')
  const formulaDisplay = document.getElementById('tuition-formula-display')

  if (sessionsDisplay) sessionsDisplay.textContent = `${sessionsCount} Buổi`
  if (tuitionDisplay) tuitionDisplay.textContent = `${totalTuition.toLocaleString('vi-VN')} VND`
  if (formulaDisplay) formulaDisplay.textContent = `${sessionsCount} buổi học &times; ${tuitionFee.toLocaleString('vi-VN')} VND/buổi`
}
