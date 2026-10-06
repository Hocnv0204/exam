import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { showToast } from '../components/toast.js'
import { state } from '../state.js'
import { api } from '../api.js'
import { parseExamMarkdown, renderMath, renderMarkdown, MATH_TEMPLATE, CHEM_TEMPLATE, compressImage } from '../utils/exam-parser.js'
import { renderPaginationBar, bindPaginationEvents } from '../components/pagination.js'

// ========================================================
// View State
// ========================================================
function escapeHtmlAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function escapeTextarea(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
let allQuestions = []
let allClasses = []
let cachedGradeBlocksList = []

let selectedQuestionIds = new Set()

let filterState = {
  gradeBlock: '',
  classId: '',
  chapterId: '',
  lessonId: '',
  lessonIds: [], // Hỗ trợ chọn nhiều bài học trong 1 chương
  questionType: '',
  difficulty: '',
  unassigned: '', // '' | 'no_class' | 'no_chapter' | 'no_lesson'
  search: '',
  page: 1,
  pageSize: 10
}

let mainFilterLessonsCache = []

let statsState = {
  total: 0,
  mc: 0,
  tf: 0,
  sa: 0,
  diffCounts: { NHAN_BIET: 0, THONG_HIEU: 0, VAN_DUNG: 0, VAN_DUNG_CAO: 0 }
}

// Matrix Generator Preview Cache
let generatorState = {
  scopeMode: 'QUICK', // 'QUICK' | 'MULTI'
  scopeType: 'BLOCK', // 'BLOCK' | 'CLASS' | 'CHAPTER' | 'LESSON'
  gradeBlock: '',
  classId: '',
  chapterId: '',
  lessonId: '',
  selectedClassIds: [],
  selectedChapterIds: [],
  selectedLessonIds: [],
  currentScope: null,
  targetClassId: '',
  targetChapterId: '',
  targetLessonId: '',
  title: '',
  type: 'PRACTICE',
  durationMinutes: 90,
  passScore: 5.0,
  maxScore: 10.0,
  deadline: '',
  maxViolations: 3,
  showSolutions: false,
  mcCount: 12,
  tfCount: 4,
  saCount: 6,
  isAdvancedDistribution: false,
  distribution: [],
  previewQuestions: [],
  rejectedIds: [],
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

              <!-- Filter: Lesson (Multi-Select) -->
              <div style="position:relative;" id="qb-filter-lesson-wrap">
                <label style="display:flex; justify-content:space-between; align-items:center; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">
                  <span><i class="fa-solid fa-file-lines"></i> Bài học (Chọn nhiều)</span>
                  <span id="qb-filter-lesson-count-badge" style="display:none; font-size:11px; font-weight:700; background:#e0f2fe; color:#0284c7; padding:1px 6px; border-radius:999px;">0 bài</span>
                </label>
                <div id="qb-filter-lesson-trigger" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#f8fafc; color:#1e293b; cursor:pointer; display:flex; justify-content:space-between; align-items:center; user-select:none;">
                  <span id="qb-filter-lesson-display" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;">-- Tất cả Bài học --</span>
                  <i id="qb-filter-lesson-chevron" class="fa-solid fa-chevron-down" style="font-size:11px; color:#64748b; margin-left:6px; transition:transform 0.2s;"></i>
                </div>
                <!-- Dropdown panel -->
                <div id="qb-filter-lesson-dropdown" style="display:none; position:absolute; top:calc(100% + 4px); left:0; width:100%; min-width:270px; max-height:280px; overflow-y:auto; background:#ffffff; border:1px solid #cbd5e1; border-radius:8px; box-shadow:0 10px 15px -3px rgba(0,0,0,0.1); z-index:1000; padding:8px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid #f1f5f9;">
                    <button type="button" id="qb-lesson-select-all" style="font-size:11px; font-weight:600; color:#0284c7; background:none; border:none; cursor:pointer; padding:2px 4px;">Chọn tất cả</button>
                    <button type="button" id="qb-lesson-clear-all" style="font-size:11px; font-weight:600; color:#ef4444; background:none; border:none; cursor:pointer; padding:2px 4px;">Bỏ chọn</button>
                  </div>
                  <div id="qb-filter-lesson-list">
                    <div style="font-size:12px; color:#94a3b8; padding:8px; text-align:center;">Vui lòng chọn Chương học trước</div>
                  </div>
                </div>
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

              <!-- Filter: 3-State Unassigned (Phase 1.4) -->
              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">
                  <i class="fa-solid fa-triangle-exclamation" style="color:#f59e0b;"></i> Trạng thái phân loại
                </label>
                <select id="qb-filter-unassigned" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#f8fafc; color:#1e293b;">
                  <option value="">-- Tất cả trạng thái --</option>
                  <option value="no_class">Chưa gán Lớp học</option>
                  <option value="no_chapter">Chưa gán Chương</option>
                  <option value="no_lesson">Chưa gán Bài học</option>
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

          <!-- Sticky Bulk Action Toolbar (Phase 1.6) -->
          <div id="qb-bulk-bar" style="display:none; position:sticky; top:12px; z-index:100; margin-bottom:16px; padding:12px 18px; background:#0f172a; color:#ffffff; border-radius:12px; box-shadow:0 10px 25px -5px rgba(0,0,0,0.25); border:1px solid #334155; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:50%; background:#0284c7; color:#fff; font-size:14px;">
                <i class="fa-solid fa-check"></i>
              </span>
              <span style="font-size:13px; font-weight:700; color:#f8fafc;">
                Đã chọn <span id="qb-bulk-selected-count" style="color:#38bdf8;">0</span> câu hỏi
              </span>
            </div>
            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              <span style="font-size:12px; color:#94a3b8; font-weight:600;">Gán mức độ:</span>
              <select id="qb-bulk-diff-select" style="height:34px; padding:0 10px; border-radius:8px; border:1px solid #475569; background:#1e293b; color:#ffffff; font-size:13px;">
                <option value="NHAN_BIET">Nhận biết</option>
                <option value="THONG_HIEU">Thông hiểu</option>
                <option value="VAN_DUNG">Vận dụng</option>
                <option value="VAN_DUNG_CAO">Vận dụng cao</option>
              </select>
              <button id="qb-bulk-apply-btn" style="height:34px; padding:0 16px; border-radius:8px; border:none; background:linear-gradient(135deg, #0284c7, #0369a1); color:#ffffff; font-size:13px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-check-double"></i> Gán hàng loạt
              </button>
              <button id="qb-bulk-create-btn" style="height:34px; padding:0 16px; border-radius:8px; border:none; background:linear-gradient(135deg, #16a34a, #15803d); color:#ffffff; font-size:13px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-file-circle-plus"></i> Tạo đề từ đã chọn
              </button>
              <button id="qb-bulk-deselect-btn" style="height:34px; padding:0 12px; border-radius:8px; border:1px solid #475569; background:#1e293b; color:#cbd5e1; font-size:13px; cursor:pointer;">
                Bỏ chọn
              </button>
            </div>
          </div>

          <!-- Questions List Section -->
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <label style="display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:600; color:#334155; cursor:pointer; background:#f8fafc; padding:4px 10px; border-radius:6px; border:1px solid #e2e8f0;">
                <input type="checkbox" id="qb-select-all-page" style="width:16px; height:16px; accent-color:#0284c7; cursor:pointer;" />
                Chọn tất cả trang này
              </label>
              <span style="font-size:13px; color:#64748b;">
                (<span id="qb-current-count">0</span> câu hỏi)
              </span>
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
  bindSidebarEvents()
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

    // 1. Fetch fresh classes from API
    const rawClasses = await api.getClasses()
    allClasses = (rawClasses || []).map(c => ({
      id: c.id,
      name: c.name,
      gradeBlock: c.gradeBlock || c.grade_block || '12-Toán',
      studentsCount: c.studentsCount || 0,
      tuitionFee: c.tuitionFee || 0,
      progress: 0
    }))
    state.classes = allClasses

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
    if (filterState.lessonIds && filterState.lessonIds.length > 0) {
      params += `lessonIds=${encodeURIComponent(filterState.lessonIds.join(','))}&`
    } else if (filterState.lessonId) {
      params += `lessonId=${filterState.lessonId}&`
    }
    if (filterState.unassigned) params += `unassigned=${filterState.unassigned}&`

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
  const lessonWrap = document.getElementById('qb-filter-lesson-wrap')
  const lessonTrigger = document.getElementById('qb-filter-lesson-trigger')
  const lessonDropdown = document.getElementById('qb-filter-lesson-dropdown')
  const lessonChevron = document.getElementById('qb-filter-lesson-chevron')
  const typeSelect = document.getElementById('qb-filter-type')
  const diffSelect = document.getElementById('qb-filter-difficulty')
  const unassignedSelect = document.getElementById('qb-filter-unassigned')
  const searchInput = document.getElementById('qb-search-input')
  const resetBtn = document.getElementById('qb-btn-reset-filters')

  // Toggle Lesson Multi-Select Dropdown
  lessonTrigger?.addEventListener('click', (e) => {
    e.stopPropagation()
    const isOpen = lessonDropdown?.style.display === 'block'
    if (lessonDropdown) lessonDropdown.style.display = isOpen ? 'none' : 'block'
    if (lessonChevron) lessonChevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)'
  })

  // Select all lessons in chapter
  document.getElementById('qb-lesson-select-all')?.addEventListener('click', async (e) => {
    e.stopPropagation()
    if (mainFilterLessonsCache.length === 0) return
    filterState.lessonIds = mainFilterLessonsCache.map(l => l.id)
    filterState.lessonId = ''
    renderMainFilterLessonCheckboxes()
    updateMainFilterLessonDisplay()
    filterState.page = 1
    await fetchAndRenderQuestions({ includeStats: true })
    await refreshStats()
  })

  // Clear all lessons
  document.getElementById('qb-lesson-clear-all')?.addEventListener('click', async (e) => {
    e.stopPropagation()
    filterState.lessonIds = []
    filterState.lessonId = ''
    renderMainFilterLessonCheckboxes()
    updateMainFilterLessonDisplay()
    filterState.page = 1
    await fetchAndRenderQuestions({ includeStats: true })
    await refreshStats()
  })

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!lessonWrap?.contains(e.target)) {
      if (lessonDropdown) lessonDropdown.style.display = 'none'
      if (lessonChevron) lessonChevron.style.transform = 'rotate(0deg)'
    }
  })

  // Cascading: Khối học changed
  gradeBlockSelect?.addEventListener('change', async (e) => {
    filterState.gradeBlock = e.target.value
    filterState.classId = ''
    filterState.chapterId = ''
    filterState.lessonId = ''
    filterState.lessonIds = []
    filterState.page = 1
    selectedQuestionIds.clear()

    // Populate chapters from all classes in this gradeBlock
    if (filterState.gradeBlock) {
      await loadChaptersForGradeBlock(filterState.gradeBlock, chapterSelect)
    } else {
      chapterSelect.innerHTML = '<option value="">-- Tất cả Chương --</option>'
    }
    await populateMainFilterLessons('')

    await fetchAndRenderQuestions({ includeStats: true })
  })

  // Cascading: Chapter changed
  chapterSelect?.addEventListener('change', async (e) => {
    filterState.chapterId = e.target.value
    filterState.lessonId = ''
    filterState.lessonIds = []
    filterState.page = 1
    selectedQuestionIds.clear()

    await populateMainFilterLessons(filterState.chapterId)
    await fetchAndRenderQuestions({ includeStats: true })
  })

  // Type changed
  typeSelect?.addEventListener('change', async (e) => {
    filterState.questionType = e.target.value
    filterState.page = 1
    selectedQuestionIds.clear()
    await fetchAndRenderQuestions()
  })

  // Difficulty changed
  diffSelect?.addEventListener('change', async (e) => {
    filterState.difficulty = e.target.value
    filterState.page = 1
    selectedQuestionIds.clear()
    await fetchAndRenderQuestions()
  })

  // Unassigned filter changed (Phase 1.4)
  unassignedSelect?.addEventListener('change', async (e) => {
    filterState.unassigned = e.target.value
    filterState.page = 1
    selectedQuestionIds.clear()
    await fetchAndRenderQuestions({ includeStats: true })
  })

  // Search input with debounce
  let searchTimer
  searchInput?.addEventListener('input', (e) => {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(async () => {
      filterState.search = e.target.value
      filterState.page = 1
      selectedQuestionIds.clear()
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
      lessonIds: [],
      questionType: '',
      difficulty: '',
      unassigned: '',
      search: '',
      page: 1,
      pageSize: 10
    }
    selectedQuestionIds.clear()
    mainFilterLessonsCache = []
    if (gradeBlockSelect) gradeBlockSelect.value = ''
    if (chapterSelect) chapterSelect.innerHTML = '<option value="">-- Tất cả Chương --</option>'
    updateMainFilterLessonDisplay()
    const listContainer = document.getElementById('qb-filter-lesson-list')
    if (listContainer) listContainer.innerHTML = '<div style="font-size:12px; color:#94a3b8; padding:8px; text-align:center;">Vui lòng chọn Chương học trước</div>'
    if (typeSelect) typeSelect.value = ''
    if (diffSelect) diffSelect.value = ''
    if (unassignedSelect) unassignedSelect.value = ''
    if (searchInput) searchInput.value = ''

    await fetchAndRenderQuestions({ includeStats: true })
  })
}

async function populateMainFilterLessons(chapterId) {
  const listContainer = document.getElementById('qb-filter-lesson-list')
  if (!listContainer) return

  filterState.lessonIds = []
  filterState.lessonId = ''
  updateMainFilterLessonDisplay()

  if (!chapterId) {
    mainFilterLessonsCache = []
    listContainer.innerHTML = '<div style="font-size:12px; color:#94a3b8; padding:8px; text-align:center;">Vui lòng chọn Chương học trước</div>'
    return
  }

  listContainer.innerHTML = '<div style="font-size:12px; color:#94a3b8; padding:8px; text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải bài học...</div>'

  try {
    const lessons = await api.getLessons(chapterId)
    mainFilterLessonsCache = lessons || []
    if (mainFilterLessonsCache.length === 0) {
      listContainer.innerHTML = '<div style="font-size:12px; color:#94a3b8; padding:8px; text-align:center;">Chương này chưa có bài học nào</div>'
      return
    }

    renderMainFilterLessonCheckboxes()
  } catch (e) {
    listContainer.innerHTML = '<div style="font-size:12px; color:#ef4444; padding:8px; text-align:center;">Không thể tải danh sách bài học</div>'
  }
}

function renderMainFilterLessonCheckboxes() {
  const listContainer = document.getElementById('qb-filter-lesson-list')
  if (!listContainer) return

  let html = ''
  mainFilterLessonsCache.forEach(l => {
    const isChecked = filterState.lessonIds.includes(l.id)
    html += `
      <label style="display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:6px; cursor:pointer; font-size:12px; color:#334155;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">
        <input type="checkbox" class="chk-qb-filter-lesson" value="${l.id}" data-title="${l.title.replace(/"/g, '&quot;')}" ${isChecked ? 'checked' : ''} style="width:14px; height:14px; cursor:pointer;" />
        <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${l.title}">${l.title}</span>
      </label>
    `
  })

  listContainer.innerHTML = html

  listContainer.querySelectorAll('.chk-qb-filter-lesson').forEach(chk => {
    chk.addEventListener('change', async () => {
      const lId = chk.value
      if (chk.checked) {
        if (!filterState.lessonIds.includes(lId)) filterState.lessonIds.push(lId)
      } else {
        filterState.lessonIds = filterState.lessonIds.filter(id => id !== lId)
      }
      updateMainFilterLessonDisplay()
      filterState.page = 1
      await fetchAndRenderQuestions({ includeStats: true })
      await refreshStats()
    })
  })
}

function updateMainFilterLessonDisplay() {
  const countBadge = document.getElementById('qb-filter-lesson-count-badge')
  const displayLabel = document.getElementById('qb-filter-lesson-display')
  const total = filterState.lessonIds.length

  if (total === 0) {
    if (displayLabel) displayLabel.textContent = '-- Tất cả Bài học --'
    if (countBadge) countBadge.style.display = 'none'
  } else if (total === 1) {
    const firstLesson = mainFilterLessonsCache.find(l => l.id === filterState.lessonIds[0])
    if (displayLabel) displayLabel.textContent = firstLesson ? firstLesson.title : 'Đã chọn 1 bài'
    if (countBadge) {
      countBadge.style.display = 'inline-block'
      countBadge.textContent = '1 bài'
    }
  } else {
    if (displayLabel) displayLabel.textContent = `Đã chọn ${total} bài học`
    if (countBadge) {
      countBadge.style.display = 'inline-block'
      countBadge.textContent = `${total} bài`
    }
  }
}

async function loadChaptersForGradeBlock(gradeBlock, targetSelect) {
  if (!targetSelect) return
  targetSelect.innerHTML = '<option value="">Đang tải chương...</option>'
  try {
    const targetClasses = (allClasses || []).filter(c => !gradeBlock || (c.gradeBlock || c.grade_block) === gradeBlock)
    let combinedChapters = []
    await Promise.all(targetClasses.map(async (c) => {
      const chs = await api.getChapters(c.id, true)
      const list = (chs || []).map(ch => ({
        ...ch,
        className: c.name
      }))
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
    const chapters = await api.getChapters(classId, true)
    let html = '<option value="">-- Tất cả Chương --</option>'
    ;(chapters || []).forEach(ch => {
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
    const lessons = await api.getLessons(chapterId)
    let html = '<option value="">-- Tất cả Bài học --</option>'
    ;(lessons || []).forEach(l => {
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
    if (filterState.lessonIds && filterState.lessonIds.length > 0) {
      paramsObj.set('lessonIds', filterState.lessonIds.join(','))
    } else if (filterState.lessonId) {
      paramsObj.set('lessonId', filterState.lessonId)
    }
    if (filterState.questionType) paramsObj.set('questionType', filterState.questionType)
    if (filterState.difficulty) paramsObj.set('difficulty', filterState.difficulty)
    if (filterState.unassigned) paramsObj.set('unassigned', filterState.unassigned)
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
      updateBulkActionBar()
      return
    }

    let cardsHtml = ''
    const startNumber = (filterState.page - 1) * filterState.pageSize
    allQuestions.forEach((q, idx) => {
      cardsHtml += renderQuestionCard(q, startNumber + idx + 1)
    })

    container.innerHTML = cardsHtml

    // Update Bulk Action Toolbar
    updateBulkActionBar()

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
          <label style="display:inline-flex; align-items:center; cursor:pointer; margin-right:2px;" title="Chọn câu hỏi này">
            <input type="checkbox" class="qb-select-card-chk" data-id="${q.id}" ${selectedQuestionIds.has(q.id) ? 'checked' : ''} style="width:16px; height:16px; accent-color:#0284c7; cursor:pointer;" />
          </label>
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

function updateBulkActionBar() {
  const bar = document.getElementById('qb-bulk-bar')
  const countEl = document.getElementById('qb-bulk-selected-count')
  const selectAllPage = document.getElementById('qb-select-all-page')
  if (!bar) return

  const count = selectedQuestionIds.size
  if (count > 0) {
    bar.style.display = 'flex'
    if (countEl) countEl.textContent = count
  } else {
    bar.style.display = 'none'
  }

  if (selectAllPage && allQuestions.length > 0) {
    const allSelected = allQuestions.every(q => selectedQuestionIds.has(q.id))
    const someSelected = allQuestions.some(q => selectedQuestionIds.has(q.id))
    selectAllPage.checked = allSelected
    selectAllPage.indeterminate = someSelected && !allSelected
  } else if (selectAllPage) {
    selectAllPage.checked = false
    selectAllPage.indeterminate = false
  }
}

function bindQuestionCardEvents(container) {
  // Checkbox toggle selection
  container.querySelectorAll('.qb-select-card-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      const qId = chk.getAttribute('data-id')
      if (chk.checked) {
        selectedQuestionIds.add(qId)
      } else {
        selectedQuestionIds.delete(qId)
      }
      updateBulkActionBar()
    })
  })

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
        selectedQuestionIds.delete(qId)
        updateBulkActionBar()
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

  // Bulk action toolbar bindings (Phase 1.6)
  document.getElementById('qb-select-all-page')?.addEventListener('change', (e) => {
    const isChecked = e.target.checked
    allQuestions.forEach(q => {
      if (isChecked) selectedQuestionIds.add(q.id)
      else selectedQuestionIds.delete(q.id)
    })
    document.querySelectorAll('.qb-select-card-chk').forEach(chk => {
      chk.checked = isChecked
    })
    updateBulkActionBar()
  })

  document.getElementById('qb-bulk-deselect-btn')?.addEventListener('click', () => {
    selectedQuestionIds.clear()
    document.querySelectorAll('.qb-select-card-chk').forEach(chk => {
      chk.checked = false
    })
    updateBulkActionBar()
  })

  document.getElementById('qb-bulk-apply-btn')?.addEventListener('click', async () => {
    if (selectedQuestionIds.size === 0) {
      return showToast('Vui lòng chọn ít nhất một câu hỏi để gán mức độ!', 'warning')
    }
    const ids = Array.from(selectedQuestionIds)
    const diffSelect = document.getElementById('qb-bulk-diff-select')
    const newDiff = diffSelect?.value || 'THONG_HIEU'
    const applyBtn = document.getElementById('qb-bulk-apply-btn')

    applyBtn.disabled = true
    applyBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gán...'

    try {
      const res = await api.updateQuestionInBank({ ids, difficulty: newDiff })
      showToast(res.message || `Đã cập nhật mức độ cho ${ids.length} câu hỏi thành công!`, 'success')
      selectedQuestionIds.clear()
      updateBulkActionBar()
      await refreshStats()
      await fetchAndRenderQuestions()
    } catch (err) {
      showToast('Lỗi khi gán mức độ hàng loạt: ' + err.message, 'error')
    } finally {
      applyBtn.disabled = false
      applyBtn.innerHTML = '<i class="fa-solid fa-check-double"></i> Gán hàng loạt'
    }
  })

  document.getElementById('qb-bulk-create-btn')?.addEventListener('click', () => {
    if (selectedQuestionIds.size === 0) {
      return showToast('Vui lòng tick chọn ít nhất một câu hỏi trong danh sách!', 'warning')
    }
    openCreateFromSelectedModal(Array.from(selectedQuestionIds))
  })
}

function openCreateFromSelectedModal(questionBankIds) {
  const modalContainer = document.getElementById('qb-modal-container')
  if (!modalContainer) return
  modalContainer.innerHTML = `
    <div class="modal-backdrop" id="create-selected-backdrop" style="position:fixed; inset:0; background:rgba(15,23,42,0.6); z-index:9999; display:flex; align-items:center; justify-content:center; padding:16px;">
      <div class="modal-content" onclick="event.stopPropagation()" style="width:100%; max-width:640px; background:#ffffff; border-radius:16px; overflow:hidden;">
        <div style="padding:18px 24px; border-bottom:1px solid #e2e8f0; background:#f0fdf4; display:flex; justify-content:space-between; align-items:center;">
          <h3 style="font-size:17px; font-weight:700; color:#0f172a; margin:0;">Tạo đề từ ${questionBankIds.length} câu đã chọn</h3>
          <button id="create-selected-close-btn" style="background:none; border:none; font-size:20px; color:#94a3b8; cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div style="padding:20px 24px; display:flex; flex-direction:column; gap:12px;">
          <div>
            <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Tên đề / bài tập *</label>
            <input type="text" id="create-selected-title" placeholder="Ví dụ: Đề ôn tập chương 1" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:13px;" />
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Lớp đích *</label>
              <select id="create-selected-class" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px;">
                <option value="">-- Chọn lớp --</option>
                ${allClasses.map(c => `<option value="${c.id}">${escapeHtmlAttr(c.name)}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Loại đề</label>
              <select id="create-selected-type" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px;">
                <option value="PRACTICE">Bài luyện tập</option>
                <option value="EXAM">Bài thi</option>
              </select>
            </div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Chương đích</label>
              <select id="create-selected-chapter" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px;"><option value="">-- Chọn lớp trước --</option></select>
            </div>
            <div>
              <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Bài học đích *</label>
              <select id="create-selected-lesson" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px;"><option value="">-- Chọn chương trước --</option></select>
            </div>
          </div>
          <div>
            <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Thời gian làm bài (phút)</label>
            <input type="number" id="create-selected-duration" value="90" min="5" style="width:120px; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:13px;" />
          </div>
        </div>
        <div style="padding:14px 24px; border-top:1px solid #e2e8f0; background:#f8fafc; display:flex; justify-content:flex-end; gap:12px;">
          <button id="create-selected-cancel-btn" style="padding:9px 18px; font-size:13px; font-weight:600; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; cursor:pointer;">Hủy</button>
          <button id="create-selected-submit-btn" style="padding:9px 24px; font-size:13px; font-weight:600; border-radius:8px; background:#16a34a; color:#ffffff; border:none; cursor:pointer;">Tạo đề</button>
        </div>
      </div>
    </div>
  `
  const closeModal = () => { modalContainer.innerHTML = '' }
  document.getElementById('create-selected-close-btn')?.addEventListener('click', closeModal)
  document.getElementById('create-selected-cancel-btn')?.addEventListener('click', closeModal)
  document.getElementById('create-selected-backdrop')?.addEventListener('click', (e) => { if (e.target.id === 'create-selected-backdrop') closeModal() })
  const classSel = document.getElementById('create-selected-class')
  const chapterSel = document.getElementById('create-selected-chapter')
  const lessonSel = document.getElementById('create-selected-lesson')
  classSel?.addEventListener('change', async (e) => {
    const clId = e.target.value
    chapterSel.innerHTML = '<option value="">Đang tải...</option>'
    lessonSel.innerHTML = '<option value="">-- Chọn chương trước --</option>'
    if (!clId) { chapterSel.innerHTML = '<option value="">-- Chọn lớp trước --</option>'; return }
    try {
      const chapters = await api.getChapters(clId, true)
      chapterSel.innerHTML = '<option value="">-- Chọn chương --</option>' + (chapters || []).map(ch => `<option value="${ch.id}">${escapeHtmlAttr(ch.title)}</option>`).join('')
    } catch (_) { chapterSel.innerHTML = '<option value="">Lỗi tải chương</option>' }
  })
  chapterSel?.addEventListener('change', async (e) => {
    const chId = e.target.value
    lessonSel.innerHTML = '<option value="">Đang tải...</option>'
    if (!chId) { lessonSel.innerHTML = '<option value="">-- Chọn chương trước --</option>'; return }
    try {
      const lessons = await api.getLessons(chId)
      lessonSel.innerHTML = '<option value="">-- Chọn bài học --</option>' + (lessons || []).map(l => `<option value="${l.id}">${escapeHtmlAttr(l.title)}</option>`).join('')
    } catch (_) { lessonSel.innerHTML = '<option value="">Lỗi tải bài học</option>' }
  })
  document.getElementById('create-selected-submit-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget
    const title = document.getElementById('create-selected-title')?.value.trim()
    const targetLessonId = lessonSel?.value
    const type = document.getElementById('create-selected-type')?.value || 'PRACTICE'
    const durationMinutes = Number(document.getElementById('create-selected-duration')?.value) || 90
    if (!title) return showToast('Vui lòng nhập tên đề!', 'warning')
    if (!targetLessonId) return showToast('Vui lòng chọn bài học đích!', 'warning')
    btn.disabled = true
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo...'
    try {
      const res = await api.createHomeworkFromBankQuestions({ targetLessonId, title, type, durationMinutes, questionBankIds })
      showToast(res.message || 'Đã tạo đề thành công!', 'success')
      selectedQuestionIds.clear()
      updateBulkActionBar()
      closeModal()
    } catch (err) {
      showToast('Lỗi tạo đề: ' + err.message, 'error')
      btn.disabled = false
      btn.textContent = 'Tạo đề'
    }
  })
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

          <!-- Live Parse Summary & Difficulty Breakdown (Phase 1.2 & 1.5) -->
          <div id="md-parse-summary" style="margin-bottom:14px; padding:12px 16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; font-size:13px; display:flex; flex-direction:column; gap:10px;">
            <!-- Types summary -->
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span style="font-weight:700; color:#334155;">Dạng câu:</span>
              <span id="md-cnt-mc" style="font-weight:600; color:#16a34a; background:#f0fdf4; padding:2px 8px; border-radius:6px; border:1px solid #bbf7d0;">0 Trắc nghiệm ABCD</span>
              <span id="md-cnt-tf" style="font-weight:600; color:#d97706; background:#fffbeb; padding:2px 8px; border-radius:6px; border:1px solid #fde68a;">0 Đúng/Sai</span>
              <span id="md-cnt-sa" style="font-weight:600; color:#9333ea; background:#faf5ff; padding:2px 8px; border-radius:6px; border:1px solid #e9d5ff;">0 Trả lời ngắn</span>
              <span style="margin-left:auto; font-size:13px; font-weight:700; color:#0284c7;" id="md-cnt-total">Tổng: 0 câu</span>
            </div>

            <!-- Cognitive Level summary pills -->
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding-top:8px; border-top:1px dashed #e2e8f0;">
              <span style="font-size:12px; font-weight:700; color:#475569;">Mức độ:</span>
              <span id="md-diff-nb" style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:6px; background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0;">0 Nhận biết</span>
              <span id="md-diff-th" style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:6px; background:#eff6ff; color:#0284c7; border:1px solid #bfdbfe;">0 Thông hiểu</span>
              <span id="md-diff-vd" style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:6px; background:#fffbeb; color:#d97706; border:1px solid #fde68a;">0 Vận dụng</span>
              <span id="md-diff-vdc" style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:6px; background:#faf5ff; color:#9333ea; border:1px solid #e9d5ff;">0 Vận dụng cao</span>

              <!-- Toggle Preview List Button -->
              <button id="md-toggle-preview-btn" type="button" style="margin-left:auto; font-size:12px; font-weight:600; padding:4px 12px; border-radius:6px; border:1px solid #cbd5e1; background:#ffffff; color:#334155; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-list-check" style="color:#0284c7;"></i> Xem & Chỉnh mức độ từng câu (<span id="md-btn-preview-count">0</span>)
              </button>
            </div>
          </div>

          <!-- Preview & Difficulty Adjustment Pane -->
          <div id="md-preview-pane" style="display:none; margin-bottom:14px; border:1px solid #e2e8f0; border-radius:12px; background:#ffffff; overflow:hidden;">
            <div style="padding:10px 14px; background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
              <span style="font-size:13px; font-weight:700; color:#334155;">
                <i class="fa-solid fa-sliders" style="color:#0284c7;"></i> Chỉnh sửa mức độ từng câu trước khi lưu
              </span>
              <!-- Fast apply for all in modal -->
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:12px; color:#64748b;">Gán tất cả thành:</span>
                <select id="md-bulk-all-diff" style="height:30px; font-size:12px; padding:0 6px; border-radius:6px; border:1px solid #cbd5e1; background:#ffffff;">
                  <option value="NHAN_BIET">Nhận biết</option>
                  <option value="THONG_HIEU" selected>Thông hiểu</option>
                  <option value="VAN_DUNG">Vận dụng</option>
                  <option value="VAN_DUNG_CAO">Vận dụng cao</option>
                </select>
                <button id="md-btn-bulk-all-diff" type="button" style="height:30px; padding:0 10px; font-size:12px; font-weight:600; border-radius:6px; border:none; background:#0284c7; color:#ffffff; cursor:pointer;">
                  Áp dụng
                </button>
              </div>
            </div>
            <div id="md-preview-questions-list" style="max-height:280px; overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:10px;">
              <!-- Question rows render here -->
            </div>
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
  const previewPane = document.getElementById('md-preview-pane')
  const togglePreviewBtn = document.getElementById('md-toggle-preview-btn')

  let parsedQuestions = []

  // Toggle preview pane
  togglePreviewBtn?.addEventListener('click', () => {
    if (!previewPane) return
    const isHidden = previewPane.style.display === 'none'
    previewPane.style.display = isHidden ? 'block' : 'none'
    if (isHidden) renderParsedPreviewList()
  })

  // Bulk apply difficulty inside modal
  document.getElementById('md-btn-bulk-all-diff')?.addEventListener('click', () => {
    const val = document.getElementById('md-bulk-all-diff')?.value || 'THONG_HIEU'
    parsedQuestions.forEach(q => { q.difficulty = val })
    renderParsedSummaryAndList()
    showToast(`Đã gán mức độ cho toàn bộ ${parsedQuestions.length} câu!`, 'success')
  })

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
    parsedQuestions = res?.questions || []
    const defaultDiff = document.getElementById('md-target-difficulty')?.value || 'THONG_HIEU'

    // If question has no difficulty tag, set it to defaultDiff initially
    parsedQuestions.forEach(q => {
      if (!q.difficulty) q.difficulty = defaultDiff
    })

    renderParsedSummaryAndList()
  }

  function renderParsedSummaryAndList() {
    const mc = parsedQuestions.filter(q => q.questionType === 'MULTIPLE_CHOICE').length
    const tf = parsedQuestions.filter(q => q.questionType === 'TRUE_FALSE').length
    const sa = parsedQuestions.filter(q => q.questionType === 'SHORT_ANSWER').length

    const nb = parsedQuestions.filter(q => q.difficulty === 'NHAN_BIET').length
    const th = parsedQuestions.filter(q => q.difficulty === 'THONG_HIEU').length
    const vd = parsedQuestions.filter(q => q.difficulty === 'VAN_DUNG').length
    const vdc = parsedQuestions.filter(q => q.difficulty === 'VAN_DUNG_CAO').length

    document.getElementById('md-cnt-mc').textContent = `${mc} Trắc nghiệm`
    document.getElementById('md-cnt-tf').textContent = `${tf} Đúng/Sai`
    document.getElementById('md-cnt-sa').textContent = `${sa} Trả lời ngắn`
    document.getElementById('md-cnt-total').textContent = `Tổng: ${parsedQuestions.length} câu`

    document.getElementById('md-diff-nb').textContent = `${nb} Nhận biết`
    document.getElementById('md-diff-th').textContent = `${th} Thông hiểu`
    document.getElementById('md-diff-vd').textContent = `${vd} Vận dụng`
    document.getElementById('md-diff-vdc').textContent = `${vdc} Vận dụng cao`

    const btnCount = document.getElementById('md-btn-preview-count')
    if (btnCount) btnCount.textContent = parsedQuestions.length

    if (previewPane && previewPane.style.display !== 'none') {
      renderParsedPreviewList()
    }
  }

  function renderParsedPreviewList() {
    const container = document.getElementById('md-preview-questions-list')
    if (!container) return

    if (parsedQuestions.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:16px; color:#94a3b8; font-size:13px;">Chưa có câu hỏi nào được nhận diện</div>'
      return
    }

    let html = ''
    parsedQuestions.forEach((q, idx) => {
      const promptSnippet = (q.promptText || '').slice(0, 100) + ((q.promptText || '').length > 100 ? '...' : '')
      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:8px 12px; border:1px solid #e2e8f0; border-radius:8px; background:#f8fafc; font-size:13px;">
          <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:0;">
            <span style="font-weight:700; color:#334155; flex-shrink:0;">Câu ${idx + 1}</span>
            <span style="font-size:11px; font-weight:700; padding:2px 6px; border-radius:4px; background:#eff6ff; color:#0284c7; flex-shrink:0;">
              ${q.questionType === 'TRUE_FALSE' ? 'Đúng/Sai' : (q.questionType === 'SHORT_ANSWER' ? 'Trả lời ngắn' : 'Trắc nghiệm')}
            </span>
            <span style="color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:12px;">
              ${promptSnippet}
            </span>
          </div>
          <div style="flex-shrink:0;">
            <select class="md-item-diff-select" data-index="${idx}" style="height:30px; font-size:12px; font-weight:600; padding:0 8px; border-radius:6px; border:1px solid #cbd5e1; background:#ffffff;">
              <option value="NHAN_BIET" ${q.difficulty === 'NHAN_BIET' ? 'selected' : ''}>Nhận biết</option>
              <option value="THONG_HIEU" ${q.difficulty === 'THONG_HIEU' ? 'selected' : ''}>Thông hiểu</option>
              <option value="VAN_DUNG" ${q.difficulty === 'VAN_DUNG' ? 'selected' : ''}>Vận dụng</option>
              <option value="VAN_DUNG_CAO" ${q.difficulty === 'VAN_DUNG_CAO' ? 'selected' : ''}>Vận dụng cao</option>
            </select>
          </div>
        </div>
      `
    })

    container.innerHTML = html

    // Bind change events for each item
    container.querySelectorAll('.md-item-diff-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const qIdx = parseInt(sel.getAttribute('data-index'), 10)
        if (parsedQuestions[qIdx]) {
          parsedQuestions[qIdx].difficulty = e.target.value
          const nb = parsedQuestions.filter(q => q.difficulty === 'NHAN_BIET').length
          const th = parsedQuestions.filter(q => q.difficulty === 'THONG_HIEU').length
          const vd = parsedQuestions.filter(q => q.difficulty === 'VAN_DUNG').length
          const vdc = parsedQuestions.filter(q => q.difficulty === 'VAN_DUNG_CAO').length
          document.getElementById('md-diff-nb').textContent = `${nb} Nhận biết`
          document.getElementById('md-diff-th').textContent = `${th} Thông hiểu`
          document.getElementById('md-diff-vd').textContent = `${vd} Vận dụng`
          document.getElementById('md-diff-vdc').textContent = `${vdc} Vận dụng cao`
        }
      })
    })
  }

  // Submit
  document.getElementById('import-md-submit-btn')?.addEventListener('click', async () => {
    const text = editor?.value || ''
    if (!text.trim()) {
      return showToast('Vui lòng nhập hoặc dán nội dung Markdown câu hỏi!', 'warning')
    }

    if (parsedQuestions.length === 0) {
      updateParsedCounters(text)
    }

    if (parsedQuestions.length === 0) {
      return showToast('Không tìm thấy câu hỏi hợp lệ nào trong văn bản Markdown!', 'error')
    }

    const defaultDifficulty = document.getElementById('md-target-difficulty')?.value || 'THONG_HIEU'
    const finalQuestions = parsedQuestions.map(q => ({
      ...q,
      difficulty: q.difficulty || defaultDifficulty
    }))

    const payload = {
      subject: 'TOAN',
      gradeLevel: 12,
      classId: classSel?.value || null,
      chapterId: chapterSel?.value || null,
      lessonId: lessonSel?.value || null,
      defaultDifficulty,
      questions: finalQuestions
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
  generatorState.rejectedIds = []
  generatorState.selectedClassIds = []
  generatorState.selectedChapterIds = []
  generatorState.selectedLessonIds = []
  generatorState.scopeMode = 'QUICK'
  generatorState.scopeType = 'BLOCK'

  const customBlocks = (allClasses || []).map(c => c.gradeBlock || c.grade_block).filter(Boolean)
  const uniqueBlocks = Array.from(new Set([...(cachedGradeBlocksList || []), ...customBlocks]))
  if (!generatorState.gradeBlock && uniqueBlocks.length > 0) {
    generatorState.gradeBlock = uniqueBlocks[0]
  }

  // Cache for dynamically loaded tree nodes (chapters & lessons)
  const treeDataCache = {
    chapters: {}, // classId -> chapters[]
    lessons: {}   // chapterId -> lessons[]
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
                Bốc ngẫu nhiên theo Khối, Lớp, Chương hoặc Bài; hỗ trợ chọn nhiều mục dạng cây và kiểm tra số lượng tức thời
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
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
              <div style="font-size:13px; font-weight:700; color:#334155; display:flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-bullseye" style="color:#0284c7;"></i> 1. Phạm vi bốc câu hỏi từ Ngân hàng
              </div>

              <!-- Scope Mode Selector Tabs -->
              <div style="display:flex; background:#e2e8f0; border-radius:8px; padding:3px; gap:4px;">
                <button type="button" id="scope-mode-quick-btn" style="border:none; padding:5px 12px; font-size:12px; font-weight:600; border-radius:6px; background:#ffffff; color:#0284c7; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.05); transition:all 0.15s ease;">
                  <i class="fa-solid fa-bolt"></i> Phạm vi đơn (Nhanh)
                </button>
                <button type="button" id="scope-mode-multi-btn" style="border:none; padding:5px 12px; font-size:12px; font-weight:600; border-radius:6px; background:transparent; color:#64748b; cursor:pointer; transition:all 0.15s ease;">
                  <i class="fa-solid fa-folder-tree"></i> Cây phân cấp (Nhiều Lớp / Chương / Bài)
                </button>
              </div>
            </div>

            <!-- Panel A: Quick Single-Scope Selector -->
            <div id="scope-quick-container">
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
            </div>

            <!-- Panel B: Tree-Checkbox Multi-Scope Selector -->
            <div id="scope-multi-container" style="display:none;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <label style="font-size:12px; font-weight:600; color:#475569;">Khối học:</label>
                  <select id="multi-scope-grade-block" style="height:32px; border:1px solid #cbd5e1; border-radius:6px; padding:0 8px; font-size:12px; background:#ffffff; font-weight:600; color:#0f172a;">
                    ${uniqueBlocks.map(b => `<option value="${b}" ${b === generatorState.gradeBlock ? 'selected' : ''}>${b}</option>`).join('')}
                  </select>
                  <span id="multi-selection-badge" style="background:#e0f2fe; color:#0369a1; padding:3px 10px; border-radius:999px; font-size:11px; font-weight:600;">
                    Đã chọn: 0 lớp, 0 chương, 0 bài
                  </span>
                </div>
                <div style="display:flex; gap:6px;">
                  <button type="button" id="multi-select-all-classes-btn" style="border:1px solid #cbd5e1; background:#ffffff; color:#334155; padding:4px 10px; font-size:11px; font-weight:600; border-radius:6px; cursor:pointer;">
                    <i class="fa-solid fa-check-double" style="color:#0284c7;"></i> Chọn tất cả Lớp
                  </button>
                  <button type="button" id="multi-clear-selection-btn" style="border:1px solid #cbd5e1; background:#ffffff; color:#dc2626; padding:4px 10px; font-size:11px; font-weight:600; border-radius:6px; cursor:pointer;">
                    <i class="fa-solid fa-xmark"></i> Bỏ chọn hết
                  </button>
                </div>
              </div>

              <!-- Tree View Container -->
              <div id="multi-scope-tree-container" style="max-height:260px; overflow-y:auto; border:1px solid #cbd5e1; border-radius:8px; background:#ffffff; padding:10px;">
                <!-- Dynamically rendered tree -->
              </div>
            </div>

            <!-- Live Availability Checker Banner with Deficit Alerts -->
            <div id="gen-avail-banner" style="margin-top:14px; padding:12px 16px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; font-size:13px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              <span style="font-weight:700; color:#1e40af;"><i class="fa-solid fa-circle-info"></i> Khả dụng:</span>
              <span id="avail-mc-badge" style="padding:3px 10px; border-radius:6px; font-weight:600; background:#dcfce7; color:#15803d; border:1px solid #86efac; display:inline-flex; align-items:center; gap:5px;">
                <i class="fa-solid fa-check"></i> <span id="avail-mc">0</span> Trắc nghiệm
              </span>
              <span id="avail-tf-badge" style="padding:3px 10px; border-radius:6px; font-weight:600; background:#fef3c7; color:#b45309; border:1px solid #fcd34d; display:inline-flex; align-items:center; gap:5px;">
                <i class="fa-solid fa-check"></i> <span id="avail-tf">0</span> Đúng / Sai
              </span>
              <span id="avail-sa-badge" style="padding:3px 10px; border-radius:6px; font-weight:600; background:#f3e8ff; color:#7e22ce; border:1px solid #d8b4fe; display:inline-flex; align-items:center; gap:5px;">
                <i class="fa-solid fa-check"></i> <span id="avail-sa">0</span> Trả lời ngắn
              </span>
              <span id="avail-total" style="margin-left:auto; font-weight:700; color:#0369a1;">Tổng có: 0 câu</span>
            </div>
          </div>

          <!-- Matrix Configuration Box -->
          <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:16px; margin-bottom:18px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:8px;">
              <div style="font-size:13px; font-weight:700; color:#334155; display:flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-table-cells" style="color:#0284c7;"></i> 2. Ma trận số lượng câu hỏi theo chuẩn Bộ GD&ĐT
              </div>
              <label style="display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:#0284c7; cursor:pointer; background:#f0f9ff; padding:5px 12px; border-radius:6px; border:1px solid #bae6fd;">
                <input type="checkbox" id="gen-matrix-advanced-toggle" style="width:15px; height:15px; cursor:pointer;" />
                <i class="fa-solid fa-layer-group"></i> Phân bổ chi tiết 4 mức độ (NB - TH - VD - VDC)
              </label>
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:14px;">
              
              <!-- MC Count -->
              <div style="padding:12px; border:1px solid #bbf7d0; border-radius:10px; background:#f0fdf4;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                  <span style="font-size:12px; font-weight:700; color:#166534;">PHẦN I: Trắc nghiệm ABCD</span>
                  <span id="mc-deficit-alert" style="font-size:11px; font-weight:600; color:#16a34a;">Khả dụng: 0</span>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <input type="number" id="gen-matrix-mc" min="0" value="12" style="width:80px; height:38px; border:1px solid #86efac; border-radius:8px; padding:0 10px; font-size:15px; font-weight:700; color:#14532d; background:#ffffff;" />
                  <span style="font-size:13px; color:#166534;">câu (0.25đ / câu)</span>
                </div>

                <!-- MC Difficulty Subpanel -->
                <div class="matrix-difficulty-subpanel" id="mc-difficulty-subpanel" style="display:none; margin-top:10px; padding-top:10px; border-top:1px dashed #bbf7d0;">
                  <div style="font-size:11px; font-weight:700; color:#166534; margin-bottom:6px;">Chi tiết mức độ nhận thức:</div>
                  <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:6px;">
                    <div>
                      <label style="font-size:10px; font-weight:700; color:#1d4ed8; display:block;">NB</label>
                      <input type="number" id="gen-mc-nb" min="0" value="5" class="matrix-sub-input" data-part="mc" data-diff="NHAN_BIET" style="width:100%; height:28px; font-size:12px; font-weight:700; border:1px solid #bfdbfe; border-radius:6px; padding:0 4px; text-align:center;" />
                      <span class="sub-avail-chip" id="avail-mc-nb" style="font-size:9px; color:#64748b; display:block; text-align:center; margin-top:2px;">Có: 0</span>
                    </div>
                    <div>
                      <label style="font-size:10px; font-weight:700; color:#15803d; display:block;">TH</label>
                      <input type="number" id="gen-mc-th" min="0" value="4" class="matrix-sub-input" data-part="mc" data-diff="THONG_HIEU" style="width:100%; height:28px; font-size:12px; font-weight:700; border:1px solid #bbf7d0; border-radius:6px; padding:0 4px; text-align:center;" />
                      <span class="sub-avail-chip" id="avail-mc-th" style="font-size:9px; color:#64748b; display:block; text-align:center; margin-top:2px;">Có: 0</span>
                    </div>
                    <div>
                      <label style="font-size:10px; font-weight:700; color:#c2410c; display:block;">VD</label>
                      <input type="number" id="gen-mc-vd" min="0" value="2" class="matrix-sub-input" data-part="mc" data-diff="VAN_DUNG" style="width:100%; height:28px; font-size:12px; font-weight:700; border:1px solid #fed7aa; border-radius:6px; padding:0 4px; text-align:center;" />
                      <span class="sub-avail-chip" id="avail-mc-vd" style="font-size:9px; color:#64748b; display:block; text-align:center; margin-top:2px;">Có: 0</span>
                    </div>
                    <div>
                      <label style="font-size:10px; font-weight:700; color:#be185d; display:block;">VDC</label>
                      <input type="number" id="gen-mc-vdc" min="0" value="1" class="matrix-sub-input" data-part="mc" data-diff="VAN_DUNG_CAO" style="width:100%; height:28px; font-size:12px; font-weight:700; border:1px solid #fbcfe8; border-radius:6px; padding:0 4px; text-align:center;" />
                      <span class="sub-avail-chip" id="avail-mc-vdc" style="font-size:9px; color:#64748b; display:block; text-align:center; margin-top:2px;">Có: 0</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- TF Count -->
              <div style="padding:12px; border:1px solid #fde68a; border-radius:10px; background:#fffbeb;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                  <span style="font-size:12px; font-weight:700; color:#92400e;">PHẦN II: Đúng / Sai (4 ý)</span>
                  <span id="tf-deficit-alert" style="font-size:11px; font-weight:600; color:#d97706;">Khả dụng: 0</span>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <input type="number" id="gen-matrix-tf" min="0" value="4" style="width:80px; height:38px; border:1px solid #fcd34d; border-radius:8px; padding:0 10px; font-size:15px; font-weight:700; color:#78350f; background:#ffffff;" />
                  <span style="font-size:13px; color:#92400e;">câu (1.0đ / câu)</span>
                </div>

                <!-- TF Difficulty Subpanel -->
                <div class="matrix-difficulty-subpanel" id="tf-difficulty-subpanel" style="display:none; margin-top:10px; padding-top:10px; border-top:1px dashed #fde68a;">
                  <div style="font-size:11px; font-weight:700; color:#92400e; margin-bottom:6px;">Chi tiết mức độ nhận thức:</div>
                  <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:6px;">
                    <div>
                      <label style="font-size:10px; font-weight:700; color:#1d4ed8; display:block;">NB</label>
                      <input type="number" id="gen-tf-nb" min="0" value="1" class="matrix-sub-input" data-part="tf" data-diff="NHAN_BIET" style="width:100%; height:28px; font-size:12px; font-weight:700; border:1px solid #bfdbfe; border-radius:6px; padding:0 4px; text-align:center;" />
                      <span class="sub-avail-chip" id="avail-tf-nb" style="font-size:9px; color:#64748b; display:block; text-align:center; margin-top:2px;">Có: 0</span>
                    </div>
                    <div>
                      <label style="font-size:10px; font-weight:700; color:#15803d; display:block;">TH</label>
                      <input type="number" id="gen-tf-th" min="0" value="2" class="matrix-sub-input" data-part="tf" data-diff="THONG_HIEU" style="width:100%; height:28px; font-size:12px; font-weight:700; border:1px solid #bbf7d0; border-radius:6px; padding:0 4px; text-align:center;" />
                      <span class="sub-avail-chip" id="avail-tf-th" style="font-size:9px; color:#64748b; display:block; text-align:center; margin-top:2px;">Có: 0</span>
                    </div>
                    <div>
                      <label style="font-size:10px; font-weight:700; color:#c2410c; display:block;">VD</label>
                      <input type="number" id="gen-tf-vd" min="0" value="1" class="matrix-sub-input" data-part="tf" data-diff="VAN_DUNG" style="width:100%; height:28px; font-size:12px; font-weight:700; border:1px solid #fed7aa; border-radius:6px; padding:0 4px; text-align:center;" />
                      <span class="sub-avail-chip" id="avail-tf-vd" style="font-size:9px; color:#64748b; display:block; text-align:center; margin-top:2px;">Có: 0</span>
                    </div>
                    <div>
                      <label style="font-size:10px; font-weight:700; color:#be185d; display:block;">VDC</label>
                      <input type="number" id="gen-tf-vdc" min="0" value="0" class="matrix-sub-input" data-part="tf" data-diff="VAN_DUNG_CAO" style="width:100%; height:28px; font-size:12px; font-weight:700; border:1px solid #fbcfe8; border-radius:6px; padding:0 4px; text-align:center;" />
                      <span class="sub-avail-chip" id="avail-tf-vdc" style="font-size:9px; color:#64748b; display:block; text-align:center; margin-top:2px;">Có: 0</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- SA Count -->
              <div style="padding:12px; border:1px solid #e9d5ff; border-radius:10px; background:#faf5ff;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                  <span style="font-size:12px; font-weight:700; color:#6b21a8;">PHẦN III: Trả lời ngắn / Điền số</span>
                  <span id="sa-deficit-alert" style="font-size:11px; font-weight:600; color:#9333ea;">Khả dụng: 0</span>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <input type="number" id="gen-matrix-sa" min="0" value="6" style="width:80px; height:38px; border:1px solid #d8b4fe; border-radius:8px; padding:0 10px; font-size:15px; font-weight:700; color:#581c87; background:#ffffff;" />
                  <span style="font-size:13px; color:#6b21a8;">câu (0.5đ / câu)</span>
                </div>

                <!-- SA Difficulty Subpanel -->
                <div class="matrix-difficulty-subpanel" id="sa-difficulty-subpanel" style="display:none; margin-top:10px; padding-top:10px; border-top:1px dashed #e9d5ff;">
                  <div style="font-size:11px; font-weight:700; color:#6b21a8; margin-bottom:6px;">Chi tiết mức độ nhận thức:</div>
                  <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:6px;">
                    <div>
                      <label style="font-size:10px; font-weight:700; color:#1d4ed8; display:block;">NB</label>
                      <input type="number" id="gen-sa-nb" min="0" value="0" class="matrix-sub-input" data-part="sa" data-diff="NHAN_BIET" style="width:100%; height:28px; font-size:12px; font-weight:700; border:1px solid #bfdbfe; border-radius:6px; padding:0 4px; text-align:center;" />
                      <span class="sub-avail-chip" id="avail-sa-nb" style="font-size:9px; color:#64748b; display:block; text-align:center; margin-top:2px;">Có: 0</span>
                    </div>
                    <div>
                      <label style="font-size:10px; font-weight:700; color:#15803d; display:block;">TH</label>
                      <input type="number" id="gen-sa-th" min="0" value="2" class="matrix-sub-input" data-part="sa" data-diff="THONG_HIEU" style="width:100%; height:28px; font-size:12px; font-weight:700; border:1px solid #bbf7d0; border-radius:6px; padding:0 4px; text-align:center;" />
                      <span class="sub-avail-chip" id="avail-sa-th" style="font-size:9px; color:#64748b; display:block; text-align:center; margin-top:2px;">Có: 0</span>
                    </div>
                    <div>
                      <label style="font-size:10px; font-weight:700; color:#c2410c; display:block;">VD</label>
                      <input type="number" id="gen-sa-vd" min="0" value="3" class="matrix-sub-input" data-part="sa" data-diff="VAN_DUNG" style="width:100%; height:28px; font-size:12px; font-weight:700; border:1px solid #fed7aa; border-radius:6px; padding:0 4px; text-align:center;" />
                      <span class="sub-avail-chip" id="avail-sa-vd" style="font-size:9px; color:#64748b; display:block; text-align:center; margin-top:2px;">Có: 0</span>
                    </div>
                    <div>
                      <label style="font-size:10px; font-weight:700; color:#be185d; display:block;">VDC</label>
                      <input type="number" id="gen-sa-vdc" min="0" value="1" class="matrix-sub-input" data-part="sa" data-diff="VAN_DUNG_CAO" style="width:100%; height:28px; font-size:12px; font-weight:700; border:1px solid #fbcfe8; border-radius:6px; padding:0 4px; text-align:center;" />
                      <span class="sub-avail-chip" id="avail-sa-vdc" style="font-size:9px; color:#64748b; display:block; text-align:center; margin-top:2px;">Có: 0</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            <!-- Algorithm Options: Borrow Fallback & Balanced Allocation -->
            <div style="display:flex; gap:16px; margin-top:14px; flex-wrap:wrap; padding-top:12px; border-top:1px dashed #e2e8f0;">
              <label style="display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:#334155; cursor:pointer;" title="Khi một mức độ nhận thức bị thiếu, hệ thống tự động bù từ mức độ thấp hơn liền kề thay vì báo lỗi">
                <input type="checkbox" id="gen-matrix-borrow" checked style="width:15px; height:15px; cursor:pointer;" />
                <i class="fa-solid fa-hand-holding-heart" style="color:#0284c7;"></i> Tự động bù từ mức độ thấp hơn nếu thiếu câu (<code style="font-size:11px; background:#f1f5f9; padding:1px 4px; border-radius:4px;">shortage: borrow</code>)
              </label>
              <label style="display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:#334155; cursor:pointer;" title="Chia đều số câu hỏi cho các Chương hoặc Bài đã chọn kèm Quỹ bù trừ">
                <input type="checkbox" id="gen-matrix-balanced" style="width:15px; height:15px; cursor:pointer;" />
                <i class="fa-solid fa-scale-balanced" style="color:#10b981;"></i> Phân bổ đều câu hỏi giữa các Chương / Bài (<code style="font-size:11px; background:#f1f5f9; padding:1px 4px; border-radius:4px;">balanced</code>)
              </label>
            </div>

            <!-- Total Question Counter -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; padding-top:10px; border-top:1px solid #f1f5f9; font-size:13px;">
              <span style="color:#64748b;">Tổng số câu yêu cầu: <strong id="gen-matrix-total-q" style="color:#0f172a; font-size:15px;">22</strong> câu</span>
              <span style="color:#64748b;">Tổng thang điểm: <strong style="color:#0284c7; font-size:15px;">10.0</strong> điểm</span>
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

          <!-- Assignment Metadata & Target Destination (Moved to Preview Step) -->
          <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:12px; padding:16px; margin-bottom:16px;">
            <div style="font-size:13px; font-weight:700; color:#1e293b; margin-bottom:12px; display:flex; align-items:center; gap:6px;">
              <i class="fa-solid fa-file-pen" style="color:#0284c7;"></i> Thông tin bài tập & Bài học đích
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:14px; margin-bottom:14px;">
              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Tiêu đề đề thi / bài tập *</label>
                <input type="text" id="gen-exam-title" placeholder="Ví dụ: Đề kiểm tra 45 phút - Đại số & Giải tích" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:13px; background:#ffffff;" />
              </div>
              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Hình thức làm bài</label>
                <select id="gen-exam-type" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#ffffff;">
                  <option value="PRACTICE">Luyện tập tự do (Tối đa 3 lần làm)</option>
                  <option value="EXAM">Kiểm tra / Thi chính thức (Chỉ 1 lần làm)</option>
                </select>
              </div>
              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Thời gian làm bài (Phút)</label>
                <input type="number" id="gen-exam-duration" min="5" value="90" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:13px; background:#ffffff;" />
              </div>
            </div>

            <!-- Destination lesson selection -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px; background:#ffffff; padding:12px; border-radius:8px; border:1px solid #e2e8f0; margin-bottom:12px;">
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
            <div style="display:flex; gap:20px; align-items:center; flex-wrap:wrap;">
              <label style="display:inline-flex; align-items:center; gap:6px; font-size:13px; color:#334155; cursor:pointer;">
                <input type="checkbox" id="gen-show-solutions" style="width:16px; height:16px; cursor:pointer;" />
                Cho phép học sinh xem lời giải chi tiết sau khi nộp
              </label>
              <label style="display:inline-flex; align-items:center; gap:6px; font-size:13px; color:#334155; cursor:pointer;" title="Tự động tạo 4 mã đề hoán vị trật tự câu hỏi và phương án ABCD (Mã 101, 102, 103, 104)">
                <input type="checkbox" id="gen-multi-variants" style="width:16px; height:16px; cursor:pointer;" />
                <i class="fa-solid fa-shuffle" style="color:#0284c7;"></i> Tự động tạo 4 mã đề hoán vị (101, 102, 103, 104)
              </label>
            </div>
          </div>

          <div style="font-size:14px; font-weight:700; color:#0f172a; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <span><i class="fa-solid fa-list-check" style="color:#0284c7;"></i> Danh sách câu hỏi bốc ngẫu nhiên</span>
            <span style="font-size:12px; font-weight:normal; color:#64748b;">(Bấm "Đổi nhanh" hoặc "3 gợi ý" để thay đổi câu hỏi theo ý muốn)</span>
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

  // Scope Mode Switcher (Quick vs Multi Tree)
  const quickBtn = document.getElementById('scope-mode-quick-btn')
  const multiBtn = document.getElementById('scope-mode-multi-btn')
  const quickContainer = document.getElementById('scope-quick-container')
  const multiContainer = document.getElementById('scope-multi-container')

  quickBtn?.addEventListener('click', () => {
    generatorState.scopeMode = 'QUICK'
    quickBtn.style.background = '#ffffff'
    quickBtn.style.color = '#0284c7'
    quickBtn.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)'
    multiBtn.style.background = 'transparent'
    multiBtn.style.color = '#64748b'
    multiBtn.style.boxShadow = 'none'

    if (quickContainer) quickContainer.style.display = 'block'
    if (multiContainer) multiContainer.style.display = 'none'
    checkLiveAvailability()
  })

  multiBtn?.addEventListener('click', () => {
    generatorState.scopeMode = 'MULTI'
    multiBtn.style.background = '#ffffff'
    multiBtn.style.color = '#0284c7'
    multiBtn.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)'
    quickBtn.style.background = 'transparent'
    quickBtn.style.color = '#64748b'
    quickBtn.style.boxShadow = 'none'

    if (quickContainer) quickContainer.style.display = 'none'
    if (multiContainer) multiContainer.style.display = 'block'
    renderTreeForGradeBlock(generatorState.gradeBlock)
    checkLiveAvailability()
  })

  // Quick Scope Radios
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

  // Scope Block changed (Quick mode)
  scopeBlockSel?.addEventListener('change', (e) => {
    generatorState.gradeBlock = e.target.value
    const multiBlockSel = document.getElementById('multi-scope-grade-block')
    if (multiBlockSel) multiBlockSel.value = e.target.value
    checkLiveAvailability()
  })

  // Cascading scope selects (Quick mode)
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

  // Multi Scope Tree Elements
  const multiGradeBlockSel = document.getElementById('multi-scope-grade-block')
  const multiTreeContainer = document.getElementById('multi-scope-tree-container')
  const multiSelectAllBtn = document.getElementById('multi-select-all-classes-btn')
  const multiClearBtn = document.getElementById('multi-clear-selection-btn')

  multiGradeBlockSel?.addEventListener('change', (e) => {
    generatorState.gradeBlock = e.target.value
    if (scopeBlockSel) scopeBlockSel.value = e.target.value
    generatorState.selectedClassIds = []
    generatorState.selectedChapterIds = []
    generatorState.selectedLessonIds = []
    renderTreeForGradeBlock(generatorState.gradeBlock)
    updateTreeSelectionBadge()
    checkLiveAvailability()
  })

  multiSelectAllBtn?.addEventListener('click', () => {
    const blockClasses = (allClasses || []).filter(c => (c.gradeBlock || c.grade_block) === generatorState.gradeBlock)
    blockClasses.forEach(c => {
      if (!generatorState.selectedClassIds.includes(c.id)) {
        generatorState.selectedClassIds.push(c.id)
      }
    })
    document.querySelectorAll('.chk-tree-class').forEach(chk => { chk.checked = true })
    updateTreeSelectionBadge()
    checkLiveAvailability()
  })

  multiClearBtn?.addEventListener('click', () => {
    generatorState.selectedClassIds = []
    generatorState.selectedChapterIds = []
    generatorState.selectedLessonIds = []
    document.querySelectorAll('.chk-tree-class, .chk-tree-chapter, .chk-tree-lesson').forEach(chk => { chk.checked = false })
    updateTreeSelectionBadge()
    checkLiveAvailability()
  })

  function updateTreeSelectionBadge() {
    const badge = document.getElementById('multi-selection-badge')
    if (badge) {
      const cCount = generatorState.selectedClassIds.length
      const chCount = generatorState.selectedChapterIds.length
      const lCount = generatorState.selectedLessonIds.length
      badge.textContent = `Đã chọn: ${cCount} lớp, ${chCount} chương, ${lCount} bài`
    }
  }

  // Render Tree View for a Grade Block
  function renderTreeForGradeBlock(block) {
    if (!multiTreeContainer) return
    const blockClasses = (allClasses || []).filter(c => (c.gradeBlock || c.grade_block) === block)

    if (blockClasses.length === 0) {
      multiTreeContainer.innerHTML = `
        <div style="text-align:center; padding:24px; color:#94a3b8; font-size:13px;">
          <i class="fa-solid fa-folder-open" style="font-size:24px; margin-bottom:6px; display:block;"></i>
          Không tìm thấy lớp học nào thuộc khối ${block || ''}
        </div>
      `
      return
    }

    let treeHtml = ''
    blockClasses.forEach(c => {
      const isClassChecked = generatorState.selectedClassIds.includes(c.id)
      treeHtml += `
        <div class="tree-class-node" data-class-id="${c.id}" style="border:1px solid #e2e8f0; border-radius:8px; margin-bottom:8px; background:#ffffff; overflow:hidden;">
          <div style="padding:8px 12px; display:flex; align-items:center; gap:8px; background:#f8fafc; border-bottom:1px solid transparent;">
            <button type="button" class="btn-tree-expand-class" data-class-id="${c.id}" style="border:none; background:transparent; cursor:pointer; color:#64748b; font-size:11px; width:20px; height:20px; display:flex; align-items:center; justify-content:center; border-radius:4px;">
              <i class="fa-solid fa-chevron-right tree-chevron-class-${c.id}"></i>
            </button>
            <label style="display:inline-flex; align-items:center; gap:8px; cursor:pointer; font-weight:600; font-size:13px; color:#1e293b; margin:0; flex:1;">
              <input type="checkbox" class="chk-tree-class" data-class-id="${c.id}" ${isClassChecked ? 'checked' : ''} style="width:16px; height:16px; cursor:pointer;" />
              <i class="fa-solid fa-chalkboard-user" style="color:#0284c7;"></i>
              ${c.name}
            </label>
            <span style="font-size:11px; color:#94a3b8;">(Bấm ▶ để mở Chương & Bài)</span>
          </div>
          <div class="tree-class-children" id="tree-class-children-${c.id}" style="display:none; padding:8px 12px 8px 34px; border-top:1px dashed #e2e8f0; background:#fdfdfd;">
            <div style="color:#94a3b8; font-size:12px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải chương...</div>
          </div>
        </div>
      `
    })

    multiTreeContainer.innerHTML = treeHtml

    // Bind Class Expand buttons
    multiTreeContainer.querySelectorAll('.btn-tree-expand-class').forEach(btn => {
      btn.addEventListener('click', async () => {
        const clId = btn.getAttribute('data-class-id')
        const childrenBox = document.getElementById(`tree-class-children-${clId}`)
        const chevron = btn.querySelector(`.tree-chevron-class-${clId}`)
        if (!childrenBox) return

        if (childrenBox.style.display === 'block') {
          childrenBox.style.display = 'none'
          if (chevron) {
            chevron.classList.remove('fa-chevron-down')
            chevron.classList.add('fa-chevron-right')
          }
          return
        }

        childrenBox.style.display = 'block'
        if (chevron) {
          chevron.classList.remove('fa-chevron-right')
          chevron.classList.add('fa-chevron-down')
        }

        // Load chapters if not cached
        if (!treeDataCache.chapters[clId]) {
          try {
            const chs = await api.getChapters(clId, true)
            treeDataCache.chapters[clId] = chs || []
          } catch (e) {
            treeDataCache.chapters[clId] = []
          }
        }

        const chapters = treeDataCache.chapters[clId] || []
        if (chapters.length === 0) {
          childrenBox.innerHTML = '<div style="font-size:12px; color:#94a3b8; padding:4px 0;">Không có chương nào trong lớp này</div>'
          return
        }

        let chHtml = ''
        chapters.forEach(ch => {
          const isChChecked = generatorState.selectedChapterIds.includes(ch.id)
          chHtml += `
            <div class="tree-chapter-node" data-chapter-id="${ch.id}" style="margin-bottom:6px; border:1px solid #f1f5f9; border-radius:6px; background:#ffffff;">
              <div style="padding:6px 10px; display:flex; align-items:center; gap:8px; background:#f8fafc;">
                <button type="button" class="btn-tree-expand-chapter" data-chapter-id="${ch.id}" style="border:none; background:transparent; cursor:pointer; color:#64748b; font-size:10px; width:18px; height:18px; display:flex; align-items:center; justify-content:center;">
                  <i class="fa-solid fa-chevron-right tree-chevron-chapter-${ch.id}"></i>
                </button>
                <label style="display:inline-flex; align-items:center; gap:6px; cursor:pointer; font-weight:600; font-size:12px; color:#334155; margin:0; flex:1;">
                  <input type="checkbox" class="chk-tree-chapter" data-chapter-id="${ch.id}" ${isChChecked ? 'checked' : ''} style="width:15px; height:15px; cursor:pointer;" />
                  <i class="fa-solid fa-book-bookmark" style="color:#d97706;"></i>
                  ${ch.title}
                </label>
              </div>
              <div class="tree-chapter-children" id="tree-chapter-children-${ch.id}" style="display:none; padding:6px 10px 6px 32px; border-top:1px dashed #f1f5f9; background:#ffffff;">
                <div style="color:#94a3b8; font-size:11px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải bài học...</div>
              </div>
            </div>
          `
        })

        childrenBox.innerHTML = chHtml

        // Bind Chapter Expand buttons
        childrenBox.querySelectorAll('.btn-tree-expand-chapter').forEach(chBtn => {
          chBtn.addEventListener('click', async () => {
            const chId = chBtn.getAttribute('data-chapter-id')
            const lBox = document.getElementById(`tree-chapter-children-${chId}`)
            const chChevron = chBtn.querySelector(`.tree-chevron-chapter-${chId}`)
            if (!lBox) return

            if (lBox.style.display === 'block') {
              lBox.style.display = 'none'
              if (chChevron) {
                chChevron.classList.remove('fa-chevron-down')
                chChevron.classList.add('fa-chevron-right')
              }
              return
            }

            lBox.style.display = 'block'
            if (chChevron) {
              chChevron.classList.remove('fa-chevron-right')
              chChevron.classList.add('fa-chevron-down')
            }

            if (!treeDataCache.lessons[chId]) {
              try {
                const ls = await api.getLessons(chId)
                treeDataCache.lessons[chId] = ls || []
              } catch (e) {
                treeDataCache.lessons[chId] = []
              }
            }

            const lessons = treeDataCache.lessons[chId] || []
            if (lessons.length === 0) {
              lBox.innerHTML = '<div style="font-size:11px; color:#94a3b8; padding:3px 0;">Không có bài học nào</div>'
              return
            }

            let lHtml = ''
            lessons.forEach(l => {
              const isLChecked = generatorState.selectedLessonIds.includes(l.id)
              lHtml += `
                <div style="padding:4px 0; display:flex; align-items:center; gap:6px;">
                  <label style="display:inline-flex; align-items:center; gap:6px; cursor:pointer; font-size:12px; color:#475569; margin:0;">
                    <input type="checkbox" class="chk-tree-lesson" data-lesson-id="${l.id}" ${isLChecked ? 'checked' : ''} style="width:14px; height:14px; cursor:pointer;" />
                    <i class="fa-solid fa-file-lines" style="color:#0284c7; font-size:11px;"></i>
                    ${l.title}
                  </label>
                </div>
              `
            })

            lBox.innerHTML = lHtml

            // Bind Lesson Checkboxes
            lBox.querySelectorAll('.chk-tree-lesson').forEach(lChk => {
              lChk.addEventListener('change', (e) => {
                const lId = lChk.getAttribute('data-lesson-id')
                if (e.target.checked) {
                  if (!generatorState.selectedLessonIds.includes(lId)) generatorState.selectedLessonIds.push(lId)
                } else {
                  generatorState.selectedLessonIds = generatorState.selectedLessonIds.filter(id => id !== lId)
                }
                updateTreeSelectionBadge()
                checkLiveAvailability()
              })
            })
          })
        })

        // Bind Chapter Checkboxes
        childrenBox.querySelectorAll('.chk-tree-chapter').forEach(chChk => {
          chChk.addEventListener('change', (e) => {
            const chId = chChk.getAttribute('data-chapter-id')
            if (e.target.checked) {
              if (!generatorState.selectedChapterIds.includes(chId)) generatorState.selectedChapterIds.push(chId)
            } else {
              generatorState.selectedChapterIds = generatorState.selectedChapterIds.filter(id => id !== chId)
            }
            updateTreeSelectionBadge()
            checkLiveAvailability()
          })
        })
      })
    })

    // Bind Class Checkboxes
    multiTreeContainer.querySelectorAll('.chk-tree-class').forEach(cChk => {
      cChk.addEventListener('change', (e) => {
        const clId = cChk.getAttribute('data-class-id')
        if (e.target.checked) {
          if (!generatorState.selectedClassIds.includes(clId)) generatorState.selectedClassIds.push(clId)
        } else {
          generatorState.selectedClassIds = generatorState.selectedClassIds.filter(id => id !== clId)
        }
        updateTreeSelectionBadge()
        checkLiveAvailability()
      })
    })
  }

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
  const advancedToggle = document.getElementById('gen-matrix-advanced-toggle')

  // Toggle Advanced Difficulty Matrix
  advancedToggle?.addEventListener('change', (e) => {
    const isAdv = e.target.checked
    document.querySelectorAll('.matrix-difficulty-subpanel').forEach(panel => {
      panel.style.display = isAdv ? 'block' : 'none'
    })
    if (isAdv) {
      syncSubInputsFromTotals()
    }
  })

  // Sync sub inputs from totals if opening advanced
  function syncSubInputsFromTotals() {
    const mcVal = Number(mcInput?.value) || 0
    const tfVal = Number(tfInput?.value) || 0
    const saVal = Number(saInput?.value) || 0

    // If sub-inputs currently sum to 0, distribute them nicely
    const currentMcSum = getSubInputSum('mc')
    if (currentMcSum === 0 && mcVal > 0) {
      setSubValues('mc', Math.round(mcVal * 0.4), Math.round(mcVal * 0.35), Math.round(mcVal * 0.15), mcVal - Math.round(mcVal * 0.4) - Math.round(mcVal * 0.35) - Math.round(mcVal * 0.15))
    }
    const currentTfSum = getSubInputSum('tf')
    if (currentTfSum === 0 && tfVal > 0) {
      setSubValues('tf', Math.max(1, Math.round(tfVal * 0.25)), Math.round(tfVal * 0.5), Math.max(0, tfVal - 1 - Math.round(tfVal * 0.5)), 0)
    }
    const currentSaSum = getSubInputSum('sa')
    if (currentSaSum === 0 && saVal > 0) {
      setSubValues('sa', 0, Math.round(saVal * 0.35), Math.round(saVal * 0.5), Math.max(0, saVal - Math.round(saVal * 0.35) - Math.round(saVal * 0.5)))
    }
  }

  function getSubInputSum(part) {
    return ['nb', 'th', 'vd', 'vdc'].reduce((sum, diff) => {
      return sum + (Number(document.getElementById(`gen-${part}-${diff}`)?.value) || 0)
    }, 0)
  }

  function setSubValues(part, nb, th, vd, vdc) {
    const nbEl = document.getElementById(`gen-${part}-nb`)
    const thEl = document.getElementById(`gen-${part}-th`)
    const vdEl = document.getElementById(`gen-${part}-vd`)
    const vdcEl = document.getElementById(`gen-${part}-vdc`)
    if (nbEl) nbEl.value = Math.max(0, nb)
    if (thEl) thEl.value = Math.max(0, th)
    if (vdEl) vdEl.value = Math.max(0, vd)
    if (vdcEl) vdcEl.value = Math.max(0, vdc)
  }

  // Handle Sub-input changes (updates parent count)
  document.querySelectorAll('.matrix-sub-input').forEach(subInput => {
    subInput.addEventListener('input', (e) => {
      const part = e.target.getAttribute('data-part')
      if (part) {
        const sum = getSubInputSum(part)
        const parentInput = document.getElementById(`gen-matrix-${part}`)
        if (parentInput) parentInput.value = sum
        updateMatrixSum()
      }
    })
  })

  const updateMatrixSum = () => {
    const total = (Number(mcInput?.value) || 0) + (Number(tfInput?.value) || 0) + (Number(saInput?.value) || 0)
    if (totalCountEl) totalCountEl.textContent = total
    updateAvailBadgesAndAlerts(generatorState.availableStats || { mc: 0, tf: 0, sa: 0, total: 0 })
  }
  mcInput?.addEventListener('input', updateMatrixSum)
  tfInput?.addEventListener('input', updateMatrixSum)
  saInput?.addEventListener('input', updateMatrixSum)

  // Update Availability Badges & Deficit Warnings
  function updateAvailBadgesAndAlerts(res) {
    const mcReq = Number(mcInput?.value) || 0
    const tfReq = Number(tfInput?.value) || 0
    const saReq = Number(saInput?.value) || 0

    const mcBadge = document.getElementById('avail-mc-badge')
    const tfBadge = document.getElementById('avail-tf-badge')
    const saBadge = document.getElementById('avail-sa-badge')
    const mcDeficit = document.getElementById('mc-deficit-alert')
    const tfDeficit = document.getElementById('tf-deficit-alert')
    const saDeficit = document.getElementById('sa-deficit-alert')

    // MC Status
    if (res.mc < mcReq) {
      if (mcBadge) {
        mcBadge.style.background = '#fef2f2'
        mcBadge.style.color = '#dc2626'
        mcBadge.style.border = '1px solid #fca5a5'
        mcBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span id="avail-mc">${res.mc}</span> Trắc nghiệm <strong style="color:#b91c1c;">(Thiếu ${mcReq - res.mc})</strong>`
      }
      if (mcDeficit) {
        mcDeficit.style.color = '#dc2626'
        mcDeficit.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> Khả dụng: ${res.mc} (Thiếu ${mcReq - res.mc})`
      }
    } else {
      if (mcBadge) {
        mcBadge.style.background = '#dcfce7'
        mcBadge.style.color = '#15803d'
        mcBadge.style.border = '1px solid #86efac'
        mcBadge.innerHTML = `<i class="fa-solid fa-check"></i> <span id="avail-mc">${res.mc}</span> Trắc nghiệm`
      }
      if (mcDeficit) {
        mcDeficit.style.color = '#16a34a'
        mcDeficit.innerHTML = `Khả dụng: ${res.mc}`
      }
    }

    // TF Status
    if (res.tf < tfReq) {
      if (tfBadge) {
        tfBadge.style.background = '#fef2f2'
        tfBadge.style.color = '#dc2626'
        tfBadge.style.border = '1px solid #fca5a5'
        tfBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span id="avail-tf">${res.tf}</span> Đúng / Sai <strong style="color:#b91c1c;">(Thiếu ${tfReq - res.tf})</strong>`
      }
      if (tfDeficit) {
        tfDeficit.style.color = '#dc2626'
        tfDeficit.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> Khả dụng: ${res.tf} (Thiếu ${tfReq - res.tf})`
      }
    } else {
      if (tfBadge) {
        tfBadge.style.background = '#fef3c7'
        tfBadge.style.color = '#b45309'
        tfBadge.style.border = '1px solid #fcd34d'
        tfBadge.innerHTML = `<i class="fa-solid fa-check"></i> <span id="avail-tf">${res.tf}</span> Đúng / Sai`
      }
      if (tfDeficit) {
        tfDeficit.style.color = '#d97706'
        tfDeficit.innerHTML = `Khả dụng: ${res.tf}`
      }
    }

    // SA Status
    if (res.sa < saReq) {
      if (saBadge) {
        saBadge.style.background = '#fef2f2'
        saBadge.style.color = '#dc2626'
        saBadge.style.border = '1px solid #fca5a5'
        saBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span id="avail-sa">${res.sa}</span> Trả lời ngắn <strong style="color:#b91c1c;">(Thiếu ${saReq - res.sa})</strong>`
      }
      if (saDeficit) {
        saDeficit.style.color = '#dc2626'
        saDeficit.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> Khả dụng: ${res.sa} (Thiếu ${saReq - res.sa})`
      }
    } else {
      if (saBadge) {
        saBadge.style.background = '#f3e8ff'
        saBadge.style.color = '#7e22ce'
        saBadge.style.border = '1px solid #d8b4fe'
        saBadge.innerHTML = `<i class="fa-solid fa-check"></i> <span id="avail-sa">${res.sa}</span> Trả lời ngắn`
      }
      if (saDeficit) {
        saDeficit.style.color = '#9333ea'
        saDeficit.innerHTML = `Khả dụng: ${res.sa}`
      }
    }

    // Sub-availability chips by difficulty
    const byType = res.byTypeAndDifficulty || {}
    const updateSubChip = (id, count, reqInputId) => {
      const el = document.getElementById(id)
      const reqVal = Number(document.getElementById(reqInputId)?.value) || 0
      if (el) {
        const isShort = count < reqVal
        el.textContent = `Có: ${count}`
        el.style.color = isShort ? '#dc2626' : '#64748b'
        el.style.fontWeight = isShort ? '700' : 'normal'
      }
    }

    const mcDiff = byType.MULTIPLE_CHOICE || {}
    updateSubChip('avail-mc-nb', mcDiff.NHAN_BIET || 0, 'gen-mc-nb')
    updateSubChip('avail-mc-th', mcDiff.THONG_HIEU || 0, 'gen-mc-th')
    updateSubChip('avail-mc-vd', mcDiff.VAN_DUNG || 0, 'gen-mc-vd')
    updateSubChip('avail-mc-vdc', mcDiff.VAN_DUNG_CAO || 0, 'gen-mc-vdc')

    const tfDiff = byType.TRUE_FALSE || {}
    updateSubChip('avail-tf-nb', tfDiff.NHAN_BIET || 0, 'gen-tf-nb')
    updateSubChip('avail-tf-th', tfDiff.THONG_HIEU || 0, 'gen-tf-th')
    updateSubChip('avail-tf-vd', tfDiff.VAN_DUNG || 0, 'gen-tf-vd')
    updateSubChip('avail-tf-vdc', tfDiff.VAN_DUNG_CAO || 0, 'gen-tf-vdc')

    const saDiff = byType.SHORT_ANSWER || {}
    updateSubChip('avail-sa-nb', saDiff.NHAN_BIET || 0, 'gen-sa-nb')
    updateSubChip('avail-sa-th', saDiff.THONG_HIEU || 0, 'gen-sa-th')
    updateSubChip('avail-sa-vd', saDiff.VAN_DUNG || 0, 'gen-sa-vd')
    updateSubChip('avail-sa-vdc', saDiff.VAN_DUNG_CAO || 0, 'gen-sa-vdc')

    const totalEl = document.getElementById('avail-total')
    if (totalEl) totalEl.textContent = `Tổng có: ${res.total} câu`
  }

  // Live availability function (supports both QUICK and MULTI mode)
  async function checkLiveAvailability() {
    try {
      let params = ''
      if (generatorState.scopeMode === 'MULTI') {
        params += `scopeType=MULTI&`
        if (generatorState.gradeBlock) {
          params += `gradeBlock=${encodeURIComponent(generatorState.gradeBlock)}&`
        }
        if (generatorState.selectedClassIds.length > 0) {
          params += `classIds=${encodeURIComponent(generatorState.selectedClassIds.join(','))}&`
        }
        if (generatorState.selectedChapterIds.length > 0) {
          params += `chapterIds=${encodeURIComponent(generatorState.selectedChapterIds.join(','))}&`
        }
        if (generatorState.selectedLessonIds.length > 0) {
          params += `lessonIds=${encodeURIComponent(generatorState.selectedLessonIds.join(','))}&`
        }
      } else {
        params += `scopeType=${generatorState.scopeType}&`
        if (generatorState.scopeType === 'BLOCK') {
          params += `gradeBlock=${encodeURIComponent(generatorState.gradeBlock || '')}&`
        } else {
          if (generatorState.classId) params += `classId=${generatorState.classId}&`
          if (generatorState.chapterId) params += `chapterId=${generatorState.chapterId}&`
          if (generatorState.lessonId) params += `lessonId=${generatorState.lessonId}&`
        }
      }

      const res = await api.checkQuestionBankAvailability(params)
      if (res) {
        generatorState.availableStats = res
        updateAvailBadgesAndAlerts(res)
      }
    } catch (e) {
      console.warn('[QuestionBank] Availability check failed:', e)
    }
  }

  // Trigger initial availability check
  checkLiveAvailability()

  // Step 1 -> Step 2: Roll & Preview
  const btnRollPreview = document.getElementById('btn-roll-preview')
  const btnFinalize = document.getElementById('btn-finalize-create-hw')
  const step1 = document.getElementById('matrix-gen-step1')
  const step2 = document.getElementById('matrix-gen-step2')

  btnRollPreview?.addEventListener('click', async () => {
    if (generatorState.scopeMode === 'MULTI') {
      const hasAnySelection = generatorState.selectedClassIds.length > 0 ||
        generatorState.selectedChapterIds.length > 0 ||
        generatorState.selectedLessonIds.length > 0 ||
        generatorState.gradeBlock
      if (!hasAnySelection) {
        return showToast('Vui lòng chọn ít nhất một Lớp, Chương hoặc Bài học trong cây phân cấp!', 'warning')
      }
    } else {
      if (generatorState.scopeType === 'BLOCK' && !generatorState.gradeBlock) {
        return showToast('Vui lòng chọn Khối nguồn để bốc câu hỏi!', 'warning')
      }
      if (generatorState.scopeType !== 'BLOCK' && !generatorState.classId) {
        return showToast('Vui lòng chọn Lớp nguồn để bốc câu hỏi!', 'warning')
      }
    }

    const mcCount = Number(mcInput?.value) || 0
    const tfCount = Number(tfInput?.value) || 0
    const saCount = Number(saInput?.value) || 0

    if (mcCount + tfCount + saCount === 0) {
      return showToast('Tổng số câu hỏi trong ma trận phải lớn hơn 0!', 'warning')
    }

    const isAdvanced = advancedToggle?.checked || false
    const isBorrow = document.getElementById('gen-matrix-borrow')?.checked ?? true
    const isBalanced = document.getElementById('gen-matrix-balanced')?.checked ?? false

    // Availability validation check
    const avail = generatorState.availableStats || { mc: 0, tf: 0, sa: 0 }
    if (avail.mc < mcCount && !isBorrow) {
      return showToast(`Không đủ câu Trắc nghiệm trong phạm vi (Cần ${mcCount}, có ${avail.mc})!`, 'error')
    }
    if (avail.tf < tfCount && !isBorrow) {
      return showToast(`Không đủ câu Đúng/Sai trong phạm vi (Cần ${tfCount}, có ${avail.tf})!`, 'error')
    }
    if (avail.sa < saCount && !isBorrow) {
      return showToast(`Không đủ câu Trả lời ngắn trong phạm vi (Cần ${saCount}, có ${avail.sa})!`, 'error')
    }

    btnRollPreview.disabled = true
    btnRollPreview.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang bốc câu...'
    generatorState.rejectedIds = []

    // Construct structured scope object
    let scopePayload
    if (generatorState.scopeMode === 'MULTI') {
      scopePayload = {
        gradeBlock: generatorState.gradeBlock,
        classIds: generatorState.selectedClassIds,
        chapterIds: generatorState.selectedChapterIds,
        lessonIds: generatorState.selectedLessonIds
      }
    } else {
      scopePayload = {
        scopeType: generatorState.scopeType,
        gradeBlock: generatorState.gradeBlock,
        classId: generatorState.classId,
        chapterId: generatorState.chapterId,
        lessonId: generatorState.lessonId
      }
    }
    generatorState.currentScope = scopePayload

    // Construct matrix payload
    let matrixPayload
    if (isAdvanced) {
      matrixPayload = {
        MULTIPLE_CHOICE: {
          total: mcCount,
          byDifficulty: {
            NHAN_BIET: Number(document.getElementById('gen-mc-nb')?.value) || 0,
            THONG_HIEU: Number(document.getElementById('gen-mc-th')?.value) || 0,
            VAN_DUNG: Number(document.getElementById('gen-mc-vd')?.value) || 0,
            VAN_DUNG_CAO: Number(document.getElementById('gen-mc-vdc')?.value) || 0
          }
        },
        TRUE_FALSE: {
          total: tfCount,
          byDifficulty: {
            NHAN_BIET: Number(document.getElementById('gen-tf-nb')?.value) || 0,
            THONG_HIEU: Number(document.getElementById('gen-tf-th')?.value) || 0,
            VAN_DUNG: Number(document.getElementById('gen-tf-vd')?.value) || 0,
            VAN_DUNG_CAO: Number(document.getElementById('gen-tf-vdc')?.value) || 0
          }
        },
        SHORT_ANSWER: {
          total: saCount,
          byDifficulty: {
            NHAN_BIET: Number(document.getElementById('gen-sa-nb')?.value) || 0,
            THONG_HIEU: Number(document.getElementById('gen-sa-th')?.value) || 0,
            VAN_DUNG: Number(document.getElementById('gen-sa-vd')?.value) || 0,
            VAN_DUNG_CAO: Number(document.getElementById('gen-sa-vdc')?.value) || 0
          }
        }
      }
    } else {
      matrixPayload = { mcCount, tfCount, saCount }
    }

    try {
      const res = await api.generateRandomExam({
        scope: scopePayload,
        ...scopePayload,
        matrix: matrixPayload,
        shortage: isBorrow ? 'borrow' : 'error',
        balanced: isBalanced,
        previewOnly: true
      })

      generatorState.previewQuestions = res.previewQuestions || []
      generatorState.borrowAlerts = res.borrowAlerts || []

      // Switch to Step 2 Preview
      step1.style.display = 'none'
      step2.style.display = 'block'
      btnRollPreview.style.display = 'none'
      btnFinalize.style.display = 'inline-flex'

      const titleInput = document.getElementById('gen-exam-title')
      if (titleInput && !titleInput.value.trim()) {
        const defaultName = generatorState.gradeBlock
          ? `Đề kiểm tra Khối ${generatorState.gradeBlock} (${generatorState.previewQuestions.length} câu)`
          : `Đề kiểm tra trắc nghiệm (${generatorState.previewQuestions.length} câu)`
        titleInput.value = defaultName
      }

      const activeTitle = titleInput?.value || 'Đề kiểm tra xem trước'
      const activeDuration = document.getElementById('gen-exam-duration')?.value || 60
      document.getElementById('preview-exam-title').textContent = activeTitle
      document.getElementById('preview-meta-desc').textContent = `${generatorState.previewQuestions.length} câu hỏi • ${activeDuration} phút`

      // Auto-preselect destination class if available from Step 1
      if (destClassSel && !destClassSel.value) {
        if (generatorState.classId) {
          destClassSel.value = generatorState.classId
          destClassSel.dispatchEvent(new Event('change'))
        } else if (generatorState.selectedClassIds && generatorState.selectedClassIds.length > 0) {
          destClassSel.value = generatorState.selectedClassIds[0]
          destClassSel.dispatchEvent(new Event('change'))
        }
      }

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

  // Render Preview Questions List with Cognitive Badges and Smart Swap
  function renderPreviewQuestionsList() {
    const container = document.getElementById('preview-questions-container')
    if (!container) return

    let html = ''

    // Render borrow alerts notification banner if borrow occurred
    if (generatorState.borrowAlerts && generatorState.borrowAlerts.length > 0) {
      html += `
        <div style="padding:12px 16px; background:#fffbeb; border:1px solid #fde68a; border-radius:10px; margin-bottom:6px;">
          <div style="font-size:13px; font-weight:700; color:#b45309; display:flex; align-items:center; gap:8px;">
            <i class="fa-solid fa-triangle-exclamation"></i> Thông báo bù mức độ nhận thức (Borrow Fallback):
          </div>
          <ul style="margin:6px 0 0 18px; padding:0; font-size:12px; color:#92400e; line-height:1.5;">
            ${generatorState.borrowAlerts.map(a => `<li>${a}</li>`).join('')}
          </ul>
        </div>
      `
    }

    const diffMap = {
      'NHAN_BIET': { text: 'Nhận biết', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
      'THONG_HIEU': { text: 'Thông hiểu', bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
      'VAN_DUNG': { text: 'Vận dụng', bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
      'VAN_DUNG_CAO': { text: 'Vận dụng cao', bg: '#fdf2f8', color: '#be185d', border: '#fbcfe8' }
    }

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

      const diffBadgeInfo = diffMap[q.difficulty] || { text: 'Chưa phân loại', bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' }

      html += `
        <div class="card preview-q-row" data-index="${idx}" data-id="${q.id}" style="margin:0; padding:16px; border:1px solid #e2e8f0; border-radius:10px; background:#ffffff;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-weight:700; font-size:13px; color:#1e293b;">Câu ${idx + 1}</span>
              <span style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:6px; background:${typeBg}; color:${typeColor};">
                ${typeBadge}
              </span>
              <span style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:6px; background:${diffBadgeInfo.bg}; color:${diffBadgeInfo.color}; border:1px solid ${diffBadgeInfo.border};">
                ${diffBadgeInfo.text}
              </span>
              <span style="font-size:11px; color:#64748b;">
                ${q.points || (q.question_type === 'TRUE_FALSE' ? 1.0 : (q.question_type === 'SHORT_ANSWER' ? 0.5 : 0.25))} điểm
              </span>
            </div>

            <!-- Smart Swap Button Group -->
            <div style="display:flex; align-items:center; gap:6px;">
              <button class="btn-swap-question" data-index="${idx}" data-id="${q.id}" data-type="${q.question_type}" data-diff="${q.difficulty || ''}" data-chap="${q.chapter_id || ''}" title="Đổi ngay câu hỏi khác (giữ cùng mức độ nhận thức)" style="padding:5px 10px; font-size:12px; font-weight:600; border-radius:6px; border:1px solid #cbd5e1; background:#f8fafc; color:#334155; cursor:pointer; display:inline-flex; align-items:center; gap:5px;">
                <i class="fa-solid fa-arrows-rotate" style="color:#0284c7;"></i> Đổi nhanh
              </button>
              <button class="btn-swap-candidates" data-index="${idx}" data-id="${q.id}" data-type="${q.question_type}" data-diff="${q.difficulty || ''}" data-chap="${q.chapter_id || ''}" title="Xem 3 gợi ý thay thế để tự chọn" style="padding:5px 10px; font-size:12px; font-weight:600; border-radius:6px; border:1px solid #bae6fd; background:#f0f9ff; color:#0369a1; cursor:pointer; display:inline-flex; align-items:center; gap:5px;">
                <i class="fa-solid fa-list-check" style="color:#0284c7;"></i> 3 gợi ý
              </button>
            </div>
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

    // Bind Quick Swap Questions (sameDifficulty by default)
    container.querySelectorAll('.btn-swap-question').forEach(btn => {
      btn.addEventListener('click', async () => {
        const qIdx = parseInt(btn.getAttribute('data-index'), 10)
        const curId = btn.getAttribute('data-id')
        const qType = btn.getAttribute('data-type')
        const curDiff = btn.getAttribute('data-diff')
        const curChap = btn.getAttribute('data-chap')

        if (!generatorState.rejectedIds) generatorState.rejectedIds = []
        if (curId && !generatorState.rejectedIds.includes(curId)) {
          generatorState.rejectedIds.push(curId)
        }
        const excludeIds = Array.from(new Set([
          ...generatorState.previewQuestions.map(q => q.id),
          ...generatorState.rejectedIds
        ]))
        btn.disabled = true
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'

        try {
          const swapRes = await api.swapQuestionInExam({
            currentQuestionId: curId,
            excludeIds,
            questionType: qType,
            sameDifficulty: Boolean(curDiff),
            currentDifficulty: curDiff || null,
            sameChapter: Boolean(curChap),
            currentChapterId: curChap || null,
            candidateCount: 1,
            scope: generatorState.currentScope,
            ...(generatorState.currentScope || {})
          })

          if (swapRes && swapRes.replacement) {
            generatorState.previewQuestions[qIdx] = swapRes.replacement
            showToast('Đã đổi câu hỏi thành công!', 'success')
            renderPreviewQuestionsList()
          }
        } catch (err) {
          if (err.message && (err.message.includes('Không còn câu hỏi thay thế') || err.message.includes('NO_MORE_CANDIDATES'))) {
            showToast('Không còn câu hỏi thay thế thỏa mãn điều kiện!', 'warning')
          } else {
            showToast('Không thể đổi câu: ' + err.message, 'error')
          }
          btn.disabled = false
          btn.innerHTML = '<i class="fa-solid fa-arrows-rotate" style="color:#0284c7;"></i> Đổi nhanh'
        }
      })
    })

    // Bind 3 Candidates Swap Modal
    container.querySelectorAll('.btn-swap-candidates').forEach(btn => {
      btn.addEventListener('click', async () => {
        const qIdx = parseInt(btn.getAttribute('data-index'), 10)
        const curId = btn.getAttribute('data-id')
        const qType = btn.getAttribute('data-type')
        const curDiff = btn.getAttribute('data-diff')
        const curChap = btn.getAttribute('data-chap')

        btn.disabled = true
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'

        const excludeIds = Array.from(new Set([
          ...generatorState.previewQuestions.map(q => q.id),
          ...(generatorState.rejectedIds || [])
        ]))

        try {
          const swapRes = await api.swapQuestionInExam({
            currentQuestionId: curId,
            excludeIds,
            questionType: qType,
            sameDifficulty: Boolean(curDiff),
            currentDifficulty: curDiff || null,
            sameChapter: false,
            candidateCount: 3,
            scope: generatorState.currentScope,
            ...(generatorState.currentScope || {})
          })

          const candidates = swapRes?.candidates || (swapRes?.replacement ? [swapRes.replacement] : [])
          if (candidates.length === 0) {
            showToast('Không tìm thấy câu hỏi thay thế phù hợp!', 'warning')
            return
          }

          openCandidatesPickerModal(qIdx, curId, candidates)
        } catch (err) {
          showToast('Lỗi khi tải câu hỏi thay thế: ' + err.message, 'error')
        } finally {
          btn.disabled = false
          btn.innerHTML = '<i class="fa-solid fa-list-check" style="color:#0284c7;"></i> 3 gợi ý'
        }
      })
    })
  }

  // Sub-modal to pick from top 3 candidates
  function openCandidatesPickerModal(qIdx, curId, candidates) {
    const candidateModalContainer = document.createElement('div')
    candidateModalContainer.id = 'candidate-picker-modal-wrap'
    document.body.appendChild(candidateModalContainer)

    const diffMap = {
      'NHAN_BIET': { text: 'Nhận biết', bg: '#eff6ff', color: '#1d4ed8' },
      'THONG_HIEU': { text: 'Thông hiểu', bg: '#f0fdf4', color: '#15803d' },
      'VAN_DUNG': { text: 'Vận dụng', bg: '#fff7ed', color: '#c2410c' },
      'VAN_DUNG_CAO': { text: 'Vận dụng cao', bg: '#fdf2f8', color: '#be185d' }
    }

    let candHtml = ''
    candidates.forEach((cand, cIdx) => {
      const pData = parseQuestionPrompt(cand.prompt)
      const dInfo = diffMap[cand.difficulty] || { text: cand.difficulty || 'Chưa phân loại', bg: '#f1f5f9', color: '#64748b' }
      candHtml += `
        <div style="border:1px solid #cbd5e1; border-radius:10px; padding:14px; margin-bottom:12px; background:#ffffff;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-weight:700; font-size:12px; color:#475569;">Gợi ý ${cIdx + 1}</span>
              <span style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:6px; background:${dInfo.bg}; color:${dInfo.color};">
                ${dInfo.text}
              </span>
              <span style="font-size:11px; color:#94a3b8;">Đã dùng: ${cand.usage_count || 0} lần</span>
            </div>
            <button class="btn-choose-cand" data-cand-idx="${cIdx}" style="padding:6px 14px; font-size:12px; font-weight:600; border-radius:6px; background:#0284c7; color:#ffffff; border:none; cursor:pointer;">
              <i class="fa-solid fa-check"></i> Chọn câu này
            </button>
          </div>
          <div class="math-content" style="font-size:13px; line-height:1.5; color:#1e293b; margin-bottom:8px;">
            ${renderMarkdown(pData.text || '')}
          </div>
          <div style="font-size:12px;">
            ${renderCardAnswers(cand, pData)}
          </div>
        </div>
      `
    })

    candidateModalContainer.innerHTML = `
      <div style="position:fixed; inset:0; background:rgba(15,23,42,0.6); z-index:100000; display:flex; align-items:center; justify-content:center; padding:16px;">
        <div style="width:100%; max-width:760px; max-height:85vh; background:#ffffff; border-radius:14px; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 20px 25px -5px rgba(0,0,0,0.2);">
          <div style="padding:14px 20px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; background:#f8fafc;">
            <h4 style="margin:0; font-size:15px; font-weight:700; color:#0f172a;">
              <i class="fa-solid fa-arrows-rotate" style="color:#0284c7;"></i> Chọn câu hỏi thay thế cho Câu ${qIdx + 1}
            </h4>
            <button id="close-cand-modal-btn" style="background:none; border:none; font-size:18px; color:#94a3b8; cursor:pointer;">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div style="padding:16px 20px; overflow-y:auto; flex:1; background:#f8fafc;">
            ${candHtml}
          </div>
        </div>
      </div>
    `

    renderMath(candidateModalContainer)

    const closeCandModal = () => { candidateModalContainer.remove() }
    candidateModalContainer.querySelector('#close-cand-modal-btn')?.addEventListener('click', closeCandModal)

    candidateModalContainer.querySelectorAll('.btn-choose-cand').forEach(cBtn => {
      cBtn.addEventListener('click', () => {
        const cIdx = parseInt(cBtn.getAttribute('data-cand-idx'), 10)
        const chosen = candidates[cIdx]
        if (chosen) {
          if (!generatorState.rejectedIds) generatorState.rejectedIds = []
          if (curId && !generatorState.rejectedIds.includes(curId)) {
            generatorState.rejectedIds.push(curId)
          }
          generatorState.previewQuestions[qIdx] = chosen
          closeCandModal()
          showToast(`Đã thay thế Câu ${qIdx + 1} thành công!`, 'success')
          renderPreviewQuestionsList()
        }
      })
    })
  }

  // Finalize Create Exam
  btnFinalize?.addEventListener('click', async () => {
    const title = document.getElementById('gen-exam-title')?.value?.trim()
    if (!title) {
      return showToast('Vui lòng nhập tiêu đề cho bài kiểm tra / bài tập!', 'warning')
    }

    const destLessonId = destLessonSel?.value
    if (!destLessonId) {
      return showToast('Vui lòng chọn Bài học đích để lưu trữ bài tập!', 'warning')
    }
    const type = document.getElementById('gen-exam-type')?.value || 'PRACTICE'
    const durationMinutes = Number(document.getElementById('gen-exam-duration')?.value) || 90
    const showSolutions = document.getElementById('gen-show-solutions')?.checked ?? false

    const questionBankIds = generatorState.previewQuestions.map(q => q.id)
    const isMultiVariants = document.getElementById('gen-multi-variants')?.checked
    const variantCodes = isMultiVariants ? ['101', '102', '103', '104'] : []

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
        questionBankIds,
        variantCodes
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
            <textarea id="edit-q-prompt" style="width:100%; height:120px; font-family:'Fira Code', monospace; font-size:13px; padding:10px; border:1px solid #cbd5e1; border-radius:8px;">${escapeTextarea(promptData.text || '')}</textarea>
          </div>

          <!-- Specific Answer editing -->
          ${q.question_type === 'MULTIPLE_CHOICE' ? `
            <div style="margin-bottom:14px;">
              <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Đáp án đúng (A, B, C hoặc D)</label>
              <input type="text" id="edit-q-mc" value="${escapeHtmlAttr(q.mc_answer || '')}" style="width:80px; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-weight:700; font-size:14px; text-transform:uppercase;" />
            </div>
          ` : ''}

          ${q.question_type === 'TRUE_FALSE' ? (() => {
            let tf = {}
            try { tf = typeof q.tf_answers === 'string' ? JSON.parse(q.tf_answers) : (q.tf_answers || {}) } catch (_) { tf = {} }
            return `
            <div style="margin-bottom:14px;">
              <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:6px;">Đáp án Đúng / Sai cho 4 ý a, b, c, d</label>
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:8px;">
                ${['a', 'b', 'c', 'd'].map(k => `
                  <label style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; border:1px solid #e2e8f0; border-radius:8px; background:#f8fafc; font-size:13px; font-weight:600;">
                    <span>Ý ${k})</span>
                    <select id="edit-q-tf-${k}" style="height:30px; border:1px solid #cbd5e1; border-radius:6px; font-size:12px; font-weight:700;">
                      <option value="true" ${tf[k] === true ? 'selected' : ''}>ĐÚNG</option>
                      <option value="false" ${tf[k] !== true ? 'selected' : ''}>SAI</option>
                    </select>
                  </label>
                `).join('')}
              </div>
            </div>
            `
          })() : ''}

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
            <textarea id="edit-q-explanation" style="width:100%; height:100px; font-family:'Fira Code', monospace; font-size:13px; padding:10px; border:1px solid #cbd5e1; border-radius:8px;">${escapeTextarea(promptData.explanation || '')}</textarea>
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
      const mc = document.getElementById('edit-q-mc')?.value?.trim().toUpperCase() || null
      if (mc && !['A', 'B', 'C', 'D'].includes(mc)) {
        showToast('Đáp án trắc nghiệm phải là A, B, C hoặc D!', 'error')
        return
      }
      updatePayload.mc_answer = mc
    } else if (q.question_type === 'TRUE_FALSE') {
      updatePayload.tf_answers = {
        a: document.getElementById('edit-q-tf-a')?.value === 'true',
        b: document.getElementById('edit-q-tf-b')?.value === 'true',
        c: document.getElementById('edit-q-tf-c')?.value === 'true',
        d: document.getElementById('edit-q-tf-d')?.value === 'true'
      }
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
