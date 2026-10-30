import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { api } from '../api.js'
import { openModal } from '../components/modal.js'

const PAGE_SIZE = 50
let proctoringInterval = null
let isAutoRefresh = true
let currentHomeworkId = null
let currentHomeworkData = null
let sessionsList = []
let logsList = []
let sessionsError = null
let logsError = null
let homeworkError = null
let sessionsLoaded = false
let logsLoaded = false
let lastSessionsRefresh = null
let lastLogsRefresh = null
let activeTab = 'sessions'
let searchQuery = ''
let sessionsPage = 1
let logsPage = 1
let requestVersion = 0
let detailVersion = 0

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

function formatDate(value) {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? escapeHTML(date.toLocaleString('vi-VN')) : 'Không rõ'
}

function displayName(profile, fallback = 'Học sinh') {
  return escapeHTML(profile?.full_name || fallback)
}

function actionLabel(action) {
  const labels = {
    LEAVE_TAB: 'Tab thi bị ẩn', BLUR_TAB: 'Cửa sổ thi mất tiêu điểm', DEVTOOLS: 'Phím tắt bị chặn',
    FULLSCREEN_EXIT: 'Thoát toàn màn hình', COPY: 'Thao tác sao chép', PASTE: 'Thao tác dán',
    LEAVE_EXAM: 'Rời phòng thi', RETURN_TAB: 'Quay lại tab thi',
    EXAM_STARTED: 'Máy chủ xác nhận bắt đầu phiên thi', EXAM_RESUMED: 'Trình duyệt tiếp tục phiên thi',
    CONNECTION_RESTORED: 'Trình duyệt báo kết nối trở lại', AUTOSAVE_RECOVERED: 'Lưu nháp thành công sau lỗi'
  }
  return escapeHTML(labels[action] || action || 'Không rõ')
}

function eventType(log) {
  if (log.session_id == null) return '<span style="color:#92400e">Chưa gắn phiên · chưa xác minh</span>'
  if (log.counted === true) return '<strong style="color:#b91c1c">Được tính vi phạm</strong>'
  if (log.counted === false) return '<span style="color:#475569">Thông tin · không tính vi phạm</span>'
  return '<span style="color:#92400e">Chưa rõ trạng thái tính</span>'
}

function logRow(log) {
  return `<tr style="border-bottom:1px solid #e2e8f0">
    <td style="padding:12px">${formatDate(log.server_timestamp || log.created_at)}</td>
    <td style="padding:12px">${displayName(log.profiles)}<br><small>@${escapeHTML(log.profiles?.username || log.student_id || 'Không rõ')}</small></td>
    <td style="padding:12px">${actionLabel(log.action)}</td>
    <td style="padding:12px">${eventType(log)}<br><small>Lần thi: ${escapeHTML(log.attempt_no ?? 'Không rõ')} · ${escapeHTML(log.severity || 'Không rõ mức độ')}</small>${log.reason ? `<br><small>Lý do: ${escapeHTML(log.reason)}</small>` : ''}</td>
    <td style="padding:12px"><small>${log.session_id == null ? 'Chưa gắn phiên' : escapeHTML(log.session_id)}</small></td>
  </tr>`
}

function logTable(logs) {
  return `<div style="overflow-x:auto"><table style="width:100%;min-width:720px;border-collapse:collapse;text-align:left;font-size:13px">
    <thead><tr style="background:#f1f5f9"><th scope="col" style="padding:12px">Thời gian máy chủ</th><th scope="col" style="padding:12px">Thí sinh</th><th scope="col" style="padding:12px">Sự kiện</th><th scope="col" style="padding:12px">Phân loại</th><th scope="col" style="padding:12px">Phiên</th></tr></thead>
    <tbody>${logs.map(logRow).join('')}</tbody></table></div>`
}

export function renderExamProctoringView() {
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '')
  currentHomeworkId = params.get('homeworkId')
  currentHomeworkData = null
  sessionsList = []
  logsList = []
  sessionsError = logsError = homeworkError = null
  sessionsLoaded = logsLoaded = false
  lastSessionsRefresh = lastLogsRefresh = null
  sessionsPage = 1
  logsPage = 1
  searchQuery = ''
  activeTab = 'sessions'
  requestVersion++
  detailVersion++
  return `<div class="app-layout">${renderSidebar('homework-mgmt')}<div class="main-content">${renderNavbar()}
    <div class="content-container" style="max-width:1240px;margin:0 auto;padding:24px 20px">
      <div id="proctoring-mount" aria-live="polite">Đang tải dữ liệu giám sát...</div>
    </div></div></div>`
}

async function fetchProctoringData(isSilent = false) {
  if (!currentHomeworkId) {
    renderProctoringContent()
    return
  }
  const version = ++requestVersion
  const homeworkId = currentHomeworkId
  const requestedSessionsPage = sessionsPage
  const requestedLogsPage = logsPage
  const requests = await Promise.allSettled([
    currentHomeworkData ? Promise.resolve(currentHomeworkData) : api.getHomeworkDetail(homeworkId, { silent: isSilent }),
    // The API wrapper appends homeworkId directly to the URL; keep paging in this view until it accepts query params.
    api.getExamSessions(`${encodeURIComponent(homeworkId)}&page=${requestedSessionsPage}&limit=${PAGE_SIZE}`, { silent: isSilent }),
    api.getExamLogs(homeworkId, `page=${requestedLogsPage}&limit=${PAGE_SIZE}`, { silent: isSilent })
  ])
  if (version !== requestVersion || homeworkId !== currentHomeworkId || requestedSessionsPage !== sessionsPage || requestedLogsPage !== logsPage) return
  const [homework, sessions, logs] = requests
  if (homework.status === 'fulfilled') {
    currentHomeworkData = homework.value
    homeworkError = null
  } else homeworkError = homework.reason
  if (sessions.status === 'fulfilled' && Array.isArray(sessions.value)) {
    sessionsList = sessions.value
    sessionsLoaded = true
    sessionsError = null
    lastSessionsRefresh = new Date()
  } else sessionsError = sessions.status === 'rejected' ? sessions.reason : new Error('Dữ liệu phiên không hợp lệ')
  if (logs.status === 'fulfilled' && Array.isArray(logs.value)) {
    logsList = logs.value
    logsLoaded = true
    logsError = null
    lastLogsRefresh = new Date()
  } else logsError = logs.status === 'rejected' ? logs.reason : new Error('Dữ liệu nhật ký không hợp lệ')
  renderProctoringContent()
}

function sessionSignal(session, now) {
  if (session.status !== 'ACTIVE') return 'Không áp dụng'
  const heartbeat = session.last_heartbeat_at ? new Date(session.last_heartbeat_at).getTime() : NaN
  if (!Number.isFinite(heartbeat)) return 'Chưa có tín hiệu'
  if (heartbeat > now + 90000) return 'Thời gian tín hiệu không hợp lệ'
  return now - heartbeat <= 90000 ? `Có tín hiệu · ${formatDate(session.last_heartbeat_at)}` : `Mất tín hiệu · ${formatDate(session.last_heartbeat_at)}`
}

function renderProctoringContent() {
  const mount = document.getElementById('proctoring-mount')
  if (!mount) return
  const hw = currentHomeworkData?.homework || {}
  const now = Date.now()
  const online = sessionsList.filter(s => s.status === 'ACTIVE' && sessionSignal(s, now).startsWith('Có tín hiệu')).length
  const disconnected = sessionsList.filter(s => s.status === 'ACTIVE' && sessionSignal(s, now).startsWith('Mất tín hiệu')).length
  const submitted = sessionsList.filter(s => s.status === 'SUBMITTED').length
  const q = searchQuery.toLocaleLowerCase('vi-VN')
  const matching = (profile, extra = '') => `${profile?.full_name || ''} ${profile?.username || ''} ${extra}`.toLocaleLowerCase('vi-VN').includes(q)
  const filteredSessions = sessionsList.filter(s => matching(s.profiles, `${s.student_id || ''} ${s.id || ''}`))
  const filteredLogs = logsList.filter(l => matching(l.profiles, `${l.action || ''} ${l.student_id || ''} ${l.session_id || ''}`))
  mount.innerHTML = `
    <header style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:20px">
      <div><a href="#homework-mgmt" class="btn-secondary" style="display:inline-block;padding:6px 12px;margin-bottom:10px">← Quay lại</a>
        <h1 style="font-size:22px;margin:0 0 6px">${escapeHTML(hw.title || 'Giám sát phòng thi')}</h1>
        <div style="font-size:13px;color:#475569">Thời lượng: ${escapeHTML(hw.durationMinutes ?? hw.duration_minutes ?? 'Không rõ')} phút · Ngưỡng cấu hình: ${escapeHTML(hw.maxViolations ?? hw.max_violations ?? 'Không rõ')} lần</div></div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <label><input type="checkbox" id="proctor-auto-refresh" ${isAutoRefresh ? 'checked' : ''}> Tự động cập nhật (5s)</label>
        <button type="button" id="proctor-refresh-now" class="btn-secondary" style="padding:8px 14px">Làm mới</button>
      </div>
    </header>
    ${!currentHomeworkId ? '<p role="alert">Thiếu mã bài thi. Vui lòng quay lại danh sách bài tập.</p>' : ''}
    ${homeworkError ? '<p role="alert" style="color:#b91c1c">Không tải được thông tin bài thi. Hãy thử làm mới.</p>' : ''}
    ${sessionsError ? `<p role="alert" style="color:#b91c1c">Không tải được phiên trang ${sessionsPage}; số liệu trang này có thể đã cũ. Hãy thử làm mới.</p>` : ''}
    ${logsError ? `<p role="alert" style="color:#b91c1c">Không tải được nhật ký trang ${logsPage}; dữ liệu hiển thị có thể đã cũ. Hãy thử làm mới.</p>` : ''}
    <p style="color:#475569;font-size:13px">Phiên trang ${sessionsPage} cập nhật: ${lastSessionsRefresh ? formatDate(lastSessionsRefresh) : 'Chưa tải'} · Nhật ký trang ${logsPage} cập nhật: ${lastLogsRefresh ? formatDate(lastLogsRefresh) : 'Chưa tải'}.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:20px 0">
      ${[['Có tín hiệu · phiên trang ' + sessionsPage, online], ['Mất tín hiệu · phiên trang ' + sessionsPage, disconnected], ['Đã nộp · phiên trang ' + sessionsPage, submitted], ['Sự kiện · nhật ký trang ' + logsPage, logsList.length]].map(([label, value], i) => `
        <div style="border:1px solid #cbd5e1;border-radius:12px;padding:16px;background:#fff"><strong style="display:block;font-size:22px">${(i === 3 ? logsLoaded : sessionsLoaded) ? value : '—'}</strong><span style="font-size:13px">${label}</span></div>`).join('')}
    </div>
    <section style="border:1px solid #cbd5e1;border-radius:12px;background:#fff;overflow:hidden">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:16px;background:#f8fafc">
        <button type="button" id="tab-btn-sessions" class="btn-secondary" aria-pressed="${activeTab === 'sessions'}" style="padding:8px 12px">Phiên thi · trang ${sessionsPage} (${sessionsLoaded ? sessionsList.length : '—'})</button>
        <button type="button" id="tab-btn-logs" class="btn-secondary" aria-pressed="${activeTab === 'logs'}" style="padding:8px 12px">Nhật ký (trang ${logsPage})</button>
        <label style="margin-left:auto">Tìm trong ${activeTab === 'sessions' ? `phiên trang ${sessionsPage}` : `nhật ký trang ${logsPage}`} (không tìm toàn bộ) <input type="search" id="proctor-search" value="${escapeHTML(searchQuery)}" placeholder="Tên, tài khoản, sự kiện..." style="max-width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px"></label>
      </div>
      ${activeTab === 'sessions' ? `
        <p style="padding:0 16px;color:#475569;font-size:13px">Chỉ hiển thị tối đa ${PAGE_SIZE} phiên/trang; số liệu và tìm kiếm chỉ áp dụng cho trang hiện tại, không phải tổng toàn bài thi. Số vi phạm toàn phiên không có trong API danh sách phiên; không tính từ trang nhật ký giới hạn và không suy đoán trạng thái khóa.</p>
        ${!sessionsLoaded ? '<p style="padding:16px">Chưa tải được phiên trang này.</p>' : !filteredSessions.length ? '<p style="padding:16px">Không có phiên phù hợp trong trang này.</p>' : `
        <div style="overflow-x:auto"><table style="width:100%;min-width:650px;border-collapse:collapse;text-align:left;font-size:13px"><thead><tr style="background:#f1f5f9"><th scope="col" style="padding:12px">Thí sinh</th><th scope="col" style="padding:12px">Trạng thái</th><th scope="col" style="padding:12px">Tín hiệu</th><th scope="col" style="padding:12px">Bắt đầu</th><th scope="col" style="padding:12px">Nhật ký</th></tr></thead><tbody>
        ${filteredSessions.map(s => `<tr style="border-top:1px solid #e2e8f0"><td style="padding:12px">${displayName(s.profiles)}<br><small>@${escapeHTML(s.profiles?.username || s.student_id || 'Không rõ')}</small></td><td style="padding:12px">${escapeHTML(s.status === 'ACTIVE' ? 'Đang làm bài' : s.status === 'SUBMITTED' ? 'Đã nộp' : s.status || 'Không rõ')}</td><td style="padding:12px">${sessionSignal(s, now)}</td><td style="padding:12px">${formatDate(s.created_at)}</td><td style="padding:12px"><button type="button" class="btn-secondary view-session-logs-btn" data-session-id="${escapeHTML(s.id)}" style="padding:6px 10px">Xem phiên</button></td></tr>`).join('')}</tbody></table></div>`}
        <div style="display:flex;gap:12px;align-items:center;padding:16px;flex-wrap:wrap"><button type="button" id="sessions-prev" class="btn-secondary" ${sessionsPage <= 1 ? 'disabled' : ''} style="padding:6px 12px">Trang trước</button><span>Trang phiên ${sessionsPage}</span><button type="button" id="sessions-next" class="btn-secondary" ${!sessionsLoaded || sessionsList.length < PAGE_SIZE || sessionsPage >= 10000 ? 'disabled' : ''} style="padding:6px 12px">Trang sau</button></div>
      ` : `
         <p style="padding:0 16px;color:#475569;font-size:13px">Chỉ hiển thị tối đa ${PAGE_SIZE} sự kiện/trang, mới nhất trước. Tín hiệu từ trình duyệt không chứng minh hành vi gian lận hay tình trạng mạng thực tế. Sự kiện không gắn phiên là chưa xác minh; không cộng vào phiên nào. Tìm kiếm chỉ áp dụng cho trang hiện tại.</p>
        ${!logsLoaded ? '<p style="padding:16px">Chưa tải được nhật ký.</p>' : !filteredLogs.length ? '<p style="padding:16px">Không có sự kiện phù hợp trong trang này.</p>' : logTable(filteredLogs)}
        <div style="display:flex;gap:12px;align-items:center;padding:16px;flex-wrap:wrap"><button type="button" id="logs-prev" class="btn-secondary" ${logsPage <= 1 ? 'disabled' : ''} style="padding:6px 12px">Trang trước</button><span>Trang ${logsPage}</span><button type="button" id="logs-next" class="btn-secondary" ${!logsLoaded || logsList.length < PAGE_SIZE || logsPage >= 10000 ? 'disabled' : ''} style="padding:6px 12px">Trang sau</button></div>
      `}
    </section>`
  bindProctoringDynamicEvents()
}

function showSessionDetail(session) {
  const version = ++detailVersion
  const homeworkId = currentHomeworkId
  const sessionId = session.id
  let page = 1
  let busy = false
  const title = `NHẬT KÝ PHIÊN · ${displayName(session.profiles)}`
  const show = (content) => {
    if (version !== detailVersion || homeworkId !== currentHomeworkId) return
    openModal(title, content, null, { cancelLabel: 'Đóng', contentStyle: 'max-width:960px;width:min(96vw,960px)', onClose: () => { detailVersion++ } })
  }
  const load = async () => {
    if (busy) return
    busy = true
    show(`<p role="status">Đang tải nhật ký phiên, trang ${page}...</p>`)
    try {
      const logs = await api.getExamLogs(homeworkId, `sessionId=${encodeURIComponent(sessionId)}&page=${page}&limit=${PAGE_SIZE}`, { silent: true })
      if (version !== detailVersion || homeworkId !== currentHomeworkId) return
      if (!Array.isArray(logs)) throw new Error('Invalid logs')
      const counted = logs.filter(l => l.session_id === sessionId && l.counted === true).length
      const complete = page === 1 && logs.length < PAGE_SIZE
       show(`<p style="font-size:13px">Phiên: <code>${escapeHTML(sessionId)}</code> · Trang ${page}. ${complete ? `Tổng sự kiện được tính trong phiên: ${counted}.` : `Sự kiện được tính trong trang này: ${counted}; chưa biết tổng toàn phiên.`} Các lần thi khác và sự kiện chưa gắn phiên không được cộng vào đây. Tín hiệu trình duyệt chỉ là thông tin, không phải bằng chứng gian lận.</p>
        ${logs.length ? logTable(logs) : '<p>Không có sự kiện trong trang này; điều này không chứng minh không có vi phạm.</p>'}
        <div style="display:flex;gap:10px;margin-top:14px;align-items:center;flex-wrap:wrap"><button type="button" id="detail-prev" class="btn-secondary" ${page <= 1 ? 'disabled' : ''} style="padding:6px 12px">Trang trước</button><span>Trang ${page}</span><button type="button" id="detail-next" class="btn-secondary" ${logs.length < PAGE_SIZE || page >= 10000 ? 'disabled' : ''} style="padding:6px 12px">Trang sau</button></div>`)
      document.getElementById('detail-prev')?.addEventListener('click', () => { page--; load() })
      document.getElementById('detail-next')?.addEventListener('click', () => { page++; load() })
    } catch (error) {
      if (version !== detailVersion || homeworkId !== currentHomeworkId) return
      show(`<p role="alert" style="color:#b91c1c">Không tải được nhật ký phiên (trang ${page}). Hãy thử lại; không thể kết luận phiên không có sự kiện.</p><button type="button" id="detail-retry" class="btn-secondary" style="padding:6px 12px">Thử lại</button>`)
      document.getElementById('detail-retry')?.addEventListener('click', load)
    } finally {
      busy = false
    }
  }
  load()
}

function bindProctoringDynamicEvents() {
  document.getElementById('proctor-auto-refresh')?.addEventListener('change', e => {
    isAutoRefresh = e.target.checked
    setupAutoRefresh()
  })
  document.getElementById('proctor-refresh-now')?.addEventListener('click', () => fetchProctoringData())
  document.getElementById('proctor-search')?.addEventListener('input', e => {
    const position = e.target.selectionStart
    searchQuery = e.target.value
    renderProctoringContent()
    const input = document.getElementById('proctor-search')
    input?.focus()
    input?.setSelectionRange(position, position)
  })
  document.getElementById('tab-btn-sessions')?.addEventListener('click', () => { activeTab = 'sessions'; renderProctoringContent() })
  document.getElementById('tab-btn-logs')?.addEventListener('click', () => { activeTab = 'logs'; renderProctoringContent() })
  const changeSessionsPage = delta => {
    sessionsPage += delta
    sessionsList = []
    sessionsLoaded = false
    sessionsError = null
    lastSessionsRefresh = null
    renderProctoringContent()
    fetchProctoringData(true)
  }
  document.getElementById('sessions-prev')?.addEventListener('click', () => changeSessionsPage(-1))
  document.getElementById('sessions-next')?.addEventListener('click', () => changeSessionsPage(1))
  const changePage = delta => {
    logsPage += delta
    logsList = []
    logsLoaded = false
    lastLogsRefresh = null
    renderProctoringContent()
    fetchProctoringData(true)
  }
  document.getElementById('logs-prev')?.addEventListener('click', () => changePage(-1))
  document.getElementById('logs-next')?.addEventListener('click', () => changePage(1))
  document.querySelectorAll('.view-session-logs-btn').forEach(btn => btn.addEventListener('click', () => {
    const session = sessionsList.find(s => String(s.id) === btn.dataset.sessionId)
    if (session) showSessionDetail(session)
  }))
}

function setupAutoRefresh() {
  if (proctoringInterval) clearInterval(proctoringInterval)
  proctoringInterval = null
  if (isAutoRefresh) proctoringInterval = setInterval(() => {
    if (window.location.hash.startsWith('#exam-proctoring')) fetchProctoringData(true)
    else { clearInterval(proctoringInterval); proctoringInterval = null }
  }, 5000)
}

export function bindExamProctoringEvents() {
  bindSidebarEvents()
  fetchProctoringData()
  setupAutoRefresh()
  const handleHashChange = () => {
    requestVersion++
    detailVersion++
    if (proctoringInterval) clearInterval(proctoringInterval)
    proctoringInterval = null
    window.removeEventListener('hashchange', handleHashChange)
  }
  window.addEventListener('hashchange', handleHashChange)
}
