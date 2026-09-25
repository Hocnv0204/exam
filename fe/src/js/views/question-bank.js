import { renderSidebar } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { showToast } from '../components/toast.js'
import { state } from '../state.js'
import { api } from '../api.js'
import { parseExamMarkdown, renderMath, renderMarkdown, MATH_TEMPLATE, CHEM_TEMPLATE, compressImage } from '../utils/exam-parser.js'
import { renderPaginationBar, bindPaginationEvents } from '../components/pagination.js'

// ========================================================
// View State
// ========================================================
let allQuestions = []
let allClasses = []
let cachedGradeBlocksList = []
let chaptersCache = {} // classId -> chapters
let lessonsCache = {}  // chapterId -> lessons

let filterState = {
  gradeBlock: '',
  classId: '',
  chapterId: '',
  lessonId: '',
  questionType: '',
  difficulty: '',
  search: '',
  page: 1,
  pageSize: 10
}

let statsState = {
  total: 0,
  mc: 0,
  tf: 0,
  sa: 0,
  diffCounts: { NHAN_BIET: 0, THONG_HIEU: 0, VAN_DUNG: 0, VAN_DUNG_CAO: 0 }
}

// Matrix Generator Preview Cache
let generatorState = {
  scopeType: 'BLOCK', // 'BLOCK' | 'CLASS' | 'CHAPTER' | 'LESSON'
  gradeBlock: '',
  classId: '',
  chapterId: '',
  lessonId: '',
  targetClassId: '',
  targetChapterId: '',
  targetLessonId: '',
  title: '',
  type: 'PRACTICE',
  durationMinutes: 60,
  passScore: 5.0,
  maxScore: 10.0,
  deadline: '',
  maxViolations: 3,
  showSolutions: true,
  mcCount: 12,
  tfCount: 4,
  saCount: 6,
  isAdvancedDistribution: false,
  distribution: [],
  previewQuestions: [],
  availableStats: { mc: 0, tf: 0, sa: 0, total: 0 }
}

// ========================================================
// Main Render
// ========================================================
export function renderQuestionBankView() {
  return `
    <div class="app-layout">
      ${renderSidebar('question-bank')}
      <div class="main-content">
        ${renderNavbar('Nền tảng / Ngân hàng câu hỏi')}
        <div class="content-body" style="padding: 24px;">

          <!-- Page Header -->
          <div class="page-header" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px; flex-wrap:wrap; gap:16px;">
            <div>
              <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
                <span style="display:inline-flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:10px; background:linear-gradient(135deg, #0066cc, #0284c7); color:#fff; font-size:18px;">
                  <i class="fa-solid fa-boxes-stacked"></i>
                </span>
                <h1 class="page-title" style="font-family:var(--font-heading); font-size:24px; font-weight:700; color:#0f172a; margin:0;">
                  Ngân hàng câu hỏi & Đề thi
                </h1>
              </div>
              <p class="page-description" style="font-size:14px; color:#64748b; margin:0; max-width:800px;">
                Kho lưu trữ câu hỏi chuẩn hóa phân tầng theo Lớp, Chương, Bài học. Tự động nhập từ Markdown, trích xuất từ bài tập cũ và tạo đề thi ngẫu nhiên theo ma trận.
              </p>
            </div>

            <!-- Header Action Buttons -->
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <button id="btn-open-import-md" class="btn-secondary" style="padding:9px 16px; font-size:13px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:8px; border-radius:10px; background:#f8fafc; border:1px solid #cbd5e1; color:#334155;">
                <i class="fa-solid fa-file-arrow-up" style="color:#0284c7;"></i> Nhập từ Markdown
              </button>
              <button id="btn-open-import-hw" class="btn-secondary" style="padding:9px 16px; font-size:13px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:8px; border-radius:10px; background:#f8fafc; border:1px solid #cbd5e1; color:#334155;">
                <i class="fa-solid fa-clock-rotate-left" style="color:#8b5cf6;"></i> Lấy từ Bài tập cũ
              </button>
              <button id="btn-open-matrix-gen" class="btn-primary" style="padding:9px 18px; font-size:13px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:8px; border-radius:10px; background:linear-gradient(135deg, #0066cc, #0284c7); color:#ffffff; border:none; box-shadow:0 3px 12px rgba(0,102,204,0.25);">
                <i class="fa-solid fa-wand-magic-sparkles"></i> Tạo đề theo Ma trận
              </button>
            </div>
          </div>

          <!-- Statistics Counters Cards -->
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:16px; margin-bottom:24px;">
            <!-- Total -->
            <div class="card" style="margin:0; padding:16px 20px; border:1px solid #e2e8f0; border-radius:14px; background:#ffffff; display:flex; align-items:center; gap:14px;">
              <div style="width:46px; height:46px; border-radius:12px; background:#eff6ff; color:#0284c7; display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0;">
                <i class="fa-solid fa-layer-group"></i>
              </div>
              <div>
                <div style="font-size:12px; font-weight:600; color:#64748b; text-transform:uppercase;">Tổng số câu hỏi</div>
                <div id="stat-total-q" style="font-size:22px; font-weight:800; color:#0f172a; font-family:var(--font-heading);">0</div>
              </div>
            </div>

            <!-- MC -->
            <div class="card" style="margin:0; padding:16px 20px; border:1px solid #e2e8f0; border-radius:14px; background:#ffffff; display:flex; align-items:center; gap:14px;">
              <div style="width:46px; height:46px; border-radius:12px; background:#f0fdf4; color:#16a34a; display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0;">
                <i class="fa-solid fa-list-check"></i>
              </div>
              <div>
                <div style="font-size:12px; font-weight:600; color:#64748b; text-transform:uppercase;">Trắc nghiệm (Phần I)</div>
                <div id="stat-mc-q" style="font-size:22px; font-weight:800; color:#16a34a; font-family:var(--font-heading);">0</div>
              </div>
            </div>

            <!-- TF -->
            <div class="card" style="margin:0; padding:16px 20px; border:1px solid #e2e8f0; border-radius:14px; background:#ffffff; display:flex; align-items:center; gap:14px;">
              <div style="width:46px; height:46px; border-radius:12px; background:#fffbeb; color:#d97706; display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0;">
                <i class="fa-solid fa-square-check"></i>
              </div>
              <div>
                <div style="font-size:12px; font-weight:600; color:#64748b; text-transform:uppercase;">Đúng / Sai (Phần II)</div>
                <div id="stat-tf-q" style="font-size:22px; font-weight:800; color:#d97706; font-family:var(--font-heading);">0</div>
              </div>
            </div>

            <!-- SA -->
            <div class="card" style="margin:0; padding:16px 20px; border:1px solid #e2e8f0; border-radius:14px; background:#ffffff; display:flex; align-items:center; gap:14px;">
              <div style="width:46px; height:46px; border-radius:12px; background:#faf5ff; color:#9333ea; display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0;">
                <i class="fa-solid fa-pen-clip"></i>
              </div>
              <div>
                <div style="font-size:12px; font-weight:600; color:#64748b; text-transform:uppercase;">Trả lời ngắn (Phần III)</div>
                <div id="stat-sa-q" style="font-size:22px; font-weight:800; color:#9333ea; font-family:var(--font-heading);">0</div>
              </div>
            </div>
          </div>

          <!-- Filter & Search Bar -->
          <div class="card" style="margin:0 0 24px 0; padding:18px 20px; border:1px solid #e2e8f0; border-radius:14px; background:#ffffff;">
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:12px; align-items:center;">
              
              <!-- Filter: Khối học (Search by Grade Block) -->
              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">
                  <i class="fa-solid fa-layer-group"></i> Khối học
                </label>
                <select id="qb-filter-grade-block" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#f8fafc; color:#1e293b;">
                  <option value="">-- Tất cả các Khối --</option>
                  ${cachedGradeBlocksList.map(b => `<option value="${b}" ${b === filterState.gradeBlock ? 'selected' : ''}>${b}</option>`).join('')}
                </select>
              </div>

              <!-- Filter: Chapter -->
              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">
                  <i class="fa-solid fa-book"></i> Chương học
                </label>
                <select id="qb-filter-chapter" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#f8fafc; color:#1e293b;">
                  <option value="">-- Tất cả Chương --</option>
                </select>
              </div>

              <!-- Filter: Lesson -->
              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">
                  <i class="fa-solid fa-file-lines"></i> Bài học
                </label>
                <select id="qb-filter-lesson" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#f8fafc; color:#1e293b;">
                  <option value="">-- Tất cả Bài học --</option>
                </select>
              </div>

              <!-- Filter: Question Type -->
              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">
                  <i class="fa-solid fa-tag"></i> Dạng câu hỏi
                </label>
                <select id="qb-filter-type" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#f8fafc; color:#1e293b;">
                  <option value="">-- Tất cả các dạng --</option>
                  <option value="MULTIPLE_CHOICE">Trắc nghiệm ABCD (Phần I)</option>
                  <option value="TRUE_FALSE">Đúng / Sai 4 ý (Phần II)</option>
                  <option value="SHORT_ANSWER">Trả lời ngắn / Điền số (Phần III)</option>
                </select>
              </div>

              <!-- Filter: Difficulty -->
              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">
                  <i class="fa-solid fa-gauge-high"></i> Mức độ
                </label>
                <select id="qb-filter-difficulty" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#f8fafc; color:#1e293b;">
                  <option value="">-- Tất cả mức độ --</option>
                  <option value="NHAN_BIET">Nhận biết</option>
                  <option value="THONG_HIEU">Thông hiểu</option>
                  <option value="VAN_DUNG">Vận dụng</option>
                  <option value="VAN_DUNG_CAO">Vận dụng cao</option>
                </select>
              </div>
            </div>

            <!-- Search input & Reset -->
            <div style="display:flex; gap:10px; align-items:center; margin-top:14px; pt:12px; border-top:1px dashed #e2e8f0;">
              <div style="position:relative; flex:1;">
                <i class="fa-solid fa-magnifying-glass" style="position:absolute; left:12px; top:11px; color:#94a3b8; font-size:14px;"></i>
                <input id="qb-search-input" type="text" placeholder="Tìm kiếm theo nội dung câu hỏi, công thức LaTeX hoặc thẻ tag..." style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px 0 36px; font-size:13px; background:#f8fafc; color:#1e293b;">
              </div>
              <button id="qb-btn-reset-filters" class="btn-secondary" style="height:38px; padding:0 14px; font-size:13px; border-radius:8px; display:inline-flex; align-items:center; gap:6px; color:#64748b; background:#f1f5f9; border:none; cursor:pointer;">
                <i class="fa-solid fa-rotate-left"></i> Đặt lại
              </button>
            </div>
          </div>

          <!-- Questions List Section -->
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
            <div style="font-size:14px; font-weight:600; color:#334155;">
              Danh sách câu hỏi (<span id="qb-current-count">0</span> câu)
            </div>
          </div>

          <div id="qb-questions-container" style="display:flex; flex-direction:column; gap:16px;">
            <!-- Loading skeleton or Question Cards will render here -->
            <div style="text-align:center; padding:48px 20px; color:#94a3b8;">
              <i class="fa-solid fa-spinner fa-spin" style="font-size:28px; margin-bottom:12px; color:#0284c7;"></i>
              <div>Đang tải câu hỏi từ Ngân hàng...</div>
            </div>
          </div>

          <!-- Pagination Container -->
          <div id="qb-pagination-container" style="margin-top:16px;"></div>

        </div>
      </div>
    </div>

    <!-- Container for Overlays & Modals -->
    <div id="qb-modal-container"></div>
  `
}

// ========================================================
// Events & Data Lifecycle
// ========================================================
export async function bindQuestionBankEvents() {
  await loadInitialData()
  setupFilterListeners()
  setupHeaderActionListeners()
}

async function loadInitialData() {
  try {
    // Read query params from URL hash (e.g. #question-bank?gradeBlock=Hóa-12)
    const hashUrl = window.location.hash.replace('#', '')
    const [, queryString] = hashUrl.split('?')
    const urlParams = new URLSearchParams(queryString || '')
    const urlGradeBlock = urlParams.get('gradeBlock')
    if (urlGradeBlock) {
      filterState.gradeBlock = urlGradeBlock
    }

    // 1. Reuse existing classes from state if available, or fetch once
    if (state.classes && state.classes.length > 0) {
      allClasses = state.classes
    } else {
      const rawClasses = await api.getClasses()
      allClasses = rawClasses || []
      state.classes = (rawClasses || []).map(c => ({
        id: c.id,
        name: c.name,
        gradeBlock: c.gradeBlock || c.grade_block || '12-Toán',
        studentsCount: c.studentsCount || 0,
        tuitionFee: c.tuitionFee || 0,
        progress: 0
      }))
    }

    // 2. Populate grade blocks synchronously from loaded classes
    populateGradeBlockDropdowns()

    // 3. Fetch question bank items AND statistics simultaneously in 1 single unified API request!
    await fetchAndRenderQuestions({ includeStats: true })
  } catch (err) {
    console.error('[QuestionBank] Error loading initial data:', err)
    showToast('Không thể tải dữ liệu ngân hàng câu hỏi: ' + err.message, 'error')
  }
}

function populateGradeBlockDropdowns() {
  const filterSelect = document.getElementById('qb-filter-grade-block')
  if (!filterSelect) return

  const custom = (allClasses || []).map(c => c.gradeBlock || c.grade_block).filter(Boolean)
  cachedGradeBlocksList = Array.from(new Set(custom))

  if (cachedGradeBlocksList.length === 0) {
    cachedGradeBlocksList = ['12-Toán', '11-Toán', '10-Toán']
  }

  let html = '<option value="">-- Tất cả các Khối --</option>'
  cachedGradeBlocksList.forEach(b => {
    const isSelected = filterState.gradeBlock === b ? 'selected' : ''
    html += `<option value="${b}" ${isSelected}>${b}</option>`
  })
  filterSelect.innerHTML = html

  // If filterState.gradeBlock is selected, load its chapters
  if (filterState.gradeBlock) {
    const chapterSelect = document.getElementById('qb-filter-chapter')
    if (chapterSelect) {
      loadChaptersForGradeBlock(filterState.gradeBlock, chapterSelect)
    }
  }
}

async function refreshStats() {
  try {
    let params = ''
    if (filterState.gradeBlock) params += `gradeBlock=${encodeURIComponent(filterState.gradeBlock)}&`
    if (filterState.classId) params += `classId=${filterState.classId}&`
    if (filterState.chapterId) params += `chapterId=${filterState.chapterId}&`
    if (filterState.lessonId) params += `lessonId=${filterState.lessonId}&`

    const res = await api.getQuestionBankStats(params)
    if (res) {
      statsState = res
      updateStatsUI()
    }
  } catch (e) {
    console.warn('[QuestionBank] Failed to refresh stats:', e)
  }
}

function updateStatsUI() {
  const totalEl = document.getElementById('stat-total-q')
  const mcEl = document.getElementById('stat-mc-q')
  const tfEl = document.getElementById('stat-tf-q')
  const saEl = document.getElementById('stat-sa-q')

  if (totalEl) totalEl.textContent = statsState.total || 0
  if (mcEl) mcEl.textContent = statsState.mc || 0
  if (tfEl) tfEl.textContent = statsState.tf || 0
  if (saEl) saEl.textContent = statsState.sa || 0
}

function setupFilterListeners() {
  const gradeBlockSelect = document.getElementById('qb-filter-grade-block')
  const chapterSelect = document.getElementById('qb-filter-chapter')
  const lessonSelect = document.getElementById('qb-filter-lesson')
  const typeSelect = document.getElementById('qb-filter-type')
  const diffSelect = document.getElementById('qb-filter-difficulty')
  const searchInput = document.getElementById('qb-search-input')
  const resetBtn = document.getElementById('qb-btn-reset-filters')

  // Cascading: Khối học changed
  gradeBlockSelect?.addEventListener('change', async (e) => {
    filterState.gradeBlock = e.target.value
    filterState.classId = ''
    filterState.chapterId = ''
    filterState.lessonId = ''
    filterState.page = 1

    // Populate chapters from all classes in this gradeBlock
    if (filterState.gradeBlock) {
      await loadChaptersForGradeBlock(filterState.gradeBlock, chapterSelect)
    } else {
      chapterSelect.innerHTML = '<option value="">-- Tất cả Chương --</option>'
    }
    lessonSelect.innerHTML = '<option value="">-- Tất cả Bài học --</option>'

    await fetchAndRenderQuestions({ includeStats: true })
  })

  // Cascading: Chapter changed
  chapterSelect?.addEventListener('change', async (e) => {
    filterState.chapterId = e.target.value
    filterState.lessonId = ''
    filterState.page = 1

    if (filterState.chapterId) {
      await loadLessonsForChapter(filterState.chapterId, lessonSelect)
    } else {
      lessonSelect.innerHTML = '<option value="">-- Tất cả Bài học --</option>'
    }

    await fetchAndRenderQuestions({ includeStats: true })
  })

  // Cascading: Lesson changed
  lessonSelect?.addEventListener('change', async (e) => {
    filterState.lessonId = e.target.value
    filterState.page = 1
    await fetchAndRenderQuestions({ includeStats: true })
  })

  // Type changed
  typeSelect?.addEventListener('change', async (e) => {
    filterState.questionType = e.target.value
    filterState.page = 1
    await fetchAndRenderQuestions()
  })

  // Difficulty changed
  diffSelect?.addEventListener('change', async (e) => {
    filterState.difficulty = e.target.value
    filterState.page = 1
    await fetchAndRenderQuestions()
  })

  // Search input with debounce
  let searchTimer
  searchInput?.addEventListener('input', (e) => {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(async () => {
      filterState.search = e.target.value
      filterState.page = 1
      await fetchAndRenderQuestions()
    }, 350)
  })

  // Reset
  resetBtn?.addEventListener('click', async () => {
    filterState = {
      gradeBlock: '',
      classId: '',
      chapterId: '',
      lessonId: '',
      questionType: '',
      difficulty: '',
      search: '',
      page: 1,
      pageSize: 10
    }
    if (gradeBlockSelect) gradeBlockSelect.value = ''
    if (chapterSelect) chapterSelect.innerHTML = '<option value="">-- Tất cả Chương --</option>'
    if (lessonSelect) lessonSelect.innerHTML = '<option value="">-- Tất cả Bài học --</option>'
    if (typeSelect) typeSelect.value = ''
    if (diffSelect) diffSelect.value = ''
    if (searchInput) searchInput.value = ''

    await fetchAndRenderQuestions({ includeStats: true })
  })
}

async function loadChaptersForGradeBlock(gradeBlock, targetSelect) {
  if (!targetSelect) return
  targetSelect.innerHTML = '<option value="">Đang tải chương...</option>'
  try {
    const targetClasses = (allClasses || []).filter(c => !gradeBlock || (c.gradeBlock || c.grade_block) === gradeBlock)
    let combinedChapters = []
    await Promise.all(targetClasses.map(async (c) => {
      if (!chaptersCache[c.id]) {
        const chs = await api.getChapters(c.id, true)
        chaptersCache[c.id] = chs || []
      }
      const list = (chaptersCache[c.id] || []).map(ch => {
        if (ch.lessons && Array.isArray(ch.lessons)) {
          lessonsCache[ch.id] = ch.lessons
        }
        return {
          ...ch,
          className: c.name
        }
      })
      combinedChapters.push(...list)
    }))

    combinedChapters.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))

    let html = '<option value="">-- Tất cả Chương --</option>'
    combinedChapters.forEach(ch => {
      const isSelected = filterState.chapterId === ch.id ? 'selected' : ''
      html += `<option value="${ch.id}" ${isSelected}>${ch.title} (${ch.className})</option>`
    })
    targetSelect.innerHTML = html
  } catch (e) {
    console.warn('[QuestionBank] Failed to load chapters for grade block:', e)
    targetSelect.innerHTML = '<option value="">-- Tất cả Chương --</option>'
  }
}

async function loadChaptersForClass(classId, targetSelect) {
  if (!targetSelect) return
  try {
    let chapters = chaptersCache[classId]
    if (!chapters) {
      chapters = await api.getChapters(classId, true)
      chaptersCache[classId] = chapters || []
    }

    let html = '<option value="">-- Tất cả Chương --</option>'
    ;(chaptersCache[classId] || []).forEach(ch => {
      html += `<option value="${ch.id}">${ch.title}</option>`
    })
    targetSelect.innerHTML = html
  } catch (e) {
    console.warn('[QuestionBank] Failed to load chapters:', e)
  }
}

async function loadLessonsForChapter(chapterId, targetSelect) {
  if (!targetSelect) return
  try {
    let lessons = lessonsCache[chapterId]
    if (!lessons) {
      lessons = await api.getLessons(chapterId)
      lessonsCache[chapterId] = lessons || []
    }

    let html = '<option value="">-- Tất cả Bài học --</option>'
    ;(lessonsCache[chapterId] || []).forEach(l => {
      html += `<option value="${l.id}">${l.title}</option>`
    })
    targetSelect.innerHTML = html
  } catch (e) {
    console.warn('[QuestionBank] Failed to load lessons:', e)
  }
}

// ========================================================
// Fetch & Render Question Cards
// ========================================================
async function fetchAndRenderQuestions(options = {}) {
  const container = document.getElementById('qb-questions-container')
  const countEl = document.getElementById('qb-current-count')
  const paginationContainer = document.getElementById('qb-pagination-container')
  if (!container) return

  container.innerHTML = `
    <div style="text-align:center; padding:48px 20px; color:#94a3b8;">
      <i class="fa-solid fa-spinner fa-spin" style="font-size:28px; margin-bottom:12px; color:#0284c7;"></i>
      <div>Đang tải câu hỏi...</div>
    </div>
  `

  try {
    const paramsObj = new URLSearchParams()
    if (filterState.gradeBlock) paramsObj.set('gradeBlock', filterState.gradeBlock)
    if (filterState.classId) paramsObj.set('classId', filterState.classId)
    if (filterState.chapterId) paramsObj.set('chapterId', filterState.chapterId)
    if (filterState.lessonId) paramsObj.set('lessonId', filterState.lessonId)
    if (filterState.questionType) paramsObj.set('questionType', filterState.questionType)
    if (filterState.difficulty) paramsObj.set('difficulty', filterState.difficulty)
    if (filterState.search) paramsObj.set('search', filterState.search)
    paramsObj.set('page', String(filterState.page || 1))
    paramsObj.set('pageSize', String(filterState.pageSize || 10))

    if (options.includeStats) {
      paramsObj.set('includeStats', 'true')
    }

    const res = await api.getQuestionBank(paramsObj.toString())
    let questions = []
    let totalItems = 0

    if (Array.isArray(res)) {
      questions = res
      totalItems = res.length
    } else if (res && typeof res === 'object') {
      questions = res.items || []
      totalItems = res.total !== undefined ? res.total : questions.length
      if (res.stats) {
        statsState = res.stats
        updateStatsUI()
      }
    }

    allQuestions = questions

    if (countEl) countEl.textContent = totalItems

    if (allQuestions.length === 0) {
      if (paginationContainer) paginationContainer.innerHTML = ''
      container.innerHTML = `
        <div class="card" style="margin:0; padding:48px 24px; text-align:center; border:1px dashed #cbd5e1; border-radius:14px; background:#f8fafc;">
          <div style="width:64px; height:64px; border-radius:50%; background:#e2e8f0; color:#64748b; display:inline-flex; align-items:center; justify-content:center; font-size:26px; margin-bottom:14px;">
            <i class="fa-solid fa-box-open"></i>
          </div>
          <h3 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#1e293b; margin:0 0 6px 0;">
            Chưa có câu hỏi nào phù hợp bộ lọc
          </h3>
          <p style="font-size:14px; color:#64748b; margin:0 0 18px 0;">
            Bạn có thể nhập câu hỏi mới bằng file Markdown hoặc lấy nhanh câu hỏi từ các bài tập đã tạo trước đó.
          </p>
          <div style="display:flex; justify-content:center; gap:10px;">
            <button id="qb-empty-import-md" class="btn-primary" style="padding:8px 18px; font-size:13px; font-weight:600; border-radius:8px; background:#0066cc; color:#fff; border:none; cursor:pointer;">
              <i class="fa-solid fa-file-arrow-up"></i> Nhập từ Markdown
            </button>
          </div>
        </div>
      `
      document.getElementById('qb-empty-import-md')?.addEventListener('click', openImportMarkdownModal)
      return
    }

    let cardsHtml = ''
    const startNumber = (filterState.page - 1) * filterState.pageSize
    allQuestions.forEach((q, idx) => {
      cardsHtml += renderQuestionCard(q, startNumber + idx + 1)
    })

    container.innerHTML = cardsHtml

    // Render KaTeX Math in all cards
    renderMath(container)

    // Bind card action buttons
    bindQuestionCardEvents(container)

    // Render and bind pagination bar
    if (paginationContainer) {
      paginationContainer.innerHTML = renderPaginationBar({
        currentPage: filterState.page,
        totalItems,
        pageSize: filterState.pageSize,
        containerId: 'qb-pagination-bar',
        pageSizeOptions: [10, 20, 50, 100]
      })

      bindPaginationEvents({
        containerId: 'qb-pagination-bar',
        onPageChange: async (newPage) => {
          filterState.page = newPage
          container.scrollIntoView({ behavior: 'smooth', block: 'start' })
          await fetchAndRenderQuestions()
        },
        onPageSizeChange: async (newSize) => {
          filterState.pageSize = newSize
          filterState.page = 1
          await fetchAndRenderQuestions()
        }
      })
    }
  } catch (err) {
    console.error('[QuestionBank] Failed to fetch questions:', err)
    if (paginationContainer) paginationContainer.innerHTML = ''
    container.innerHTML = `
      <div style="padding:24px; background:#fef2f2; border:1px solid #fecaca; border-radius:10px; color:#991b1b; text-align:center;">
        <i class="fa-solid fa-triangle-exclamation" style="font-size:24px; margin-bottom:8px;"></i>
        <div>Lỗi khi tải câu hỏi: ${err.message}</div>
      </div>
    `
  }
}

// ========================================================
// Helper: Parse & Unwrap Question Prompt
// ========================================================
export function parseQuestionPrompt(rawPrompt) {
  let promptData = { text: '', imageUrl: '', options: [], statements: [], explanation: '' }
  try {
    if (typeof rawPrompt === 'string') {
      const parsed = JSON.parse(rawPrompt)
      if (parsed && typeof parsed === 'object') promptData = { ...promptData, ...parsed }
      else promptData.text = rawPrompt
    } else if (typeof rawPrompt === 'object' && rawPrompt !== null) {
      promptData = { ...promptData, ...rawPrompt }
    }
  } catch (_) {
    promptData.text = rawPrompt || ''
  }

  // Unwrap if promptData.text is itself a stringified JSON (prevent double-nested JSON bug)
  let unwrapLimit = 0
  while (typeof promptData.text === 'string' && promptData.text.trim().startsWith('{') && unwrapLimit < 3) {
    try {
      const inner = JSON.parse(promptData.text)
      if (inner && typeof inner === 'object' && (inner.text !== undefined || inner.options || inner.statements)) {
        promptData = {
          ...promptData,
          ...inner,
          text: inner.text !== undefined ? inner.text : promptData.text,
          options: (inner.options && inner.options.length) ? inner.options : promptData.options,
          statements: (inner.statements && inner.statements.length) ? inner.statements : promptData.statements,
          explanation: inner.explanation || promptData.explanation || '',
          imageUrl: inner.imageUrl || promptData.imageUrl || ''
        }
        unwrapLimit++
      } else {
        break
      }
    } catch (_) {
      break
    }
  }

  if (!Array.isArray(promptData.options)) promptData.options = []
  if (!Array.isArray(promptData.statements)) promptData.statements = []
  if (promptData.text === undefined) promptData.text = ''

  return promptData
}

// Render individual Question Card
function renderQuestionCard(q, displayIndex) {
  // Parse prompt payload
  const promptData = parseQuestionPrompt(q.prompt)

  // Determine actual question type
  const isTf = q.question_type === 'TRUE_FALSE' || (promptData.statements && promptData.statements.length > 0)
  const isSa = q.question_type === 'SHORT_ANSWER'
  const isMc = !isTf && !isSa

  // Type badge styling
  let typeLabel = 'Trắc nghiệm ABCD'
  let typeBg = '#eff6ff'
  let typeColor = '#0284c7'
  let typeBorder = '#bfdbfe'

  if (isTf) {
    typeLabel = 'Đúng / Sai (4 ý)'
    typeBg = '#fffbeb'
    typeColor = '#d97706'
    typeBorder = '#fde68a'
  } else if (isSa) {
    typeLabel = 'Trả lời ngắn'
    typeBg = '#faf5ff'
    typeColor = '#9333ea'
    typeBorder = '#e9d5ff'
  }

  // Difficulty badge styling
  const diffMap = {
    NHAN_BIET: { label: 'Nhận biết', bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
    THONG_HIEU: { label: 'Thông hiểu', bg: '#ecfeff', color: '#0891b2', border: '#a5f3fc' },
    VAN_DUNG: { label: 'Vận dụng', bg: '#fff7ed', color: '#ea580c', border: '#fed7aa' },
    VAN_DUNG_CAO: { label: 'Vận dụng cao', bg: '#fff1f2', color: '#e11d48', border: '#fecdd3' }
  }
  const diffInfo = diffMap[q.difficulty] || diffMap['THONG_HIEU']

  // Khối & Breadcrumbs: Khối > Class > Chapter > Lesson
  const gradeBlockName = q.grade_block || q.chapters?.classes?.grade_block || '12-Toán'
  const className = q.chapters?.classes?.name || ''
  const chapterTitle = q.chapters?.title || ''
  const lessonTitle = q.lessons?.title || ''
  let locationBreadcrumb = []
  if (className) locationBreadcrumb.push(className)
  if (chapterTitle) locationBreadcrumb.push(chapterTitle)
  if (lessonTitle) locationBreadcrumb.push(lessonTitle)
  const breadcrumbText = locationBreadcrumb.join(' / ') || 'Chung'

  return `
    <div class="card qb-question-card" data-id="${q.id}" style="margin:0; padding:20px; border:1px solid #e2e8f0; border-radius:14px; background:#ffffff; box-shadow:0 1px 3px rgba(0,0,0,0.02); position:relative;">
      
      <!-- Top meta row -->
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:14px; padding-bottom:12px; border-bottom:1px solid #f1f5f9;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span style="display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:8px; background:#f1f5f9; font-weight:700; font-size:13px; color:#334155;">
            #${displayIndex}
          </span>
          <span style="font-size:11px; font-weight:700; padding:3px 9px; border-radius:6px; background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; display:inline-flex; align-items:center; gap:4px;">
            <i class="fa-solid fa-layer-group" style="font-size:10px;"></i> ${gradeBlockName}
          </span>
          <span style="font-size:11px; font-weight:700; text-transform:uppercase; padding:3px 9px; border-radius:6px; background:${typeBg}; color:${typeColor}; border:1px solid ${typeBorder};">
            ${typeLabel}
          </span>
          <span style="font-size:11px; font-weight:700; text-transform:uppercase; padding:3px 9px; border-radius:6px; background:${diffInfo.bg}; color:${diffInfo.color}; border:1px solid ${diffInfo.border};">
            ${diffInfo.label}
          </span>
          <span style="font-size:12px; color:#64748b; display:inline-flex; align-items:center; gap:5px; background:#f8fafc; padding:3px 8px; border-radius:6px; border:1px solid #e2e8f0;">
            <i class="fa-solid fa-folder-tree" style="font-size:11px; color:#94a3b8;"></i> ${breadcrumbText}
          </span>
          <span style="font-size:11px; font-weight:600; color:#475569; background:#f1f5f9; padding:3px 8px; border-radius:6px;" title="Số lần đã được bốc vào đề thi">
            <i class="fa-solid fa-repeat" style="color:#0284c7;"></i> Đã dùng: ${q.usage_count || 0} lần
          </span>
        </div>

        <!-- Action buttons -->
        <div style="display:flex; align-items:center; gap:6px;">
          <button class="btn-edit-question" data-id="${q.id}" title="Chỉnh sửa câu hỏi" style="width:32px; height:32px; border-radius:8px; border:1px solid #e2e8f0; background:#ffffff; color:#475569; cursor:pointer; display:flex; align-items:center; justify-content:center;">
            <i class="fa-solid fa-pen-to-square" style="font-size:13px;"></i>
          </button>
          <button class="btn-delete-question" data-id="${q.id}" title="Xóa câu hỏi khỏi ngân hàng" style="width:32px; height:32px; border-radius:8px; border:1px solid #fee2e2; background:#fff5f5; color:#dc2626; cursor:pointer; display:flex; align-items:center; justify-content:center;">
            <i class="fa-solid fa-trash-can" style="font-size:13px;"></i>
          </button>
        </div>
      </div>

      <!-- Question Prompt Content -->
      <div class="math-content" style="font-size:15px; line-height:1.65; color:#1e293b; margin-bottom:14px; word-break:break-word;">
        ${renderMarkdown(promptData.text || '')}
      </div>

      <!-- Optional Image -->
      ${promptData.imageUrl ? `
        <div style="margin-bottom:16px; text-align:center;">
          <img src="${promptData.imageUrl}" alt="Hình vẽ minh họa" style="max-width:100%; max-height:280px; border-radius:8px; border:1px solid #e2e8f0; object-fit:contain; background:#ffffff;" />
        </div>
      ` : ''}

      <!-- Options / Answers Display -->
      <div style="margin-bottom:14px;">
        ${renderCardAnswers(q, promptData)}
      </div>

      <!-- Explanation Collapsible Accordion -->
      ${promptData.explanation ? `
        <div style="border-top:1px dashed #e2e8f0; padding-top:10px;">
          <button class="btn-toggle-explanation" style="background:none; border:none; padding:4px 0; font-size:13px; font-weight:600; color:#0284c7; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
            <i class="fa-solid fa-lightbulb" style="color:#f59e0b;"></i>
            <span>Xem lời giải chi tiết</span>
            <i class="fa-solid fa-chevron-down" style="font-size:11px; transition:transform 0.2s;"></i>
          </button>
          <div class="explanation-box math-content" style="display:none; margin-top:8px; padding:12px 14px; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; font-size:14px; line-height:1.6; color:#0369a1; word-break:break-word;">
            ${renderMarkdown(promptData.explanation)}
          </div>
        </div>
      ` : ''}

    </div>
  `
}

function renderCardAnswers(q, promptData) {
  // 1. True / False (4 statements a, b, c, d)
  if (q.question_type === 'TRUE_FALSE' || (promptData.statements && promptData.statements.length > 0)) {
    const statements = (promptData.statements && promptData.statements.length > 0)
      ? promptData.statements
      : (promptData.options || [])
    let tfKeys = {}
    try {
      tfKeys = typeof q.tf_answers === 'string' ? JSON.parse(q.tf_answers) : (q.tf_answers || {})
    } catch (_) {}

    return `
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${statements.map(s => {
          const sKey = (s.id || s.key || '').toLowerCase()
          const isTrue = Boolean(tfKeys[sKey])
          return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0; background:#f8fafc; font-size:14px;">
              <div style="display:flex; align-items:flex-start; gap:8px; flex:1;">
                <span style="font-weight:700; color:#475569;">${sKey})</span>
                <span class="math-content" style="color:#334155; line-height:1.5;">${renderMarkdown(s.text || '')}</span>
              </div>
              <span style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:6px; background:${isTrue ? '#dcfce7' : '#fee2e2'}; color:${isTrue ? '#15803d' : '#b91c1c'}; border:1px solid ${isTrue ? '#bbf7d0' : '#fecaca'}; margin-left:12px; flex-shrink:0;">
                ${isTrue ? 'ĐÚNG' : 'SAI'}
              </span>
            </div>
          `
        }).join('')}
      </div>
    `
  }

  // 2. Multiple Choice ABCD
  if (q.question_type === 'MULTIPLE_CHOICE' || (promptData.options && promptData.options.length > 0)) {
    const opts = promptData.options || []
    const correctKey = (q.mc_answer || '').trim().toUpperCase()

    return `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px;">
        ${opts.map(o => {
          const optKey = (o.id || o.key || '').trim().toUpperCase()
          const isCorrect = (optKey === correctKey)
          return `
            <div style="display:flex; align-items:flex-start; gap:8px; padding:8px 12px; border-radius:8px; border:1px solid ${isCorrect ? '#86efac' : '#e2e8f0'}; background:${isCorrect ? '#f0fdf4' : '#f8fafc'}; font-size:14px;">
              <span style="font-weight:700; width:22px; height:22px; border-radius:50%; background:${isCorrect ? '#22c55e' : '#cbd5e1'}; color:#ffffff; display:inline-flex; align-items:center; justify-content:center; font-size:12px; flex-shrink:0;">
                ${optKey}
              </span>
              <div class="math-content" style="color:${isCorrect ? '#15803d' : '#334155'}; font-weight:${isCorrect ? '600' : '400'}; flex:1; line-height:1.5;">
                ${renderMarkdown(o.text || '')}
              </div>
              ${isCorrect ? `<i class="fa-solid fa-check" style="color:#22c55e; font-size:14px; margin-left:auto;"></i>` : ''}
            </div>
          `
        }).join('')}
      </div>
    `
  }

  // 3. Short Answer / Fill in
  if (q.question_type === 'SHORT_ANSWER') {
    return `
      <div style="display:inline-flex; align-items:center; gap:8px; padding:8px 14px; background:#faf5ff; border:1px solid #e9d5ff; border-radius:8px; font-size:14px;">
        <span style="font-weight:600; color:#7e22ce;">Đáp án đúng:</span>
        <span style="font-family:monospace; font-size:16px; font-weight:700; color:#581c87; background:#ffffff; padding:2px 8px; border-radius:6px; border:1px solid #d8b4fe;">
          ${q.sa_answer !== null && q.sa_answer !== undefined ? q.sa_answer : '(Chưa có)'}
        </span>
        ${Number(q.sa_tolerance) > 0 ? `
          <span style="font-size:12px; color:#9333ea;">(Dung sai: ±${q.sa_tolerance})</span>
        ` : ''}
      </div>
    `
  }

  return ''
}

function bindQuestionCardEvents(container) {
  // Accordion toggle explanation
  container.querySelectorAll('.btn-toggle-explanation').forEach(btn => {
    btn.addEventListener('click', () => {
      const box = btn.nextElementSibling
      const icon = btn.querySelector('.fa-chevron-down')
      if (box) {
        const isHidden = (box.style.display === 'none' || !box.style.display)
        box.style.display = isHidden ? 'block' : 'none'
        if (icon) icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)'
      }
    })
  })

  // Delete question
  container.querySelectorAll('.btn-delete-question').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const qId = btn.getAttribute('data-id')
      if (!qId) return

      if (!confirm('Bạn có chắc chắn muốn xóa câu hỏi này khỏi Ngân hàng? Hành động này không thể hoàn tác.')) {
        return
      }

      try {
        await api.deleteQuestionFromBank(qId)
        showToast('Đã xóa câu hỏi thành công!', 'success')
        await refreshStats()
        await fetchAndRenderQuestions()
      } catch (err) {
        showToast('Lỗi khi xóa câu hỏi: ' + err.message, 'error')
      }
    })
  })

  // Edit question
  container.querySelectorAll('.btn-edit-question').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const qId = btn.getAttribute('data-id')
      const targetQ = allQuestions.find(q => q.id === qId)
      if (targetQ) openEditQuestionModal(targetQ)
    })
  })
}

// ========================================================
// Modal 1: Import từ Markdown (MOET Math / Chemistry mhchem)
// ========================================================
function setupHeaderActionListeners() {
  document.getElementById('btn-open-import-md')?.addEventListener('click', openImportMarkdownModal)
  document.getElementById('btn-open-import-hw')?.addEventListener('click', openImportFromHomeworkModal)
  document.getElementById('btn-open-matrix-gen')?.addEventListener('click', openMatrixGeneratorModal)
}

function openImportMarkdownModal() {
  const modalContainer = document.getElementById('qb-modal-container')
  if (!modalContainer) return

  modalContainer.innerHTML = `
    <div class="modal-backdrop" id="import-md-backdrop" style="position:fixed; inset:0; background:rgba(15,23,42,0.6); z-index:9999; display:flex; align-items:center; justify-content:center; padding:16px;">
      <div class="modal-content" onclick="event.stopPropagation()" style="width:100%; max-width:980px; max-height:92vh; background:#ffffff; border-radius:16px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1); display:flex; flex-direction:column; overflow:hidden;">
        
        <!-- Modal Header -->
        <div style="padding:18px 24px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; background:#f8fafc;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:36px; height:36px; border-radius:10px; background:#eff6ff; color:#0284c7; display:flex; align-items:center; justify-content:center; font-size:18px;">
              <i class="fa-solid fa-file-arrow-up"></i>
            </div>
            <div>
              <h3 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a; margin:0;">
                Nhập câu hỏi từ File Markdown (.md)
              </h3>
              <p style="font-size:12px; color:#64748b; margin:0;">
                Hỗ trợ công thức Toán LaTeX ($...$), Hóa học (\\ce{...}), hình ảnh và lời giải chi tiết
              </p>
            </div>
          </div>
          <button id="import-md-close-btn" style="background:none; border:none; font-size:20px; color:#94a3b8; cursor:pointer; padding:4px;">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- Modal Body (Scrollable) -->
        <div style="padding:20px 24px; overflow-y:auto; flex:1;">
          
          <!-- Categorization: Class > Chapter > Lesson -->
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; margin-bottom:18px;">
            <div style="font-size:13px; font-weight:700; color:#334155; margin-bottom:10px; display:flex; align-items:center; gap:6px;">
              <i class="fa-solid fa-folder-tree" style="color:#0284c7;"></i> Phân loại thư mục lưu trữ câu hỏi
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px;">
              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Lớp học *</label>
                <select id="md-target-class" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#ffffff;">
                  <option value="">-- Chọn lớp học --</option>
                  ${allClasses.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                </select>
              </div>
              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Chương học</label>
                <select id="md-target-chapter" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#ffffff;">
                  <option value="">-- Chọn chương học --</option>
                </select>
              </div>
              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Bài học</label>
                <select id="md-target-lesson" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#ffffff;">
                  <option value="">-- Chọn bài học --</option>
                </select>
              </div>
              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Mức độ mặc định</label>
                <select id="md-target-difficulty" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#ffffff;">
                  <option value="THONG_HIEU">Thông hiểu</option>
                  <option value="NHAN_BIET">Nhận biết</option>
                  <option value="VAN_DUNG">Vận dụng</option>
                  <option value="VAN_DUNG_CAO">Vận dụng cao</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Quick Templates Bar -->
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:8px;">
            <div style="display:flex; gap:8px;">
              <button id="md-btn-template-math" type="button" class="btn-secondary" style="padding:5px 12px; font-size:12px; font-weight:600; border-radius:6px; border:1px solid #cbd5e1; background:#f1f5f9; cursor:pointer;">
                <i class="fa-solid fa-square-root-variable" style="color:#0284c7;"></i> Chèn Mẫu Toán MOET
              </button>
              <button id="md-btn-template-chem" type="button" class="btn-secondary" style="padding:5px 12px; font-size:12px; font-weight:600; border-radius:6px; border:1px solid #cbd5e1; background:#f1f5f9; cursor:pointer;">
                <i class="fa-solid fa-flask" style="color:#16a34a;"></i> Chèn Mẫu Hóa mhchem
              </button>
            </div>
            <div>
              <label for="md-file-input" style="padding:5px 12px; font-size:12px; font-weight:600; border-radius:6px; border:1px solid #0284c7; background:#eff6ff; color:#0284c7; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-folder-open"></i> Tải file .md từ máy
              </label>
              <input type="file" id="md-file-input" accept=".md,.txt" style="display:none;" />
            </div>
          </div>

          <!-- Markdown Editor Textarea -->
          <div style="position:relative; margin-bottom:14px;">
            <textarea id="md-editor-textarea" placeholder="Dán nội dung Markdown câu hỏi vào đây hoặc nhấn vào nút Chèn Mẫu ở trên..." style="width:100%; height:260px; font-family:'Fira Code', monospace, sans-serif; font-size:13px; line-height:1.6; padding:12px; border:1px solid #cbd5e1; border-radius:10px; resize:vertical; background:#f8fafc; color:#1e293b; outline:none;"></textarea>
            <div style="position:absolute; right:12px; bottom:12px; font-size:11px; color:#94a3b8; pointer-events:none;">
              Mẹo: Kéo thả ảnh hoặc dán (Ctrl+V) ảnh trực tiếp vào đây
            </div>
          </div>

          <!-- Live Parse Summary Badge -->
          <div id="md-parse-summary" style="display:flex; align-items:center; gap:12px; padding:10px 16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; font-size:13px;">
            <span style="font-weight:700; color:#334155;">Đã nhận diện:</span>
            <span id="md-cnt-mc" style="font-weight:600; color:#16a34a;">0 câu Trắc nghiệm</span>
            <span>•</span>
            <span id="md-cnt-tf" style="font-weight:600; color:#d97706;">0 câu Đúng/Sai</span>
            <span>•</span>
            <span id="md-cnt-sa" style="font-weight:600; color:#9333ea;">0 câu Trả lời ngắn</span>
            <span style="margin-left:auto; font-size:12px; font-weight:700; color:#0284c7;" id="md-cnt-total">Tổng: 0 câu</span>
          </div>

        </div>

        <!-- Modal Footer -->
        <div style="padding:14px 24px; border-top:1px solid #e2e8f0; background:#f8fafc; display:flex; justify-content:flex-end; gap:12px;">
          <button id="import-md-cancel-btn" class="btn-secondary" style="padding:9px 18px; font-size:13px; font-weight:600; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#475569; cursor:pointer;">
            Hủy bỏ
          </button>
          <button id="import-md-submit-btn" class="btn-primary" style="padding:9px 24px; font-size:13px; font-weight:600; border-radius:8px; background:linear-gradient(135deg, #0066cc, #0284c7); color:#ffffff; border:none; cursor:pointer; display:inline-flex; align-items:center; gap:8px;">
            <i class="fa-solid fa-cloud-arrow-up"></i> Lưu vào Ngân hàng câu hỏi
          </button>
        </div>

      </div>
    </div>
  `

  const closeModal = () => { modalContainer.innerHTML = '' }
  document.getElementById('import-md-close-btn')?.addEventListener('click', closeModal)
  document.getElementById('import-md-cancel-btn')?.addEventListener('click', closeModal)
  document.getElementById('import-md-backdrop')?.addEventListener('click', closeModal)

  const classSel = document.getElementById('md-target-class')
  const chapterSel = document.getElementById('md-target-chapter')
  const lessonSel = document.getElementById('md-target-lesson')
  const editor = document.getElementById('md-editor-textarea')

  // Cascading chapters/lessons
  classSel?.addEventListener('change', async (e) => {
    const clId = e.target.value
    if (clId) {
      await loadChaptersForClass(clId, chapterSel)
    } else {
      chapterSel.innerHTML = '<option value="">-- Chọn chương học --</option>'
    }
    lessonSel.innerHTML = '<option value="">-- Chọn bài học --</option>'
  })

  chapterSel?.addEventListener('change', async (e) => {
    const chId = e.target.value
    if (chId) {
      await loadLessonsForChapter(chId, lessonSel)
    } else {
      lessonSel.innerHTML = '<option value="">-- Chọn bài học --</option>'
    }
  })

  // Template button math
  document.getElementById('md-btn-template-math')?.addEventListener('click', () => {
    if (editor) {
      editor.value = MATH_TEMPLATE
      updateParsedCounters(editor.value)
    }
  })

  // Template button chem
  document.getElementById('md-btn-template-chem')?.addEventListener('click', () => {
    if (editor) {
      editor.value = CHEM_TEMPLATE
      updateParsedCounters(editor.value)
    }
  })

  // File upload input
  document.getElementById('md-file-input')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (re) => {
      if (editor) {
        editor.value = re.target.result || ''
        updateParsedCounters(editor.value)
      }
    }
    reader.readAsText(file)
  })

  // Editor typing parse counter update
  editor?.addEventListener('input', () => {
    updateParsedCounters(editor.value)
  })

  // Paste image handler inside editor
  editor?.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile()
        try {
          const compressed = await compressImage(blob, 900, 0.8)
          const imgTag = `\n[Ảnh]\n${compressed}\n`
          const start = editor.selectionStart
          const end = editor.selectionEnd
          editor.value = editor.value.substring(0, start) + imgTag + editor.value.substring(end)
          updateParsedCounters(editor.value)
        } catch (err) {
          showToast('Lỗi nén ảnh: ' + err.message, 'error')
        }
      }
    }
  })

  function updateParsedCounters(text) {
    const res = parseExamMarkdown(text || '')
    const qs = res?.questions || []
    const mc = qs.filter(q => q.questionType === 'MULTIPLE_CHOICE').length
    const tf = qs.filter(q => q.questionType === 'TRUE_FALSE').length
    const sa = qs.filter(q => q.questionType === 'SHORT_ANSWER').length

    document.getElementById('md-cnt-mc').textContent = `${mc} câu Trắc nghiệm`
    document.getElementById('md-cnt-tf').textContent = `${tf} câu Đúng/Sai`
    document.getElementById('md-cnt-sa').textContent = `${sa} câu Trả lời ngắn`
    document.getElementById('md-cnt-total').textContent = `Tổng: ${qs.length} câu`
  }

  // Submit
  document.getElementById('import-md-submit-btn')?.addEventListener('click', async () => {
    const text = editor?.value || ''
    if (!text.trim()) {
      return showToast('Vui lòng nhập hoặc dán nội dung Markdown câu hỏi!', 'warning')
    }

    const res = parseExamMarkdown(text)
    if (!res || !res.questions || res.questions.length === 0) {
      return showToast('Không tìm thấy câu hỏi hợp lệ nào trong văn bản Markdown!', 'error')
    }

    const payload = {
      subject: 'TOAN',
      gradeLevel: 12,
      classId: classSel?.value || null,
      chapterId: chapterSel?.value || null,
      lessonId: lessonSel?.value || null,
      defaultDifficulty: document.getElementById('md-target-difficulty')?.value || 'THONG_HIEU',
      questions: res.questions
    }

    const submitBtn = document.getElementById('import-md-submit-btn')
    submitBtn.disabled = true
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...'

    try {
      const result = await api.importQuestionBank(payload)
      showToast(result.message || 'Đã nhập câu hỏi thành công!', 'success')
      closeModal()
      await fetchAndRenderQuestions({ includeStats: true })
    } catch (err) {
      showToast('Lỗi khi nhập câu hỏi: ' + err.message, 'error')
      submitBtn.disabled = false
      submitBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Lưu vào Ngân hàng câu hỏi'
    }
  })
}

// ========================================================
// Modal 2: Trích xuất / Đồng bộ từ Bài tập cũ
// ========================================================
async function openImportFromHomeworkModal() {
  const modalContainer = document.getElementById('qb-modal-container')
  if (!modalContainer) return

  modalContainer.innerHTML = `
    <div class="modal-backdrop" id="import-hw-backdrop" style="position:fixed; inset:0; background:rgba(15,23,42,0.6); z-index:9999; display:flex; align-items:center; justify-content:center; padding:16px;">
      <div class="modal-content" onclick="event.stopPropagation()" style="width:100%; max-width:850px; max-height:90vh; background:#ffffff; border-radius:16px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.1); display:flex; flex-direction:column; overflow:hidden;">
        
        <!-- Header -->
        <div style="padding:18px 24px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; background:#f8fafc;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:36px; height:36px; border-radius:10px; background:#faf5ff; color:#9333ea; display:flex; align-items:center; justify-content:center; font-size:18px;">
              <i class="fa-solid fa-clock-rotate-left"></i>
            </div>
            <div>
              <h3 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a; margin:0;">
                Lấy câu hỏi từ Bài tập & Đề thi đã có
              </h3>
              <p style="font-size:12px; color:#64748b; margin:0;">
                Tự động gom câu hỏi, đáp án đúng và lời giải từ các bài tập đã tạo trước đây vào Ngân hàng
              </p>
            </div>
          </div>
          <button id="import-hw-close-btn" style="background:none; border:none; font-size:20px; color:#94a3b8; cursor:pointer; padding:4px;">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- Body -->
        <div style="padding:20px 24px; overflow-y:auto; flex:1;">
          
          <!-- Filter homeworks by class -->
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; gap:12px; flex-wrap:wrap;">
            <div style="display:flex; align-items:center; gap:8px;">
              <label style="font-size:13px; font-weight:600; color:#475569;">Lọc theo lớp:</label>
              <select id="hw-filter-class-sel" style="height:36px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#ffffff;">
                <option value="">-- Tất cả lớp học --</option>
                ${allClasses.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
              </select>
            </div>
            <div style="font-size:13px; color:#64748b;">
              Đã chọn: <strong id="hw-selected-count" style="color:#0284c7;">0</strong> bài tập
            </div>
          </div>

          <!-- Homeworks list table -->
          <div style="border:1px solid #e2e8f0; border-radius:10px; overflow:hidden; margin-bottom:18px;">
            <div style="max-height:280px; overflow-y:auto;">
              <table style="width:100%; border-collapse:collapse; text-align:left; font-size:13px;">
                <thead style="background:#f8fafc; border-bottom:1px solid #e2e8f0; position:sticky; top:0; z-index:1;">
                  <tr>
                    <th style="padding:10px 14px; width:40px; text-align:center;">
                      <input type="checkbox" id="hw-check-all" style="cursor:pointer;" />
                    </th>
                    <th style="padding:10px 14px; font-weight:600; color:#475569;">Tiêu đề bài tập</th>
                    <th style="padding:10px 14px; font-weight:600; color:#475569;">Lớp / Bài học</th>
                    <th style="padding:10px 14px; font-weight:600; color:#475569; text-align:center;">Loại</th>
                  </tr>
                </thead>
                <tbody id="hw-list-tbody">
                  <tr>
                    <td colspan="4" style="text-align:center; padding:30px; color:#94a3b8;">
                      <i class="fa-solid fa-spinner fa-spin" style="font-size:20px; margin-bottom:8px;"></i>
                      <div>Đang tải danh sách bài tập...</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Deduplication checkbox -->
          <div style="display:flex; align-items:center; gap:8px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:10px 14px;">
            <input type="checkbox" id="hw-deduplicate-checkbox" checked style="width:16px; height:16px; cursor:pointer;" />
            <label for="hw-deduplicate-checkbox" style="font-size:13px; font-weight:600; color:#15803d; cursor:pointer;">
              Tự động bỏ qua các câu hỏi đã có trong Ngân hàng (Tránh trùng lặp nội dung)
            </label>
          </div>

        </div>

        <!-- Footer -->
        <div style="padding:14px 24px; border-top:1px solid #e2e8f0; background:#f8fafc; display:flex; justify-content:flex-end; gap:12px;">
          <button id="import-hw-cancel-btn" class="btn-secondary" style="padding:9px 18px; font-size:13px; font-weight:600; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#475569; cursor:pointer;">
            Hủy bỏ
          </button>
          <button id="import-hw-submit-btn" class="btn-primary" style="padding:9px 24px; font-size:13px; font-weight:600; border-radius:8px; background:linear-gradient(135deg, #9333ea, #7e22ce); color:#ffffff; border:none; cursor:pointer; display:inline-flex; align-items:center; gap:8px;">
            <i class="fa-solid fa-file-import"></i> Bắt đầu trích xuất
          </button>
        </div>

      </div>
    </div>
  `

  const closeModal = () => { modalContainer.innerHTML = '' }
  document.getElementById('import-hw-close-btn')?.addEventListener('click', closeModal)
  document.getElementById('import-hw-cancel-btn')?.addEventListener('click', closeModal)
  document.getElementById('import-hw-backdrop')?.addEventListener('click', closeModal)

  // Load homeworks
  let rawHomeworks = []
  try {
    rawHomeworks = await api.getHomeworks('')
    renderHomeworkTable(rawHomeworks)
  } catch (err) {
    document.getElementById('hw-list-tbody').innerHTML = `
      <tr><td colspan="4" style="padding:20px; text-align:center; color:#dc2626;">Lỗi tải bài tập: ${err.message}</td></tr>
    `
  }

  // Filter homeworks by class (server-side filter)
  document.getElementById('hw-filter-class-sel')?.addEventListener('change', async (e) => {
    const clId = e.target.value
    const tbody = document.getElementById('hw-list-tbody')
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="4" style="padding:20px; text-align:center; color:#64748b;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải bài tập...</td></tr>`
    }
    try {
      const filtered = await api.getHomeworks('', clId)
      renderHomeworkTable(filtered)
    } catch (err) {
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="4" style="padding:20px; text-align:center; color:#dc2626;">Lỗi tải bài tập: ${err.message}</td></tr>`
      }
    }
  })

  function renderHomeworkTable(list) {
    const tbody = document.getElementById('hw-list-tbody')
    if (!tbody) return

    if (!list || list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px; color:#94a3b8;">Không có bài tập nào.</td></tr>`
      return
    }

    tbody.innerHTML = list.map(hw => `
      <tr style="border-bottom:1px solid #f1f5f9; cursor:pointer;" onclick="const cb = this.querySelector('.hw-row-check'); cb.checked = !cb.checked; cb.dispatchEvent(new Event('change'));">
        <td style="padding:10px 14px; text-align:center;" onclick="event.stopPropagation();">
          <input type="checkbox" class="hw-row-check" value="${hw.id}" style="cursor:pointer;" />
        </td>
        <td style="padding:10px 14px; font-weight:600; color:#1e293b;">
          ${hw.title || 'Bài tập không tên'}
        </td>
        <td style="padding:10px 14px; color:#64748b; font-size:12px;">
          ${hw.className || 'Lớp học'} - ${hw.lessonTitle || ''}
        </td>
        <td style="padding:10px 14px; text-align:center;">
          <span style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:6px; background:${hw.type === 'EXAM' ? '#fef2f2' : '#eff6ff'}; color:${hw.type === 'EXAM' ? '#dc2626' : '#0284c7'};">
            ${hw.type === 'EXAM' ? 'Đề thi' : 'Tự luyện'}
          </span>
        </td>
      </tr>
    `).join('')

    // Check all event
    const checkAll = document.getElementById('hw-check-all')
    const rowChecks = tbody.querySelectorAll('.hw-row-check')

    checkAll?.addEventListener('change', () => {
      rowChecks.forEach(cb => { cb.checked = checkAll.checked })
      updateSelectedHwCount()
    })

    rowChecks.forEach(cb => {
      cb.addEventListener('change', () => {
        updateSelectedHwCount()
      })
    })

    updateSelectedHwCount()
  }

  function updateSelectedHwCount() {
    const selected = document.querySelectorAll('.hw-row-check:checked')
    const cntEl = document.getElementById('hw-selected-count')
    if (cntEl) cntEl.textContent = selected.length
  }

  // Submit Extraction
  document.getElementById('import-hw-submit-btn')?.addEventListener('click', async () => {
    const selectedBoxes = document.querySelectorAll('.hw-row-check:checked')
    const hwIds = Array.from(selectedBoxes).map(cb => cb.value)

    if (hwIds.length === 0) {
      return showToast('Vui lòng chọn ít nhất 1 bài tập để trích xuất câu hỏi!', 'warning')
    }

    const deduplicate = document.getElementById('hw-deduplicate-checkbox')?.checked ?? true
    const submitBtn = document.getElementById('import-hw-submit-btn')
    submitBtn.disabled = true
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang trích xuất...'

    try {
      const res = await api.importQuestionBankFromHomework({
        homeworkIds: hwIds,
        deduplicate
      })

      showToast(res.message || 'Đã trích xuất câu hỏi thành công!', 'success')
      closeModal()
      await fetchAndRenderQuestions({ includeStats: true })
    } catch (err) {
      showToast('Lỗi khi trích xuất: ' + err.message, 'error')
      submitBtn.disabled = false
      submitBtn.innerHTML = '<i class="fa-solid fa-file-import"></i> Bắt đầu trích xuất'
    }
  })
}

// ========================================================
// Modal 3: Tạo Đề thi ngẫu nhiên theo Ma trận
// ========================================================
async function openMatrixGeneratorModal() {
  const modalContainer = document.getElementById('qb-modal-container')
  if (!modalContainer) return

  generatorState.previewQuestions = []

  const customBlocks = (allClasses || []).map(c => c.gradeBlock || c.grade_block).filter(Boolean)
  const uniqueBlocks = Array.from(new Set([...(cachedGradeBlocksList || []), ...customBlocks]))
  if (!generatorState.gradeBlock && uniqueBlocks.length > 0) {
    generatorState.gradeBlock = uniqueBlocks[0]
  }

  modalContainer.innerHTML = `
    <div class="modal-backdrop" id="matrix-gen-backdrop" style="position:fixed; inset:0; background:rgba(15,23,42,0.6); z-index:9999; display:flex; align-items:center; justify-content:center; padding:16px;">
      <div class="modal-content" onclick="event.stopPropagation()" style="width:100%; max-width:1040px; max-height:92vh; background:#ffffff; border-radius:16px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.1); display:flex; flex-direction:column; overflow:hidden;">
        
        <!-- Header -->
        <div style="padding:18px 24px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; background:#f8fafc;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:36px; height:36px; border-radius:10px; background:linear-gradient(135deg, #0066cc, #0284c7); color:#fff; display:flex; align-items:center; justify-content:center; font-size:18px;">
              <i class="fa-solid fa-wand-magic-sparkles"></i>
            </div>
            <div>
              <h3 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a; margin:0;">
                Tạo đề kiểm tra / bài tập theo Ma trận
              </h3>
              <p style="font-size:12px; color:#64748b; margin:0;">
                Bốc ngẫu nhiên theo phạm vi Khối học, Lớp, Chương hoặc Bài; kiểm tra số lượng khả dụng và xem trước câu hỏi
              </p>
            </div>
          </div>
          <button id="matrix-gen-close-btn" style="background:none; border:none; font-size:20px; color:#94a3b8; cursor:pointer; padding:4px;">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- Body with Tabs: Step 1 Matrix Config / Step 2 Preview -->
        <div id="matrix-gen-step1" style="padding:20px 24px; overflow-y:auto; flex:1;">
          
          <!-- Scope Selection Box -->
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; margin-bottom:18px;">
            <div style="font-size:13px; font-weight:700; color:#334155; margin-bottom:12px; display:flex; align-items:center; gap:6px;">
              <i class="fa-solid fa-bullseye" style="color:#0284c7;"></i> 1. Phạm vi bốc câu hỏi từ Ngân hàng
            </div>

            <div style="display:flex; gap:16px; margin-bottom:14px; flex-wrap:wrap;">
              <label style="display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:600; color:#334155; cursor:pointer;">
                <input type="radio" name="gen-scope-type" value="BLOCK" checked style="width:16px; height:16px; cursor:pointer;" />
                Bốc từ 1 Khối học (Toàn bộ các lớp trong Khối)
              </label>
              <label style="display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:600; color:#334155; cursor:pointer;">
                <input type="radio" name="gen-scope-type" value="CLASS" style="width:16px; height:16px; cursor:pointer;" />
                Bốc từ 1 Lớp học
              </label>
              <label style="display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:600; color:#334155; cursor:pointer;">
                <input type="radio" name="gen-scope-type" value="CHAPTER" style="width:16px; height:16px; cursor:pointer;" />
                Bốc từ 1 Chương học
              </label>
              <label style="display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:600; color:#334155; cursor:pointer;">
                <input type="radio" name="gen-scope-type" value="LESSON" style="width:16px; height:16px; cursor:pointer;" />
                Bốc từ 1 Bài học cụ thể
              </label>
            </div>

            <!-- Cascading Scope Selects -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px;">
              <div id="gen-scope-block-wrap">
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Chọn Khối nguồn *</label>
                <select id="gen-scope-block" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#ffffff;">
                  ${uniqueBlocks.map(b => `<option value="${b}" ${b === generatorState.gradeBlock ? 'selected' : ''}>${b}</option>`).join('')}
                </select>
              </div>
              <div id="gen-scope-class-wrap" style="display:none;">
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Chọn Lớp nguồn *</label>
                <select id="gen-scope-class" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#ffffff;">
                  <option value="">-- Chọn lớp học --</option>
                  ${allClasses.map(c => `<option value="${c.id}">${c.name} (${c.gradeBlock || ''})</option>`).join('')}
                </select>
              </div>
              <div id="gen-scope-chapter-wrap" style="display:none;">
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Chọn Chương nguồn *</label>
                <select id="gen-scope-chapter" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#ffffff;">
                  <option value="">-- Chọn chương học --</option>
                </select>
              </div>
              <div id="gen-scope-lesson-wrap" style="display:none;">
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Chọn Bài học nguồn *</label>
                <select id="gen-scope-lesson" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#ffffff;">
                  <option value="">-- Chọn bài học --</option>
                </select>
              </div>
            </div>

            <!-- Live Availability Checker Banner -->
            <div id="gen-avail-banner" style="margin-top:14px; padding:10px 14px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; font-size:13px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
              <span style="font-weight:700; color:#1e40af;"><i class="fa-solid fa-circle-info"></i> Khả dụng trong phạm vi:</span>
              <span id="avail-mc" style="font-weight:600; color:#15803d;">0 Trắc nghiệm ABCD</span>
              <span>•</span>
              <span id="avail-tf" style="font-weight:600; color:#b45309;">0 Đúng / Sai</span>
              <span>•</span>
              <span id="avail-sa" style="font-weight:600; color:#7e22ce;">0 Trả lời ngắn</span>
              <span id="avail-total" style="margin-left:auto; font-weight:700; color:#0369a1;">Tổng có: 0 câu</span>
            </div>
          </div>

          <!-- Matrix Configuration Box -->
          <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:16px; margin-bottom:18px;">
            <div style="font-size:13px; font-weight:700; color:#334155; margin-bottom:14px; display:flex; align-items:center; gap:6px;">
              <i class="fa-solid fa-table-cells" style="color:#0284c7;"></i> 2. Ma trận số lượng câu hỏi theo chuẩn Bộ GD&ĐT
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:14px;">
              
              <!-- MC Count -->
              <div style="padding:12px; border:1px solid #bbf7d0; border-radius:10px; background:#f0fdf4;">
                <div style="font-size:12px; font-weight:700; color:#166534; margin-bottom:6px;">
                  PHẦN I: Trắc nghiệm ABCD
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <input type="number" id="gen-matrix-mc" min="0" value="12" style="width:80px; height:38px; border:1px solid #86efac; border-radius:8px; padding:0 10px; font-size:15px; font-weight:700; color:#14532d; background:#ffffff;" />
                  <span style="font-size:13px; color:#166534;">câu (0.25đ / câu)</span>
                </div>
              </div>

              <!-- TF Count -->
              <div style="padding:12px; border:1px solid #fde68a; border-radius:10px; background:#fffbeb;">
                <div style="font-size:12px; font-weight:700; color:#92400e; margin-bottom:6px;">
                  PHẦN II: Đúng / Sai (4 ý)
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <input type="number" id="gen-matrix-tf" min="0" value="4" style="width:80px; height:38px; border:1px solid #fcd34d; border-radius:8px; padding:0 10px; font-size:15px; font-weight:700; color:#78350f; background:#ffffff;" />
                  <span style="font-size:13px; color:#92400e;">câu (1.0đ / câu)</span>
                </div>
              </div>

              <!-- SA Count -->
              <div style="padding:12px; border:1px solid #e9d5ff; border-radius:10px; background:#faf5ff;">
                <div style="font-size:12px; font-weight:700; color:#6b21a8; margin-bottom:6px;">
                  PHẦN III: Trả lời ngắn / Điền số
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <input type="number" id="gen-matrix-sa" min="0" value="6" style="width:80px; height:38px; border:1px solid #d8b4fe; border-radius:8px; padding:0 10px; font-size:15px; font-weight:700; color:#581c87; background:#ffffff;" />
                  <span style="font-size:13px; color:#6b21a8;">câu (0.5đ / câu)</span>
                </div>
              </div>

            </div>

            <!-- Total Question Counter -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; padding-top:12px; border-top:1px dashed #e2e8f0; font-size:13px;">
              <span style="color:#64748b;">Tổng số câu yêu cầu: <strong id="gen-matrix-total-q" style="color:#0f172a; font-size:15px;">22</strong> câu</span>
              <span style="color:#64748b;">Tổng thang điểm: <strong style="color:#0284c7; font-size:15px;">10.0</strong> điểm</span>
            </div>
          </div>

          <!-- Assignment Metadata & Target Destination -->
          <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:16px;">
            <div style="font-size:13px; font-weight:700; color:#334155; margin-bottom:14px; display:flex; align-items:center; gap:6px;">
              <i class="fa-solid fa-file-pen" style="color:#0284c7;"></i> 3. Thông tin bài tập & Bài học đích
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:14px; margin-bottom:14px;">
              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Tiêu đề đề thi / bài tập *</label>
                <input type="text" id="gen-exam-title" placeholder="Ví dụ: Đề kiểm tra 45 phút - Đại số & Giải tích" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:13px;" />
              </div>
              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Hình thức làm bài</label>
                <select id="gen-exam-type" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px;">
                  <option value="PRACTICE">Luyện tập tự do (Tối đa 3 lần làm)</option>
                  <option value="EXAM">Kiểm tra / Thi chính thức (Chỉ 1 lần làm)</option>
                </select>
              </div>
              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Thời gian làm bài (Phút)</label>
                <input type="number" id="gen-exam-duration" min="5" value="60" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:13px;" />
              </div>
            </div>

            <!-- Destination lesson selection -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px; background:#f8fafc; padding:12px; border-radius:8px; border:1px solid #e2e8f0;">
              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Gán vào Lớp đích *</label>
                <select id="gen-dest-class" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#ffffff;">
                  <option value="">-- Chọn lớp đích --</option>
                  ${allClasses.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                </select>
              </div>
              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Chương đích</label>
                <select id="gen-dest-chapter" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#ffffff;">
                  <option value="">-- Chọn chương đích --</option>
                </select>
              </div>
              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Bài học đích *</label>
                <select id="gen-dest-lesson" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#ffffff;">
                  <option value="">-- Chọn bài học đích --</option>
                </select>
              </div>
            </div>

            <!-- Toggles -->
            <div style="display:flex; gap:20px; align-items:center; margin-top:14px; flex-wrap:wrap;">
              <label style="display:inline-flex; align-items:center; gap:6px; font-size:13px; color:#334155; cursor:pointer;">
                <input type="checkbox" id="gen-show-solutions" checked style="width:16px; height:16px; cursor:pointer;" />
                Cho phép học sinh xem lời giải chi tiết sau khi nộp
              </label>
            </div>
          </div>

        </div>

        <!-- Body Step 2: Preview & Re-roll (Swap) -->
        <div id="matrix-gen-step2" style="display:none; padding:20px 24px; overflow-y:auto; flex:1;">
          
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid #e2e8f0; flex-wrap:wrap; gap:10px;">
            <div>
              <div style="font-size:16px; font-weight:700; color:#0f172a;" id="preview-exam-title">
                Đề kiểm tra xem trước
              </div>
              <div style="font-size:12px; color:#64748b;" id="preview-meta-desc">
                22 câu hỏi • 60 phút
              </div>
            </div>
            <div style="display:flex; gap:8px;">
              <button id="btn-back-to-config" class="btn-secondary" style="padding:8px 14px; font-size:13px; font-weight:600; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#475569; cursor:pointer;">
                <i class="fa-solid fa-arrow-left"></i> Chỉnh lại ma trận
              </button>
            </div>
          </div>

          <!-- Preview Questions List -->
          <div id="preview-questions-container" style="display:flex; flex-direction:column; gap:14px;">
            <!-- Generated questions will render here with swap buttons -->
          </div>

        </div>

        <!-- Footer -->
        <div style="padding:14px 24px; border-top:1px solid #e2e8f0; background:#f8fafc; display:flex; justify-content:flex-end; gap:12px;">
          <button id="matrix-gen-cancel-btn" class="btn-secondary" style="padding:9px 18px; font-size:13px; font-weight:600; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#475569; cursor:pointer;">
            Đóng
          </button>
          
          <button id="btn-roll-preview" class="btn-primary" style="padding:9px 22px; font-size:13px; font-weight:600; border-radius:8px; background:linear-gradient(135deg, #0284c7, #0369a1); color:#ffffff; border:none; cursor:pointer; display:inline-flex; align-items:center; gap:8px;">
            <i class="fa-solid fa-dice"></i> Bốc ngẫu nhiên & Xem trước
          </button>

          <button id="btn-finalize-create-hw" class="btn-primary" style="display:none; padding:9px 24px; font-size:13px; font-weight:600; border-radius:8px; background:linear-gradient(135deg, #0066cc, #0284c7); color:#ffffff; border:none; cursor:pointer; display:inline-flex; align-items:center; gap:8px;">
            <i class="fa-solid fa-check"></i> Xác nhận & Xuất bản đề thi
          </button>
        </div>

      </div>
    </div>
  `

  const closeModal = () => { modalContainer.innerHTML = '' }
  document.getElementById('matrix-gen-close-btn')?.addEventListener('click', closeModal)
  document.getElementById('matrix-gen-cancel-btn')?.addEventListener('click', closeModal)
  document.getElementById('matrix-gen-backdrop')?.addEventListener('click', closeModal)

  // Scope Type Radios
  const scopeRadios = document.querySelectorAll('input[name="gen-scope-type"]')
  const blockWrap = document.getElementById('gen-scope-block-wrap')
  const classWrap = document.getElementById('gen-scope-class-wrap')
  const chapterWrap = document.getElementById('gen-scope-chapter-wrap')
  const lessonWrap = document.getElementById('gen-scope-lesson-wrap')
  const scopeBlockSel = document.getElementById('gen-scope-block')
  const scopeClassSel = document.getElementById('gen-scope-class')
  const scopeChapterSel = document.getElementById('gen-scope-chapter')
  const scopeLessonSel = document.getElementById('gen-scope-lesson')

  scopeRadios.forEach(r => {
    r.addEventListener('change', (e) => {
      generatorState.scopeType = e.target.value
      if (generatorState.scopeType === 'BLOCK') {
        if (blockWrap) blockWrap.style.display = 'block'
        if (classWrap) classWrap.style.display = 'none'
        if (chapterWrap) chapterWrap.style.display = 'none'
        if (lessonWrap) lessonWrap.style.display = 'none'
      } else if (generatorState.scopeType === 'CLASS') {
        if (blockWrap) blockWrap.style.display = 'none'
        if (classWrap) classWrap.style.display = 'block'
        if (chapterWrap) chapterWrap.style.display = 'none'
        if (lessonWrap) lessonWrap.style.display = 'none'
      } else if (generatorState.scopeType === 'CHAPTER') {
        if (blockWrap) blockWrap.style.display = 'none'
        if (classWrap) classWrap.style.display = 'block'
        if (chapterWrap) chapterWrap.style.display = 'block'
        if (lessonWrap) lessonWrap.style.display = 'none'
      } else if (generatorState.scopeType === 'LESSON') {
        if (blockWrap) blockWrap.style.display = 'none'
        if (classWrap) classWrap.style.display = 'block'
        if (chapterWrap) chapterWrap.style.display = 'block'
        if (lessonWrap) lessonWrap.style.display = 'block'
      }
      checkLiveAvailability()
    })
  })

  // Scope Block changed
  scopeBlockSel?.addEventListener('change', (e) => {
    generatorState.gradeBlock = e.target.value
    checkLiveAvailability()
  })

  // Cascading scope selects
  scopeClassSel?.addEventListener('change', async (e) => {
    generatorState.classId = e.target.value
    generatorState.chapterId = ''
    generatorState.lessonId = ''

    if (generatorState.classId) {
      await loadChaptersForClass(generatorState.classId, scopeChapterSel)
    } else {
      scopeChapterSel.innerHTML = '<option value="">-- Chọn chương học --</option>'
    }
    scopeLessonSel.innerHTML = '<option value="">-- Chọn bài học --</option>'

    // Also pre-fill target class if empty
    const destClass = document.getElementById('gen-dest-class')
    if (destClass && !destClass.value) {
      destClass.value = generatorState.classId
      destClass.dispatchEvent(new Event('change'))
    }

    checkLiveAvailability()
  })

  scopeChapterSel?.addEventListener('change', async (e) => {
    generatorState.chapterId = e.target.value
    generatorState.lessonId = ''

    if (generatorState.chapterId) {
      await loadLessonsForChapter(generatorState.chapterId, scopeLessonSel)
    } else {
      scopeLessonSel.innerHTML = '<option value="">-- Chọn bài học --</option>'
    }
    checkLiveAvailability()
  })

  scopeLessonSel?.addEventListener('change', (e) => {
    generatorState.lessonId = e.target.value
    checkLiveAvailability()
  })

  // Trigger initial availability check for default BLOCK
  checkLiveAvailability()

  // Cascading destination selects
  const destClassSel = document.getElementById('gen-dest-class')
  const destChapterSel = document.getElementById('gen-dest-chapter')
  const destLessonSel = document.getElementById('gen-dest-lesson')

  destClassSel?.addEventListener('change', async (e) => {
    const clId = e.target.value
    if (clId) {
      await loadChaptersForClass(clId, destChapterSel)
    } else {
      destChapterSel.innerHTML = '<option value="">-- Chọn chương đích --</option>'
    }
    destLessonSel.innerHTML = '<option value="">-- Chọn bài học đích --</option>'
  })

  destChapterSel?.addEventListener('change', async (e) => {
    const chId = e.target.value
    if (chId) {
      await loadLessonsForChapter(chId, destLessonSel)
    } else {
      destLessonSel.innerHTML = '<option value="">-- Chọn bài học đích --</option>'
    }
  })

  // Matrix count inputs listener
  const mcInput = document.getElementById('gen-matrix-mc')
  const tfInput = document.getElementById('gen-matrix-tf')
  const saInput = document.getElementById('gen-matrix-sa')
  const totalCountEl = document.getElementById('gen-matrix-total-q')

  const updateMatrixSum = () => {
    const total = (Number(mcInput?.value) || 0) + (Number(tfInput?.value) || 0) + (Number(saInput?.value) || 0)
    if (totalCountEl) totalCountEl.textContent = total
  }
  mcInput?.addEventListener('input', updateMatrixSum)
  tfInput?.addEventListener('input', updateMatrixSum)
  saInput?.addEventListener('input', updateMatrixSum)

  // Live availability function
  async function checkLiveAvailability() {
    try {
      let params = `scopeType=${generatorState.scopeType}&`
      if (generatorState.scopeType === 'BLOCK') {
        params += `gradeBlock=${encodeURIComponent(generatorState.gradeBlock || '')}&`
      } else {
        if (generatorState.classId) params += `classId=${generatorState.classId}&`
        if (generatorState.chapterId) params += `chapterId=${generatorState.chapterId}&`
        if (generatorState.lessonId) params += `lessonId=${generatorState.lessonId}&`
      }

      const res = await api.checkQuestionBankAvailability(params)
      if (res) {
        generatorState.availableStats = res
        document.getElementById('avail-mc').textContent = `${res.mc} Trắc nghiệm ABCD`
        document.getElementById('avail-tf').textContent = `${res.tf} Đúng / Sai`
        document.getElementById('avail-sa').textContent = `${res.sa} Trả lời ngắn`
        document.getElementById('avail-total').textContent = `Tổng có: ${res.total} câu`
      }
    } catch (e) {
      console.warn('[QuestionBank] Availability check failed:', e)
    }
  }

  // Step 1 -> Step 2: Roll & Preview
  const btnRollPreview = document.getElementById('btn-roll-preview')
  const btnFinalize = document.getElementById('btn-finalize-create-hw')
  const step1 = document.getElementById('matrix-gen-step1')
  const step2 = document.getElementById('matrix-gen-step2')

  btnRollPreview?.addEventListener('click', async () => {
    const title = document.getElementById('gen-exam-title')?.value?.trim()
    if (!title) {
      return showToast('Vui lòng nhập tiêu đề cho bài kiểm tra / bài tập!', 'warning')
    }

    if (generatorState.scopeType === 'BLOCK' && !generatorState.gradeBlock) {
      return showToast('Vui lòng chọn Khối nguồn để bốc câu hỏi!', 'warning')
    }
    if (generatorState.scopeType !== 'BLOCK' && !generatorState.classId) {
      return showToast('Vui lòng chọn Lớp nguồn để bốc câu hỏi!', 'warning')
    }

    const mcCount = Number(mcInput?.value) || 0
    const tfCount = Number(tfInput?.value) || 0
    const saCount = Number(saInput?.value) || 0

    if (mcCount + tfCount + saCount === 0) {
      return showToast('Tổng số câu hỏi trong ma trận phải lớn hơn 0!', 'warning')
    }

    // Availability validation check
    const avail = generatorState.availableStats
    if (avail.mc < mcCount) {
      return showToast(`Không đủ câu Trắc nghiệm trong phạm vi (Cần ${mcCount}, có ${avail.mc})!`, 'error')
    }
    if (avail.tf < tfCount) {
      return showToast(`Không đủ câu Đúng/Sai trong phạm vi (Cần ${tfCount}, có ${avail.tf})!`, 'error')
    }
    if (avail.sa < saCount) {
      return showToast(`Không đủ câu Trả lời ngắn trong phạm vi (Cần ${saCount}, có ${avail.sa})!`, 'error')
    }

    btnRollPreview.disabled = true
    btnRollPreview.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang bốc câu...'

    try {
      const res = await api.generateRandomExam({
        scopeType: generatorState.scopeType,
        gradeBlock: generatorState.gradeBlock,
        classId: generatorState.classId,
        chapterId: generatorState.chapterId,
        lessonId: generatorState.lessonId,
        matrix: { mcCount, tfCount, saCount },
        previewOnly: true
      })

      generatorState.previewQuestions = res.previewQuestions || []

      // Switch to Step 2 Preview
      step1.style.display = 'none'
      step2.style.display = 'block'
      btnRollPreview.style.display = 'none'
      btnFinalize.style.display = 'inline-flex'

      document.getElementById('preview-exam-title').textContent = title
      document.getElementById('preview-meta-desc').textContent = `${generatorState.previewQuestions.length} câu hỏi • ${document.getElementById('gen-exam-duration')?.value || 60} phút`

      renderPreviewQuestionsList()
    } catch (err) {
      showToast('Lỗi khi bốc đề: ' + err.message, 'error')
    } finally {
      btnRollPreview.disabled = false
      btnRollPreview.innerHTML = '<i class="fa-solid fa-dice"></i> Bốc ngẫu nhiên & Xem trước'
    }
  })

  // Back to Config
  document.getElementById('btn-back-to-config')?.addEventListener('click', () => {
    step1.style.display = 'block'
    step2.style.display = 'none'
    btnRollPreview.style.display = 'inline-flex'
    btnFinalize.style.display = 'none'
  })

  // Render Preview Questions List with Swap/Re-roll capability
  function renderPreviewQuestionsList() {
    const container = document.getElementById('preview-questions-container')
    if (!container) return

    let html = ''
    generatorState.previewQuestions.forEach((q, idx) => {
      const promptData = parseQuestionPrompt(q.prompt)

      let typeBadge = 'Trắc nghiệm'
      let typeBg = '#eff6ff'
      let typeColor = '#0284c7'
      if (q.question_type === 'TRUE_FALSE') {
        typeBadge = 'Đúng / Sai'
        typeBg = '#fffbeb'
        typeColor = '#d97706'
      } else if (q.question_type === 'SHORT_ANSWER') {
        typeBadge = 'Trả lời ngắn'
        typeBg = '#faf5ff'
        typeColor = '#9333ea'
      }

      html += `
        <div class="card preview-q-row" data-index="${idx}" data-id="${q.id}" style="margin:0; padding:16px; border:1px solid #e2e8f0; border-radius:10px; background:#ffffff;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-weight:700; font-size:13px; color:#1e293b;">Câu ${idx + 1}</span>
              <span style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:6px; background:${typeBg}; color:${typeColor};">
                ${typeBadge}
              </span>
              <span style="font-size:11px; color:#64748b;">
                ${q.points || (q.question_type === 'TRUE_FALSE' ? 1.0 : (q.question_type === 'SHORT_ANSWER' ? 0.5 : 0.25))} điểm
              </span>
            </div>

            <!-- Re-roll / Swap Button -->
            <button class="btn-swap-question" data-index="${idx}" data-id="${q.id}" data-type="${q.question_type}" style="padding:4px 10px; font-size:12px; font-weight:600; border-radius:6px; border:1px solid #cbd5e1; background:#f8fafc; color:#334155; cursor:pointer; display:inline-flex; align-items:center; gap:5px;">
              <i class="fa-solid fa-arrows-rotate" style="color:#0284c7;"></i> Đổi câu khác
            </button>
          </div>

          <div class="math-content" style="font-size:14px; line-height:1.6; color:#1e293b; margin-bottom:10px; word-break:break-word;">
            ${renderMarkdown(promptData.text || '')}
          </div>

          <!-- Answers -->
          <div style="font-size:13px;">
            ${renderCardAnswers(q, promptData)}
          </div>
        </div>
      `
    })

    container.innerHTML = html
    renderMath(container)

    // Bind Swap Questions
    container.querySelectorAll('.btn-swap-question').forEach(btn => {
      btn.addEventListener('click', async () => {
        const qIdx = parseInt(btn.getAttribute('data-index'), 10)
        const curId = btn.getAttribute('data-id')
        const qType = btn.getAttribute('data-type')

        const excludeIds = generatorState.previewQuestions.map(q => q.id)
        btn.disabled = true
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'

        try {
          const swapRes = await api.swapQuestionInExam({
            currentQuestionId: curId,
            excludeIds,
            questionType: qType,
            scopeType: generatorState.scopeType,
            gradeBlock: generatorState.gradeBlock,
            classId: generatorState.classId,
            chapterId: generatorState.chapterId,
            lessonId: generatorState.lessonId
          })

          if (swapRes && swapRes.replacement) {
            generatorState.previewQuestions[qIdx] = swapRes.replacement
            showToast('Đã đổi câu hỏi thành công!', 'success')
            renderPreviewQuestionsList()
          }
        } catch (err) {
          showToast('Không thể đổi câu: ' + err.message, 'error')
          btn.disabled = false
          btn.innerHTML = '<i class="fa-solid fa-arrows-rotate" style="color:#0284c7;"></i> Đổi câu khác'
        }
      })
    })
  }

  // Finalize Create Exam
  btnFinalize?.addEventListener('click', async () => {
    const destLessonId = destLessonSel?.value
    if (!destLessonId) {
      return showToast('Vui lòng chọn Bài học đích để lưu trữ bài tập!', 'warning')
    }

    const title = document.getElementById('gen-exam-title')?.value?.trim()
    const type = document.getElementById('gen-exam-type')?.value || 'PRACTICE'
    const durationMinutes = Number(document.getElementById('gen-exam-duration')?.value) || 60
    const showSolutions = document.getElementById('gen-show-solutions')?.checked ?? true

    const questionBankIds = generatorState.previewQuestions.map(q => q.id)

    btnFinalize.disabled = true
    btnFinalize.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang khởi tạo bài thi...'

    try {
      const res = await api.createHomeworkFromBankQuestions({
        targetLessonId: destLessonId,
        title,
        type,
        durationMinutes,
        passScore: 5.0,
        maxScore: 10.0,
        showSolutions,
        questionBankIds
      })

      showToast(res.message || 'Đã tạo bài tập thành công!', 'success')
      closeModal()
      window.location.hash = '#homework-mgmt'
    } catch (err) {
      showToast('Lỗi khi tạo bài thi: ' + err.message, 'error')
      btnFinalize.disabled = false
      btnFinalize.innerHTML = '<i class="fa-solid fa-check"></i> Xác nhận & Xuất bản đề thi'
    }
  })
}

// ========================================================
// Modal 4: Chỉnh sửa câu hỏi đơn lẻ
// ========================================================
function openEditQuestionModal(q) {
  const modalContainer = document.getElementById('qb-modal-container')
  if (!modalContainer) return

  const promptData = parseQuestionPrompt(q.prompt)

  modalContainer.innerHTML = `
    <div class="modal-backdrop" id="edit-q-backdrop" style="position:fixed; inset:0; background:rgba(15,23,42,0.6); z-index:9999; display:flex; align-items:center; justify-content:center; padding:16px;">
      <div class="modal-content" onclick="event.stopPropagation()" style="width:100%; max-width:800px; max-height:90vh; background:#ffffff; border-radius:16px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.1); display:flex; flex-direction:column; overflow:hidden;">
        
        <div style="padding:18px 24px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; background:#f8fafc;">
          <h3 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a; margin:0;">
            Chỉnh sửa câu hỏi
          </h3>
          <button id="edit-q-close-btn" style="background:none; border:none; font-size:20px; color:#94a3b8; cursor:pointer; padding:4px;">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div style="padding:20px 24px; overflow-y:auto; flex:1;">
          <!-- Grade Block, Difficulty & Points -->
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:14px;">
            <div>
              <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Khối học</label>
              <input type="text" id="edit-q-grade-block" list="edit-q-grade-block-options" value="${q.grade_block || (cachedGradeBlocksList[0] || '')}" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px;" />
              <datalist id="edit-q-grade-block-options">
                ${cachedGradeBlocksList.map(b => `<option value="${b}">`).join('')}
              </datalist>
            </div>
            <div>
              <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Mức độ nhận thức</label>
              <select id="edit-q-difficulty" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px;">
                <option value="NHAN_BIET" ${q.difficulty === 'NHAN_BIET' ? 'selected' : ''}>Nhận biết</option>
                <option value="THONG_HIEU" ${q.difficulty === 'THONG_HIEU' ? 'selected' : ''}>Thông hiểu</option>
                <option value="VAN_DUNG" ${q.difficulty === 'VAN_DUNG' ? 'selected' : ''}>Vận dụng</option>
                <option value="VAN_DUNG_CAO" ${q.difficulty === 'VAN_DUNG_CAO' ? 'selected' : ''}>Vận dụng cao</option>
              </select>
            </div>
            <div>
              <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Điểm câu hỏi</label>
              <input type="number" step="0.05" id="edit-q-points" value="${q.points || 0.25}" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:13px;" />
            </div>
          </div>

          <!-- Prompt text -->
          <div style="margin-bottom:14px;">
            <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Nội dung câu hỏi (Hỗ trợ LaTeX)</label>
            <textarea id="edit-q-prompt" style="width:100%; height:120px; font-family:'Fira Code', monospace; font-size:13px; padding:10px; border:1px solid #cbd5e1; border-radius:8px;">${promptData.text || ''}</textarea>
          </div>

          <!-- Specific Answer editing -->
          ${q.question_type === 'MULTIPLE_CHOICE' ? `
            <div style="margin-bottom:14px;">
              <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Đáp án đúng (A, B, C hoặc D)</label>
              <input type="text" id="edit-q-mc" value="${q.mc_answer || ''}" style="width:80px; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-weight:700; font-size:14px; text-transform:uppercase;" />
            </div>
          ` : ''}

          ${q.question_type === 'SHORT_ANSWER' ? `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px;">
              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Đáp án số / ký tự</label>
                <input type="text" id="edit-q-sa" value="${q.sa_answer !== null && q.sa_answer !== undefined ? q.sa_answer : ''}" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:13px;" />
              </div>
              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Dung sai cho phép (±)</label>
                <input type="number" step="0.01" id="edit-q-tolerance" value="${q.sa_tolerance || 0}" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:13px;" />
              </div>
            </div>
          ` : ''}

          <!-- Explanation -->
          <div style="margin-bottom:14px;">
            <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Lời giải chi tiết</label>
            <textarea id="edit-q-explanation" style="width:100%; height:100px; font-family:'Fira Code', monospace; font-size:13px; padding:10px; border:1px solid #cbd5e1; border-radius:8px;">${promptData.explanation || ''}</textarea>
          </div>
        </div>

        <div style="padding:14px 24px; border-top:1px solid #e2e8f0; background:#f8fafc; display:flex; justify-content:flex-end; gap:12px;">
          <button id="edit-q-cancel-btn" class="btn-secondary" style="padding:9px 18px; font-size:13px; font-weight:600; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#475569; cursor:pointer;">
            Hủy
          </button>
          <button id="edit-q-submit-btn" class="btn-primary" style="padding:9px 24px; font-size:13px; font-weight:600; border-radius:8px; background:#0066cc; color:#ffffff; border:none; cursor:pointer;">
            Lưu thay đổi
          </button>
        </div>

      </div>
    </div>
  `

  const closeModal = () => { modalContainer.innerHTML = '' }
  document.getElementById('edit-q-close-btn')?.addEventListener('click', closeModal)
  document.getElementById('edit-q-cancel-btn')?.addEventListener('click', closeModal)
  document.getElementById('edit-q-backdrop')?.addEventListener('click', closeModal)

  document.getElementById('edit-q-submit-btn')?.addEventListener('click', async () => {
    promptData.text = document.getElementById('edit-q-prompt')?.value || ''
    promptData.explanation = document.getElementById('edit-q-explanation')?.value || ''

    const updatePayload = {
      id: q.id,
      grade_block: document.getElementById('edit-q-grade-block')?.value?.trim() || (cachedGradeBlocksList[0] || ''),
      difficulty: document.getElementById('edit-q-difficulty')?.value,
      points: Number(document.getElementById('edit-q-points')?.value) || 0.25,
      prompt: promptData
    }

    if (q.question_type === 'MULTIPLE_CHOICE') {
      updatePayload.mc_answer = document.getElementById('edit-q-mc')?.value?.trim().toUpperCase() || null
    } else if (q.question_type === 'SHORT_ANSWER') {
      updatePayload.sa_answer = document.getElementById('edit-q-sa')?.value?.trim() || null
      updatePayload.sa_tolerance = Number(document.getElementById('edit-q-tolerance')?.value) || 0
    }

    try {
      await api.updateQuestionInBank(updatePayload)
      showToast('Đã cập nhật câu hỏi thành công!', 'success')
      closeModal()
      await fetchAndRenderQuestions()
    } catch (err) {
      showToast('Lỗi khi cập nhật câu hỏi: ' + err.message, 'error')
    }
  })
}
