import { openModal, closeModal } from './modal.js'
import { showToast } from './toast.js'
import { api } from '../api.js'

/**
 * Mở modal gán / nhân bản bài tập sang một hoặc nhiều lớp học khác
 * @param {Object} homework Thông tin bài tập cần gán { id, title, type, durationMinutes, deadline, classId, className, chapterTitle, lessonTitle }
 * @param {Function} onSuccess Callback khi gán thành công
 */
export async function openAssignHomeworkModal(homework, onSuccess = null) {
  if (!homework || !homework.id) {
    showToast('Không tìm thấy thông tin bài tập!', 'error')
    return
  }

  // 1. Lấy danh sách toàn bộ lớp học
  let allClasses = []
  try {
    const rawClasses = await api.getClasses()
    allClasses = rawClasses || []
  } catch (err) {
    showToast(`Không thể tải danh sách lớp học: ${err.message}`, 'error')
    return
  }

  const currentClassId = homework.classId || ''
  const availableClasses = allClasses.filter(c => c.id !== currentClassId)

  if (availableClasses.length === 0) {
    showToast('Không có lớp học đích nào khác để gán bài tập!', 'warning')
    return
  }

  const isExam = homework.type === 'EXAM'
  const hwTitle = homework.title || 'Bài tập'
  const hwDuration = homework.durationMinutes || 45
  const hwMaxAttempts = homework.maxAttempts !== undefined ? homework.maxAttempts : (isExam ? 1 : 0)

  // Format existing deadline for input
  let defaultDateVal = ''
  let defaultHourVal = '23'
  let defaultMinuteVal = '59'
  if (homework.deadline) {
    const d = new Date(homework.deadline)
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      defaultDateVal = `${year}-${month}-${day}`
      defaultHourVal = String(d.getHours()).padStart(2, '0')
      defaultMinuteVal = String(d.getMinutes()).padStart(2, '0')
    }
  }

  // Render Body HTML
  const bodyHTML = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      
      <!-- Box 1: Thông tin bài tập gốc -->
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 16px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
          <span style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.5px;">Bài tập gốc</span>
          <span class="badge" style="background:${isExam ? '#fef2f2' : '#f0fdf4'}; color:${isExam ? '#dc2626' : '#16a34a'}; border:1px solid ${isExam ? '#fecaca' : '#bbf7d0'}; font-weight:700; font-size:11px; padding:2px 8px; border-radius:4px;">
            ${isExam ? 'BÀI THI CHÍNH THỨC' : 'LUYỆN TẬP'}
          </span>
        </div>
        <div style="font-weight:700; font-size:15px; color:#0f172a; margin-bottom:6px;">${hwTitle}</div>
        <div style="font-size:12px; color:#475569; display:flex; flex-wrap:wrap; gap:14px;">
          <div><i class="fa-solid fa-graduation-cap" style="color:#0284c7;"></i> Lớp: <strong>${homework.className || 'Chưa rõ'}</strong></div>
          <div><i class="fa-solid fa-folder-open" style="color:#d97706;"></i> Chương: <strong>${homework.chapterTitle || 'Chương 1'}</strong></div>
          <div><i class="fa-solid fa-file-lines" style="color:#059669;"></i> Bài: <strong>${homework.lessonTitle || 'Bài 1'}</strong></div>
          <div><i class="fa-regular fa-clock" style="color:#64748b;"></i> ${hwDuration} phút</div>
        </div>
      </div>

      <!-- Box 2: Chọn lớp học đích -->
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <label style="font-size:13px; font-weight:700; color:#0f172a;">
            Chọn lớp học đích nhận bài tập <span style="color:#ef4444;">*</span>
          </label>
          <div style="display:flex; gap:8px;">
            <button type="button" id="btn-select-all-target-classes" style="background:none; border:none; color:#0066cc; font-size:12px; font-weight:600; cursor:pointer; padding:0;">Chọn tất cả</button>
            <span style="color:#cbd5e1;">|</span>
            <button type="button" id="btn-deselect-all-target-classes" style="background:none; border:none; color:#64748b; font-size:12px; font-weight:600; cursor:pointer; padding:0;">Bỏ chọn</button>
          </div>
        </div>
        
        <div id="target-classes-container" style="max-height:160px; overflow-y:auto; border:1px solid #cbd5e1; border-radius:8px; padding:8px 12px; display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:8px; background:#ffffff;">
          ${availableClasses.map(c => `
            <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; color:#334155; cursor:pointer; padding:6px 8px; border-radius:6px; background:#f8fafc; border:1px solid #e2e8f0; transition:all 0.15s ease;">
              <input type="checkbox" class="target-class-checkbox" value="${c.id}" data-name="${c.name}" style="cursor:pointer; width:16px; height:16px; accent-color:#0066cc;">
              <span>${c.name} <span style="font-size:11px; color:#94a3b8; font-weight:normal;">(${c.gradeBlock || c.grade_block || ''})</span></span>
            </label>
          `).join('')}
        </div>
        <div id="target-class-error" style="color:#ef4444; font-size:11px; margin-top:4px; display:none;">Vui lòng chọn ít nhất một lớp học đích!</div>
      </div>

      <!-- Box 3: Vị trí đặt bài tập ở lớp đích -->
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:12px 16px;">
        <label style="font-size:13px; font-weight:700; color:#0f172a; display:block; margin-bottom:8px;">
          <i class="fa-solid fa-folder-tree" style="color:#0066cc;"></i> Vị trí đặt bài tập ở Lớp đích
        </label>

        <div style="display:flex; flex-direction:column; gap:8px;">
          <label style="display:flex; align-items:flex-start; gap:8px; font-size:13px; cursor:pointer;">
            <input type="radio" name="assign-mapping-mode" value="smart" checked style="margin-top:3px; accent-color:#0066cc;">
            <div>
              <strong style="color:#0f172a;">Tự động thông minh (Khuyên dùng)</strong>
              <div style="font-size:12px; color:#64748b; margin-top:1px;">
                Hệ thống tự tìm Chương & Bài học cùng tên (<strong>${homework.chapterTitle || 'Chương 1'}</strong> / <strong>${homework.lessonTitle || 'Bài 1'}</strong>). Nếu lớp đích chưa có, hệ thống sẽ tự động tạo mới.
              </div>
            </div>
          </label>

          <label style="display:flex; align-items:flex-start; gap:8px; font-size:13px; cursor:pointer;" id="label-manual-mode">
            <input type="radio" name="assign-mapping-mode" value="manual" style="margin-top:3px; accent-color:#0066cc;">
            <div>
              <strong style="color:#0f172a;">Chỉ định thủ công Chương & Bài học</strong>
              <div style="font-size:12px; color:#64748b; margin-top:1px;">
                Tự chọn một bài học có sẵn ở lớp đích (Chỉ khả dụng khi chọn 1 lớp đơn lẻ).
              </div>
            </div>
          </label>
        </div>

        <!-- Manual Selector Panel (Hidden by default) -->
        <div id="manual-mapping-panel" style="display:none; margin-top:12px; padding-top:12px; border-top:1px dashed #cbd5e1; display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div>
            <label style="font-size:12px; font-weight:600; color:#334155; display:block; margin-bottom:4px;">Chương đích <span style="color:#ef4444;">*</span></label>
            <select id="assign-manual-chapter" class="form-input" style="padding:7px 10px; font-size:12.5px; width:100%; border-radius:6px; background:#ffffff;">
              <option value="">Chọn chương đích...</option>
            </select>
          </div>
          <div>
            <label style="font-size:12px; font-weight:600; color:#334155; display:block; margin-bottom:4px;">Bài học đích <span style="color:#ef4444;">*</span></label>
            <select id="assign-manual-lesson" class="form-input" style="padding:7px 10px; font-size:12.5px; width:100%; border-radius:6px; background:#ffffff;">
              <option value="">Chọn bài học đích...</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Box 4: Tùy chỉnh cấu hình cho lớp đích -->
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px;">
        <label style="font-size:13px; font-weight:700; color:#0f172a; display:block; margin-bottom:12px;">
          <i class="fa-solid fa-sliders" style="color:#7c3aed;"></i> Cấu hình riêng cho Lớp đích
        </label>

        <div style="display:flex; flex-direction:column; gap:12px;">
          <!-- Tên bài tập mới -->
          <div>
            <label style="font-size:12px; font-weight:600; color:#334155; display:block; margin-bottom:4px;">Tên bài tập tại lớp mới</label>
            <input type="text" id="assign-custom-title" class="form-input" value="${hwTitle}" style="padding:8px 12px; font-size:13px; width:100%; border-radius:6px; border:1px solid #cbd5e1; background:#ffffff;">
          </div>

          <!-- Hạn chót nộp bài (Deadline) -->
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <label style="font-size:12px; font-weight:600; color:#334155; margin:0;">
                <i class="fa-regular fa-calendar-days" style="color:#0284c7;"></i> Hạn chót nộp bài (Deadline)
              </label>
              <span style="font-size:11px; color:#64748b;">(Không bắt buộc)</span>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
              <input type="date" id="assign-deadline-date" class="form-input" value="${defaultDateVal}" style="flex:1; min-width:140px; padding:8px 10px; font-size:13px; background:#ffffff; border-radius:6px; border:1px solid #cbd5e1;" title="Chọn ngày hết hạn">
              <div style="display:flex; align-items:center; gap:3px; flex-shrink:0;">
                <select id="assign-deadline-hour" class="form-input" style="width:68px; padding:8px 4px; font-size:13px; font-weight:600; text-align:center; background:#ffffff; border-radius:6px; border:1px solid #cbd5e1; cursor:pointer;" title="Chọn giờ (00 - 23)">
                  ${Array.from({ length: 24 }, (_, i) => {
                    const val = String(i).padStart(2, '0')
                    return `<option value="${val}" ${val === defaultHourVal ? 'selected' : ''}>${val}h</option>`
                  }).join('')}
                </select>
                <span style="font-weight:700; color:#64748b;">:</span>
                <select id="assign-deadline-minute" class="form-input" style="width:68px; padding:8px 4px; font-size:13px; font-weight:600; text-align:center; background:#ffffff; border-radius:6px; border:1px solid #cbd5e1; cursor:pointer;" title="Chọn phút (00 - 59)">
                  ${Array.from({ length: 60 }, (_, i) => {
                    const val = String(i).padStart(2, '0')
                    return `<option value="${val}" ${val === defaultMinuteVal ? 'selected' : ''}>${val}p</option>`
                  }).join('')}
                </select>
              </div>
              <button type="button" id="assign-deadline-clear-btn" title="Xóa hạn chót" style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:6px; padding:8px 10px; cursor:pointer; color:#64748b; font-size:13px; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; height:37px; transition:all 0.15s ease;" onmouseover="this.style.background='#fee2e2'; this.style.color='#ef4444'; this.style.borderColor='#fca5a5';" onmouseout="this.style.background='#f1f5f9'; this.style.color='#64748b'; this.style.borderColor='#cbd5e1';">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>

          <!-- Thời gian & Lần làm tối đa -->
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <label style="font-size:12px; font-weight:600; color:#334155; display:block; margin-bottom:4px;">
                <i class="fa-regular fa-clock" style="color:#0284c7;"></i> Thời gian (Phút)
              </label>
              <input type="number" id="assign-custom-duration" class="form-input" value="${hwDuration}" min="5" style="padding:8px 10px; font-size:13px; width:100%; border-radius:6px; border:1px solid #cbd5e1; background:#ffffff;">
            </div>

            <div>
              <label style="font-size:12px; font-weight:600; color:#334155; display:block; margin-bottom:4px;">
                <i class="fa-solid fa-rotate" style="color:#64748b;"></i> Lần làm tối đa
              </label>
              <input type="number" id="assign-custom-attempts" class="form-input" value="${hwMaxAttempts}" min="0" style="padding:8px 10px; font-size:13px; width:100%; border-radius:6px; border:1px solid #cbd5e1; background:#ffffff;" ${isExam ? 'disabled title="Bài thi cố định 1 lần làm"' : ''}>
            </div>
          </div>

          <!-- Publish State -->
          <div style="display:flex; align-items:center; gap:8px; margin-top:2px;">
            <input type="checkbox" id="assign-is-published" checked style="width:16px; height:16px; accent-color:#0066cc; cursor:pointer;">
            <label for="assign-is-published" style="font-size:12.5px; font-weight:600; color:#334155; cursor:pointer;">
              Xuất bản bài tập ngay sau khi gán (Học sinh có thể thấy và làm bài)
            </label>
          </div>
        </div>
      </div>

    </div>
  `

  openModal(
    `Gán bài tập sang lớp khác`,
    bodyHTML,
    async () => {
      // Validate inputs
      const checkedBoxes = document.querySelectorAll('.target-class-checkbox:checked')
      const targetClassIds = Array.from(checkedBoxes).map(cb => cb.value)
      const errorEl = document.getElementById('target-class-error')

      if (targetClassIds.length === 0) {
        if (errorEl) errorEl.style.display = 'block'
        return false
      }
      if (errorEl) errorEl.style.display = 'none'

      const mappingMode = document.querySelector('input[name="assign-mapping-mode"]:checked')?.value || 'smart'
      let targetLessonId = undefined

      if (mappingMode === 'manual') {
        const lessonSelect = document.getElementById('assign-manual-lesson')
        targetLessonId = lessonSelect?.value || undefined
        if (!targetLessonId) {
          showToast('Vui lòng chọn bài học đích khi ở chế độ thủ công!', 'warning')
          return false
        }
      }

      // Collect custom settings
      const customTitle = document.getElementById('assign-custom-title')?.value.trim() || hwTitle
      const customDuration = parseInt(document.getElementById('assign-custom-duration')?.value || String(hwDuration), 10)
      const customAttempts = parseInt(document.getElementById('assign-custom-attempts')?.value || '0', 10)
      const isPublished = document.getElementById('assign-is-published')?.checked !== false

      let customDeadline = null
      const dateVal = document.getElementById('assign-deadline-date')?.value
      if (dateVal) {
        const hourVal = document.getElementById('assign-deadline-hour')?.value || '23'
        const minVal = document.getElementById('assign-deadline-minute')?.value || '59'
        customDeadline = `${dateVal}T${hourVal}:${minVal}:00+07:00`
      }

      // Call API
      const confirmBtn = document.getElementById('modal-confirm-btn')
      if (confirmBtn) {
        confirmBtn.disabled = true
        confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gán...'
      }

      try {
        const res = await api.assignHomeworkToClass({
          sourceHomeworkId: homework.id,
          targetClassIds,
          targetLessonId,
          smartMapping: mappingMode === 'smart',
          customSettings: {
            title: customTitle,
            deadline: customDeadline,
            durationMinutes: customDuration,
            maxAttempts: isExam ? 1 : customAttempts,
            isPublished
          }
        })

        showToast(res.message || `Đã gán bài tập cho ${targetClassIds.length} lớp thành công!`, 'success')
        if (onSuccess) {
          await onSuccess()
        }
        return true
      } catch (err) {
        showToast(`Lỗi khi gán bài tập: ${err.message}`, 'error')
        if (confirmBtn) {
          confirmBtn.disabled = false
          confirmBtn.innerHTML = 'Xác nhận'
        }
        return false
      }
    }
  )

  // Tinh chỉnh Modal Width
  const modalContent = document.querySelector('#modal-container .modal-content')
  if (modalContent) {
    modalContent.style.maxWidth = '680px'
  }

  // Attach dynamic event listeners inside modal
  const selectAllBtn = document.getElementById('btn-select-all-target-classes')
  const deselectAllBtn = document.getElementById('btn-deselect-all-target-classes')
  const checkboxes = document.querySelectorAll('.target-class-checkbox')
  const mappingRadios = document.querySelectorAll('input[name="assign-mapping-mode"]')
  const manualPanel = document.getElementById('manual-mapping-panel')
  const manualRadio = document.querySelector('input[name="assign-mapping-mode"][value="manual"]')
  const manualRadioLabel = document.getElementById('label-manual-mode')
  const chapterSelect = document.getElementById('assign-manual-chapter')
  const lessonSelect = document.getElementById('assign-manual-lesson')
  const clearDeadlineBtn = document.getElementById('assign-deadline-clear-btn')

  clearDeadlineBtn?.addEventListener('click', () => {
    const dateInput = document.getElementById('assign-deadline-date')
    if (dateInput) {
      dateInput.value = ''
      showToast('Đã xóa hạn nộp bài', 'info')
    }
  })

  const updateManualModeAvailability = () => {
    const checkedCount = document.querySelectorAll('.target-class-checkbox:checked').length
    if (checkedCount > 1) {
      if (manualRadio) manualRadio.disabled = true
      if (manualRadioLabel) manualRadioLabel.style.opacity = '0.5'
      const smartRadio = document.querySelector('input[name="assign-mapping-mode"][value="smart"]')
      if (smartRadio) smartRadio.checked = true
      if (manualPanel) manualPanel.style.display = 'none'
    } else {
      if (manualRadio) manualRadio.disabled = false
      if (manualRadioLabel) manualRadioLabel.style.opacity = '1'
    }
  }

  selectAllBtn?.addEventListener('click', () => {
    checkboxes.forEach(cb => { cb.checked = true })
    document.getElementById('target-class-error')?.style.setProperty('display', 'none')
    updateManualModeAvailability()
  })

  deselectAllBtn?.addEventListener('click', () => {
    checkboxes.forEach(cb => { cb.checked = false })
    updateManualModeAvailability()
  })

  checkboxes.forEach(cb => {
    cb.addEventListener('change', async () => {
      document.getElementById('target-class-error')?.style.setProperty('display', 'none')
      updateManualModeAvailability()

      // If manual mode is active and exactly 1 class is checked, load chapters for that class
      const checkedBoxes = document.querySelectorAll('.target-class-checkbox:checked')
      if (checkedBoxes.length === 1 && manualRadio?.checked) {
        await loadChaptersForManualSelect(checkedBoxes[0].value)
      }
    })
  })

  mappingRadios.forEach(radio => {
    radio.addEventListener('change', async (e) => {
      if (e.target.value === 'manual') {
        if (manualPanel) manualPanel.style.display = 'grid'
        const checkedBoxes = document.querySelectorAll('.target-class-checkbox:checked')
        if (checkedBoxes.length === 1) {
          await loadChaptersForManualSelect(checkedBoxes[0].value)
        } else {
          if (chapterSelect) chapterSelect.innerHTML = '<option value="">Chọn 1 lớp đích ở trên trước...</option>'
          if (lessonSelect) lessonSelect.innerHTML = '<option value="">Chọn chương trước...</option>'
        }
      } else {
        if (manualPanel) manualPanel.style.display = 'none'
      }
    })
  })

  async function loadChaptersForManualSelect(classId) {
    if (!chapterSelect) return
    chapterSelect.innerHTML = '<option value="">Đang tải chương...</option>'
    if (lessonSelect) lessonSelect.innerHTML = '<option value="">Chọn chương trước...</option>'
    try {
      const chapters = await api.getChapters(classId)
      let html = '<option value="">Chọn chương đích...</option>'
      ;(chapters || []).forEach(ch => {
        html += `<option value="${ch.id}">${ch.title}</option>`
      })
      chapterSelect.innerHTML = html
    } catch (err) {
      chapterSelect.innerHTML = '<option value="">Lỗi khi tải chương</option>'
    }
  }

  chapterSelect?.addEventListener('change', async (e) => {
    const chapterId = e.target.value
    if (!lessonSelect) return
    if (!chapterId) {
      lessonSelect.innerHTML = '<option value="">Chọn chương trước...</option>'
      return
    }
    lessonSelect.innerHTML = '<option value="">Đang tải bài học...</option>'
    try {
      const lessons = await api.getLessons(chapterId)
      let html = '<option value="">Chọn bài học đích...</option>'
      ;(lessons || []).forEach(l => {
        html += `<option value="${l.id}">${l.title}</option>`
      })
      lessonSelect.innerHTML = html
    } catch (err) {
      lessonSelect.innerHTML = '<option value="">Lỗi khi tải bài học</option>'
    }
  })
}
