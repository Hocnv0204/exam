import { api } from '../api.js'
import { showToast } from '../components/toast.js'
import { escapeHtml } from '../utils/download-helper.js'

const DAY_LABELS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/

function dayOptions(selectedDay) {
  return DAY_LABELS.map((label, index) => {
    const day = index + 1
    return `<option value="${day}" ${Number(selectedDay) === day ? 'selected' : ''}>${label}</option>`
  }).join('')
}

function renderScheduleRows(schedule) {
  if (!schedule.length) {
    return `<p class="ap-public-intro-empty">Chưa có lịch — trang giới thiệu sẽ hiện 'Lịch học: liên hệ'</p>`
  }

  return schedule.map((slot, index) => `
    <div class="ap-public-intro-slot" data-slot-index="${index}">
      <label class="ap-public-intro-slot-day">
        <span class="ap-sr-only">Thứ</span>
        <select class="form-input ap-public-intro-day" aria-label="Thứ của khung giờ ${index + 1}">
          ${dayOptions(slot?.day)}
        </select>
      </label>
      <label class="ap-public-intro-time-field">
        <span>Bắt đầu</span>
        <input class="form-input ap-public-intro-start" type="time" value="${escapeHtml(slot?.start ?? '')}" aria-label="Giờ bắt đầu khung giờ ${index + 1}">
      </label>
      <label class="ap-public-intro-time-field">
        <span>Kết thúc</span>
        <input class="form-input ap-public-intro-end" type="time" value="${escapeHtml(slot?.end ?? '')}" aria-label="Giờ kết thúc khung giờ ${index + 1}">
      </label>
      <button type="button" class="ap-public-intro-remove" data-slot-index="${index}" aria-label="Xóa khung giờ" title="Xóa khung giờ">
        <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
      </button>
    </div>
  `).join('')
}

function initialSchedule(currentClass) {
  if (!Array.isArray(currentClass?.publicSchedule)) return []
  return currentClass.publicSchedule.map(slot => ({
    day: slot?.day,
    start: slot?.start == null ? '' : String(slot.start),
    end: slot?.end == null ? '' : String(slot.end)
  }))
}

export function validatePublicIntroDraft({ publicListed, schedule, maxStudentsRaw }) {
  if (!Array.isArray(schedule)) {
    return { ok: false, error: 'Lịch học không hợp lệ.' }
  }
  if (schedule.length > 7) {
    return { ok: false, error: 'Chỉ được thêm tối đa 7 khung giờ.' }
  }

  const normalizedSchedule = []
  const seenSlots = new Set()
  for (let index = 0; index < schedule.length; index++) {
    const slot = schedule[index] || {}
    const day = Number(slot.day)
    const start = String(slot.start ?? '').trim()
    const end = String(slot.end ?? '').trim()

    if (!Number.isInteger(day) || day < 1 || day > 7) {
      return { ok: false, error: `Khung giờ ${index + 1}: thứ phải từ Thứ 2 đến Chủ nhật.` }
    }
    if (!TIME_PATTERN.test(start) || !TIME_PATTERN.test(end)) {
      return { ok: false, error: `Khung giờ ${index + 1}: giờ phải đúng định dạng HH:MM.` }
    }
    if (start >= end) {
      return { ok: false, error: `Khung giờ ${index + 1}: giờ bắt đầu phải trước giờ kết thúc.` }
    }

    const key = `${day}:${start}`
    if (seenSlots.has(key)) {
      return { ok: false, error: 'Không được có hai khung giờ trùng thứ và giờ bắt đầu.' }
    }
    seenSlots.add(key)
    normalizedSchedule.push({ day, start, end })
  }

  const maxRaw = maxStudentsRaw == null ? '' : String(maxStudentsRaw).trim()
  let maxStudents = null
  if (maxRaw !== '') {
    if (!/^\d+$/.test(maxRaw)) {
      return { ok: false, error: 'Sĩ số tối đa phải là số nguyên từ 1 đến 500.' }
    }
    maxStudents = Number(maxRaw)
    if (!Number.isInteger(maxStudents) || maxStudents < 1 || maxStudents > 500) {
      return { ok: false, error: 'Sĩ số tối đa phải từ 1 đến 500.' }
    }
  }

  return {
    ok: true,
    value: { publicListed: Boolean(publicListed), schedule: normalizedSchedule, maxStudents }
  }
}

export function renderClassPublicIntroCard(currentClass = {}) {
  const schedule = initialSchedule(currentClass)
  const maxStudents = currentClass.maxStudents == null ? '' : currentClass.maxStudents

  return `
    <div class="card ap-tab-card" id="class-public-intro-card">
      <h2 class="ap-card-section-title ap-public-intro-title">
        <i class="fa-solid fa-chalkboard-user"></i> Trang giới thiệu
      </h2>

      <label class="ap-public-intro-toggle">
        <input type="checkbox" id="class-public-listed" ${currentClass.publicListed === true ? 'checked' : ''}>
        <span class="ap-public-intro-toggle-copy">
          <strong>Hiện lớp này trên trang giới thiệu công khai</strong>
          <small>Khách xem được tên lớp, lịch học và số học sinh đang theo học (không hiện tên học sinh).</small>
        </span>
      </label>

      <div class="ap-public-intro-section">
        <div class="ap-public-intro-section-head">
          <strong>Lịch học công khai</strong>
          <button type="button" id="btn-add-public-intro-slot" class="btn-secondary" ${schedule.length >= 7 ? 'disabled hidden' : ''}>
            <i class="fa-solid fa-plus" aria-hidden="true"></i> Thêm khung giờ
          </button>
        </div>
        <div id="class-public-intro-schedule" class="ap-public-intro-schedule">
          ${renderScheduleRows(schedule)}
        </div>
      </div>

      <label class="ap-field-label ap-public-intro-max">
        <span>Sĩ số tối đa</span>
        <input type="number" id="class-public-intro-max-students" class="form-input" min="1" max="500" value="${escapeHtml(maxStudents)}" placeholder="Để trống nếu không giới hạn">
        <small>Để trống = không giới hạn.</small>
      </label>

      <div id="class-public-intro-error" class="ap-public-intro-error" role="alert" hidden></div>
      <div class="ap-public-intro-actions">
        <button type="button" id="btn-save-class-public-intro" class="btn-primary">
          <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Lưu trang giới thiệu
        </button>
      </div>
    </div>
  `
}

export function bindClassPublicIntroCard(classId, currentClass) {
  const card = document.getElementById('class-public-intro-card')
  if (!card) return

  let schedule = initialSchedule(currentClass)
  let inflight = false
  const scheduleEl = card.querySelector('#class-public-intro-schedule')
  const addButton = card.querySelector('#btn-add-public-intro-slot')
  const saveButton = card.querySelector('#btn-save-class-public-intro')
  const errorEl = card.querySelector('#class-public-intro-error')

  const showInlineError = (message = '') => {
    if (!errorEl) return
    errorEl.textContent = message
    errorEl.hidden = !message
  }

  const syncScheduleFromInputs = () => {
    if (!scheduleEl) return
    schedule = [...scheduleEl.querySelectorAll('.ap-public-intro-slot')].map(row => ({
      day: row.querySelector('.ap-public-intro-day')?.value ?? '',
      start: row.querySelector('.ap-public-intro-start')?.value ?? '',
      end: row.querySelector('.ap-public-intro-end')?.value ?? ''
    }))
  }

  const renderSchedule = () => {
    if (!scheduleEl) return
    scheduleEl.innerHTML = renderScheduleRows(schedule)
    if (addButton) {
      const atLimit = schedule.length >= 7
      addButton.disabled = atLimit
      addButton.hidden = atLimit
    }

    scheduleEl.querySelectorAll('.ap-public-intro-remove').forEach(button => {
      button.onclick = () => {
        syncScheduleFromInputs()
        schedule.splice(Number(button.dataset.slotIndex), 1)
        showInlineError('')
        renderSchedule()
      }
    })
  }

  if (addButton) {
    addButton.onclick = () => {
      syncScheduleFromInputs()
      if (schedule.length >= 7) return
      schedule.push({ day: schedule.length + 1, start: '', end: '' })
      showInlineError('')
      renderSchedule()
    }
  }

  renderSchedule()

  if (saveButton) {
    saveButton.onclick = async () => {
      if (inflight) return
      syncScheduleFromInputs()
      const result = validatePublicIntroDraft({
        publicListed: card.querySelector('#class-public-listed')?.checked === true,
        schedule,
        maxStudentsRaw: card.querySelector('#class-public-intro-max-students')?.value ?? ''
      })

      if (!result.ok) {
        showInlineError(result.error)
        return
      }

      showInlineError('')
      inflight = true
      saveButton.disabled = true
      try {
        const response = await api.updateClassPublicIntro({ classId, ...result.value })
        if (document.getElementById('class-public-intro-card') !== card) return
        currentClass.publicListed = response.publicListed
        currentClass.publicSchedule = response.publicSchedule
        currentClass.maxStudents = response.maxStudents
        showToast('Đã lưu trang giới thiệu', 'success')
      } catch (error) {
        if (document.getElementById('class-public-intro-card') !== card) return
        const message = error?.message || 'Không thể lưu trang giới thiệu.'
        showInlineError(message)
        showToast(`Lưu trang giới thiệu thất bại: ${message}`, 'error')
      } finally {
        if (document.getElementById('class-public-intro-card') === card) {
          inflight = false
          saveButton.disabled = false
        }
      }
    }
  }
}
