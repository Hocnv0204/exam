import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { state } from '../state.js'
import { api } from '../api.js'
import { showToast } from '../components/toast.js'

let selectedSessionDates = new Map()

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
        
        // Filter payload to only save sessions of the current month
        const payloadDates = Array.from(selectedSessionDates.entries())
          .filter(([date]) => date.startsWith(month))
          .map(([date, val]) => ({
            date,
            isPaid: val.isPaid
          }))
        
        await api.setStudentSessions(studentId, classId, payloadDates, month)
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
    selectedSessionDates = new Map((sessions || []).map(s => [s.sessionDate, { isPaid: s.isPaid }]))

    const [year, m] = month.split('-').map(Number)
    const totalDays = new Date(year, m, 0).getDate()

    let daysHTML = `
      <div style="font-size:12px; color:#64748b; margin-bottom:12px; display:flex; gap:16px; align-items:center; flex-wrap:wrap;">
        <span><i class="fa-solid fa-circle-info"></i> Click để đổi trạng thái:</span>
        <span style="display:inline-flex; align-items:center; gap:4px;"><span style="width:12px; height:12px; background:#ffffff; border:1px solid #e2e8f0; border-radius:3px;"></span> Trống</span>
        <span style="display:inline-flex; align-items:center; gap:4px;"><span style="width:12px; height:12px; background:#fef3c7; border:1px solid #f59e0b; border-radius:3px;"></span> Chưa đóng tiền</span>
        <span style="display:inline-flex; align-items:center; gap:4px;"><span style="width:12px; height:12px; background:#dcfce7; border:1px solid #10b981; border-radius:3px;"></span> Đã đóng tiền</span>
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
      const sessionData = selectedSessionDates.get(dateStr)
      const isSelected = !!sessionData
      const isPaid = sessionData ? sessionData.isPaid : false

      let bgColor = '#ffffff'
      let textColor = '#334155'
      let border = '1px solid #e2e8f0'
      let badgeHtml = ''

      if (isSelected) {
        if (isPaid) {
          bgColor = '#dcfce7'
          textColor = '#15803d'
          border = '1px solid #10b981'
          badgeHtml = '<span style="font-size: 9px; display: block; font-weight: 800; color: #16a34a; margin-top: 2px;"><i class="fa-solid fa-circle-check"></i> Đã đóng</span>'
        } else {
          bgColor = '#fef3c7'
          textColor = '#b45309'
          border = '1px solid #f59e0b'
          badgeHtml = '<span style="font-size: 9px; display: block; font-weight: 800; color: #d97706; margin-top: 2px;"><i class="fa-regular fa-clock"></i> Chưa đóng</span>'
        }
      }

      daysHTML += `
        <button class="calendar-day-btn" data-date="${dateStr}" style="
          background:${bgColor};
          color:${textColor};
          border:${border};
          border-radius:10px;
          height:54px;
          font-weight:700;
          font-size:14px;
          cursor:pointer;
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          transition: all 0.15s ease;
        " onmouseover="this.style.filter='brightness(0.9)'" onmouseout="this.style.filter='none'">
          <span>${day}</span>
          ${badgeHtml}
        </button>
      `
    }

    daysHTML += `</div>`
    gridContainer.innerHTML = daysHTML

    // Bind Calendar click toggle events
    document.querySelectorAll('.calendar-day-btn').forEach(btn => {
      btn.onclick = () => {
        const dateStr = btn.getAttribute('data-date')
        const dayNum = dateStr.split('-')[2]
        const tuitionFee = currentClassTuitionFee()
        
        const currentData = selectedSessionDates.get(dateStr)
        if (!currentData) {
          // Unselected -> Selected & Unpaid
          selectedSessionDates.set(dateStr, { isPaid: false })
          btn.style.background = '#fef3c7'
          btn.style.color = '#b45309'
          btn.style.border = '1px solid #f59e0b'
          btn.innerHTML = `<span>${parseInt(dayNum, 10)}</span><span style="font-size: 9px; display: block; font-weight: 800; color: #d97706; margin-top: 2px;"><i class="fa-regular fa-clock"></i> Chưa đóng</span>`
        } else if (currentData.isPaid === false) {
          // Selected & Unpaid -> Selected & Paid
          selectedSessionDates.set(dateStr, { isPaid: true })
          btn.style.background = '#dcfce7'
          btn.style.color = '#15803d'
          btn.style.border = '1px solid #10b981'
          btn.innerHTML = `<span>${parseInt(dayNum, 10)}</span><span style="font-size: 9px; display: block; font-weight: 800; color: #16a34a; margin-top: 2px;"><i class="fa-solid fa-circle-check"></i> Đã đóng</span>`
        } else {
          // Selected & Paid -> Unselected
          selectedSessionDates.delete(dateStr)
          btn.style.background = '#ffffff'
          btn.style.color = '#334155'
          btn.style.border = '1px solid #e2e8f0'
          btn.innerHTML = `<span>${parseInt(dayNum, 10)}</span>`
        }
        updateSummaryMetrics(tuitionFee)
      }
    })

    // Update Summary Metrics
    updateSummaryMetrics(currentClassTuitionFee())

    // 2. Fetch homeworks under this class in a single request
    const homeworksWithMeta = await api.getHomeworks('', classId) || []

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
  const completedCount = completed.length
  const uncompletedCount = uncompleted.length

  container.innerHTML = `
    <!-- Charts Section -->
    <div style="display:grid; grid-template-columns:1fr 2fr; gap:20px; margin-bottom:24px;">
      <!-- Pie Chart Card -->
      <div class="card" style="padding:20px; margin:0; display:flex; flex-direction:column; align-items:center; justify-content:center; border:1px solid #e2e8f0; border-radius:16px; background:#ffffff;">
        <h4 style="font-family:var(--font-heading); font-size:13px; font-weight:700; color:#475569; margin:0 0 16px 0; text-align:center; width:100%; text-transform:uppercase; letter-spacing:0.5px;">
          Tỷ lệ hoàn thành bài tập
        </h4>
        <div style="width:100%; max-width:180px; position:relative; display:flex; justify-content:center;">
          <canvas id="homework-pie-chart" style="max-height:180px; max-width:180px;"></canvas>
        </div>
        <div style="display:flex; justify-content:space-around; width:100%; margin-top:20px; font-size:12px; font-weight:700;">
          <span style="color:#16a34a; background:#f0fdf4; padding:4px 10px; border-radius:8px; border:1px solid #dcfce7;"><i class="fa-solid fa-circle-check"></i> Đã làm: ${completedCount}</span>
          <span style="color:#e11d48; background:#fff1f2; padding:4px 10px; border-radius:8px; border:1px solid #ffe4e6;"><i class="fa-solid fa-circle-xmark"></i> Chưa làm: ${uncompletedCount}</span>
        </div>
      </div>

      <!-- Score Trend Chart Card -->
      <div class="card" style="padding:20px; margin:0; border:1px solid #e2e8f0; border-radius:16px; background:#ffffff; display:flex; flex-direction:column;">
        <h4 style="font-family:var(--font-heading); font-size:13px; font-weight:700; color:#475569; margin:0 0 16px 0; text-transform:uppercase; letter-spacing:0.5px;">
          Đồ thị điểm số qua từng bài làm
        </h4>
        <div style="flex-grow:1; min-height:200px; position:relative;">
          <canvas id="homework-scores-chart" style="height:100%; width:100%;"></canvas>
        </div>
      </div>
    </div>

    <!-- Toggle Action Buttons -->
    <div style="display:flex; gap:12px; margin-bottom:20px;">
      <button id="btn-show-completed" class="btn-secondary" style="padding:8px 16px; font-weight:600; font-size:13px; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
        <i class="fa-solid fa-list-check"></i> Xem chi tiết bài đã nộp
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

  // Render Charts
  setTimeout(() => {
    // 1. Pie Chart
    const pieCtx = document.getElementById('homework-pie-chart')?.getContext('2d')
    if (pieCtx && window.Chart) {
      new window.Chart(pieCtx, {
        type: 'pie',
        data: {
          labels: ['Đã làm', 'Chưa làm'],
          datasets: [{
            data: [completedCount, uncompletedCount],
            backgroundColor: ['#10b981', '#f43f5e'],
            borderColor: ['#ffffff', '#ffffff'],
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              display: false
            }
          }
        }
      })
    }

    // 2. Score Mixed Chart (Bar + Curve Line)
    const scoresCtx = document.getElementById('homework-scores-chart')?.getContext('2d')
    if (scoresCtx && window.Chart) {
      const sortedSubs = [...submissions].sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt))
      
      const labels = sortedSubs.map(s => s.homeworkTitle || 'Bài tập')
      const scores = sortedSubs.map(s => s.score)

      new window.Chart(scoresCtx, {
        type: 'bar',
        data: {
          labels: labels.length > 0 ? labels : ['Chưa nộp bài nào'],
          datasets: [
            {
              type: 'line',
              label: 'Đường xu hướng (Điểm)',
              data: scores.length > 0 ? scores : [0],
              borderColor: '#f43f5e',
              borderWidth: 2.5,
              tension: 0.4,
              fill: false,
              pointBackgroundColor: '#ffffff',
              pointBorderColor: '#f43f5e',
              pointBorderWidth: 2,
              pointRadius: 4,
              order: 1
            },
            {
              type: 'bar',
              label: 'Điểm số đạt được',
              data: scores.length > 0 ? scores : [0],
              backgroundColor: 'rgba(14, 165, 233, 0.75)',
              borderColor: '#0284c7',
              borderWidth: 1,
              borderRadius: 6,
              barThickness: 32,
              order: 2
            }
          ]
        },
        plugins: [
          {
            id: 'chart-value-labels',
            afterDatasetsDraw(chart) {
              const { ctx } = chart
              ctx.save()
              ctx.font = 'bold 11px sans-serif'
              ctx.fillStyle = '#0f172a'
              ctx.textAlign = 'center'
              ctx.textBaseline = 'bottom'

              chart.data.datasets.forEach((dataset, datasetIndex) => {
                if (dataset.type !== 'line') return
                const meta = chart.getDatasetMeta(datasetIndex)
                meta.data.forEach((element, index) => {
                  const dataValue = dataset.data[index]
                  if (dataValue !== undefined && dataValue !== null) {
                    const pos = element.tooltipPosition()
                    ctx.fillText(dataValue, pos.x, pos.y - 8)
                  }
                })
              })
              ctx.restore()
            }
          }
        ],
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              max: 10,
              ticks: {
                stepSize: 2,
                font: {
                  weight: '600'
                }
              },
              grid: {
                color: '#f1f5f9'
              }
            },
            x: {
              ticks: {
                font: {
                  weight: '600'
                }
              },
              grid: {
                display: false
              }
            }
          },
          plugins: {
            legend: {
              position: 'top',
              labels: {
                boxWidth: 12,
                usePointStyle: true,
                font: {
                  size: 11,
                  weight: '600'
                }
              }
            }
          }
        }
      })
    }
  }, 50)

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
                  <th style="padding:12px 16px; text-align:center;">Hành động</th>
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
                      <td style="padding:12px 16px; text-align:center;">
                        <button class="btn-secondary" onclick="window.location.hash='#assignment-review?submissionId=${sub.submissionId}'" style="padding:4px 10px; font-size:12px; cursor:pointer;">
                          <i class="fa-solid fa-eye"></i> Xem bài làm
                        </button>
                      </td>
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
  const monthPicker = document.getElementById('details-month-picker')
  const currentMonth = monthPicker ? monthPicker.value : ''
  
  // Filter sessions to only count those belonging to the current month
  const currentMonthSessions = Array.from(selectedSessionDates.entries())
    .filter(([date]) => date.startsWith(currentMonth))

  const sessionsCount = currentMonthSessions.length
  
  let paidCount = 0
  for (const [date, val] of currentMonthSessions) {
    if (val.isPaid) paidCount++
  }
  const unpaidCount = sessionsCount - paidCount
  const totalTuition = sessionsCount * tuitionFee
  const unpaidTuition = unpaidCount * tuitionFee
  const paidTuition = paidCount * tuitionFee

  const sessionsDisplay = document.getElementById('sessions-count-display')
  const tuitionDisplay = document.getElementById('tuition-amount-display')
  const formulaDisplay = document.getElementById('tuition-formula-display')

  if (sessionsDisplay) {
    sessionsDisplay.innerHTML = `
      <strong>${sessionsCount} Buổi</strong>
      <div style="font-size:12px; font-weight:600; color:#0369a1; margin-top:4px;">
        <span style="color:#16a34a;"><i class="fa-solid fa-circle-check"></i> ${paidCount} Đã đóng</span> | 
        <span style="color:#d97706;"><i class="fa-regular fa-clock"></i> ${unpaidCount} Chưa đóng</span>
      </div>
    `
  }
  if (tuitionDisplay) {
    tuitionDisplay.innerHTML = `
      <strong>${totalTuition.toLocaleString('vi-VN')} VND</strong>
      <div style="font-size:12px; font-weight:600; color:#047857; margin-top:4px;">
        Đã đóng: ${paidTuition.toLocaleString('vi-VN')} VND | Còn thiếu: <span style="color:#dc2626; font-weight:700;">${unpaidTuition.toLocaleString('vi-VN')} VND</span>
      </div>
    `
  }
  if (formulaDisplay) {
    formulaDisplay.innerHTML = `${sessionsCount} buổi học &times; ${tuitionFee.toLocaleString('vi-VN')} VND/buổi`
  }
}
