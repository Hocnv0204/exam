/**
 * Partial dùng chung: cụm cấu hình bài tập giống hệt form tạo bài tập (create-hw.js).
 * - Thời gian (phút), mặc định 90
 * - Lần làm tối đa (0 = không giới hạn), mặc định 0
 * - Giới hạn vi phạm, mặc định 3
 * - Hạn chót nộp bài: ngày + giờ + phút + nút xóa (không bắt buộc)
 * - Hiển thị đáp án & giải thích sau khi nộp (mặc định tắt)
 *
 * Mọi id đều có tiền tố `prefix` để dùng chung trong nhiều modal cùng lúc:
 * `${prefix}-duration | -attempts | -violations | -deadline-date/hour/minute/clear | -show-solutions`
 */
export function renderHomeworkConfigFields(prefix, opts = {}) {
  const duration = opts.duration !== undefined ? opts.duration : 90
  const maxAttempts = opts.maxAttempts !== undefined ? opts.maxAttempts : 0
  const maxViolations = opts.maxViolations !== undefined ? opts.maxViolations : 3
  const showSolutions = !!opts.showSolutions

  const hours = Array.from({ length: 24 }, (_, i) => {
    const val = String(i).padStart(2, '0')
    return `<option value="${val}" ${val === '23' ? 'selected' : ''}>${val}h</option>`
  }).join('')
  const minutes = Array.from({ length: 60 }, (_, i) => {
    const val = String(i).padStart(2, '0')
    return `<option value="${val}" ${val === '59' ? 'selected' : ''}>${val}p</option>`
  }).join('')

  return `
    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">
      <div>
        <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Thời gian (Phút)</label>
        <input type="number" id="${prefix}-duration" value="${duration}" min="5" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:13px; background:#ffffff;">
      </div>
      <div>
        <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Giới hạn vi phạm</label>
        <input type="number" id="${prefix}-violations" value="${maxViolations}" min="1" max="10" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:13px; background:#ffffff;">
      </div>
      <div>
        <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Số lần làm (0 = không giới hạn)</label>
        <input type="number" id="${prefix}-attempts" value="${maxAttempts}" min="0" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:13px; background:#ffffff;">
      </div>
    </div>
    <div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <label style="font-size:12px; font-weight:600; margin:0;">
          <i class="fa-regular fa-calendar-days" style="color:#0284c7;"></i> Hạn chót nộp bài (24h)
        </label>
        <span style="font-size:11px; color:#64748b;">(Không bắt buộc)</span>
      </div>
      <div style="display:flex; gap:6px; align-items:center;">
        <input type="date" id="${prefix}-deadline-date" style="flex:1; min-width:140px; height:38px; padding:0 10px; font-size:13px; background:#ffffff; border-radius:8px; border:1px solid #cbd5e1;" title="Chọn ngày hết hạn">
        <div style="display:flex; align-items:center; gap:2px; flex-shrink:0;">
          <select id="${prefix}-deadline-hour" style="width:64px; height:38px; padding:0 4px; font-size:13px; font-weight:600; text-align:center; background:#ffffff; border-radius:8px; border:1px solid #cbd5e1; cursor:pointer;" title="Chọn giờ (00 - 23)">${hours}</select>
          <span style="font-weight:700; color:#64748b;">:</span>
          <select id="${prefix}-deadline-minute" style="width:64px; height:38px; padding:0 4px; font-size:13px; font-weight:600; text-align:center; background:#ffffff; border-radius:8px; border:1px solid #cbd5e1; cursor:pointer;" title="Chọn phút (00 - 59)">${minutes}</select>
        </div>
        <button type="button" id="${prefix}-deadline-clear" title="Xóa hạn chót" style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; cursor:pointer; color:#64748b; font-size:13px; height:38px; flex-shrink:0;">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    </div>
    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px;">
      <label style="display:flex; align-items:center; gap:10px; cursor:pointer; margin:0;">
        <input type="checkbox" id="${prefix}-show-solutions" ${showSolutions ? 'checked' : ''} style="width:18px; height:18px; accent-color:#0066cc; cursor:pointer;">
        <span style="font-size:13px; font-weight:600; color:#1e293b;"><i class="fa-regular fa-eye" style="color:#0066cc; margin-right:4px;"></i> Hiển thị đáp án & giải thích sau khi nộp</span>
      </label>
      <div style="font-size:11px; color:#64748b; margin-left:28px; margin-top:3px;">
        Nếu chọn thì khi nộp bài sẽ hiển thị đáp án và giải thích, nếu ẩn thì chỉ hiển thị là sai, không có đáp án và giải thích.
      </div>
    </div>
  `
}

/** Bind nút xóa hạn chót của cụm partial. */
export function bindHomeworkConfigFields(prefix) {
  document.getElementById(`${prefix}-deadline-clear`)?.addEventListener('click', () => {
    const dateInput = document.getElementById(`${prefix}-deadline-date`)
    if (dateInput) dateInput.value = ''
  })
}

/**
 * Coupling Loại bài tập <-> Số lần làm / Giới hạn vi phạm, giống create-hw.js:
 * EXAM => lần làm = 1 (khóa), mở vi phạm; PRACTICE => mở lần làm, khóa vi phạm.
 */
export function bindHomeworkTypeCoupling(typeSelectId, attemptsInputId, violationsInputId) {
  const typeSelect = document.getElementById(typeSelectId)
  const attemptsInput = document.getElementById(attemptsInputId)
  const violationsInput = violationsInputId ? document.getElementById(violationsInputId) : null
  if (!typeSelect || !attemptsInput) return
  // Khóa/mở bằng class `hw-config-locked` thay vì ghi inline backgroundColor:
  // ghi style qua CSSOM khiến browser chuẩn hoá TOÀN BỘ attribute sang dạng
  // rgb(), làm mất chuỗi `background:#ffffff` mà theme-admin-modals.css dùng
  // để map nền input về navy — hậu quả input khóa (disabled) thành near-white
  // trên nền gần trắng trong admin tối. Nền disabled do CSS scoped quyết định.
  const setLocked = (input, locked) => {
    if (!input) return
    input.disabled = locked
    input.classList.toggle('hw-config-locked', locked)
  }
  const handleTypeChange = () => {
    const isExam = typeSelect.value === 'EXAM'
    if (isExam) attemptsInput.value = 1
    setLocked(attemptsInput, isExam) // EXAM => đúng 1 lần làm (khóa)
    if (violationsInput) setLocked(violationsInput, !isExam) // PRACTICE => khóa giới hạn vi phạm
  }
  typeSelect.addEventListener('change', handleTypeChange)
  handleTypeChange()
}

/** Gom giá trị cụm partial thành payload, logic y hệt nút Lưu của create-hw.js. */
export function collectHomeworkConfig(prefix) {
  const durationMinutes = parseInt(document.getElementById(`${prefix}-duration`)?.value || '90', 10)
  const maxAttempts = parseInt(document.getElementById(`${prefix}-attempts`)?.value || '0', 10)
  const maxViolations = parseInt(document.getElementById(`${prefix}-violations`)?.value || '3', 10)
  const showSolutions = !!document.getElementById(`${prefix}-show-solutions`)?.checked

  let deadline = null
  const deadlineDate = document.getElementById(`${prefix}-deadline-date`)?.value
  if (deadlineDate) {
    const deadlineHour = document.getElementById(`${prefix}-deadline-hour`)?.value || '23'
    const deadlineMinute = document.getElementById(`${prefix}-deadline-minute`)?.value || '59'
    const dlObj = new Date(`${deadlineDate}T${deadlineHour}:${deadlineMinute}:00`)
    if (!isNaN(dlObj.getTime())) {
      deadline = dlObj.toISOString()
    }
  }

  return { durationMinutes, maxAttempts, maxViolations, deadline, showSolutions }
}
