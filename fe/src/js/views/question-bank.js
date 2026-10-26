import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { showToast } from '../components/toast.js'
import { state } from '../state.js'
import { api } from '../api.js'
import { renderHomeworkConfigFields, bindHomeworkConfigFields, bindHomeworkTypeCoupling, collectHomeworkConfig } from '../components/homework-config-fields.js'
import { parseExamMarkdown, renderMath, renderMarkdown, validateQuestionDiagrams, MATH_TEMPLATE, CHEM_TEMPLATE, compressImage } from '../utils/exam-parser.js'
import { renderPaginationBar, bindPaginationEvents } from '../components/pagination.js'

// ========================================================
// View State
// ========================================================
function escapeHtmlAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
function escapeTextarea(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
let allQuestions = []
let allClasses = []
let cachedGradeBlocksList = []
let constantTaxonomyState = {
  gradeBlocks: [],
  classes: [],
  chapters: [],
  lessons: [],
  questionTypes: []
}

let selectedQuestionIds = new Set()

let filterState = {
  gradeBlock: '',
  classId: '',
  chapterId: '',
  lessonId: '',
  lessonIds: [], // Hỗ trợ chọn nhiều bài học trong 1 chương
  questionTypeId: '', // Dạng bài Constant (khác questionType = loại câu hỏi)
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
  scopeMode: 'MULTI', // Unified scope panel: always MULTI
  scopeType: 'MULTI',
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
            <div style="flex:1; min-width:280px;">
              <div style="display:flex; align-items:center; gap:12px; margin-bottom:8px;">
                <span style="display:inline-flex; align-items:center; justify-content:center; width:44px; height:44px; border-radius:12px; background:linear-gradient(135deg, #0284c7, #0369a1); color:#ffffff; font-size:20px; box-shadow:0 3px 10px rgba(2,132,199,0.25); flex-shrink:0;">
                  <i class="fa-solid fa-boxes-stacked"></i>
                </span>
                <div>
                  <h1 class="page-title" style="font-family:var(--font-heading); font-size:24px; font-weight:700; color:#0f172a; margin:0; line-height:1.2;">
                    Ngân hàng câu hỏi & Đề thi
                  </h1>
                  <span style="display:inline-block; font-size:11px; font-weight:700; color:#0284c7; background:#eff6ff; border:1px solid #bfdbfe; padding:1px 8px; border-radius:999px; margin-top:3px;">
                    <i class="fa-solid fa-shield-halved" style="font-size:10px;"></i> Chuẩn hóa Constant Taxonomy
                  </span>
                </div>
              </div>
              <p class="page-description" style="font-size:13.5px; color:#64748b; margin:0; max-width:820px; line-height:1.5;">
                Kho lưu trữ câu hỏi chuẩn hóa phân tầng theo Khối &rarr; Lớp &rarr; Chương &rarr; Bài học Constant. Tự động nhập từ Markdown, trích xuất từ bài tập cũ, đồng bộ từ chương trình động và tạo đề thi ma trận.
              </p>
            </div>

            <!-- Header Action Buttons (Hierarchical Grouping) -->
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
              <!-- Primary Action: Đồng bộ sang Constant (Green) -->
              <button id="btn-open-sync-modal" class="btn-primary" style="width:auto; padding:9px 16px; font-size:13px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:8px; border-radius:10px; background:linear-gradient(135deg, #10b981, #059669); color:#ffffff; border:none; box-shadow:0 3px 12px rgba(16,185,129,0.28); transition:transform 0.15s, box-shadow 0.15s;">
                <i class="fa-solid fa-cloud-arrow-up"></i> Đồng bộ sang Constant
              </button>

              <!-- Highlight Action: Tạo đề theo Ma trận (Blue Primary) -->
              <button id="btn-open-matrix-gen" class="btn-primary" style="width:auto; padding:9px 16px; font-size:13px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:8px; border-radius:10px; background:linear-gradient(135deg, #0284c7, #0369a1); color:#ffffff; border:none; box-shadow:0 3px 12px rgba(2,132,199,0.25); transition:transform 0.15s, box-shadow 0.15s;">
                <i class="fa-solid fa-wand-magic-sparkles"></i> Tạo đề theo Ma trận
              </button>

              <!-- Secondary Action: Danh mục Constant -->
              <button id="btn-open-taxonomy-modal" class="btn-secondary" style="width:auto; padding:9px 14px; font-size:13px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:7px; border-radius:10px; background:#ffffff; border:1px solid #cbd5e1; color:#334155; box-shadow:0 1px 2px rgba(0,0,0,0.04); transition:all 0.15s;">
                <i class="fa-solid fa-sitemap" style="color:#6366f1;"></i> Danh mục Constant
              </button>

              <!-- Secondary Action: Nhập từ Markdown -->
              <button id="btn-open-import-md" class="btn-secondary" style="width:auto; padding:9px 14px; font-size:13px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:7px; border-radius:10px; background:#ffffff; border:1px solid #cbd5e1; color:#334155; box-shadow:0 1px 2px rgba(0,0,0,0.04); transition:all 0.15s;">
                <i class="fa-solid fa-file-arrow-up" style="color:#0284c7;"></i> Nhập từ Markdown
              </button>

              <!-- Secondary Action: Lấy từ Bài tập cũ -->
              <button id="btn-open-import-hw" class="btn-secondary" style="width:auto; padding:9px 14px; font-size:13px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:7px; border-radius:10px; background:#ffffff; border:1px solid #cbd5e1; color:#334155; box-shadow:0 1px 2px rgba(0,0,0,0.04); transition:all 0.15s;">
                <i class="fa-solid fa-clock-rotate-left" style="color:#8b5cf6;"></i> Lấy từ Bài cũ
              </button>
            </div>
          </div>

          <!-- Statistics Counters Cards (4 balanced responsive cards) -->
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:16px; margin-bottom:24px;">
            <!-- Total -->
            <div class="card" style="margin:0; padding:18px 20px; border:1px solid #e2e8f0; border-radius:14px; background:#ffffff; display:flex; align-items:center; gap:16px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
              <div style="width:48px; height:48px; border-radius:12px; background:linear-gradient(135deg, #eff6ff, #dbeafe); color:#0284c7; display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0; box-shadow:0 2px 6px rgba(2,132,199,0.12);">
                <i class="fa-solid fa-boxes-stacked"></i>
              </div>
              <div style="flex:1; min-width:0;">
                <div style="font-size:11.5px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.04em;">Tổng số câu hỏi</div>
                <div id="stat-total-q" style="font-size:24px; font-weight:800; color:#0f172a; font-family:var(--font-heading); line-height:1.2; margin:2px 0;">0</div>
                <div style="font-size:11px; color:#0284c7; font-weight:600; display:inline-flex; align-items:center; gap:4px;">
                  <i class="fa-solid fa-database" style="font-size:10px;"></i> Toàn bộ kho câu hỏi
                </div>
              </div>
            </div>

            <!-- MC -->
            <div class="card" style="margin:0; padding:18px 20px; border:1px solid #e2e8f0; border-radius:14px; background:#ffffff; display:flex; align-items:center; gap:16px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
              <div style="width:48px; height:48px; border-radius:12px; background:linear-gradient(135deg, #ecfdf5, #d1fae5); color:#059669; display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0; box-shadow:0 2px 6px rgba(5,150,105,0.12);">
                <i class="fa-solid fa-list-check"></i>
              </div>
              <div style="flex:1; min-width:0;">
                <div style="font-size:11.5px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.04em;">Trắc nghiệm (Phần I)</div>
                <div id="stat-mc-q" style="font-size:24px; font-weight:800; color:#059669; font-family:var(--font-heading); line-height:1.2; margin:2px 0;">0</div>
                <div style="font-size:11px; color:#059669; font-weight:600;">
                  4 lựa chọn (ABCD)
                </div>
              </div>
            </div>

            <!-- TF -->
            <div class="card" style="margin:0; padding:18px 20px; border:1px solid #e2e8f0; border-radius:14px; background:#ffffff; display:flex; align-items:center; gap:16px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
              <div style="width:48px; height:48px; border-radius:12px; background:linear-gradient(135deg, #fffbeb, #fef3c7); color:#d97706; display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0; box-shadow:0 2px 6px rgba(217,119,6,0.12);">
                <i class="fa-solid fa-square-check"></i>
              </div>
              <div style="flex:1; min-width:0;">
                <div style="font-size:11.5px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.04em;">Đúng / Sai (Phần II)</div>
                <div id="stat-tf-q" style="font-size:24px; font-weight:800; color:#d97706; font-family:var(--font-heading); line-height:1.2; margin:2px 0;">0</div>
                <div style="font-size:11px; color:#d97706; font-weight:600;">
                  4 ý (a, b, c, d)
                </div>
              </div>
            </div>

            <!-- SA -->
            <div class="card" style="margin:0; padding:18px 20px; border:1px solid #e2e8f0; border-radius:14px; background:#ffffff; display:flex; align-items:center; gap:16px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
              <div style="width:48px; height:48px; border-radius:12px; background:linear-gradient(135deg, #faf5ff, #f3e8ff); color:#9333ea; display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0; box-shadow:0 2px 6px rgba(147,51,234,0.12);">
                <i class="fa-solid fa-pen-clip"></i>
              </div>
              <div style="flex:1; min-width:0;">
                <div style="font-size:11.5px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.04em;">Trả lời ngắn (Phần III)</div>
                <div id="stat-sa-q" style="font-size:24px; font-weight:800; color:#9333ea; font-family:var(--font-heading); line-height:1.2; margin:2px 0;">0</div>
                <div style="font-size:11px; color:#9333ea; font-weight:600;">
                  Điền số / kết quả
                </div>
              </div>
            </div>
          </div>

          <!-- Filter & Search Card (Hierarchical Constant Taxonomy & Attributes) -->
          <div class="card" style="margin:0 0 24px 0; padding:20px 22px; border:1px solid #e2e8f0; border-radius:16px; background:#ffffff; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
            
            <!-- Filter Header -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid #f1f5f9; flex-wrap:wrap; gap:8px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <div style="width:28px; height:28px; border-radius:8px; background:#e0f2fe; color:#0284c7; display:flex; align-items:center; justify-content:center; font-size:13px;">
                  <i class="fa-solid fa-filter"></i>
                </div>
                <span style="font-size:14px; font-weight:700; color:#0f172a;">Bộ lọc Danh mục Constant & Thuộc tính câu hỏi</span>
              </div>
              <span style="font-size:11.5px; font-weight:600; color:#0284c7; background:#eff6ff; border:1px solid #bfdbfe; padding:2px 8px; border-radius:999px;">
                <i class="fa-solid fa-sitemap" style="font-size:10px;"></i> Phân cấp 4 tầng
              </span>
            </div>

            <!-- Hàng 1: Taxonomy Phân cấp Constant (Khối -> Lớp -> Chương -> Bài) -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:14px; margin-bottom:14px;">
              
              <!-- Filter: Khối học (Search by Grade Block) -->
              <div>
                <label style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:#475569; margin-bottom:6px;">
                  <i class="fa-solid fa-layer-group" style="color:#0284c7; font-size:11px;"></i> Khối học
                </label>
                <select id="qb-filter-grade-block" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#f8fafc; color:#1e293b; outline:none; transition:border-color 0.15s;">
                  <option value="">-- Tất cả các Khối --</option>
                  ${cachedGradeBlocksList.map(b => `<option value="${b}" ${b === filterState.gradeBlock ? 'selected' : ''}>${b}</option>`).join('')}
                </select>
              </div>

              <!-- Filter: Lớp học Constant (cascading Khối -> Lớp -> Chương -> Bài) -->
              <div>
                <label style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:#475569; margin-bottom:6px;">
                  <i class="fa-solid fa-graduation-cap" style="color:#059669; font-size:11px;"></i> Lớp Constant
                </label>
                <select id="qb-filter-class" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#f8fafc; color:#1e293b; outline:none; transition:border-color 0.15s;">
                  <option value="">-- Tất cả Lớp --</option>
                </select>
              </div>

              <!-- Filter: Chương Constant -->
              <div>
                <label style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:#475569; margin-bottom:6px;">
                  <i class="fa-solid fa-book-bookmark" style="color:#6366f1; font-size:11px;"></i> Chương Constant
                </label>
                <select id="qb-filter-chapter" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#f8fafc; color:#1e293b; outline:none; transition:border-color 0.15s;">
                  <option value="">-- Tất cả Chương --</option>
                </select>
              </div>

              <!-- Filter: Bài học Constant (Multi-Select) -->
              <div style="position:relative;" id="qb-filter-lesson-wrap">
                <label style="display:flex; justify-content:space-between; align-items:center; font-size:12px; font-weight:600; color:#475569; margin-bottom:6px;">
                  <span style="display:flex; align-items:center; gap:6px;">
                    <i class="fa-solid fa-file-lines" style="color:#8b5cf6; font-size:11px;"></i> Bài học Constant
                  </span>
                  <span id="qb-filter-lesson-count-badge" style="display:none; font-size:11px; font-weight:700; background:#eff6ff; color:#0284c7; border:1px solid #bfdbfe; padding:1px 6px; border-radius:999px;">0 bài</span>
                </label>
                <div id="qb-filter-lesson-trigger" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#f8fafc; color:#1e293b; cursor:pointer; display:flex; justify-content:space-between; align-items:center; user-select:none; transition:border-color 0.15s;">
                  <span id="qb-filter-lesson-display" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;">-- Tất cả Bài học --</span>
                  <i id="qb-filter-lesson-chevron" class="fa-solid fa-chevron-down" style="font-size:11px; color:#64748b; margin-left:6px; transition:transform 0.2s;"></i>
                </div>
                <!-- Dropdown panel -->
                <div id="qb-filter-lesson-dropdown" style="display:none; position:absolute; top:calc(100% + 4px); left:0; width:100%; min-width:280px; max-height:280px; overflow-y:auto; background:#ffffff; border:1px solid #cbd5e1; border-radius:10px; box-shadow:0 12px 24px -4px rgba(0,0,0,0.12); z-index:1000; padding:10px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid #f1f5f9;">
                    <button type="button" id="qb-lesson-select-all" style="font-size:11.5px; font-weight:700; color:#0284c7; background:none; border:none; cursor:pointer; padding:2px 4px;">Chọn tất cả</button>
                    <button type="button" id="qb-lesson-clear-all" style="font-size:11.5px; font-weight:700; color:#ef4444; background:none; border:none; cursor:pointer; padding:2px 4px;">Bỏ chọn</button>
                  </div>
                  <div id="qb-filter-lesson-list">
                    <div style="font-size:12px; color:#94a3b8; padding:8px; text-align:center;">Vui lòng chọn Chương học trước</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Hàng 2: Thuộc tính & Trạng thái phân loại -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:14px; margin-bottom:16px;">
              <!-- Filter: Dạng bài Constant -->
              <div>
                <label style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:#475569; margin-bottom:6px;">
                  <i class="fa-solid fa-diagram-project" style="color:#db2777; font-size:11px;"></i> Dạng bài Constant
                </label>
                <select id="qb-filter-question-type-id" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#f8fafc; color:#1e293b; outline:none; transition:border-color 0.15s;">
                  <option value="">-- Tất cả Dạng bài --</option>
                </select>
              </div>

              <!-- Filter: Question Type -->
              <div>
                <label style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:#475569; margin-bottom:6px;">
                  <i class="fa-solid fa-tag" style="color:#0ea5e9; font-size:11px;"></i> Dạng câu hỏi
                </label>
                <select id="qb-filter-type" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#f8fafc; color:#1e293b; outline:none; transition:border-color 0.15s;">
                  <option value="">-- Tất cả các dạng --</option>
                  <option value="MULTIPLE_CHOICE">Trắc nghiệm ABCD (Phần I)</option>
                  <option value="TRUE_FALSE">Đúng / Sai 4 ý (Phần II)</option>
                  <option value="SHORT_ANSWER">Trả lời ngắn / Điền số (Phần III)</option>
                </select>
              </div>

              <!-- Filter: Difficulty -->
              <div>
                <label style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:#475569; margin-bottom:6px;">
                  <i class="fa-solid fa-gauge-high" style="color:#f59e0b; font-size:11px;"></i> Mức độ nhận thức
                </label>
                <select id="qb-filter-difficulty" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#f8fafc; color:#1e293b; outline:none; transition:border-color 0.15s;">
                  <option value="">-- Tất cả mức độ --</option>
                  <option value="NHAN_BIET">Nhận biết</option>
                  <option value="THONG_HIEU">Thông hiểu</option>
                  <option value="VAN_DUNG">Vận dụng</option>
                  <option value="VAN_DUNG_CAO">Vận dụng cao</option>
                </select>
              </div>

              <!-- Filter: 3-State Unassigned (Phase 1.4) -->
              <div>
                <label style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:#475569; margin-bottom:6px;">
                  <i class="fa-solid fa-triangle-exclamation" style="color:#e11d48; font-size:11px;"></i> Trạng thái phân loại
                </label>
                <select id="qb-filter-unassigned" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#f8fafc; color:#1e293b; outline:none; transition:border-color 0.15s;">
                  <option value="">-- Tất cả trạng thái --</option>
                  <option value="no_class">Chưa gán Lớp học</option>
                  <option value="no_chapter">Chưa gán Chương</option>
                  <option value="no_lesson">Chưa gán Bài học</option>
                </select>
              </div>
            </div>

            <!-- Hàng 3: Search input & Reset -->
            <div style="display:flex; gap:12px; align-items:center; padding-top:14px; border-top:1px dashed #e2e8f0; flex-wrap:wrap;">
              <div style="position:relative; flex:1; min-width:260px;">
                <i class="fa-solid fa-magnifying-glass" style="position:absolute; left:12px; top:13px; color:#94a3b8; font-size:13px;"></i>
                <input id="qb-search-input" type="text" placeholder="Tìm kiếm theo nội dung câu hỏi, công thức LaTeX ($...$), từ khóa hoặc đáp án..." style="width:100%; height:40px; border:1px solid #cbd5e1; border-radius:10px; padding:0 12px 0 36px; font-size:13px; background:#f8fafc; color:#1e293b; outline:none; transition:border-color 0.15s;">
              </div>
              <button id="qb-btn-reset-filters" class="btn-secondary" style="height:40px; padding:0 16px; font-size:13px; font-weight:600; border-radius:10px; display:inline-flex; align-items:center; gap:6px; color:#475569; background:#f8fafc; border:1px solid #cbd5e1; cursor:pointer; transition:all 0.15s;">
                <i class="fa-solid fa-rotate-left"></i> Đặt lại bộ lọc
              </button>
            </div>
          </div>

          <!-- Sticky Bulk Action Toolbar (Phase 1.6) -->
          <div id="qb-bulk-bar" style="display:none; position:sticky; top:16px; z-index:100; margin-bottom:18px; padding:12px 20px; background:#0f172a; color:#ffffff; border-radius:14px; box-shadow:0 12px 30px -4px rgba(15,23,42,0.35); border:1px solid #334155; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
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
              <button id="qb-bulk-delete-btn" style="height:34px; padding:0 16px; border-radius:8px; border:none; background:linear-gradient(135deg, #ef4444, #dc2626); color:#ffffff; font-size:13px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-trash-can"></i> Xóa hàng loạt
              </button>
              <button id="qb-bulk-deselect-btn" style="height:34px; padding:0 12px; border-radius:8px; border:1px solid #475569; background:#1e293b; color:#cbd5e1; font-size:13px; cursor:pointer;">
                Bỏ chọn
              </button>
            </div>
          </div>

          <!-- Questions List Section Header & Select All Toolbar -->
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <label style="display:inline-flex; align-items:center; gap:8px; font-size:13px; font-weight:600; color:#334155; cursor:pointer; background:#ffffff; padding:6px 14px; border-radius:8px; border:1px solid #e2e8f0; box-shadow:0 1px 2px rgba(0,0,0,0.03);">
                <input type="checkbox" id="qb-select-all-page" style="width:16px; height:16px; accent-color:#0284c7; cursor:pointer;" />
                Chọn tất cả trang này
              </label>
              <span style="font-size:13px; color:#64748b; font-weight:500;">
                (Hiển thị <strong id="qb-current-count" style="color:#0f172a;">0</strong> câu hỏi)
              </span>
            </div>
            <div style="font-size:12px; color:#94a3b8; display:inline-flex; align-items:center; gap:6px;">
              <i class="fa-solid fa-eye" style="font-size:11px;"></i> Chế độ xem chi tiết câu hỏi & đáp án
            </div>
          </div>

          <div id="qb-questions-container" style="display:flex; flex-direction:column; gap:16px;">
            <!-- Loading skeleton or Question Cards will render here -->
            <div class="card" style="margin:0; padding:40px 20px; text-align:center; border:1px solid #e2e8f0; border-radius:14px; background:#ffffff;">
              <div style="width:48px; height:48px; border-radius:50%; background:#eff6ff; color:#0284c7; display:inline-flex; align-items:center; justify-content:center; font-size:22px; margin-bottom:12px;">
                <i class="fa-solid fa-circle-notch fa-spin"></i>
              </div>
              <div style="font-size:15px; font-weight:600; color:#1e293b;">Đang tải danh sách câu hỏi...</div>
              <div style="font-size:13px; color:#64748b; margin-top:4px;">Đang kết nối kho dữ liệu Ngân hàng câu hỏi chuẩn hóa</div>
            </div>
          </div>

          <!-- Pagination Container -->
          <div id="qb-pagination-container" style="margin-top:20px;"></div>

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

async function loadConstantTaxonomyData(params = '') {
  try {
    const res = await api.getConstantTaxonomy(params)
    if (res) {
      constantTaxonomyState = {
        gradeBlocks: Array.isArray(res.gradeBlocks) ? res.gradeBlocks : [],
        classes: Array.isArray(res.classes) ? res.classes : [],
        chapters: Array.isArray(res.chapters) ? res.chapters : [],
        lessons: Array.isArray(res.lessons) ? res.lessons : [],
        questionTypes: Array.isArray(res.questionTypes) ? res.questionTypes : []
      }
    }
  } catch (err) {
    console.error('[QuestionBank] Lỗi tải danh mục Constant:', err)
    throw new Error('Lỗi tải danh mục Constant: ' + (err.message || 'Không thể kết nối máy chủ'))
  }
}

async function loadInitialData() {
  try {
    // Read query params from URL hash (e.g. #question-bank?gradeBlock=12-Toán)
    const hashUrl = window.location.hash.replace('#', '')
    const [, queryString] = hashUrl.split('?')
    const urlParams = new URLSearchParams(queryString || '')
    const urlGradeBlock = urlParams.get('gradeBlock')
    if (urlGradeBlock) {
      filterState.gradeBlock = urlGradeBlock
    }

    // 1. Fetch fresh Question Bank CONSTANT taxonomy (khối, lớp, chương, bài)
    await loadConstantTaxonomyData()

    // 2. Tải song song danh sách lớp động của chương trình để phục vụ Modal Tạo bài tập & Modal Sync Nguồn
    try {
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
    } catch (e) {
      console.warn('[QuestionBank] Dynamic classes load failed (non-critical for constant filter):', e)
    }

    // 3. Khởi tạo dropdown Khối/Lớp/Chương/Bài từ taxonomy Constant
    populateGradeBlockDropdowns()

    // 4. Fetch question bank items AND statistics simultaneously in 1 single unified API request!
    await fetchAndRenderQuestions({ includeStats: true })
  } catch (err) {
    console.error('[QuestionBank] Error loading initial data:', err)
    showToast(err.message, 'error')
    const container = document.getElementById('qb-questions-container')
    if (container) {
      container.innerHTML = `
        <div class="card" style="margin:0; padding:32px 20px; text-align:center; border:1px solid #fee2e2; border-radius:14px; background:#fff5f5; color:#991b1b;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size:32px; margin-bottom:12px; color:#ef4444;"></i>
          <h4 style="margin:0 0 8px 0; font-size:16px; font-weight:700;">Không thể tải danh mục Constant của Ngân hàng câu hỏi</h4>
          <p style="margin:0; font-size:13px; color:#b91c1c;">${escapeHtml(err.message)}</p>
          <p style="margin:10px 0 0 0; font-size:12px; color:#64748b;">(Vui lòng đảm bảo migration <code>20261023000000_question_bank_constant_taxonomy.sql</code> đã được áp dụng trên cơ sở dữ liệu Supabase)</p>
        </div>
      `
    }
  }
}

function populateGradeBlockDropdowns() {
  const filterSelect = document.getElementById('qb-filter-grade-block')
  if (!filterSelect) return

  let blocks = (constantTaxonomyState.gradeBlocks || []).map(b => b.code || b.name).filter(Boolean)
  if (blocks.length === 0) {
    blocks = (constantTaxonomyState.classes || []).map(c => c.grade_block || c.gradeBlock).filter(Boolean)
  }
  if (blocks.length === 0) {
    blocks = ['12-Toán', '11-Toán', '10-Toán']
  }

  cachedGradeBlocksList = Array.from(new Set(blocks))

  let html = '<option value="">-- Tất cả các Khối --</option>'
  cachedGradeBlocksList.forEach(b => {
    const isSelected = filterState.gradeBlock === b ? 'selected' : ''
    html += `<option value="${escapeHtmlAttr(b)}" ${isSelected}>${escapeHtml(b)}</option>`
  })
  filterSelect.innerHTML = html

  const classSelect = document.getElementById('qb-filter-class')
  if (classSelect) {
    loadConstantClassesForGradeBlock(filterState.gradeBlock, classSelect)
  }

  const chapterSelect = document.getElementById('qb-filter-chapter')
  if (chapterSelect) {
    loadConstantChaptersForGradeBlockOrClass(filterState.gradeBlock, filterState.classId, chapterSelect)
  }
  populateQuestionTypeFilter()
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
    if (filterState.questionTypeId) params += `qbQuestionTypeId=${encodeURIComponent(filterState.questionTypeId)}&`
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
  const questionTypeIdSelect = document.getElementById('qb-filter-question-type-id')
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
    filterState.questionTypeId = ''
    renderMainFilterLessonCheckboxes()
    updateMainFilterLessonDisplay()
    populateQuestionTypeFilter()
    filterState.page = 1
    await fetchAndRenderQuestions({ includeStats: true })
    await refreshStats()
  })

  // Clear all lessons
  document.getElementById('qb-lesson-clear-all')?.addEventListener('click', async (e) => {
    e.stopPropagation()
    filterState.lessonIds = []
    filterState.lessonId = ''
    filterState.questionTypeId = ''
    renderMainFilterLessonCheckboxes()
    updateMainFilterLessonDisplay()
    populateQuestionTypeFilter()
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
    filterState.questionTypeId = ''
    filterState.page = 1
    selectedQuestionIds.clear()

    const classSelect = document.getElementById('qb-filter-class')
    loadConstantClassesForGradeBlock(filterState.gradeBlock, classSelect)

    loadConstantChaptersForGradeBlockOrClass(filterState.gradeBlock, '', chapterSelect)
    populateMainFilterLessons('')
    populateQuestionTypeFilter()

    await fetchAndRenderQuestions({ includeStats: true })
  })

  // Cascading: Lớp học changed (Khối -> Lớp -> Chương -> Bài)
  document.getElementById('qb-filter-class')?.addEventListener('change', async (e) => {
    filterState.classId = e.target.value
    filterState.chapterId = ''
    filterState.lessonId = ''
    filterState.lessonIds = []
    filterState.questionTypeId = ''
    filterState.page = 1
    selectedQuestionIds.clear()

    loadConstantChaptersForGradeBlockOrClass(filterState.gradeBlock, filterState.classId, chapterSelect)
    populateMainFilterLessons('')
    populateQuestionTypeFilter()
    await fetchAndRenderQuestions({ includeStats: true })
  })

  // Cascading: Chapter changed
  chapterSelect?.addEventListener('change', async (e) => {
    filterState.chapterId = e.target.value
    filterState.lessonId = ''
    filterState.lessonIds = []
    filterState.questionTypeId = ''
    filterState.page = 1
    selectedQuestionIds.clear()

    populateMainFilterLessons(filterState.chapterId)
    populateQuestionTypeFilter()
    await fetchAndRenderQuestions({ includeStats: true })
  })

  questionTypeIdSelect?.addEventListener('change', async (e) => {
    filterState.questionTypeId = e.target.value
    filterState.page = 1
    selectedQuestionIds.clear()
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
      questionTypeId: '',
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
    const classSelectReset = document.getElementById('qb-filter-class')
    if (classSelectReset) loadConstantClassesForGradeBlock('', classSelectReset)
    if (chapterSelect) loadConstantChaptersForGradeBlockOrClass('', '', chapterSelect)
    updateMainFilterLessonDisplay()
    const listContainer = document.getElementById('qb-filter-lesson-list')
    if (listContainer) listContainer.innerHTML = '<div style="font-size:12px; color:#94a3b8; padding:8px; text-align:center;">Vui lòng chọn Chương học trước</div>'
    if (typeSelect) typeSelect.value = ''
    if (diffSelect) diffSelect.value = ''
    if (unassignedSelect) unassignedSelect.value = ''
    if (questionTypeIdSelect) questionTypeIdSelect.value = ''
    if (searchInput) searchInput.value = ''

    await fetchAndRenderQuestions({ includeStats: true })
  })
}

function populateMainFilterLessons(chapterId) {
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

  const lessons = (constantTaxonomyState.lessons || []).filter(l => l.chapter_id === chapterId)
  lessons.sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
  mainFilterLessonsCache = lessons

  if (mainFilterLessonsCache.length === 0) {
    listContainer.innerHTML = '<div style="font-size:12px; color:#94a3b8; padding:8px; text-align:center;">Chương này chưa có bài học constant nào</div>'
    return
  }

  renderMainFilterLessonCheckboxes()
}

function populateQuestionTypeFilter() {
  const select = document.getElementById('qb-filter-question-type-id')
  if (!select) return

  const lessonIds = new Set(filterState.lessonIds || [])
  if (filterState.lessonId) lessonIds.add(filterState.lessonId)
  let types = constantTaxonomyState.questionTypes || []

  if (lessonIds.size > 0) {
    types = types.filter(t => lessonIds.has(t.lesson_id))
  } else if (filterState.chapterId) {
    const chapterLessonIds = new Set((constantTaxonomyState.lessons || [])
      .filter(l => l.chapter_id === filterState.chapterId).map(l => l.id))
    types = types.filter(t => chapterLessonIds.has(t.lesson_id))
  } else if (filterState.classId || filterState.gradeBlock) {
    const classIds = new Set((constantTaxonomyState.classes || [])
      .filter(c => filterState.classId
        ? c.id === filterState.classId
        : (c.grade_block || c.gradeBlock) === filterState.gradeBlock)
      .map(c => c.id))
    const chapterIds = new Set((constantTaxonomyState.chapters || [])
      .filter(ch => classIds.has(ch.class_id)).map(ch => ch.id))
    const classLessonIds = new Set((constantTaxonomyState.lessons || [])
      .filter(l => chapterIds.has(l.chapter_id)).map(l => l.id))
    types = types.filter(t => classLessonIds.has(t.lesson_id))
  }

  types = [...types].sort((a, b) => (a.order_index || 0) - (b.order_index || 0)
    || String(a.name).localeCompare(String(b.name), 'vi'))
  if (!types.some(t => t.id === filterState.questionTypeId)) filterState.questionTypeId = ''
  select.innerHTML = '<option value="">-- Tất cả Dạng bài --</option>' + types
    .map(t => `<option value="${escapeHtmlAttr(t.id)}" ${t.id === filterState.questionTypeId ? 'selected' : ''}>${escapeHtml(t.name)}</option>`)
    .join('')
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
      populateQuestionTypeFilter()
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

function loadConstantClassesForGradeBlock(gradeBlock, targetSelect) {
  if (!targetSelect) return
  const list = (constantTaxonomyState.classes || []).filter(c => !gradeBlock || (c.grade_block || c.gradeBlock) === gradeBlock)
  list.sort((a, b) => (a.order_index || 0) - (b.order_index || 0))

  let html = '<option value="">-- Tất cả Lớp --</option>'
  if (list.length === 0 && gradeBlock) {
    html += '<option value="" disabled>(Khối này chưa có lớp constant)</option>'
  } else {
    list.forEach(c => {
      const isSelected = filterState.classId === c.id ? 'selected' : ''
      html += `<option value="${c.id}" ${isSelected}>${escapeHtml(c.name)}</option>`
    })
  }
  targetSelect.innerHTML = html
}

function loadConstantChaptersForGradeBlockOrClass(gradeBlock, classId, targetSelect) {
  if (!targetSelect) return

  let matchingClasses = constantTaxonomyState.classes || []
  if (classId) {
    matchingClasses = matchingClasses.filter(c => c.id === classId)
  } else if (gradeBlock) {
    matchingClasses = matchingClasses.filter(c => (c.grade_block || c.gradeBlock) === gradeBlock)
  }

  const validClassIds = new Set(matchingClasses.map(c => c.id))
  const classNameMap = new Map(matchingClasses.map(c => [c.id, c.name]))

  let chapters = (constantTaxonomyState.chapters || [])
  if (classId || gradeBlock) {
    chapters = chapters.filter(ch => validClassIds.has(ch.class_id))
  }

  chapters.sort((a, b) => (a.order_index || 0) - (b.order_index || 0))

  let html = '<option value="">-- Tất cả Chương --</option>'
  if (chapters.length === 0 && (classId || gradeBlock)) {
    html += '<option value="" disabled>(Chưa có chương constant nào)</option>'
  } else {
    chapters.forEach(ch => {
      const isSelected = filterState.chapterId === ch.id ? 'selected' : ''
      const clName = classNameMap.get(ch.class_id)
      const label = clName && !classId ? `${ch.title} (${clName})` : ch.title
      html += `<option value="${ch.id}" ${isSelected}>${escapeHtml(label)}</option>`
    })
  }
  targetSelect.innerHTML = html
}

// Helpers tải dữ liệu động từ curriculum phục vụ Modal Giao bài tập về lớp học
async function loadChaptersForClass(classId, targetSelect) {
  if (!targetSelect) return
  try {
    const chapters = await api.getChapters(classId, true)
    let html = '<option value="">-- Tất cả Chương --</option>'
    ;(chapters || []).forEach(ch => {
      html += `<option value="${ch.id}">${escapeHtml(ch.title)}</option>`
    })
    targetSelect.innerHTML = html
  } catch (e) {
    console.warn('[QuestionBank] Failed to load dynamic chapters:', e)
  }
}

async function loadLessonsForChapter(chapterId, targetSelect) {
  if (!targetSelect) return
  try {
    const lessons = await api.getLessons(chapterId)
    let html = '<option value="">-- Tất cả Bài học --</option>'
    ;(lessons || []).forEach(l => {
      html += `<option value="${l.id}">${escapeHtml(l.title)}</option>`
    })
    targetSelect.innerHTML = html
  } catch (e) {
    console.warn('[QuestionBank] Failed to load dynamic lessons:', e)
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
    <div class="card" style="margin:0; padding:48px 20px; text-align:center; border:1px solid #e2e8f0; border-radius:14px; background:#ffffff;">
      <div style="width:52px; height:52px; border-radius:50%; background:#eff6ff; color:#0284c7; display:inline-flex; align-items:center; justify-content:center; font-size:24px; margin-bottom:12px; box-shadow:0 2px 8px rgba(2,132,199,0.12);">
        <i class="fa-solid fa-circle-notch fa-spin"></i>
      </div>
      <div style="font-size:15px; font-weight:600; color:#1e293b;">Đang tải danh sách câu hỏi...</div>
      <div style="font-size:13px; color:#64748b; margin-top:4px;">Hệ thống đang truy vấn kho câu hỏi theo bộ lọc phân cấp</div>
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
    if (filterState.questionTypeId) paramsObj.set('qbQuestionTypeId', filterState.questionTypeId)
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
        <div class="card" style="margin:0; padding:48px 24px; text-align:center; border:2px dashed #cbd5e1; border-radius:16px; background:#f8fafc;">
          <div style="width:64px; height:64px; border-radius:50%; background:linear-gradient(135deg, #eff6ff, #dbeafe); color:#0284c7; display:inline-flex; align-items:center; justify-content:center; font-size:26px; margin-bottom:14px; box-shadow:0 2px 8px rgba(2,132,199,0.12);">
            <i class="fa-solid fa-box-open"></i>
          </div>
          <h3 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a; margin:0 0 6px 0;">
            Chưa có câu hỏi nào phù hợp bộ lọc
          </h3>
          <p style="font-size:13.5px; color:#64748b; margin:0 auto 20px auto; max-width:540px; line-height:1.5;">
            Bạn có thể điều chỉnh lại tiêu chí lọc hoặc nhập câu hỏi mới bằng file Markdown, đồng bộ từ bài học động sang Constant, hoặc lấy nhanh từ bài tập cũ.
          </p>
          <div style="display:flex; justify-content:center; gap:10px; flex-wrap:wrap;">
            <button id="qb-empty-import-md" class="btn-primary" style="width:auto; padding:9px 18px; font-size:13.5px; font-weight:600; border-radius:10px; background:linear-gradient(135deg, #0284c7, #0369a1); color:#ffffff; border:none; cursor:pointer; display:inline-flex; align-items:center; gap:8px; box-shadow:0 3px 12px rgba(2,132,199,0.25);">
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
      <div class="card" style="margin:0; padding:36px 20px; text-align:center; border:1px solid #fee2e2; border-radius:14px; background:#fff5f5; color:#991b1b;">
        <div style="width:52px; height:52px; border-radius:50%; background:#fee2e2; color:#ef4444; display:inline-flex; align-items:center; justify-content:center; font-size:24px; margin-bottom:12px;">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <h4 style="margin:0 0 6px 0; font-size:16px; font-weight:700; color:#991b1b;">Lỗi khi tải câu hỏi</h4>
        <p style="margin:0 auto; font-size:13px; color:#b91c1c; max-width:520px; line-height:1.5;">${escapeHtml(err.message)}</p>
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

  // Khối & Breadcrumbs: Khối > Class > Chapter > Lesson (hỗ trợ cả constant và legacy)
  const gradeBlockName = q.grade_block || q.qb_classes?.grade_block || q.chapters?.classes?.grade_block || '12-Toán'
  const className = q.qb_classes?.name || q.chapters?.classes?.name || ''
  const chapterTitle = q.qb_chapters?.title || q.chapters?.title || ''
  const lessonTitle = q.qb_lessons?.title || q.lessons?.title || ''
  let locationBreadcrumb = []
  if (className) locationBreadcrumb.push(className)
  if (chapterTitle) locationBreadcrumb.push(chapterTitle)
  if (lessonTitle) locationBreadcrumb.push(lessonTitle)
  const breadcrumbText = locationBreadcrumb.join(' / ') || 'Chung'

  const isConstantTaxonomy = Boolean(q.qb_lesson_id || q.qb_chapter_id || q.qb_class_id)
  const isSyncedFromDynamic = Boolean(q.source_dynamic_lesson_id || q.sync_source_id)

  return `
    <div class="card qb-question-card" data-id="${q.id}" style="margin:0; padding:22px 24px; border:1px solid #e2e8f0; border-radius:14px; background:#ffffff; box-shadow:0 1px 3px rgba(0,0,0,0.02); position:relative; transition:border-color 0.15s, box-shadow 0.15s;">
      
      <!-- Top meta row -->
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:14px; padding-bottom:12px; border-bottom:1px solid #f1f5f9;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <label style="display:inline-flex; align-items:center; cursor:pointer; margin-right:2px;" title="Chọn câu hỏi này">
            <input type="checkbox" class="qb-select-card-chk" data-id="${q.id}" ${selectedQuestionIds.has(q.id) ? 'checked' : ''} style="width:16px; height:16px; accent-color:#0284c7; cursor:pointer;" />
          </label>
          <span style="display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:8px; background:#f1f5f9; font-weight:700; font-size:12.5px; color:#334155;">
            #${displayIndex}
          </span>
          <span style="font-size:11px; font-weight:700; padding:3px 9px; border-radius:6px; background:#eff6ff; color:#0284c7; border:1px solid #bfdbfe; display:inline-flex; align-items:center; gap:4px;">
            <i class="fa-solid fa-layer-group" style="font-size:10px;"></i> ${escapeHtml(gradeBlockName)}
          </span>
          ${isConstantTaxonomy ? `
            <span style="font-size:11px; font-weight:700; padding:3px 8px; border-radius:6px; background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; display:inline-flex; align-items:center; gap:4px;" title="Thuộc danh mục chuẩn Constant">
              <i class="fa-solid fa-certificate" style="font-size:10px;"></i> Constant
            </span>
          ` : ''}
          ${isSyncedFromDynamic ? `
            <span style="font-size:11px; font-weight:700; padding:3px 8px; border-radius:6px; background:#eff6ff; color:#0369a1; border:1px solid #bae6fd; display:inline-flex; align-items:center; gap:4px;" title="Được nhân bản độc lập từ bài học động sang bài học constant">
              <i class="fa-solid fa-code-branch" style="font-size:10px;"></i> Đã sync
            </span>
          ` : ''}
          <span style="font-size:11px; font-weight:700; text-transform:uppercase; padding:3px 9px; border-radius:6px; background:${typeBg}; color:${typeColor}; border:1px solid ${typeBorder};">
            ${typeLabel}
          </span>
          <span style="font-size:11px; font-weight:700; text-transform:uppercase; padding:3px 9px; border-radius:6px; background:${diffInfo.bg}; color:${diffInfo.color}; border:1px solid ${diffInfo.border};">
            ${diffInfo.label}
          </span>
          <span style="font-size:12px; color:#64748b; display:inline-flex; align-items:center; gap:5px; background:#f8fafc; padding:3px 8px; border-radius:6px; border:1px solid #e2e8f0;">
            <i class="fa-solid fa-folder-tree" style="font-size:11px; color:#94a3b8;"></i> ${escapeHtml(breadcrumbText)}
          </span>
          <span style="font-size:11px; font-weight:600; color:#475569; background:#f1f5f9; padding:3px 8px; border-radius:6px;" title="Số lần đã được bốc vào đề thi">
            <i class="fa-solid fa-repeat" style="color:#0284c7;"></i> Đã dùng: ${q.usage_count || 0} lần
          </span>
        </div>

        <!-- Action buttons -->
        <div style="display:flex; align-items:center; gap:6px;">
          <button class="btn-edit-question" data-id="${q.id}" title="Chỉnh sửa câu hỏi" style="width:32px; height:32px; border-radius:8px; border:1px solid #e2e8f0; background:#ffffff; color:#475569; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.15s;">
            <i class="fa-solid fa-pen-to-square" style="font-size:13px;"></i>
          </button>
          <button class="btn-delete-question" data-id="${q.id}" title="Xóa câu hỏi khỏi ngân hàng" style="width:32px; height:32px; border-radius:8px; border:1px solid #fee2e2; background:#fff5f5; color:#dc2626; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.15s;">
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
          <img src="${promptData.imageUrl}" alt="Hình vẽ minh họa" style="max-width:100%; max-height:280px; border-radius:10px; border:1px solid #e2e8f0; object-fit:contain; background:#ffffff; box-shadow:0 1px 3px rgba(0,0,0,0.04);" />
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
          <div class="explanation-box math-content" style="display:none; margin-top:8px; padding:12px 16px; background:#f0f9ff; border:1px solid #bae6fd; border-radius:10px; font-size:14px; line-height:1.65; color:#0369a1; word-break:break-word;">
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
            <div style="display:flex; justify-content:space-between; align-items:center; padding:9px 14px; border-radius:10px; border:1px solid #e2e8f0; background:#f8fafc; font-size:14px; transition:background 0.15s;">
              <div style="display:flex; align-items:flex-start; gap:10px; flex:1;">
                <span style="font-weight:700; color:#475569; min-width:20px;">${sKey})</span>
                <span class="math-content" style="color:#334155; line-height:1.5;">${renderMarkdown(s.text || '')}</span>
              </div>
              <span style="font-size:11.5px; font-weight:700; padding:2px 10px; border-radius:6px; background:${isTrue ? '#dcfce7' : '#fee2e2'}; color:${isTrue ? '#15803d' : '#b91c1c'}; border:1px solid ${isTrue ? '#bbf7d0' : '#fecaca'}; margin-left:14px; flex-shrink:0;">
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
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:10px;">
        ${opts.map(o => {
          const optKey = (o.id || o.key || '').trim().toUpperCase()
          const isCorrect = (optKey === correctKey)
          return `
            <div style="display:flex; align-items:flex-start; gap:10px; padding:9px 14px; border-radius:10px; border:1px solid ${isCorrect ? '#86efac' : '#e2e8f0'}; background:${isCorrect ? '#f0fdf4' : '#f8fafc'}; font-size:14px; transition:border-color 0.15s;">
              <span style="font-weight:700; width:24px; height:24px; border-radius:50%; background:${isCorrect ? '#16a34a' : '#cbd5e1'}; color:#ffffff; display:inline-flex; align-items:center; justify-content:center; font-size:12px; flex-shrink:0;">
                ${optKey}
              </span>
              <div class="math-content" style="color:${isCorrect ? '#15803d' : '#334155'}; font-weight:${isCorrect ? '600' : '400'}; flex:1; line-height:1.5;">
                ${renderMarkdown(o.text || '')}
              </div>
              ${isCorrect ? `<i class="fa-solid fa-circle-check" style="color:#16a34a; font-size:16px; margin-left:auto; margin-top:3px;"></i>` : ''}
            </div>
          `
        }).join('')}
      </div>
    `
  }

  // 3. Short Answer / Fill in
  if (q.question_type === 'SHORT_ANSWER') {
    return `
      <div style="display:inline-flex; align-items:center; gap:10px; padding:10px 16px; background:#faf5ff; border:1px solid #e9d5ff; border-radius:10px; font-size:14px;">
        <span style="font-weight:600; color:#7e22ce;">Đáp án đúng:</span>
        <span style="font-family:monospace; font-size:16px; font-weight:700; color:#581c87; background:#ffffff; padding:3px 10px; border-radius:6px; border:1px solid #d8b4fe;">
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
// Modal 0A: Đồng bộ câu hỏi từ Bài học động sang Bài học Constant
// ========================================================
async function openSyncDynamicToConstantModal() {
  const modalContainer = document.getElementById('qb-modal-container')
  if (!modalContainer) return

  let dynamicClasses = allClasses || []
  if (dynamicClasses.length === 0) {
    try {
      const raw = await api.getClasses()
      dynamicClasses = (raw || []).map(c => ({
        id: c.id,
        name: c.name,
        gradeBlock: c.gradeBlock || c.grade_block || '12-Toán'
      }))
    } catch (_) {
      dynamicClasses = []
    }
  }

  if ((constantTaxonomyState.classes || []).length === 0) {
    try {
      await loadConstantTaxonomyData()
    } catch (e) {
      showToast('Chưa tải được danh mục Constant: ' + e.message, 'error')
    }
  }

  let selectedDynamicLessonIds = new Set()
  let loadedDynamicLessons = []
  let isPreviewLoading = false
  let isSyncLoading = false

  modalContainer.innerHTML = `
    <div class="modal-backdrop" id="sync-dynamic-backdrop" style="position:fixed; inset:0; background:rgba(15,23,42,0.6); z-index:9999; display:flex; align-items:center; justify-content:center; padding:16px;">
      <div class="modal-content" onclick="event.stopPropagation()" style="width:100%; max-width:920px; max-height:92vh; background:#ffffff; border-radius:16px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1); display:flex; flex-direction:column; overflow:hidden;">
        
        <!-- Modal Header -->
        <div style="padding:18px 24px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; background:#f8fafc;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:40px; height:40px; border-radius:12px; background:#ecfdf5; color:#059669; display:flex; align-items:center; justify-content:center; font-size:20px;">
              <i class="fa-solid fa-cloud-arrow-up"></i>
            </div>
            <div>
              <h3 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a; margin:0;">
                Đồng bộ câu hỏi sang Danh mục Constant
              </h3>
              <p style="font-size:12px; color:#64748b; margin:2px 0 0 0;">
                Nhân bản độc lập (Duplicate) câu hỏi từ một hoặc nhiều bài học động sang một bài học constant đích.
              </p>
            </div>
          </div>
          <button id="sync-modal-close-btn" style="background:none; border:none; font-size:20px; color:#94a3b8; cursor:pointer; padding:4px;">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- Modal Body (Scrollable) -->
        <div style="padding:20px 24px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:16px;">
          
          <!-- Thông tin cơ chế Idempotency & Duplicate -->
          <div style="padding:12px 16px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; font-size:12.5px; color:#1e40af; line-height:1.5; display:flex; gap:10px; align-items:flex-start;">
            <i class="fa-solid fa-circle-info" style="font-size:16px; margin-top:2px; flex-shrink:0; color:#0284c7;"></i>
            <div>
              <strong>Cơ chế Nhân bản & Deduplication:</strong>
              Mỗi câu hỏi sẽ được tạo thành một bản ghi mới độc lập (mã UUID mới, gắn <code>qb_lesson_id</code> đích). Dữ liệu gốc ở bài học động không bị thay đổi.
              Hệ thống tự động băm nội dung (content hash) để tránh tạo trùng câu hỏi nếu người dùng thực hiện đồng bộ lặp lại nhiều lần.
            </div>
          </div>

          <!-- Grid 2 Cột: Nguồn Động -> Đích Constant -->
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
            
            <!-- Cột trái: NGUỒN (Dynamic Curriculum) -->
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; display:flex; flex-direction:column; gap:10px;">
              <div style="font-size:13px; font-weight:700; color:#0f172a; display:flex; align-items:center; gap:6px;">
                <span style="display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; background:#e0f2fe; color:#0284c7; font-size:11px; font-weight:800;">1</span>
                Nguồn: Bài học động (Curriculum)
              </div>
              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Lớp học nguồn *</label>
                <select id="sync-src-class" style="width:100%; height:36px; border:1px solid #cbd5e1; border-radius:8px; padding:0 8px; font-size:12.5px; background:#ffffff;">
                  <option value="">-- Chọn lớp học nguồn --</option>
                  ${dynamicClasses.map(c => `<option value="${c.id}">${escapeHtml(c.name)} (${c.gradeBlock})</option>`).join('')}
                </select>
              </div>

              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Chương học nguồn</label>
                <select id="sync-src-chapter" style="width:100%; height:36px; border:1px solid #cbd5e1; border-radius:8px; padding:0 8px; font-size:12.5px; background:#ffffff;">
                  <option value="">-- Chọn lớp trước --</option>
                </select>
              </div>

              <!-- Multi-select dynamic lessons -->
              <div style="flex:1;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <label style="font-size:12px; font-weight:600; color:#475569;">Chọn các bài học nguồn *</label>
                  <div style="display:flex; gap:6px;">
                    <button type="button" id="sync-src-select-all" style="font-size:11px; color:#0284c7; background:none; border:none; cursor:pointer; font-weight:600; padding:0;">Chọn tất cả</button>
                    <span style="color:#cbd5e1;">|</span>
                    <button type="button" id="sync-src-clear-all" style="font-size:11px; color:#ef4444; background:none; border:none; cursor:pointer; font-weight:600; padding:0;">Bỏ chọn</button>
                  </div>
                </div>
                <div id="sync-src-lessons-box" style="height:150px; overflow-y:auto; border:1px solid #cbd5e1; border-radius:8px; background:#ffffff; padding:6px;">
                  <div style="text-align:center; padding:24px 8px; font-size:12px; color:#94a3b8;">Vui lòng chọn Lớp & Chương trước</div>
                </div>
                <div style="font-size:11px; color:#64748b; margin-top:4px;">
                  Đã chọn: <strong id="sync-src-selected-count" style="color:#0284c7;">0</strong> bài học nguồn
                </div>
              </div>
            </div>

            <!-- Cột phải: ĐÍCH (Constant Taxonomy) -->
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; display:flex; flex-direction:column; gap:10px;">
              <div style="font-size:13px; font-weight:700; color:#0f172a; display:flex; align-items:center; gap:6px;">
                <span style="display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; background:#dcfce7; color:#15803d; font-size:11px; font-weight:800;">2</span>
                Đích: Bài học Constant (Module Question Bank)
              </div>

              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Khối học Constant</label>
                <select id="sync-dest-grade-block" style="width:100%; height:36px; border:1px solid #cbd5e1; border-radius:8px; padding:0 8px; font-size:12.5px; background:#ffffff;">
                  <option value="">-- Tất cả khối --</option>
                  ${(cachedGradeBlocksList || []).map(b => `<option value="${escapeHtmlAttr(b)}">${escapeHtml(b)}</option>`).join('')}
                </select>
              </div>

              <div>
                  <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Lớp Constant <span style="font-weight:400; color:#94a3b8;">(tự nhận diện)</span></label>
                <select id="sync-dest-class" style="width:100%; height:36px; border:1px solid #cbd5e1; border-radius:8px; padding:0 8px; font-size:12.5px; background:#ffffff;">
                  <option value="">-- Chọn lớp Constant --</option>
                </select>
              </div>

              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Chương Constant *</label>
                <select id="sync-dest-chapter" style="width:100%; height:36px; border:1px solid #cbd5e1; border-radius:8px; padding:0 8px; font-size:12.5px; background:#ffffff;">
                  <option value="">-- Chọn lớp Constant trước --</option>
                </select>
              </div>

              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Bài học Constant đích * (Nhận câu hỏi)</label>
                <select id="sync-dest-lesson" style="width:100%; height:36px; border:1px solid #cbd5e1; border-radius:8px; padding:0 8px; font-size:12.5px; background:#ffffff; font-weight:600; color:#15803d;">
                  <option value="">-- Chọn chương Constant trước --</option>
                </select>
              </div>
            </div>

          </div>

          <!-- Preview & Result Section -->
          <div id="sync-preview-section" style="display:none; background:#ffffff; border:1px solid #cbd5e1; border-radius:12px; padding:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
              <div style="font-size:13px; font-weight:700; color:#334155; display:flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-list-check" style="color:#0284c7;"></i> Kết quả xem trước (Preview)
              </div>
              <div style="font-size:12px; color:#64748b;" id="sync-preview-stat-summary"></div>
            </div>
            
            <!-- Cards tóm tắt số lượng -->
            <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; margin-bottom:12px;">
              <div style="padding:10px; border-radius:8px; background:#f8fafc; border:1px solid #e2e8f0; text-align:center;">
                <div style="font-size:11px; font-weight:600; color:#64748b;">Tổng câu nguồn</div>
                <div id="sync-stat-total" style="font-size:18px; font-weight:800; color:#0f172a;">0</div>
              </div>
              <div style="padding:10px; border-radius:8px; background:#f0fdf4; border:1px solid #bbf7d0; text-align:center;">
                <div style="font-size:11px; font-weight:600; color:#16a34a;">Sẽ nhân bản tạo mới</div>
                <div id="sync-stat-new" style="font-size:18px; font-weight:800; color:#16a34a;">0</div>
              </div>
              <div style="padding:10px; border-radius:8px; background:#fffbeb; border:1px solid #fde68a; text-align:center;">
                <div style="font-size:11px; font-weight:600; color:#d97706;">Bỏ qua (đã trùng hash)</div>
                <div id="sync-stat-skipped" style="font-size:18px; font-weight:800; color:#d97706;">0</div>
              </div>
            </div>

            <!-- Snippets -->
            <div id="sync-preview-snippets" style="max-height:360px; overflow-y:auto; border:1px solid #f1f5f9; border-radius:8px; padding:6px; background:#fafafa; font-size:12px;"></div>
          </div>

          <!-- Status / Execution Alert Box -->
          <div id="sync-result-alert" style="display:none; padding:14px 18px; border-radius:10px; font-size:13px; line-height:1.5;"></div>

        </div>

        <!-- Modal Footer -->
        <div style="padding:14px 24px; border-top:1px solid #e2e8f0; background:#f8fafc; display:flex; justify-content:space-between; align-items:center;">
          <button id="btn-sync-preview" type="button" class="btn-secondary" style="padding:9px 18px; font-size:13px; font-weight:600; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#334155; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
            <i class="fa-solid fa-eye" style="color:#0284c7;"></i> Xem trước (Preview)
          </button>
          
          <div style="display:flex; gap:10px;">
            <button id="sync-modal-cancel-btn" class="btn-secondary" style="padding:9px 18px; font-size:13px; font-weight:600; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#64748b; cursor:pointer;">
              Hủy
            </button>
            <button id="btn-sync-confirm" type="button" class="btn-primary" style="padding:9px 24px; font-size:13px; font-weight:600; border-radius:8px; background:linear-gradient(135deg, #10b981, #059669); color:#ffffff; border:none; cursor:pointer; display:inline-flex; align-items:center; gap:8px;">
              <i class="fa-solid fa-copy"></i> Xác nhận Đồng bộ (Duplicate)
            </button>
          </div>
        </div>

      </div>
    </div>
  `

  const closeModal = () => { modalContainer.innerHTML = '' }
  document.getElementById('sync-modal-close-btn')?.addEventListener('click', closeModal)
  document.getElementById('sync-modal-cancel-btn')?.addEventListener('click', closeModal)
  document.getElementById('sync-dynamic-backdrop')?.addEventListener('click', closeModal)

  // 1. Setup Source Dropdowns
  const srcClassSel = document.getElementById('sync-src-class')
  const srcChapterSel = document.getElementById('sync-src-chapter')
  const srcLessonsBox = document.getElementById('sync-src-lessons-box')
  const srcCountEl = document.getElementById('sync-src-selected-count')

  srcClassSel?.addEventListener('change', async (e) => {
    const clId = e.target.value
    srcChapterSel.innerHTML = '<option value="">Đang tải chương...</option>'
    srcLessonsBox.innerHTML = '<div style="text-align:center; padding:24px 8px; font-size:12px; color:#94a3b8;">Vui lòng chọn Chương học</div>'
    selectedDynamicLessonIds.clear()
    srcCountEl.textContent = '0'

    if (!clId) {
      srcChapterSel.innerHTML = '<option value="">-- Chọn lớp trước --</option>'
      return
    }

    try {
      const chs = await api.getChapters(clId, true)
      let html = '<option value="">-- Chọn chương học nguồn --</option>'
      ;(chs || []).forEach(ch => {
        html += `<option value="${ch.id}">${escapeHtml(ch.title)}</option>`
      })
      srcChapterSel.innerHTML = html
    } catch (err) {
      srcChapterSel.innerHTML = '<option value="">Lỗi tải chương</option>'
    }
  })

  srcChapterSel?.addEventListener('change', async (e) => {
    const chId = e.target.value
    srcLessonsBox.innerHTML = '<div style="text-align:center; padding:24px 8px; font-size:12px; color:#94a3b8;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải bài học...</div>'
    selectedDynamicLessonIds.clear()
    srcCountEl.textContent = '0'

    if (!chId) {
      srcLessonsBox.innerHTML = '<div style="text-align:center; padding:24px 8px; font-size:12px; color:#94a3b8;">Vui lòng chọn Chương học</div>'
      return
    }

    try {
      const ls = await api.getLessons(chId)
      loadedDynamicLessons = ls || []
      if (loadedDynamicLessons.length === 0) {
        srcLessonsBox.innerHTML = '<div style="text-align:center; padding:24px 8px; font-size:12px; color:#94a3b8;">Chương này không có bài học nào</div>'
        return
      }

      let html = ''
      loadedDynamicLessons.forEach(l => {
        html += `
          <label style="display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:6px; cursor:pointer; font-size:12px; color:#334155;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">
            <input type="checkbox" class="chk-sync-dynamic-lesson" value="${l.id}" style="width:14px; height:14px; accent-color:#0284c7; cursor:pointer;" />
            <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(l.title)}">${escapeHtml(l.title)}</span>
          </label>
        `
      })
      srcLessonsBox.innerHTML = html

      srcLessonsBox.querySelectorAll('.chk-sync-dynamic-lesson').forEach(chk => {
        chk.addEventListener('change', () => {
          if (chk.checked) selectedDynamicLessonIds.add(chk.value)
          else selectedDynamicLessonIds.delete(chk.value)
          srcCountEl.textContent = String(selectedDynamicLessonIds.size)
        })
      })
    } catch (err) {
      srcLessonsBox.innerHTML = '<div style="text-align:center; padding:24px 8px; font-size:12px; color:#ef4444;">Lỗi tải bài học</div>'
    }
  })

  document.getElementById('sync-src-select-all')?.addEventListener('click', () => {
    srcLessonsBox.querySelectorAll('.chk-sync-dynamic-lesson').forEach(chk => {
      chk.checked = true
      selectedDynamicLessonIds.add(chk.value)
    })
    srcCountEl.textContent = String(selectedDynamicLessonIds.size)
  })

  document.getElementById('sync-src-clear-all')?.addEventListener('click', () => {
    srcLessonsBox.querySelectorAll('.chk-sync-dynamic-lesson').forEach(chk => {
      chk.checked = false
    })
    selectedDynamicLessonIds.clear()
    srcCountEl.textContent = '0'
  })

  // 2. Setup Destination Constant Dropdowns
  const destGradeBlockSel = document.getElementById('sync-dest-grade-block')
  const destClassSel = document.getElementById('sync-dest-class')
  const destChapterSel = document.getElementById('sync-dest-chapter')
  const destLessonSel = document.getElementById('sync-dest-lesson')

  function refreshDestClasses(block) {
    const list = (constantTaxonomyState.classes || []).filter(c => !block || (c.grade_block || c.gradeBlock) === block)
    list.sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    let html = '<option value="">-- Chọn lớp Constant --</option>'
    list.forEach(c => {
      html += `<option value="${c.id}">${escapeHtml(c.name)} (${c.grade_block || block})</option>`
    })
    destClassSel.innerHTML = html
    destChapterSel.innerHTML = '<option value="">-- Chọn lớp Constant trước --</option>'
    destLessonSel.innerHTML = '<option value="">-- Chọn chương Constant trước --</option>'
  }

  function refreshDestChapters(classId) {
    const list = (constantTaxonomyState.chapters || []).filter(ch => ch.class_id === classId)
    list.sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    let html = '<option value="">-- Chọn chương Constant --</option>'
    list.forEach(ch => {
      html += `<option value="${ch.id}">${escapeHtml(ch.title)}</option>`
    })
    destChapterSel.innerHTML = html
    destLessonSel.innerHTML = '<option value="">-- Chọn chương Constant trước --</option>'
  }

  function refreshDestLessons(chapterId) {
    const list = (constantTaxonomyState.lessons || []).filter(l => l.chapter_id === chapterId)
    list.sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    let html = '<option value="">-- Chọn bài học Constant đích --</option>'
    list.forEach(l => {
      html += `<option value="${l.id}">${escapeHtml(l.title)}</option>`
    })
    destLessonSel.innerHTML = html
  }

  destGradeBlockSel?.addEventListener('change', (e) => {
    refreshDestClasses(e.target.value)
  })

  destClassSel?.addEventListener('change', (e) => {
    refreshDestChapters(e.target.value)
  })

  destChapterSel?.addEventListener('change', (e) => {
    refreshDestLessons(e.target.value)
  })

  refreshDestClasses('')

  // 3. Preview Action
  const previewBtn = document.getElementById('btn-sync-preview')
  const previewSection = document.getElementById('sync-preview-section')
  const statTotal = document.getElementById('sync-stat-total')
  const statNew = document.getElementById('sync-stat-new')
  const statSkipped = document.getElementById('sync-stat-skipped')
  const snippetsBox = document.getElementById('sync-preview-snippets')
  const resultAlert = document.getElementById('sync-result-alert')

  previewBtn?.addEventListener('click', async () => {
    if (isPreviewLoading) return
    const srcIds = Array.from(selectedDynamicLessonIds)
    const targetLessonId = destLessonSel?.value

    if (srcIds.length === 0) {
      showToast('Vui lòng chọn ít nhất 1 bài học nguồn động!', 'warning')
      return
    }
    if (!targetLessonId) {
      showToast('Vui lòng chọn bài học Constant đích!', 'warning')
      return
    }

    isPreviewLoading = true
    previewBtn.disabled = true
    previewBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang phân tích...'
    resultAlert.style.display = 'none'

    try {
      const res = await api.previewSyncDynamicToConstant({
        sourceLessonIds: srcIds,
        targetConstantLessonId: targetLessonId
      })

      previewSection.style.display = 'block'
      statTotal.textContent = String(res.totalSourceQuestions || 0)
      statNew.textContent = String(res.willCreateCount || 0)
      statSkipped.textContent = String(res.alreadyInTargetCount || 0)

      const prevQs = res.previewQuestions || []
      if (prevQs.length === 0) {
        snippetsBox.innerHTML = '<div style="color:#94a3b8; padding:8px; text-align:center;">Các bài học nguồn không có câu hỏi nào</div>'
      } else {
        snippetsBox.innerHTML = `
          <div style="padding:4px 8px 8px; color:#64748b; font-size:11.5px; font-weight:600;">Hiển thị ${prevQs.length} / ${res.totalSourceQuestions || prevQs.length} câu nguồn</div>
          ${prevQs.map((q, idx) => `
          <div style="padding:8px; border-bottom:1px solid #f1f5f9; display:flex; align-items:flex-start; gap:8px; line-height:1.5;">
            <span style="font-weight:700; color:#64748b;">${idx + 1}.</span>
            <span style="font-size:11px; font-weight:700; padding:1px 5px; border-radius:4px; background:#e0f2fe; color:#0369a1;">${escapeHtml(q.questionType)}</span>
            <span style="font-size:11px; font-weight:600; color:#64748b;">[${escapeHtml(q.sourceLessonTitle)}]</span>
            <span class="sync-preview-markdown" style="flex:1; min-width:0; color:#334155; overflow-wrap:anywhere;">${renderMarkdown(q.promptSnippet || '')}</span>
          </div>
          `).join('')}`
        // Nội dung preview vừa được chèn động; cần chạy lại KaTeX/mhchem
        // để các delimiters $...$, $$...$$ và \\ce{...} không còn hiển thị thô.
        renderMath(snippetsBox)
      }
    } catch (err) {
      showToast('Lỗi xem trước: ' + err.message, 'error')
    } finally {
      isPreviewLoading = false
      previewBtn.disabled = false
      previewBtn.innerHTML = '<i class="fa-solid fa-eye" style="color:#0284c7;"></i> Xem trước (Preview)'
    }
  })

  // 4. Confirm Sync (Duplicate) Action
  const confirmBtn = document.getElementById('btn-sync-confirm')
  confirmBtn?.addEventListener('click', async () => {
    if (isSyncLoading) return
    const srcIds = Array.from(selectedDynamicLessonIds)
    const targetLessonId = destLessonSel?.value

    if (srcIds.length === 0) {
      showToast('Vui lòng chọn ít nhất 1 bài học nguồn!', 'warning')
      return
    }
    if (!targetLessonId) {
      showToast('Vui lòng chọn bài học Constant đích!', 'warning')
      return
    }

    isSyncLoading = true
    confirmBtn.disabled = true
    confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang đồng bộ duplicate...'

    try {
      const res = await api.syncDynamicToConstant({
        sourceLessonIds: srcIds,
        targetConstantLessonId: targetLessonId
      })

      resultAlert.style.display = 'block'
      resultAlert.style.background = '#f0fdf4'
      resultAlert.style.border = '1px solid #bbf7d0'
      resultAlert.style.color = '#15803d'
      resultAlert.innerHTML = `
        <div style="font-weight:700; font-size:14px; margin-bottom:4px; display:flex; align-items:center; gap:8px;">
          <i class="fa-solid fa-circle-check" style="font-size:18px;"></i> ${escapeHtml(res.message || 'Đồng bộ thành công!')}
        </div>
        <div style="font-size:12.5px;">
          Đã tạo mới: <strong>${res.createdCount || 0}</strong> câu | Bỏ qua trùng lặp: <strong>${res.skippedCount || 0}</strong> câu | Tổng kiểm tra: <strong>${res.totalProcessed || 0}</strong> câu
        </div>
      `

      showToast(res.message || 'Đã đồng bộ thành công!', 'success')
      await fetchAndRenderQuestions({ includeStats: true })
      await refreshStats()
      // Đồng bộ thành công thì đóng popup để người dùng quay lại danh sách đã cập nhật.
      closeModal()
    } catch (err) {
      resultAlert.style.display = 'block'
      resultAlert.style.background = '#fef2f2'
      resultAlert.style.border = '1px solid #fecaca'
      resultAlert.style.color = '#b91c1c'
      resultAlert.innerHTML = `
        <div style="font-weight:700; font-size:14px; margin-bottom:4px; display:flex; align-items:center; gap:8px;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size:18px;"></i> Lỗi khi thực hiện đồng bộ
        </div>
        <div style="font-size:12.5px;">${escapeHtml(err.message)}</div>
      `
      showToast('Lỗi khi đồng bộ: ' + err.message, 'error')
    } finally {
      isSyncLoading = false
      confirmBtn.disabled = false
      confirmBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Xác nhận Đồng bộ (Duplicate)'
    }
  })
}

// ========================================================
// Modal 0B: Quản lý Danh mục Constant (Hai cột: Cây + Form Dùng Chung)
// ========================================================
async function openTaxonomyManagementModal() {
  const modalContainer = document.getElementById('qb-modal-container')
  if (!modalContainer) return

  let editingItem = null // { type: 'gradeBlock'|'class'|'chapter'|'lesson', id: string, item: object }
  const collapsedKeys = new Set() // Set lưu trữ các node đang bị thu gọn
  let treeSearchQuery = ''

  modalContainer.innerHTML = `
    <div class="modal-backdrop" id="taxo-modal-backdrop" style="position:fixed; inset:0; background:rgba(15,23,42,0.65); backdrop-filter:blur(3px); z-index:9999; display:flex; align-items:center; justify-content:center; padding:16px;">
      <div class="modal-content" onclick="event.stopPropagation()" style="width:100%; max-width:1120px; height:90vh; max-height:860px; background:#ffffff; border-radius:18px; box-shadow:0 25px 50px -12px rgba(15,23,42,0.25); display:flex; flex-direction:column; overflow:hidden;">
        
        <!-- Header -->
        <div style="padding:16px 24px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; background:#f8fafc;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:42px; height:42px; border-radius:12px; background:linear-gradient(135deg, #eff6ff, #dbeafe); color:#2563eb; display:flex; align-items:center; justify-content:center; font-size:20px; box-shadow:0 2px 6px rgba(37,99,235,0.12);">
              <i class="fa-solid fa-sitemap"></i>
            </div>
            <div>
              <div style="display:flex; align-items:center; gap:8px;">
                <h3 style="font-family:var(--font-heading); font-size:18px; font-weight:700; color:#0f172a; margin:0;">
                  Quản lý Danh mục Constant - Ngân hàng câu hỏi
                </h3>
                <span style="font-size:11px; font-weight:700; color:#0284c7; background:#e0f2fe; padding:2px 8px; border-radius:999px;">
                  Độc lập & Bất biến
                </span>
              </div>
              <p style="font-size:12.5px; color:#64748b; margin:2px 0 0 0;">
                Cây phân tầng chuẩn: Khối học &rarr; Lớp &rarr; Chương &rarr; Bài học. Quản lý, chỉnh sửa và đồng bộ trực tiếp.
              </p>
            </div>
          </div>
          <button id="taxo-modal-close-btn" style="background:none; border:none; font-size:22px; color:#94a3b8; cursor:pointer; padding:6px; border-radius:8px; line-height:1; transition:color 0.15s;" title="Đóng cửa sổ">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- Body: Responsive Two-Pane Layout -->
        <div class="taxo-modal-grid" style="display:grid; grid-template-columns:1.2fr 0.8fr; gap:20px; padding:20px 24px; flex:1; min-height:0; overflow:hidden;">
          
          <!-- CỘT TRÁI: CÂY DANH MỤC CONSTANT -->
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:16px; display:flex; flex-direction:column; min-height:0; overflow:hidden;">
            
            <!-- Toolbar Cây -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; gap:8px; flex-wrap:wrap;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:13.5px; font-weight:700; color:#0f172a; display:flex; align-items:center; gap:6px;">
                  <i class="fa-solid fa-folder-tree" style="color:#0284c7;"></i> Cấu trúc Danh mục
                </span>
                <span id="taxo-tree-summary-badge" style="font-size:11px; font-weight:600; color:#64748b; background:#e2e8f0; padding:2px 8px; border-radius:6px;">
                  Đang tải...
                </span>
              </div>
              <div style="display:flex; align-items:center; gap:6px;">
                <button type="button" id="btn-taxo-expand-all" style="font-size:11.5px; font-weight:600; color:#475569; background:#ffffff; border:1px solid #cbd5e1; border-radius:6px; padding:3px 8px; cursor:pointer;" title="Mở rộng tất cả các node">
                  <i class="fa-solid fa-angles-down" style="font-size:10px;"></i> Mở hết
                </button>
                <button type="button" id="btn-taxo-collapse-all" style="font-size:11.5px; font-weight:600; color:#475569; background:#ffffff; border:1px solid #cbd5e1; border-radius:6px; padding:3px 8px; cursor:pointer;" title="Thu gọn tất cả các node">
                  <i class="fa-solid fa-angles-up" style="font-size:10px;"></i> Thu gọn
                </button>
                <button type="button" id="btn-taxo-refresh" style="font-size:11.5px; font-weight:600; color:#0284c7; background:#e0f2fe; border:1px solid #bae6fd; border-radius:6px; padding:3px 9px; cursor:pointer; display:inline-flex; align-items:center; gap:4px;" title="Tải lại từ máy chủ">
                  <i class="fa-solid fa-rotate"></i> Làm mới
                </button>
              </div>
            </div>

            <!-- Thanh tìm kiếm nhanh trên cây -->
            <div style="margin-bottom:10px; position:relative;">
              <i class="fa-solid fa-magnifying-glass" style="position:absolute; left:10px; top:10px; font-size:12px; color:#94a3b8;"></i>
              <input type="text" id="taxo-tree-search" placeholder="Lọc theo tên Khối / Lớp / Chương / Bài..." style="width:100%; height:32px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px 0 30px; font-size:12px; background:#ffffff;" />
            </div>

            <!-- Container Cây cuộn mượt -->
            <div id="taxo-tree-container" style="flex:1; min-height:0; overflow-y:auto; border:1px solid #cbd5e1; border-radius:10px; background:#ffffff; padding:12px;">
              <div style="text-align:center; padding:36px; color:#94a3b8;">
                <i class="fa-solid fa-spinner fa-spin" style="font-size:20px; margin-bottom:8px; color:#0284c7;"></i>
                <div>Đang tải cây danh mục...</div>
              </div>
            </div>

          </div>

          <!-- CỘT PHẢI: FORM DÙNG CHUNG (THÊM MỚI / CHỈNH SỬA) -->
          <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:18px; display:flex; flex-direction:column; min-height:0; overflow-y:auto;">
            
            <!-- Header của Form -->
            <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid #f1f5f9; padding-bottom:12px; margin-bottom:14px;">
              <div>
                <div id="taxo-form-mode-badge" style="display:inline-block; margin-bottom:4px;">
                  <span style="font-size:11px; font-weight:700; color:#059669; background:#ecfdf5; border:1px solid #a7f3d0; padding:2px 8px; border-radius:999px;">
                    <i class="fa-solid fa-circle-plus"></i> CHẾ ĐỘ THÊM MỚI
                  </span>
                </div>
                <h4 id="taxo-form-title-heading" style="font-size:15px; font-weight:700; color:#0f172a; margin:0;">
                  Thêm mới Danh mục Constant
                </h4>
                <p id="taxo-form-subtitle" style="font-size:12px; color:#64748b; margin:2px 0 0 0;">
                  Chọn cấp độ và danh mục cha để thêm node mới vào cây.
                </p>
              </div>

              <button type="button" id="btn-taxo-cancel-edit" style="display:none; font-size:12px; font-weight:600; color:#64748b; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:8px; padding:5px 10px; cursor:pointer; align-items:center; gap:5px;" title="Hủy chỉnh sửa và quay lại chế độ Thêm mới">
                <i class="fa-solid fa-xmark"></i> Hủy sửa
              </button>
            </div>

            <!-- Các trường của Form -->
            <div style="display:flex; flex-direction:column; gap:12px; flex:1;">
              
              <!-- 1. Cấp độ (Type) -->
              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">
                  Cấp độ danh mục <span style="color:#ef4444;">*</span>
                </label>
                <select id="taxo-add-type" style="width:100%; height:36px; border:1px solid #cbd5e1; border-radius:8px; padding:0 8px; font-size:13px; background:#ffffff; font-weight:600; color:#1e293b;">
                  <option value="gradeBlock">1. Khối học (Cấp 1 - Gốc)</option>
                  <option value="class" selected>2. Lớp học (Cấp 2 - Thuộc Khối)</option>
                  <option value="chapter">3. Chương học (Cấp 3 - Thuộc Lớp)</option>
                  <option value="lesson">4. Bài học (Cấp 4 - Thuộc Chương)</option>
                  <option value="questionType">5. Dạng bài (Cấp 5 - Thuộc Bài học)</option>
                </select>
                <div id="taxo-type-lock-hint" style="display:none; font-size:11px; color:#64748b; margin-top:3px;">
                  <i class="fa-solid fa-lock" style="font-size:10px;"></i> Cấp độ cố định khi đang sửa node.
                </div>
              </div>

              <!-- 2. Danh mục cha (Dynamic Parent Field) -->
              <div id="taxo-form-parent-field"></div>

              <!-- 3. Tên / Tiêu đề -->
              <div>
                <label id="taxo-form-name-label" style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">
                  Tên lớp / Tiêu đề <span style="color:#ef4444;">*</span>
                </label>
                <input type="text" id="taxo-form-title" placeholder="VD: Toán 12 - Chuẩn hóa..." style="width:100%; height:36px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; color:#1e293b;" />
              </div>

              <!-- 4. Thứ tự hiển thị -->
              <div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <label style="font-size:12px; font-weight:600; color:#475569;">
                    Thứ tự hiển thị (Order Index)
                  </label>
                  <span style="font-size:11px; color:#94a3b8;">Số nhỏ hơn hiển thị trước</span>
                </div>
                <input type="number" id="taxo-form-order" value="1" min="0" step="1" style="width:100%; height:36px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; color:#1e293b;" />
              </div>

              <!-- 5. Mô tả -->
              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">
                  Mô tả / Ghi chú (Tùy chọn)
                </label>
                <textarea id="taxo-form-desc" placeholder="Ghi chú chi tiết về mục taxonomy..." style="width:100%; height:76px; border:1px solid #cbd5e1; border-radius:8px; padding:8px 10px; font-size:12.5px; color:#1e293b; resize:vertical;"></textarea>
              </div>

              <!-- Form Action Button -->
              <div style="margin-top:auto; padding-top:14px; border-top:1px solid #f1f5f9; display:flex; gap:10px;">
                <button type="button" id="btn-taxo-submit-add" class="btn-primary" style="flex:1; height:40px; border-radius:8px; background:linear-gradient(135deg, #0284c7, #0369a1); color:#ffffff; font-size:13.5px; font-weight:600; border:none; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 2px 8px rgba(2,132,199,0.25);">
                  <i class="fa-solid fa-plus"></i> Thêm vào danh mục
                </button>
              </div>

            </div>

          </div>

        </div>

        <!-- Footer -->
        <div style="padding:12px 24px; border-top:1px solid #e2e8f0; background:#f8fafc; display:flex; justify-content:space-between; align-items:center;">
          <div style="font-size:12px; color:#64748b;">
            <i class="fa-solid fa-circle-info" style="color:#0284c7;"></i> Mẹo: Bấm nút <strong>Sửa</strong> trên từng node để mở form chỉnh sửa hoặc <strong>+</strong> để thêm mục con.
          </div>
          <button id="taxo-modal-close-btn-bottom" class="btn-secondary" style="padding:8px 20px; font-size:13px; font-weight:600; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#475569; cursor:pointer;">
            Đóng
          </button>
        </div>

      </div>
    </div>
  `

  const closeModal = () => { modalContainer.innerHTML = '' }
  document.getElementById('taxo-modal-close-btn')?.addEventListener('click', closeModal)
  document.getElementById('taxo-modal-close-btn-bottom')?.addEventListener('click', closeModal)
  document.getElementById('taxo-modal-backdrop')?.addEventListener('click', closeModal)

  const treeContainer = document.getElementById('taxo-tree-container')
  const addTypeSel = document.getElementById('taxo-add-type')
  const parentFieldContainer = document.getElementById('taxo-form-parent-field')
  const titleInput = document.getElementById('taxo-form-title')
  const orderInput = document.getElementById('taxo-form-order')
  const descInput = document.getElementById('taxo-form-desc')
  const submitBtn = document.getElementById('btn-taxo-submit-add')
  const btnCancelEdit = document.getElementById('btn-taxo-cancel-edit')
  const formModeBadge = document.getElementById('taxo-form-mode-badge')
  const formTitleHeading = document.getElementById('taxo-form-title-heading')
  const formSubtitle = document.getElementById('taxo-form-subtitle')
  const typeLockHint = document.getElementById('taxo-type-lock-hint')
  const treeSearchInput = document.getElementById('taxo-tree-search')

  function buildUnifiedGradeBlocks() {
    const rawBlocks = [...(constantTaxonomyState.gradeBlocks || [])]
    const classes = constantTaxonomyState.classes || []
    const knownNames = new Set(rawBlocks.map(b => b.name))

    // Bổ sung các khối có trong classes nhưng chưa được tạo trong rawBlocks
    classes.forEach(c => {
      const gbName = c.grade_block || c.gradeBlock
      if (gbName && !knownNames.has(gbName)) {
        knownNames.add(gbName)
        rawBlocks.push({
          id: c.grade_block_id || null,
          name: gbName,
          description: '',
          order_index: 99
        })
      }
    })

    if (rawBlocks.length === 0 && cachedGradeBlocksList && cachedGradeBlocksList.length > 0) {
      cachedGradeBlocksList.forEach((bName, idx) => {
        rawBlocks.push({ id: null, name: bName, description: '', order_index: idx + 1 })
      })
    }

    return rawBlocks.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
  }

  function setFormMode(mode, payload = null) {
    if (mode === 'edit' && payload) {
      editingItem = payload
      if (formModeBadge) {
        formModeBadge.innerHTML = `
          <span style="font-size:11px; font-weight:700; color:#2563eb; background:#eff6ff; border:1px solid #bfdbfe; padding:2px 8px; border-radius:999px;">
            <i class="fa-solid fa-pen-to-square"></i> ĐANG CHỈNH SỬA
          </span>
        `
      }
      if (formTitleHeading) {
        formTitleHeading.innerHTML = `Chỉnh sửa: <span style="color:#0284c7;">${escapeHtml(payload.name || payload.title)}</span>`
      }
      if (formSubtitle) {
        formSubtitle.textContent = 'Cập nhật thông tin node và danh mục cha (nếu muốn di chuyển).'
      }
      if (btnCancelEdit) btnCancelEdit.style.display = 'inline-flex'
      if (addTypeSel) {
        addTypeSel.value = payload.type
        addTypeSel.disabled = true
      }
      if (typeLockHint) typeLockHint.style.display = 'block'

      updateFormParentField()

      if (titleInput) titleInput.value = payload.name || payload.title || ''
      if (orderInput) orderInput.value = payload.order_index ?? payload.orderIndex ?? 1
      if (descInput) descInput.value = payload.description || ''

      if (submitBtn) {
        submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Cập nhật thay đổi'
        submitBtn.style.background = 'linear-gradient(135deg, #2563eb, #1d4ed8)'
      }
    } else {
      editingItem = null
      if (formModeBadge) {
        formModeBadge.innerHTML = `
          <span style="font-size:11px; font-weight:700; color:#059669; background:#ecfdf5; border:1px solid #a7f3d0; padding:2px 8px; border-radius:999px;">
            <i class="fa-solid fa-circle-plus"></i> CHẾ ĐỘ THÊM MỚI
          </span>
        `
      }
      if (formTitleHeading) {
        formTitleHeading.textContent = 'Thêm mới Danh mục Constant'
      }
      if (formSubtitle) {
        formSubtitle.textContent = 'Chọn cấp độ và danh mục cha để thêm node mới vào cây.'
      }
      if (btnCancelEdit) btnCancelEdit.style.display = 'none'
      if (addTypeSel) {
        addTypeSel.disabled = false
        if (payload?.presetType) {
          addTypeSel.value = payload.presetType
        }
      }
      if (typeLockHint) typeLockHint.style.display = 'none'

      updateFormParentField(payload)

      if (titleInput) titleInput.value = ''
      if (descInput) descInput.value = ''

      // Auto-compute next order index
      let nextOrder = 1
      const currentType = addTypeSel?.value || 'class'
      if (currentType === 'gradeBlock') {
        nextOrder = (constantTaxonomyState.gradeBlocks || []).length + 1
      } else if (currentType === 'class') {
        nextOrder = (constantTaxonomyState.classes || []).length + 1
      } else if (currentType === 'chapter') {
        nextOrder = (constantTaxonomyState.chapters || []).length + 1
      } else if (currentType === 'lesson') {
        nextOrder = (constantTaxonomyState.lessons || []).length + 1
      } else if (currentType === 'questionType') {
        nextOrder = (constantTaxonomyState.questionTypes || []).length + 1
      }
      if (orderInput) orderInput.value = nextOrder

      if (submitBtn) {
        submitBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Thêm vào danh mục'
        submitBtn.style.background = 'linear-gradient(135deg, #0284c7, #0369a1)'
      }
    }

    renderTaxonomyTree()
  }

  function updateFormParentField(presetPayload = null) {
    const type = addTypeSel?.value || 'class'
    const nameLabel = document.getElementById('taxo-form-name-label')

    if (type === 'gradeBlock') {
      if (nameLabel) nameLabel.innerHTML = 'Tên Khối học Constant <span style="color:#ef4444;">*</span>'
      if (titleInput) titleInput.placeholder = 'VD: 12-Toán, 11-Hóa, 10-Toán...'
      parentFieldContainer.innerHTML = `
        <div style="font-size:12px; color:#64748b; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; padding:10px 12px; display:flex; align-items:center; gap:8px;">
          <i class="fa-solid fa-layer-group" style="color:#0284c7; font-size:14px;"></i>
          <span>Khối học là cấp gốc cao nhất (Level 1) &mdash; không thuộc danh mục cha nào.</span>
        </div>
      `
    } else if (type === 'class') {
      if (nameLabel) nameLabel.innerHTML = 'Tên Lớp Constant <span style="color:#ef4444;">*</span>'
      if (titleInput) titleInput.placeholder = 'VD: Toán 12 - Chuẩn hóa...'
      const gradeBlocks = buildUnifiedGradeBlocks()
      const selectedGb = editingItem?.grade_block || editingItem?.gradeBlock || presetPayload?.presetParentGb || filterState.gradeBlock || ''
      parentFieldContainer.innerHTML = `
        <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">
          Khối học trực thuộc <span style="color:#ef4444;">*</span>
        </label>
        <select id="taxo-form-grade-block" style="width:100%; height:36px; border:1px solid #cbd5e1; border-radius:8px; padding:0 8px; font-size:13px; background:#ffffff; color:#1e293b;">
          ${gradeBlocks.map(b => `
            <option value="${escapeHtmlAttr(b.name)}" data-id="${b.id || ''}" ${b.name === selectedGb ? 'selected' : ''}>
              ${escapeHtml(b.name)} ${b.description ? `(${escapeHtml(b.description)})` : ''}
            </option>
          `).join('')}
        </select>
      `
    } else if (type === 'chapter') {
      if (nameLabel) nameLabel.innerHTML = 'Tiêu đề Chương Constant <span style="color:#ef4444;">*</span>'
      if (titleInput) titleInput.placeholder = 'VD: Chương 1: Ứng dụng đạo hàm khảo sát hàm số...'
      const classes = constantTaxonomyState.classes || []
      const selectedClId = editingItem?.class_id || presetPayload?.presetParentId || ''
      parentFieldContainer.innerHTML = `
        <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">
          Lớp học trực thuộc <span style="color:#ef4444;">*</span>
        </label>
        ${classes.length === 0 ? `
          <div style="font-size:12px; color:#ef4444; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:8px 12px;">
            <i class="fa-solid fa-triangle-exclamation"></i> Chưa có Lớp học Constant nào. Vui lòng tạo Lớp trước khi tạo Chương!
          </div>
        ` : `
          <select id="taxo-form-class-id" style="width:100%; height:36px; border:1px solid #cbd5e1; border-radius:8px; padding:0 8px; font-size:13px; background:#ffffff; color:#1e293b;">
            ${classes.map(c => `
              <option value="${c.id}" ${c.id === selectedClId ? 'selected' : ''}>
                ${escapeHtml(c.name)} (${escapeHtml(c.grade_block)})
              </option>
            `).join('')}
          </select>
        `}
      `
    } else if (type === 'lesson') {
      if (nameLabel) nameLabel.innerHTML = 'Tiêu đề Bài học Constant <span style="color:#ef4444;">*</span>'
      if (titleInput) titleInput.placeholder = 'VD: Bài 1: Tính đơn điệu của hàm số...'
      const chapters = constantTaxonomyState.chapters || []
      const classes = constantTaxonomyState.classes || []
      const classMap = new Map(classes.map(c => [c.id, c.name]))
      const selectedChId = editingItem?.chapter_id || presetPayload?.presetParentId || ''
      parentFieldContainer.innerHTML = `
        <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">
          Chương học trực thuộc <span style="color:#ef4444;">*</span>
        </label>
        ${chapters.length === 0 ? `
          <div style="font-size:12px; color:#ef4444; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:8px 12px;">
            <i class="fa-solid fa-triangle-exclamation"></i> Chưa có Chương học Constant nào. Vui lòng tạo Chương trước khi tạo Bài học!
          </div>
        ` : `
          <select id="taxo-form-chapter-id" style="width:100%; height:36px; border:1px solid #cbd5e1; border-radius:8px; padding:0 8px; font-size:13px; background:#ffffff; color:#1e293b;">
            ${chapters.map(ch => {
              const clName = classMap.get(ch.class_id) || 'Lớp'
              return `
                <option value="${ch.id}" ${ch.id === selectedChId ? 'selected' : ''}>
                  ${escapeHtml(ch.title)} &mdash; [${escapeHtml(clName)}]
                </option>
              `
            }).join('')}
          </select>
        `}
      `
    } else if (type === 'questionType') {
      if (nameLabel) nameLabel.innerHTML = 'Tên Dạng bài Constant <span style="color:#ef4444;">*</span>'
      if (titleInput) titleInput.placeholder = 'VD: Xét tính đơn điệu bằng đạo hàm...'
      const lessons = constantTaxonomyState.lessons || []
      const chapters = constantTaxonomyState.chapters || []
      const chapterMap = new Map(chapters.map(ch => [ch.id, ch.title]))
      const selectedLsId = editingItem?.lesson_id || presetPayload?.presetParentId || ''
      parentFieldContainer.innerHTML = `
        <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">
          Bài học trực thuộc <span style="color:#ef4444;">*</span>
        </label>
        ${lessons.length === 0 ? `
          <div style="font-size:12px; color:#ef4444; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:8px 12px;">
            <i class="fa-solid fa-triangle-exclamation"></i> Chưa có Bài học Constant nào. Vui lòng tạo Bài học trước khi tạo Dạng bài!
          </div>
        ` : `
          <select id="taxo-form-lesson-id" style="width:100%; height:36px; border:1px solid #cbd5e1; border-radius:8px; padding:0 8px; font-size:13px; background:#ffffff; color:#1e293b;">
            ${lessons.map(l => {
              const chTitle = chapterMap.get(l.chapter_id) || 'Chương'
              return `
                <option value="${l.id}" ${l.id === selectedLsId ? 'selected' : ''}>
                  ${escapeHtml(l.title)} &mdash; [${escapeHtml(chTitle)}]
                </option>
              `
            }).join('')}
          </select>
        `}
      `
    }
  }

  function renderTaxonomyTree() {
    if (!treeContainer) return
    const gradeBlocks = buildUnifiedGradeBlocks()
    const classes = constantTaxonomyState.classes || []
    const chapters = constantTaxonomyState.chapters || []
    const lessons = constantTaxonomyState.lessons || []
    const questionTypes = constantTaxonomyState.questionTypes || []

    const summaryBadge = document.getElementById('taxo-tree-summary-badge')
    if (summaryBadge) {
      summaryBadge.textContent = `${gradeBlocks.length} Khối • ${classes.length} Lớp • ${chapters.length} Chương • ${lessons.length} Bài • ${questionTypes.length} Dạng bài`
    }

    if (gradeBlocks.length === 0 && classes.length === 0) {
      treeContainer.innerHTML = `
        <div style="text-align:center; padding:40px 16px; color:#94a3b8; font-size:13px;">
          <i class="fa-solid fa-sitemap" style="font-size:32px; color:#cbd5e1; margin-bottom:12px;"></i>
          <div style="font-weight:600; color:#64748b;">Chưa có danh mục Constant nào trong cơ sở dữ liệu.</div>
          <div style="font-size:12px; margin-top:4px;">Hãy dùng form bên phải để bắt đầu tạo Khối học đầu tiên!</div>
        </div>
      `
      return
    }

    const query = treeSearchQuery.trim().toLowerCase()

    // Bài học khớp tìm kiếm khi tiêu đề khớp HOẶC có dạng bài con khớp tên.
    const lessonMatchesQuery = (l) => !query || l.title.toLowerCase().includes(query) ||
      questionTypes.some(t => t.lesson_id === l.id && t.name.toLowerCase().includes(query))

    let html = '<div style="display:flex; flex-direction:column; gap:10px;">'

    gradeBlocks.forEach(gb => {
      const gbKey = 'gb_' + (gb.id || gb.name)
      const gbClasses = classes.filter(c => (gb.id && c.grade_block_id === gb.id) || (c.grade_block || c.gradeBlock) === gb.name)

      // Kiểm tra filter tìm kiếm
      const gbMatch = !query || gb.name.toLowerCase().includes(query)
      const hasMatchingChild = gbClasses.some(c => {
        if (!query) return true
        if (c.name.toLowerCase().includes(query)) return true
        const chList = chapters.filter(ch => ch.class_id === c.id)
        return chList.some(ch => {
          if (ch.title.toLowerCase().includes(query)) return true
          const lList = lessons.filter(l => l.chapter_id === ch.id)
          return lList.some(l => lessonMatchesQuery(l))
        })
      })

      if (!gbMatch && !hasMatchingChild) return

      const isGbCollapsed = collapsedKeys.has(gbKey)
      const isGbEditing = editingItem && editingItem.type === 'gradeBlock' && editingItem.id === gb.id

      html += `
        <div class="taxo-node-block" style="border:1px solid ${isGbEditing ? '#2563eb' : '#bae6fd'}; border-radius:10px; background:${isGbEditing ? '#eff6ff' : '#f0f9ff'}; overflow:hidden; box-shadow:${isGbEditing ? '0 0 0 2px #93c5fd' : 'none'}; transition:all 0.15s;">
          
          <!-- Header Khối -->
          <div style="padding:10px 14px; background:${isGbEditing ? '#dbeafe' : '#e0f2fe'}; display:flex; justify-content:space-between; align-items:center; border-bottom:${isGbCollapsed ? 'none' : '1px solid #bae6fd'};">
            
            <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:0;">
              <span class="taxo-toggle-collapse" data-key="${gbKey}" style="cursor:pointer; width:20px; height:20px; display:inline-flex; align-items:center; justify-content:center; color:#0369a1; font-size:12px;" title="Bấm để đóng/mở">
                <i class="fa-solid fa-chevron-${isGbCollapsed ? 'right' : 'down'}"></i>
              </span>
              <i class="fa-solid fa-layer-group" style="color:#0284c7; font-size:14px;"></i>
              <span style="font-weight:700; font-size:13.5px; color:#0369a1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${escapeHtml(gb.name)}
              </span>
              <span style="font-size:10.5px; font-weight:700; color:#0369a1; background:#bae6fd; padding:1px 6px; border-radius:4px;">
                KHỐI
              </span>
              <span style="font-size:11px; color:#64748b;">
                (${gbClasses.length} lớp)
              </span>
              ${gb.order_index !== undefined ? `<span style="font-size:10.5px; color:#94a3b8;" title="Thứ tự hiển thị">#${gb.order_index}</span>` : ''}
            </div>

            <!-- Action buttons Khối -->
            <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
              <button type="button" class="btn-taxo-add-child" data-type="class" data-parent-gb="${escapeHtmlAttr(gb.name)}" data-parent-gb-id="${gb.id || ''}" title="Thêm Lớp mới vào Khối này" style="font-size:11px; font-weight:600; color:#0369a1; background:#ffffff; border:1px solid #7dd3fc; border-radius:6px; padding:2px 8px; cursor:pointer; display:inline-flex; align-items:center; gap:3px;">
                <i class="fa-solid fa-plus" style="font-size:10px;"></i> Lớp
              </button>
              ${gb.id ? `
                <button type="button" class="btn-taxo-edit" data-type="gradeBlock" data-id="${gb.id}" data-name="${escapeHtmlAttr(gb.name)}" data-order="${gb.order_index || 0}" data-desc="${escapeHtmlAttr(gb.description || '')}" title="Chỉnh sửa Khối học này" style="background:#ffffff; border:1px solid #cbd5e1; border-radius:6px; color:#2563eb; cursor:pointer; font-size:11px; padding:3px 7px;">
                  <i class="fa-solid fa-pen-to-square"></i> Sửa
                </button>
                <button type="button" class="btn-taxo-delete" data-type="gradeBlock" data-id="${gb.id}" data-name="${escapeHtmlAttr(gb.name)}" title="Xóa Khối học này" style="background:#ffffff; border:1px solid #cbd5e1; border-radius:6px; color:#ef4444; cursor:pointer; font-size:11px; padding:3px 7px;">
                  <i class="fa-solid fa-trash-can"></i>
                </button>
              ` : ''}
            </div>

          </div>

          <!-- Body Khối: Danh sách các Lớp -->
          ${!isGbCollapsed ? `
            <div style="padding:10px 12px 12px 16px; display:flex; flex-direction:column; gap:8px;">
              ${gbClasses.length === 0 ? `
                <div style="font-size:12px; color:#94a3b8; padding:6px 0; font-style:italic;">
                  (Chưa có Lớp học nào trong Khối này &mdash; bấm "+ Lớp" để thêm)
                </div>
              ` : gbClasses.map(c => {
                const cKey = 'cl_' + c.id
                const isCCollapsed = collapsedKeys.has(cKey)
                const cChapters = chapters.filter(ch => ch.class_id === c.id)
                const isCEditing = editingItem && editingItem.type === 'class' && editingItem.id === c.id

                const cMatch = !query || c.name.toLowerCase().includes(query)
                const cHasMatchingChild = cChapters.some(ch => {
                  if (!query) return true
                  if (ch.title.toLowerCase().includes(query)) return true
                  const lList = lessons.filter(l => l.chapter_id === ch.id)
                  return lList.some(l => lessonMatchesQuery(l))
                })

                if (!cMatch && !cHasMatchingChild) return ''

                return `
                  <div style="border:1px solid ${isCEditing ? '#2563eb' : '#e2e8f0'}; border-radius:8px; background:#ffffff; overflow:hidden; box-shadow:${isCEditing ? '0 0 0 2px #bfdbfe' : 'none'};">
                    
                    <!-- Header Lớp -->
                    <div style="padding:8px 12px; background:${isCEditing ? '#eff6ff' : '#f8fafc'}; display:flex; justify-content:space-between; align-items:center; border-bottom:${isCCollapsed ? 'none' : '1px solid #f1f5f9'};">
                      <div style="display:flex; align-items:center; gap:6px; flex:1; min-width:0;">
                        <span class="taxo-toggle-collapse" data-key="${cKey}" style="cursor:pointer; width:18px; height:18px; display:inline-flex; align-items:center; justify-content:center; color:#64748b; font-size:11px;" title="Bấm để đóng/mở">
                          <i class="fa-solid fa-chevron-${isCCollapsed ? 'right' : 'down'}"></i>
                        </span>
                        <i class="fa-solid fa-graduation-cap" style="color:#2563eb; font-size:12px;"></i>
                        <span style="font-weight:700; font-size:13px; color:#1e293b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                          ${escapeHtml(c.name)}
                        </span>
                        <span style="font-size:10px; font-weight:700; color:#4f46e5; background:#ede9fe; padding:1px 5px; border-radius:4px;">
                          LỚP
                        </span>
                        <span style="font-size:11px; color:#64748b;">
                          (${cChapters.length} chương)
                        </span>
                        ${c.order_index !== undefined ? `<span style="font-size:10px; color:#94a3b8;">#${c.order_index}</span>` : ''}
                      </div>

                      <!-- Action buttons Lớp -->
                      <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
                        <button type="button" class="btn-taxo-add-child" data-type="chapter" data-parent-id="${c.id}" title="Thêm Chương mới vào Lớp này" style="font-size:11px; font-weight:600; color:#059669; background:#ecfdf5; border:1px solid #a7f3d0; border-radius:5px; padding:2px 7px; cursor:pointer; display:inline-flex; align-items:center; gap:2px;">
                          <i class="fa-solid fa-plus" style="font-size:9px;"></i> Chương
                        </button>
                        <button type="button" class="btn-taxo-edit" data-type="class" data-id="${c.id}" data-name="${escapeHtmlAttr(c.name)}" data-order="${c.order_index || 0}" data-gb="${escapeHtmlAttr(c.grade_block || '')}" data-gb-id="${c.grade_block_id || ''}" data-desc="${escapeHtmlAttr(c.description || '')}" title="Chỉnh sửa Lớp này" style="background:none; border:1px solid #e2e8f0; border-radius:5px; color:#2563eb; cursor:pointer; font-size:11px; padding:2px 6px;">
                          <i class="fa-solid fa-pen-to-square"></i> Sửa
                        </button>
                        <button type="button" class="btn-taxo-delete" data-type="class" data-id="${c.id}" data-name="${escapeHtmlAttr(c.name)}" title="Xóa Lớp này" style="background:none; border:1px solid #e2e8f0; border-radius:5px; color:#ef4444; cursor:pointer; font-size:11px; padding:2px 6px;">
                          <i class="fa-solid fa-trash-can"></i>
                        </button>
                      </div>
                    </div>

                    <!-- Body Lớp: Danh sách các Chương -->
                    ${!isCCollapsed ? `
                      <div style="padding:6px 10px 8px 14px; display:flex; flex-direction:column; gap:6px;">
                        ${cChapters.length === 0 ? `
                          <div style="font-size:11.5px; color:#94a3b8; padding:4px 0; font-style:italic;">
                            (Chưa có Chương học nào &mdash; bấm "+ Chương" để thêm)
                          </div>
                        ` : cChapters.map(ch => {
                          const chKey = 'ch_' + ch.id
                          const isChCollapsed = collapsedKeys.has(chKey)
                          const chLessons = lessons.filter(l => l.chapter_id === ch.id)
                          const isChEditing = editingItem && editingItem.type === 'chapter' && editingItem.id === ch.id

                          const chMatch = !query || ch.title.toLowerCase().includes(query)
                          const chHasMatchingChild = chLessons.some(l => lessonMatchesQuery(l))

                          if (!chMatch && !chHasMatchingChild) return ''

                          return `
                            <div style="border-left:3px solid #059669; background:${isChEditing ? '#ecfdf5' : '#f8fafc'}; border-radius:6px; padding:6px 8px; box-shadow:${isChEditing ? '0 0 0 2px #6ee7b7' : 'none'};">
                              
                              <!-- Header Chương -->
                              <div style="display:flex; justify-content:space-between; align-items:center;">
                                <div style="display:flex; align-items:center; gap:6px; flex:1; min-width:0;">
                                  <span class="taxo-toggle-collapse" data-key="${chKey}" style="cursor:pointer; width:16px; height:16px; display:inline-flex; align-items:center; justify-content:center; color:#059669; font-size:10px;" title="Bấm để đóng/mở">
                                    <i class="fa-solid fa-chevron-${isChCollapsed ? 'right' : 'down'}"></i>
                                  </span>
                                  <i class="fa-solid fa-book" style="color:#059669; font-size:11px;"></i>
                                  <span style="font-weight:600; font-size:12.5px; color:#1e293b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                    ${escapeHtml(ch.title)}
                                  </span>
                                  <span style="font-size:10px; font-weight:700; color:#059669; background:#d1fae5; padding:1px 5px; border-radius:4px;">
                                    CHƯƠNG
                                  </span>
                                  <span style="font-size:11px; color:#64748b;">
                                    (${chLessons.length} bài)
                                  </span>
                                  ${ch.order_index !== undefined ? `<span style="font-size:10px; color:#94a3b8;">#${ch.order_index}</span>` : ''}
                                </div>

                                <!-- Action buttons Chương -->
                                <div style="display:flex; align-items:center; gap:3px; flex-shrink:0;">
                                  <button type="button" class="btn-taxo-add-child" data-type="lesson" data-parent-id="${ch.id}" title="Thêm Bài học mới vào Chương này" style="font-size:10.5px; font-weight:600; color:#7c3aed; background:#f5f3ff; border:1px solid #ddd6fe; border-radius:4px; padding:1px 6px; cursor:pointer; display:inline-flex; align-items:center; gap:2px;">
                                    <i class="fa-solid fa-plus" style="font-size:8px;"></i> Bài
                                  </button>
                                  <button type="button" class="btn-taxo-edit" data-type="chapter" data-id="${ch.id}" data-title="${escapeHtmlAttr(ch.title)}" data-order="${ch.order_index || 0}" data-class-id="${ch.class_id}" data-desc="${escapeHtmlAttr(ch.description || '')}" title="Chỉnh sửa Chương này" style="background:none; border:1px solid #e2e8f0; border-radius:4px; color:#2563eb; cursor:pointer; font-size:10.5px; padding:1px 5px;">
                                    <i class="fa-solid fa-pen-to-square"></i>
                                  </button>
                                  <button type="button" class="btn-taxo-delete" data-type="chapter" data-id="${ch.id}" data-title="${escapeHtmlAttr(ch.title)}" title="Xóa Chương này" style="background:none; border:1px solid #e2e8f0; border-radius:4px; color:#ef4444; cursor:pointer; font-size:10.5px; padding:1px 5px;">
                                    <i class="fa-solid fa-trash-can"></i>
                                  </button>
                                </div>
                              </div>

                              <!-- Body Chương: Danh sách các Bài học -->
                              ${!isChCollapsed ? `
                                <div style="padding-left:18px; margin-top:4px; display:flex; flex-direction:column; gap:3px;">
                                  ${chLessons.length === 0 ? `
                                    <div style="font-size:11px; color:#94a3b8; padding:2px 0; font-style:italic;">
                                      (Chưa có Bài học nào &mdash; bấm "+ Bài" để thêm)
                                    </div>
                                  ` : chLessons.map(l => {
                                    if (!lessonMatchesQuery(l)) return ''
                                    const isLEditing = editingItem && editingItem.type === 'lesson' && editingItem.id === l.id
                                    const lsKey = 'ls_' + l.id
                                    const isLCollapsed = collapsedKeys.has(lsKey)
                                    const lTypes = questionTypes.filter(t => t.lesson_id === l.id)
                                    const isTyEditing = (t) => editingItem && editingItem.type === 'questionType' && editingItem.id === t.id
                                    // Khi tìm kiếm khớp tên bài thì hiện đủ dạng bài; khi chỉ khớp
                                    // tên dạng bài thì chỉ hiện các dạng bài khớp.
                                    const shownTypes = lTypes.filter(t => !query || l.title.toLowerCase().includes(query) || t.name.toLowerCase().includes(query))

                                    return `
                                      <div style="background:${isLEditing ? '#ede9fe' : '#ffffff'}; border:1px solid ${isLEditing ? '#7c3aed' : '#f1f5f9'}; border-radius:4px; transition:background 0.15s; overflow:hidden;">
                                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; color:#334155; padding:3px 6px;">
                                          <div style="display:flex; align-items:center; gap:6px; flex:1; min-width:0;">
                                            <span class="taxo-toggle-collapse" data-key="${lsKey}" style="cursor:pointer; width:14px; height:14px; display:inline-flex; align-items:center; justify-content:center; color:#7c3aed; font-size:9px;" title="Bấm để đóng/mở dạng bài">
                                              <i class="fa-solid fa-chevron-${isLCollapsed ? 'right' : 'down'}"></i>
                                            </span>
                                            <i class="fa-solid fa-file-lines" style="font-size:10.5px; color:#7c3aed;"></i>
                                            <span style="font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                              ${escapeHtml(l.title)}
                                            </span>
                                            <span style="font-size:10px; color:#64748b;">
                                              (${lTypes.length} dạng bài)
                                            </span>
                                            ${l.order_index !== undefined ? `<span style="font-size:9.5px; color:#94a3b8;">#${l.order_index}</span>` : ''}
                                          </div>

                                          <!-- Action buttons Bài học -->
                                          <div style="display:flex; align-items:center; gap:3px; flex-shrink:0;">
                                            <button type="button" class="btn-taxo-add-child" data-type="questionType" data-parent-id="${l.id}" title="Thêm Dạng bài mới vào Bài học này" style="font-size:10px; font-weight:600; color:#b45309; background:#fffbeb; border:1px solid #fde68a; border-radius:4px; padding:1px 5px; cursor:pointer; display:inline-flex; align-items:center; gap:2px;">
                                              <i class="fa-solid fa-plus" style="font-size:8px;"></i> Dạng bài
                                            </button>
                                            <button type="button" class="btn-taxo-edit" data-type="lesson" data-id="${l.id}" data-title="${escapeHtmlAttr(l.title)}" data-order="${l.order_index || 0}" data-chapter-id="${l.chapter_id}" data-desc="${escapeHtmlAttr(l.description || '')}" title="Chỉnh sửa Bài học này" style="background:none; border:none; color:#2563eb; cursor:pointer; font-size:10.5px; padding:1px 4px;">
                                              <i class="fa-solid fa-pen-to-square"></i>
                                            </button>
                                            <button type="button" class="btn-taxo-delete" data-type="lesson" data-id="${l.id}" data-title="${escapeHtmlAttr(l.title)}" title="Xóa Bài học này" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:10.5px; padding:1px 4px;">
                                              <i class="fa-solid fa-trash-can"></i>
                                            </button>
                                          </div>
                                        </div>

                                        <!-- Body Bài học: Danh sách các Dạng bài -->
                                        ${!isLCollapsed ? `
                                          <div style="padding-left:20px; padding-bottom:3px; display:flex; flex-direction:column; gap:2px;">
                                            ${shownTypes.length === 0 ? `
                                              <div style="font-size:11px; color:#94a3b8; padding:2px 0 2px 6px; font-style:italic;">
                                                (Chưa có Dạng bài nào &mdash; bấm \"+ Dạng bài\" để thêm)
                                              </div>
                                            ` : shownTypes.map(t => `
                                              <div style="display:flex; justify-content:space-between; align-items:center; font-size:11.5px; color:#475569; padding:2px 6px; background:${isTyEditing(t) ? '#fffbeb' : '#fbfbfd'}; border:1px solid ${isTyEditing(t) ? '#f59e0b' : '#f1f5f9'}; border-radius:4px;">
                                                <div style="display:flex; align-items:center; gap:6px; flex:1; min-width:0;">
                                                  <i class="fa-solid fa-tag" style="font-size:9.5px; color:#b45309;"></i>
                                                  <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                                    ${escapeHtml(t.name)}
                                                  </span>
                                                  ${t.order_index !== undefined ? `<span style="font-size:9.5px; color:#94a3b8;">#${t.order_index}</span>` : ''}
                                                </div>
                                                <div style="display:flex; align-items:center; gap:3px; flex-shrink:0;">
                                                  <button type="button" class="btn-taxo-edit" data-type="questionType" data-id="${t.id}" data-name="${escapeHtmlAttr(t.name)}" data-order="${t.order_index || 0}" data-lesson-id="${t.lesson_id}" data-desc="${escapeHtmlAttr(t.description || '')}" title="Chỉnh sửa Dạng bài này" style="background:none; border:none; color:#2563eb; cursor:pointer; font-size:10px; padding:1px 4px;">
                                                    <i class="fa-solid fa-pen-to-square"></i>
                                                  </button>
                                                  <button type="button" class="btn-taxo-delete" data-type="questionType" data-id="${t.id}" data-name="${escapeHtmlAttr(t.name)}" title="Xóa Dạng bài này" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:10px; padding:1px 4px;">
                                                    <i class="fa-solid fa-trash-can"></i>
                                                  </button>
                                                </div>
                                              </div>
                                            `).join('')}
                                          </div>
                                        ` : ''}
                                      </div>
                                    `
                                  }).join('')}
                                </div>
                              ` : ''}

                            </div>
                          `
                        }).join('')}
                      </div>
                    ` : ''}

                  </div>
                `
              }).join('')}
            </div>
          ` : ''}

        </div>
      `
    })

    html += '</div>'
    treeContainer.innerHTML = html

    // Attach tree event listeners
    attachTreeEventListeners()
  }

  function attachTreeEventListeners() {
    if (!treeContainer) return

    // 1. Toggle collapse / expand
    treeContainer.querySelectorAll('.taxo-toggle-collapse').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const key = btn.getAttribute('data-key')
        if (!key) return
        if (collapsedKeys.has(key)) {
          collapsedKeys.delete(key)
        } else {
          collapsedKeys.add(key)
        }
        renderTaxonomyTree()
      })
    })

    // 2. Chỉnh sửa node (mở form edit dùng chung)
    treeContainer.querySelectorAll('.btn-taxo-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const type = btn.getAttribute('data-type')
        const id = btn.getAttribute('data-id')

        let itemData = { type, id }
        if (type === 'gradeBlock') {
          itemData.name = btn.getAttribute('data-name') || ''
          itemData.order_index = parseInt(btn.getAttribute('data-order') || '0', 10)
          itemData.description = btn.getAttribute('data-desc') || ''
        } else if (type === 'class') {
          itemData.name = btn.getAttribute('data-name') || ''
          itemData.grade_block = btn.getAttribute('data-gb') || ''
          itemData.grade_block_id = btn.getAttribute('data-gb-id') || null
          itemData.order_index = parseInt(btn.getAttribute('data-order') || '0', 10)
          itemData.description = btn.getAttribute('data-desc') || ''
        } else if (type === 'chapter') {
          itemData.title = btn.getAttribute('data-title') || ''
          itemData.class_id = btn.getAttribute('data-class-id') || ''
          itemData.order_index = parseInt(btn.getAttribute('data-order') || '0', 10)
          itemData.description = btn.getAttribute('data-desc') || ''
        } else if (type === 'lesson') {
          itemData.title = btn.getAttribute('data-title') || ''
          itemData.chapter_id = btn.getAttribute('data-chapter-id') || ''
          itemData.order_index = parseInt(btn.getAttribute('data-order') || '0', 10)
          itemData.description = btn.getAttribute('data-desc') || ''
        } else if (type === 'questionType') {
          itemData.name = btn.getAttribute('data-name') || ''
          itemData.lesson_id = btn.getAttribute('data-lesson-id') || ''
          itemData.order_index = parseInt(btn.getAttribute('data-order') || '0', 10)
          itemData.description = btn.getAttribute('data-desc') || ''
        }

        setFormMode('edit', itemData)
        titleInput?.focus()
      })
    })

    // 3. Xóa node khỏi Constant taxonomy
    treeContainer.querySelectorAll('.btn-taxo-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const type = btn.getAttribute('data-type')
        const id = btn.getAttribute('data-id')
        const name = btn.getAttribute('data-name') || btn.getAttribute('data-title') || 'mục'

        const typeLabels = {
          gradeBlock: 'Khối học',
          class: 'Lớp học',
          chapter: 'Chương học',
          lesson: 'Bài học',
          questionType: 'Dạng bài'
        }
        const label = typeLabels[type] || 'mục'

        if (!confirm(`Bạn có chắc chắn muốn xóa ${label} "${name}" khỏi danh mục Constant?\n\nLưu ý: Chỉ xóa được nếu không chứa danh mục con hoặc câu hỏi liên kết.`)) {
          return
        }

        try {
          await api.deleteConstantTaxonomyItem({ type, id })
          showToast(`Đã xóa ${label} "${name}" thành công!`, 'success')

          if (editingItem && editingItem.type === type && editingItem.id === id) {
            setFormMode('add')
          }

          await loadConstantTaxonomyData()
          populateGradeBlockDropdowns()
          renderTaxonomyTree()
          updateFormParentField()
        } catch (err) {
          showToast('Không thể xóa: ' + (err.message || 'Lỗi xử lý'), 'error')
        }
      })
    })

    // 4. Nút bấm Thêm mục con nhanh (+ Lớp / + Chương / + Bài)
    treeContainer.querySelectorAll('.btn-taxo-add-child').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const childType = btn.getAttribute('data-type')
        const parentId = btn.getAttribute('data-parent-id')
        const parentGb = btn.getAttribute('data-parent-gb')
        const parentGbId = btn.getAttribute('data-parent-gb-id')

        setFormMode('add', {
          presetType: childType,
          presetParentId: parentId,
          presetParentGb: parentGb,
          presetParentGbId: parentGbId
        })
        titleInput?.focus()
      })
    })
  }

  // Event: Cấp độ dropdown change
  addTypeSel?.addEventListener('change', () => {
    updateFormParentField()
    // Auto calculate order index
    const currentType = addTypeSel.value
    let nextOrder = 1
    if (currentType === 'gradeBlock') {
      nextOrder = (constantTaxonomyState.gradeBlocks || []).length + 1
    } else if (currentType === 'class') {
      nextOrder = (constantTaxonomyState.classes || []).length + 1
    } else if (currentType === 'chapter') {
      nextOrder = (constantTaxonomyState.chapters || []).length + 1
    } else if (currentType === 'lesson') {
      nextOrder = (constantTaxonomyState.lessons || []).length + 1
    } else if (currentType === 'questionType') {
      nextOrder = (constantTaxonomyState.questionTypes || []).length + 1
    }
    if (orderInput) orderInput.value = nextOrder
  })

  // Event: Hủy chỉnh sửa
  btnCancelEdit?.addEventListener('click', () => {
    setFormMode('add')
  })

  // Event: Tìm kiếm trên cây
  treeSearchInput?.addEventListener('input', (e) => {
    treeSearchQuery = e.target.value
    renderTaxonomyTree()
  })

  // Event: Mở hết / Thu gọn
  document.getElementById('btn-taxo-expand-all')?.addEventListener('click', () => {
    collapsedKeys.clear()
    renderTaxonomyTree()
  })

  document.getElementById('btn-taxo-collapse-all')?.addEventListener('click', () => {
    buildUnifiedGradeBlocks().forEach(gb => {
      collapsedKeys.add('gb_' + (gb.id || gb.name))
    })
    ;(constantTaxonomyState.classes || []).forEach(c => {
      collapsedKeys.add('cl_' + c.id)
    })
    ;(constantTaxonomyState.chapters || []).forEach(ch => {
      collapsedKeys.add('ch_' + ch.id)
    })
    ;(constantTaxonomyState.lessons || []).forEach(l => {
      collapsedKeys.add('ls_' + l.id)
    })
    renderTaxonomyTree()
  })

  // Event: Làm mới
  document.getElementById('btn-taxo-refresh')?.addEventListener('click', async () => {
    try {
      await loadConstantTaxonomyData()
      populateGradeBlockDropdowns()
      renderTaxonomyTree()
      updateFormParentField()
      showToast('Đã làm mới danh mục Constant!', 'success')
    } catch (e) {
      showToast('Lỗi làm mới: ' + (e.message || 'Lỗi mạng'), 'error')
    }
  })

  // Event: Submit Add or Edit (Dùng chung 1 form)
  submitBtn?.addEventListener('click', async () => {
    const isEdit = Boolean(editingItem)
    const type = isEdit ? editingItem.type : (addTypeSel?.value || 'class')
    const title = titleInput?.value.trim()
    const orderIndex = parseInt(orderInput?.value || '0', 10)
    const description = descInput?.value.trim() || null

    if (!title) {
      showToast('Vui lòng nhập tên hoặc tiêu đề!', 'warning')
      titleInput?.focus()
      return
    }

    if (isNaN(orderIndex) || orderIndex < 0) {
      showToast('Thứ tự hiển thị phải là số không âm (>= 0)!', 'warning')
      orderInput?.focus()
      return
    }

    const payload = {
      type,
      data: {
        orderIndex,
        description
      }
    }

    if (type === 'gradeBlock') {
      payload.data.name = title
    } else if (type === 'class') {
      const gbSelect = document.getElementById('taxo-form-grade-block')
      const gb = gbSelect?.value
      if (!gb) {
        showToast('Vui lòng chọn khối học trực thuộc!', 'warning')
        gbSelect?.focus()
        return
      }
      payload.data.gradeBlock = gb
      const selectedOpt = gbSelect?.selectedOptions?.[0]
      const gbId = selectedOpt?.getAttribute('data-id')
      if (gbId) payload.data.gradeBlockId = gbId
      payload.data.name = title
    } else if (type === 'chapter') {
      const clSelect = document.getElementById('taxo-form-class-id')
      const clId = clSelect?.value
      if (!clId) {
        showToast('Vui lòng chọn lớp học trực thuộc!', 'warning')
        clSelect?.focus()
        return
      }
      payload.data.classId = clId
      payload.data.title = title
    } else if (type === 'lesson') {
      const chSelect = document.getElementById('taxo-form-chapter-id')
      const chId = chSelect?.value
      if (!chId) {
        showToast('Vui lòng chọn chương học trực thuộc!', 'warning')
        chSelect?.focus()
        return
      }
      payload.data.chapterId = chId
      payload.data.title = title
    } else if (type === 'questionType') {
      const lsSelect = document.getElementById('taxo-form-lesson-id')
      const lsId = lsSelect?.value
      if (!lsId) {
        showToast('Vui lòng chọn bài học trực thuộc!', 'warning')
        lsSelect?.focus()
        return
      }
      payload.data.lessonId = lsId
      payload.data.name = title
    }

    // Double submit protection
    submitBtn.disabled = true
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...'

    try {
      if (isEdit) {
        payload.id = editingItem.id
        await api.updateConstantTaxonomyItem(payload)
        showToast('Đã cập nhật danh mục Constant thành công!', 'success')
        setFormMode('add')
      } else {
        await api.createConstantTaxonomyItem(payload)
        showToast('Đã thêm danh mục Constant thành công!', 'success')
        titleInput.value = ''
        descInput.value = ''
        if (orderInput) orderInput.value = parseInt(orderInput.value || '0', 10) + 1
      }

      await loadConstantTaxonomyData()
      populateGradeBlockDropdowns()
      renderTaxonomyTree()
      updateFormParentField()
    } catch (err) {
      showToast('Lỗi thao tác: ' + (err.message || 'Không thể lưu'), 'error')
    } finally {
      submitBtn.disabled = false
      submitBtn.innerHTML = editingItem ? '<i class="fa-solid fa-check"></i> Cập nhật thay đổi' : '<i class="fa-solid fa-plus"></i> Thêm vào danh mục'
    }
  })

  // Khởi tạo ban đầu
  renderTaxonomyTree()
  updateFormParentField()
}

// ========================================================
// Modal 1: Import từ Markdown (MOET Math / Chemistry mhchem)
// ========================================================
function setupHeaderActionListeners() {
  document.getElementById('btn-open-sync-modal')?.addEventListener('click', openSyncDynamicToConstantModal)
  document.getElementById('btn-open-taxonomy-modal')?.addEventListener('click', openTaxonomyManagementModal)
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

  document.getElementById('qb-bulk-delete-btn')?.addEventListener('click', async () => {
    if (selectedQuestionIds.size === 0) {
      return showToast('Vui lòng chọn ít nhất một câu hỏi để xóa!', 'warning')
    }
    const ids = Array.from(selectedQuestionIds)
    const count = ids.length
    if (!confirm(`Bạn có chắc chắn muốn xóa ${count} câu hỏi đã chọn khỏi Ngân hàng đề? Hành động này không thể hoàn tác!`)) {
      return
    }

    const delBtn = document.getElementById('qb-bulk-delete-btn')
    if (delBtn) {
      delBtn.disabled = true
      delBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xóa...'
    }

    try {
      const res = await api.deleteQuestionsBulkFromBank(ids)
      showToast(res.message || `Đã xóa thành công ${count} câu hỏi khỏi Ngân hàng!`, 'success')
      selectedQuestionIds.clear()
      updateBulkActionBar()
      await refreshStats()
      await fetchAndRenderQuestions()
    } catch (err) {
      showToast('Lỗi khi xóa câu hỏi hàng loạt: ' + err.message, 'error')
    } finally {
      if (delBtn) {
        delBtn.disabled = false
        delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Xóa hàng loạt'
      }
    }
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
          <div style="display:flex; flex-direction:column; gap:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px;">
            <div style="font-size:13px; font-weight:700; color:#0f172a; display:flex; align-items:center; gap:6px;">
              <i class="fa-solid fa-sliders" style="color:#0066cc;"></i> Cấu hình bài tập
            </div>
            ${renderHomeworkConfigFields('cs')}
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
  bindHomeworkConfigFields('cs')
  bindHomeworkTypeCoupling('create-selected-type', 'cs-attempts', 'cs-violations')
  document.getElementById('create-selected-submit-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget
    const title = document.getElementById('create-selected-title')?.value.trim()
    const targetLessonId = lessonSel?.value
    const type = document.getElementById('create-selected-type')?.value || 'PRACTICE'
    const cfg = collectHomeworkConfig('cs')
    if (!title) return showToast('Vui lòng nhập tên đề!', 'warning')
    if (!targetLessonId) return showToast('Vui lòng chọn bài học đích!', 'warning')
    btn.disabled = true
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo...'
    try {
      const res = await api.createHomeworkFromBankQuestions({ targetLessonId, title, type, durationMinutes: cfg.durationMinutes, maxAttempts: type === 'EXAM' ? 1 : cfg.maxAttempts, maxViolations: cfg.maxViolations, deadline: cfg.deadline, showSolutions: cfg.showSolutions, questionBankIds })
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

async function openImportMarkdownModal() {
  // Modal nhập Markdown cần taxonomy đầy đủ để tự suy ra target từ tag Dạng bài.
  // Không dùng state cũ/không đầy đủ (đặc biệt sau khi vừa cập nhật taxonomy).
  try {
    await loadConstantTaxonomyData()
  } catch (err) {
    showToast(err.message || 'Không thể tải danh mục Constant', 'error')
    return
  }
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
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Lớp Constant *</label>
                <select id="md-target-class" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#ffffff;">
                  <option value="">-- Chọn lớp Constant --</option>
                  ${(constantTaxonomyState.classes || []).map(c => `<option value="${c.id}">${escapeHtml(c.name)} (${c.grade_block})</option>`).join('')}
                </select>
              </div>
              <div>
                  <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Chương Constant <span style="font-weight:400; color:#94a3b8;">(tự nhận diện)</span></label>
                <select id="md-target-chapter" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#ffffff;">
                  <option value="">-- Chọn chương Constant --</option>
                </select>
              </div>
              <div>
                  <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Bài học Constant <span style="font-weight:400; color:#94a3b8;">(tự nhận diện)</span></label>
                <select id="md-target-lesson" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#ffffff;">
                  <option value="">-- Chọn bài học Constant --</option>
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
              <span id="md-diag-summary" style="display:none; font-size:12px; font-weight:700; padding:2px 8px; border-radius:6px;"></span>
              <span id="md-taxonomy-summary" style="display:none; font-size:12px; font-weight:700; padding:2px 8px; border-radius:6px;"></span>
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

  // Cascading chapters/lessons from constant taxonomy
  classSel?.addEventListener('change', (e) => {
    const clId = e.target.value
    if (clId) {
      const chs = (constantTaxonomyState.chapters || []).filter(ch => ch.class_id === clId)
      chs.sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
      chapterSel.innerHTML = '<option value="">-- Chọn chương Constant --</option>' + chs.map(ch => `<option value="${ch.id}">${escapeHtml(ch.title)}</option>`).join('')
    } else {
      chapterSel.innerHTML = '<option value="">-- Chọn chương Constant --</option>'
    }
    lessonSel.innerHTML = '<option value="">-- Chọn bài học Constant --</option>'
  })

  chapterSel?.addEventListener('change', (e) => {
    const chId = e.target.value
    if (chId) {
      const ls = (constantTaxonomyState.lessons || []).filter(l => l.chapter_id === chId)
      ls.sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
      lessonSel.innerHTML = '<option value="">-- Chọn bài học Constant --</option>' + ls.map(l => `<option value="${l.id}">${escapeHtml(l.title)}</option>`).join('')
    } else {
      lessonSel.innerHTML = '<option value="">-- Chọn bài học Constant --</option>'
    }
  })

  lessonSel?.addEventListener('change', () => {
    resolveParsedQuestionTypes()
    renderParsedSummaryAndList()
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

  /** Gom lỗi/cảnh báo khối hình theo từng câu hỏi (dùng cho preview + chặn lưu). */
  function collectDiagramIssuesFor(questions) {
    const list = []
    ;(questions || []).forEach((q, idx) => {
      const res = validateQuestionDiagrams(q)
      if (!res.errors.length && !res.warnings.length) return
      list.push({
        questionNumber: q.questionNumber || (idx + 1),
        index: idx,
        errors: res.errors,
        warnings: res.warnings
      })
    })
    return list
  }

  function updateParsedCounters(text) {    const res = parseExamMarkdown(text || '')
    parsedQuestions = res?.questions || []
    const defaultDiff = document.getElementById('md-target-difficulty')?.value || 'THONG_HIEU'

    // If question has no difficulty tag, set it to defaultDiff initially
    parsedQuestions.forEach(q => {
      if (!q.difficulty) q.difficulty = defaultDiff
    })

    inferLessonFromQuestionTypeTags()
    resolveParsedQuestionTypes()

    renderParsedSummaryAndList()
  }

  function normalizeQuestionTypeName(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[–—−]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function setInferredLessonTarget(lessonId) {
    const lesson = (constantTaxonomyState.lessons || []).find(l => l.id === lessonId)
    const chapter = lesson && (constantTaxonomyState.chapters || []).find(ch => ch.id === lesson.chapter_id)
    const targetClass = chapter && (constantTaxonomyState.classes || []).find(cl => cl.id === chapter.class_id)
    if (!lesson || !chapter || !targetClass || !classSel || !chapterSel || !lessonSel) return false

    classSel.value = targetClass.id
    const chapters = (constantTaxonomyState.chapters || [])
      .filter(ch => ch.class_id === targetClass.id)
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    chapterSel.innerHTML = '<option value="">-- Chọn chương Constant --</option>' + chapters
      .map(ch => `<option value="${ch.id}">${escapeHtml(ch.title)}</option>`).join('')
    chapterSel.value = chapter.id

    const lessons = (constantTaxonomyState.lessons || [])
      .filter(l => l.chapter_id === chapter.id)
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    lessonSel.innerHTML = '<option value="">-- Chọn bài học Constant --</option>' + lessons
      .map(l => `<option value="${l.id}">${escapeHtml(l.title)}</option>`).join('')
    lessonSel.value = lesson.id
    return true
  }

  function inferLessonFromQuestionTypeTags() {
    const taggedQuestions = parsedQuestions.filter(q => String(q.questionTypeTag || '').trim())
    if (taggedQuestions.length === 0) return false

    const allTypes = constantTaxonomyState.questionTypes || []
    const resolved = taggedQuestions.map(q => {
      const matches = allTypes.filter(t => normalizeQuestionTypeName(t.name) === normalizeQuestionTypeName(q.questionTypeTag))
      return { q, matches }
    })
    if (resolved.some(item => item.matches.length !== 1)) return false
    const lessonIds = new Set(resolved.map(item => item.matches[0].lesson_id))
    if (lessonIds.size !== 1) return false
    return setInferredLessonTarget([...lessonIds][0])
  }

  function resolveParsedQuestionTypes() {
    const lessonId = lessonSel?.value || ''
    const lessonTypes = (constantTaxonomyState.questionTypes || []).filter(t => t.lesson_id === lessonId)
    const byName = new Map()
    lessonTypes.forEach(t => {
      const key = normalizeQuestionTypeName(t.name)
      const list = byName.get(key) || []
      list.push(t)
      byName.set(key, list)
    })

    parsedQuestions.forEach(q => {
      q.qbQuestionTypeId = null
      q.questionTypeError = ''
      const tag = String(q.questionTypeTag || '').trim()
      if (!tag) return
      if (!lessonId) {
        q.questionTypeError = 'Chưa chọn Bài học Constant'
        return
      }
      const matches = byName.get(normalizeQuestionTypeName(tag)) || []
      if (matches.length === 1) {
        q.qbQuestionTypeId = matches[0].id
      } else if (matches.length === 0) {
        q.questionTypeError = `Không tìm thấy Dạng bài "${tag}" trong Bài học đã chọn`
      } else {
        q.questionTypeError = `Dạng bài "${tag}" bị trùng trong Bài học đã chọn`
      }
    })
  }

  function renderParsedSummaryAndList() {
    const mc = parsedQuestions.filter(q => q.questionType === 'MULTIPLE_CHOICE').length
    const tf = parsedQuestions.filter(q => q.questionType === 'TRUE_FALSE').length
    const sa = parsedQuestions.filter(q => q.questionType === 'SHORT_ANSWER').length

    const nb = parsedQuestions.filter(q => q.difficulty === 'NHAN_BIET').length
    const th = parsedQuestions.filter(q => q.difficulty === 'THONG_HIEU').length
    const vd = parsedQuestions.filter(q => q.difficulty === 'VAN_DUNG').length
    const vdc = parsedQuestions.filter(q => q.difficulty === 'VAN_DUNG_CAO').length
    const taxonomyErrors = parsedQuestions.filter(q => q.questionTypeError).length

    document.getElementById('md-cnt-mc').textContent = `${mc} Trắc nghiệm`
    document.getElementById('md-cnt-tf').textContent = `${tf} Đúng/Sai`
    document.getElementById('md-cnt-sa').textContent = `${sa} Trả lời ngắn`
    document.getElementById('md-cnt-total').textContent = `Tổng: ${parsedQuestions.length} câu`

    // Chẩn đoán khối hình (bbt/graph/geo3d) — lỗi thì chặn lưu, cảnh báo thì vẫn lưu
    const diagramIssues = collectDiagramIssuesFor(parsedQuestions)
    const diagErr = diagramIssues.reduce((s, it) => s + it.errors.length, 0)
    const diagWarn = diagramIssues.reduce((s, it) => s + it.warnings.length, 0)
    const diagBadge = document.getElementById('md-diag-summary')
    if (diagBadge) {
      if (diagErr > 0) {
        diagBadge.style.display = 'inline-flex'
        diagBadge.style.background = '#fef2f2'
        diagBadge.style.color = '#b91c1c'
        diagBadge.style.border = '1px solid #fecaca'
        diagBadge.textContent = `⚠ ${diagErr} lỗi khối hình (không cho lưu)`
      } else if (diagWarn > 0) {
        diagBadge.style.display = 'inline-flex'
        diagBadge.style.background = '#fffbeb'
        diagBadge.style.color = '#b45309'
        diagBadge.style.border = '1px solid #fde68a'
        diagBadge.textContent = `⚠ ${diagWarn} cảnh báo khối hình`
      } else {
        diagBadge.style.display = 'none'
        diagBadge.textContent = ''
      }
    }
    const taxonomyBadge = document.getElementById('md-taxonomy-summary')
    if (taxonomyBadge) {
      if (taxonomyErrors > 0) {
        taxonomyBadge.style.display = 'inline-flex'
        taxonomyBadge.style.background = '#fef2f2'
        taxonomyBadge.style.color = '#b91c1c'
        taxonomyBadge.style.border = '1px solid #fecaca'
        taxonomyBadge.textContent = `⚠ ${taxonomyErrors} câu chưa nhận diện Dạng bài`
      } else {
        taxonomyBadge.style.display = 'none'
        taxonomyBadge.textContent = ''
      }
    }

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
      const diag = validateQuestionDiagrams(q)
      const diagBadge = diag.errors.length
        ? `<span title="${escapeHtmlAttr(diag.errors.map(e => `[${e.code}] ${e.message}`).join(' | '))}" style="font-size:10.5px; font-weight:700; padding:1px 6px; border-radius:4px; background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; white-space:nowrap;">⚠ ${diag.errors.length} lỗi hình</span>`
        : (diag.warnings.length
          ? `<span title="${escapeHtmlAttr(diag.warnings.map(e => `[${e.code}] ${e.message}`).join(' | '))}" style="font-size:10.5px; font-weight:700; padding:1px 6px; border-radius:4px; background:#fffbeb; color:#b45309; border:1px solid #fde68a; white-space:nowrap;">⚠ ${diag.warnings.length} cảnh báo hình</span>`
          : '')
      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:8px 12px; border:1px solid #e2e8f0; border-radius:8px; background:#f8fafc; font-size:13px;">
          <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:0;">
            <span style="font-weight:700; color:#334155; flex-shrink:0;">Câu ${idx + 1}</span>
            <span style="font-size:11px; font-weight:700; padding:2px 6px; border-radius:4px; background:#eff6ff; color:#0284c7; flex-shrink:0;">
              ${q.questionType === 'TRUE_FALSE' ? 'Đúng/Sai' : (q.questionType === 'SHORT_ANSWER' ? 'Trả lời ngắn' : 'Trắc nghiệm')}
            </span>
            ${diagBadge}
            ${q.questionTypeTag ? `<span title="${escapeHtmlAttr(q.questionTypeError || q.questionTypeTag)}" style="font-size:10.5px; font-weight:700; padding:1px 6px; border-radius:4px; background:${q.questionTypeError ? '#fef2f2' : '#fdf2f8'}; color:${q.questionTypeError ? '#b91c1c' : '#be185d'}; border:1px solid ${q.questionTypeError ? '#fecaca' : '#fbcfe8'}; white-space:nowrap;">${q.questionTypeError ? '⚠ ' : ''}Dạng bài</span>` : ''}
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

    inferLessonFromQuestionTypeTags()
    resolveParsedQuestionTypes()
    const taxonomyErrors = parsedQuestions.filter(q => q.questionTypeError)
    if (taxonomyErrors.length > 0) {
      const first = taxonomyErrors[0]
      return showToast(`Câu ${first.questionNumber}: ${first.questionTypeError}. Vui lòng chọn đúng Bài học và sửa tag Dạng bài!`, 'error')
    }

    // Chặn lưu khi còn lỗi khối hình (bbt/graph/geo3d)
    const diagramIssues = collectDiagramIssuesFor(parsedQuestions)
    const diagramErrors = diagramIssues.filter(it => it.errors.length > 0)
    if (diagramErrors.length > 0) {
      const first = diagramErrors[0]
      const detail = first.errors.map(e => `[${e.code}] ${e.message}`).join(' | ')
      return showToast(`Câu ${first.questionNumber} có lỗi khối hình: ${detail}. Vui lòng sửa trước khi lưu!`, 'error')
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
      qbClassId: classSel?.value || null,
      chapterId: chapterSel?.value || null,
      qbChapterId: chapterSel?.value || null,
      lessonId: lessonSel?.value || null,
      qbLessonId: lessonSel?.value || null,
      defaultDifficulty,
      questions: finalQuestions
    }

    const submitBtn = document.getElementById('import-md-submit-btn')
    submitBtn.disabled = true
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...'

    try {
      const result = await api.importQuestionBank(payload)
      const toastType = (result.importedCount === 0 && result.skippedCount > 0) ? 'warning' : 'success'
      showToast(result.message || 'Đã nhập câu hỏi thành công!', toastType)
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

  // Preload classes if not ready
  if (!allClasses || allClasses.length === 0) {
    try {
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
      populateGradeBlockDropdowns()
    } catch (err) {
      console.warn('[QuestionBank] Could not preload classes for matrix modal:', err)
    }
  }

  generatorState.previewQuestions = []
  generatorState.rejectedIds = []
  generatorState.selectedClassIds = []
  generatorState.selectedChapterIds = []
  generatorState.selectedLessonIds = []
  generatorState.scopeMode = 'MULTI'
  generatorState.scopeType = 'MULTI'
  generatorState.classId = ''
  generatorState.chapterId = ''
  generatorState.lessonId = ''

  // MỤC TIÊU A — Modal tạo đề từ ngân hàng CHỈ dùng danh mục CONSTANT. Khối động
  // (gradeBlock của lớp động) không còn xuất hiện ở dropdown, cây scope, hay payload:
  // uniqueBlocks chỉ lấy từ cachedGradeBlocksList (constant). allClasses vẫn được preload
  // ở trên cho filter chính, nhưng không còn dùng trong modal này.
  const uniqueBlocks = Array.from(new Set([...(cachedGradeBlocksList || [])])).filter(Boolean)
  if (!generatorState.gradeBlock || (generatorState.gradeBlock !== 'ALL' && !uniqueBlocks.includes(generatorState.gradeBlock))) {
    // Reset khối stale (vd khối động còn sót từ lần mở trước) về khối constant hợp lệ.
    generatorState.gradeBlock = (filterState.gradeBlock && uniqueBlocks.includes(filterState.gradeBlock))
      ? filterState.gradeBlock
      : (uniqueBlocks[0] || '')
  }

  // Cache for dynamically loaded tree nodes (chapters & lessons)
  const treeDataCache = {
    chapters: {}, // classId -> chapters[]
    lessons: {},  // chapterId -> lessons[]
    expandedClasses: new Set(),
    expandedChapters: new Set()
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
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
              <div>
                <div style="font-size:14px; font-weight:700; color:#1e293b; display:flex; align-items:center; gap:8px;">
                  <i class="fa-solid fa-bullseye" style="color:#0284c7;"></i> 1. Phạm vi nguồn bốc câu hỏi từ Ngân hàng
                </div>
                <div style="font-size:12px; color:#64748b; margin-top:2px;">
                  Chọn Khối và đánh dấu các Lớp, Chương hoặc Bài học làm kho câu hỏi nguồn (chỉ danh mục Constant; câu hỏi nguồn động không được bốc ở đây — chọn 1 mục bất kỳ để bốc nhanh hoặc chọn nhiều mục linh hoạt)
                </div>
              </div>
            </div>

            <!-- Unified Scope Panel -->
            <div id="unified-scope-container">
              <!-- Toolbar: Lọc Khối + Badge tóm tắt + Các nút thao tác -->
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px; background:#ffffff; padding:10px 14px; border:1px solid #e2e8f0; border-radius:8px;">
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                  <label for="gen-scope-grade-block" style="font-size:12px; font-weight:700; color:#334155; display:flex; align-items:center; gap:4px;">
                    <i class="fa-solid fa-layer-group" style="color:#0284c7;"></i> Khối học nguồn:
                  </label>
                  <select id="gen-scope-grade-block" style="height:32px; border:1px solid #cbd5e1; border-radius:6px; padding:0 8px; font-size:12px; background:#ffffff; font-weight:600; color:#0f172a; cursor:pointer;">
                    <option value="ALL">-- Tất cả Khối học --</option>
                    ${uniqueBlocks.map(b => `<option value="${b}" ${b === generatorState.gradeBlock ? 'selected' : ''}>Khối: ${b}</option>`).join('')}
                  </select>
                  <span id="scope-selection-badge" style="background:#f1f5f9; color:#475569; padding:4px 12px; border-radius:999px; font-size:11.5px; font-weight:700; border:1px solid #e2e8f0; display:inline-flex; align-items:center; gap:6px;">
                    <i class="fa-solid fa-list-check" style="color:#64748b;"></i>
                    <span id="scope-selection-badge-text">Đã chọn: 0 lớp, 0 chương, 0 bài</span>
                  </span>
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap;" role="toolbar" aria-label="Thao tác chọn phạm vi">
                  <button type="button" id="btn-scope-select-block" title="Chọn tất cả lớp trong khối đang lọc" style="border:1px solid #bae6fd; background:#f0f9ff; color:#0284c7; padding:5px 10px; font-size:11.5px; font-weight:600; border-radius:6px; cursor:pointer; display:inline-flex; align-items:center; gap:4px; transition:all 0.15s ease;">
                    <i class="fa-solid fa-check-double"></i> Chọn cả khối
                  </button>
                  <button type="button" id="btn-scope-expand-all" title="Mở rộng tất cả các lớp và chương" style="border:1px solid #cbd5e1; background:#ffffff; color:#334155; padding:5px 10px; font-size:11.5px; font-weight:600; border-radius:6px; cursor:pointer; display:inline-flex; align-items:center; gap:4px; transition:all 0.15s ease;">
                    <i class="fa-solid fa-up-right-and-down-left-from-center" style="color:#0284c7; font-size:11px;"></i> Mở tất cả
                  </button>
                  <button type="button" id="btn-scope-collapse-all" title="Thu gọn tất cả" style="border:1px solid #cbd5e1; background:#ffffff; color:#334155; padding:5px 10px; font-size:11.5px; font-weight:600; border-radius:6px; cursor:pointer; display:inline-flex; align-items:center; gap:4px; transition:all 0.15s ease;">
                    <i class="fa-solid fa-down-left-and-up-right-to-center" style="color:#64748b; font-size:11px;"></i> Thu gọn
                  </button>
                  <button type="button" id="btn-scope-clear-selection" title="Bỏ chọn toàn bộ" style="border:1px solid #fecaca; background:#fff1f2; color:#dc2626; padding:5px 10px; font-size:11.5px; font-weight:600; border-radius:6px; cursor:pointer; display:inline-flex; align-items:center; gap:4px; transition:all 0.15s ease;">
                    <i class="fa-solid fa-xmark"></i> Bỏ chọn
                  </button>
                </div>
              </div>

              <!-- Tip hướng dẫn -->
              <div style="font-size:11.5px; color:#64748b; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-circle-info" style="color:#0284c7;"></i>
                <span>Tick chọn <strong>Lớp / Chương</strong> để lấy toàn bộ câu hỏi bên trong, hoặc bấm nút mũi tên <strong style="color:#0284c7;">▶</strong> để mở chi tiết và tick từng <strong>Bài học</strong> mong muốn (chọn 1 mục bất kỳ cũng là bốc nhanh hợp lệ).</span>
              </div>

              <!-- Tree View Container -->
              <div id="gen-scope-tree-container" tabindex="0" role="region" aria-label="Cây phân cấp Lớp Chương Bài" style="max-height:300px; min-height:120px; overflow-y:auto; border:1px solid #cbd5e1; border-radius:8px; background:#ffffff; padding:10px;">
                <!-- Dynamically rendered tree -->
              </div>
            </div>

            <!-- Live Availability Checker Banner with Deficit Alerts -->
            <div id="gen-avail-banner" style="margin-top:14px; padding:12px 16px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; font-size:13px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              <span style="font-weight:700; color:#1e40af;"><i class="fa-solid fa-circle-info"></i> Khả dụng nguồn:</span>
              <span id="avail-mc-badge" style="padding:3px 10px; border-radius:6px; font-weight:600; background:#dcfce7; color:#15803d; border:1px solid #86efac; display:inline-flex; align-items:center; gap:5px;">
                <i class="fa-solid fa-check"></i> <span id="avail-mc">0</span> Trắc nghiệm
              </span>
              <span id="avail-tf-badge" style="padding:3px 10px; border-radius:6px; font-weight:600; background:#fef3c7; color:#b45309; border:1px solid #fcd34d; display:inline-flex; align-items:center; gap:5px;">
                <i class="fa-solid fa-check"></i> <span id="avail-tf">0</span> Đúng / Sai
              </span>
              <span id="avail-sa-badge" style="padding:3px 10px; border-radius:6px; font-weight:600; background:#f3e8ff; color:#7e22ce; border:1px solid #d8b4fe; display:inline-flex; align-items:center; gap:5px;">
                <i class="fa-solid fa-check"></i> <span id="avail-sa">0</span> Trả lời ngắn
              </span>
              <span id="avail-total" style="margin-left:auto; font-weight:700; color:#0369a1;">Tổng có: 0 câu (Chưa chọn mục trong cây phân cấp)</span>
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
                  <input type="number" id="gen-matrix-mc" min="0" value="0" style="width:80px; height:38px; border:1px solid #86efac; border-radius:8px; padding:0 10px; font-size:15px; font-weight:700; color:#14532d; background:#ffffff;" />
                  <span style="font-size:13px; color:#166534;">câu (0.25đ / câu)</span>
                </div>

                <!-- MC Difficulty Subpanel -->
                <div class="matrix-difficulty-subpanel" id="mc-difficulty-subpanel" style="display:none; margin-top:10px; padding-top:10px; border-top:1px dashed #bbf7d0;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <span style="font-size:11px; font-weight:700; color:#166534;">Chi tiết mức độ nhận thức:</span>
                    <div style="display:flex; align-items:center; gap:6px;">
                      <span id="mc-match-status" style="font-size:11px; font-weight:700;"></span>
                      <button type="button" class="btn-auto-distribute" data-part="mc" title="Tự động phân bổ số câu theo tỷ lệ chuẩn Bộ GD&ĐT (40% NB - 35% TH - 15% VD - 10% VDC)" style="background:#dcfce7; border:1px solid #86efac; color:#15803d; font-size:10.5px; font-weight:600; cursor:pointer; padding:2px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:3px;">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> Tự động chia
                      </button>
                    </div>
                  </div>
                  <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:6px;">
                    <div>
                      <label style="font-size:10px; font-weight:700; color:#1d4ed8; display:block;">NB</label>
                      <input type="number" id="gen-mc-nb" min="0" value="0" class="matrix-sub-input" data-part="mc" data-diff="NHAN_BIET" style="width:100%; height:28px; font-size:12px; font-weight:700; border:1px solid #bfdbfe; border-radius:6px; padding:0 4px; text-align:center;" />
                      <span class="sub-avail-chip" id="avail-mc-nb" style="font-size:9px; color:#64748b; display:block; text-align:center; margin-top:2px;">Có: 0</span>
                    </div>
                    <div>
                      <label style="font-size:10px; font-weight:700; color:#15803d; display:block;">TH</label>
                      <input type="number" id="gen-mc-th" min="0" value="0" class="matrix-sub-input" data-part="mc" data-diff="THONG_HIEU" style="width:100%; height:28px; font-size:12px; font-weight:700; border:1px solid #bbf7d0; border-radius:6px; padding:0 4px; text-align:center;" />
                      <span class="sub-avail-chip" id="avail-mc-th" style="font-size:9px; color:#64748b; display:block; text-align:center; margin-top:2px;">Có: 0</span>
                    </div>
                    <div>
                      <label style="font-size:10px; font-weight:700; color:#c2410c; display:block;">VD</label>
                      <input type="number" id="gen-mc-vd" min="0" value="0" class="matrix-sub-input" data-part="mc" data-diff="VAN_DUNG" style="width:100%; height:28px; font-size:12px; font-weight:700; border:1px solid #fed7aa; border-radius:6px; padding:0 4px; text-align:center;" />
                      <span class="sub-avail-chip" id="avail-mc-vd" style="font-size:9px; color:#64748b; display:block; text-align:center; margin-top:2px;">Có: 0</span>
                    </div>
                    <div>
                      <label style="font-size:10px; font-weight:700; color:#be185d; display:block;">VDC</label>
                      <input type="number" id="gen-mc-vdc" min="0" value="0" class="matrix-sub-input" data-part="mc" data-diff="VAN_DUNG_CAO" style="width:100%; height:28px; font-size:12px; font-weight:700; border:1px solid #fbcfe8; border-radius:6px; padding:0 4px; text-align:center;" />
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
                  <input type="number" id="gen-matrix-tf" min="0" value="0" style="width:80px; height:38px; border:1px solid #fcd34d; border-radius:8px; padding:0 10px; font-size:15px; font-weight:700; color:#78350f; background:#ffffff;" />
                  <span style="font-size:13px; color:#92400e;">câu (1.0đ / câu)</span>
                </div>

                <!-- TF Difficulty Subpanel -->
                <div class="matrix-difficulty-subpanel" id="tf-difficulty-subpanel" style="display:none; margin-top:10px; padding-top:10px; border-top:1px dashed #fde68a;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <span style="font-size:11px; font-weight:700; color:#92400e;">Chi tiết mức độ nhận thức:</span>
                    <div style="display:flex; align-items:center; gap:6px;">
                      <span id="tf-match-status" style="font-size:11px; font-weight:700;"></span>
                      <button type="button" class="btn-auto-distribute" data-part="tf" title="Tự động phân bổ số câu theo tỷ lệ chuẩn Bộ GD&ĐT (25% NB - 50% TH - 25% VD)" style="background:#fef3c7; border:1px solid #fcd34d; color:#b45309; font-size:10.5px; font-weight:600; cursor:pointer; padding:2px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:3px;">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> Tự động chia
                      </button>
                    </div>
                  </div>
                  <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:6px;">
                    <div>
                      <label style="font-size:10px; font-weight:700; color:#1d4ed8; display:block;">NB</label>
                      <input type="number" id="gen-tf-nb" min="0" value="0" class="matrix-sub-input" data-part="tf" data-diff="NHAN_BIET" style="width:100%; height:28px; font-size:12px; font-weight:700; border:1px solid #bfdbfe; border-radius:6px; padding:0 4px; text-align:center;" />
                      <span class="sub-avail-chip" id="avail-tf-nb" style="font-size:9px; color:#64748b; display:block; text-align:center; margin-top:2px;">Có: 0</span>
                    </div>
                    <div>
                      <label style="font-size:10px; font-weight:700; color:#15803d; display:block;">TH</label>
                      <input type="number" id="gen-tf-th" min="0" value="0" class="matrix-sub-input" data-part="tf" data-diff="THONG_HIEU" style="width:100%; height:28px; font-size:12px; font-weight:700; border:1px solid #bbf7d0; border-radius:6px; padding:0 4px; text-align:center;" />
                      <span class="sub-avail-chip" id="avail-tf-th" style="font-size:9px; color:#64748b; display:block; text-align:center; margin-top:2px;">Có: 0</span>
                    </div>
                    <div>
                      <label style="font-size:10px; font-weight:700; color:#c2410c; display:block;">VD</label>
                      <input type="number" id="gen-tf-vd" min="0" value="0" class="matrix-sub-input" data-part="tf" data-diff="VAN_DUNG" style="width:100%; height:28px; font-size:12px; font-weight:700; border:1px solid #fed7aa; border-radius:6px; padding:0 4px; text-align:center;" />
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
                  <input type="number" id="gen-matrix-sa" min="0" value="0" style="width:80px; height:38px; border:1px solid #d8b4fe; border-radius:8px; padding:0 10px; font-size:15px; font-weight:700; color:#581c87; background:#ffffff;" />
                  <span style="font-size:13px; color:#6b21a8;">câu (0.5đ / câu)</span>
                </div>

                <!-- SA Difficulty Subpanel -->
                <div class="matrix-difficulty-subpanel" id="sa-difficulty-subpanel" style="display:none; margin-top:10px; padding-top:10px; border-top:1px dashed #e9d5ff;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <span style="font-size:11px; font-weight:700; color:#6b21a8;">Chi tiết mức độ nhận thức:</span>
                    <div style="display:flex; align-items:center; gap:6px;">
                      <span id="sa-match-status" style="font-size:11px; font-weight:700;"></span>
                      <button type="button" class="btn-auto-distribute" data-part="sa" title="Tự động phân bổ số câu theo tỷ lệ chuẩn Bộ GD&ĐT (35% TH - 50% VD - 15% VDC)" style="background:#f3e8ff; border:1px solid #d8b4fe; color:#7e22ce; font-size:10.5px; font-weight:600; cursor:pointer; padding:2px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:3px;">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> Tự động chia
                      </button>
                    </div>
                  </div>
                  <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:6px;">
                    <div>
                      <label style="font-size:10px; font-weight:700; color:#1d4ed8; display:block;">NB</label>
                      <input type="number" id="gen-sa-nb" min="0" value="0" class="matrix-sub-input" data-part="sa" data-diff="NHAN_BIET" style="width:100%; height:28px; font-size:12px; font-weight:700; border:1px solid #bfdbfe; border-radius:6px; padding:0 4px; text-align:center;" />
                      <span class="sub-avail-chip" id="avail-sa-nb" style="font-size:9px; color:#64748b; display:block; text-align:center; margin-top:2px;">Có: 0</span>
                    </div>
                    <div>
                      <label style="font-size:10px; font-weight:700; color:#15803d; display:block;">TH</label>
                      <input type="number" id="gen-sa-th" min="0" value="0" class="matrix-sub-input" data-part="sa" data-diff="THONG_HIEU" style="width:100%; height:28px; font-size:12px; font-weight:700; border:1px solid #bbf7d0; border-radius:6px; padding:0 4px; text-align:center;" />
                      <span class="sub-avail-chip" id="avail-sa-th" style="font-size:9px; color:#64748b; display:block; text-align:center; margin-top:2px;">Có: 0</span>
                    </div>
                    <div>
                      <label style="font-size:10px; font-weight:700; color:#c2410c; display:block;">VD</label>
                      <input type="number" id="gen-sa-vd" min="0" value="0" class="matrix-sub-input" data-part="sa" data-diff="VAN_DUNG" style="width:100%; height:28px; font-size:12px; font-weight:700; border:1px solid #fed7aa; border-radius:6px; padding:0 4px; text-align:center;" />
                      <span class="sub-avail-chip" id="avail-sa-vd" style="font-size:9px; color:#64748b; display:block; text-align:center; margin-top:2px;">Có: 0</span>
                    </div>
                    <div>
                      <label style="font-size:10px; font-weight:700; color:#be185d; display:block;">VDC</label>
                      <input type="number" id="gen-sa-vdc" min="0" value="0" class="matrix-sub-input" data-part="sa" data-diff="VAN_DUNG_CAO" style="width:100%; height:28px; font-size:12px; font-weight:700; border:1px solid #fbcfe8; border-radius:6px; padding:0 4px; text-align:center;" />
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
              <span style="color:#64748b;">Tổng số câu yêu cầu: <strong id="gen-matrix-total-q" style="color:#0f172a; font-size:15px;">0</strong> câu</span>
              <span style="color:#64748b;">Tổng thang điểm: <strong id="gen-matrix-total-points" style="color:#0284c7; font-size:15px;">0.0</strong> điểm</span>
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
            <div style="margin-bottom:12px;">
              <div style="font-size:13px; font-weight:700; color:#1e293b; display:flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-file-pen" style="color:#0284c7;"></i> Thông tin bài tập & Lớp / Bài học đích nhận đề
              </div>
              <div style="font-size:11.5px; color:#64748b; margin-top:3px;">
                <i class="fa-solid fa-circle-info" style="color:#0066cc;"></i> Chọn vị trí lưu trữ bài tập và giao cho học sinh làm bài (tách biệt với phạm vi nguồn bốc câu hỏi ở Bước 1)
              </div>
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:14px; margin-bottom:14px;">
              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Tên bài tập *</label>
                <input type="text" id="gen-exam-title" placeholder="Ví dụ: TN - 1, Đề 15 phút, Đề kiểm tra..." style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:13px; background:#ffffff;" />
                <div style="font-size:11px; color:#64748b; margin-top:3px;"><i class="fa-solid fa-circle-info" style="color:#0066cc;"></i> Tên bài học đích sẽ tự động được ghép phía trước khi tạo bài tập</div>
              </div>
              <div>
                <label style="display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">Hình thức làm bài</label>
                <select id="gen-exam-type" style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; font-size:13px; background:#ffffff;">
                  <option value="PRACTICE">Luyện tập tự do (Tối đa 3 lần làm)</option>
                  <option value="EXAM">Kiểm tra / Thi chính thức (Chỉ 1 lần làm)</option>
                </select>
              </div>
            </div>

            <div style="display:flex; flex-direction:column; gap:12px; background:#ffffff; padding:12px; border-radius:8px; border:1px solid #e2e8f0; margin-bottom:12px;">
              <div style="font-size:13px; font-weight:700; color:#0f172a; display:flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-sliders" style="color:#0066cc;"></i> Cấu hình bài tập
              </div>
              ${renderHomeworkConfigFields('mx')}
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

            <!-- Assign to specific students (Optional) -->
            <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:12px 14px; margin-bottom:12px;">
              <label style="font-size:12px; font-weight:700; display:block; margin-bottom:4px; color:#92400e;">
                <i class="fa-solid fa-user-check"></i> Giao riêng cho học sinh (tùy chọn)
              </label>
              <div style="font-size:11px; color:#64748b; margin-bottom:8px;">Không chọn ai = cả lớp đích đều thấy bài này. Tick chọn để chỉ các em được chọn mới thấy và làm bài.</div>
              <div style="display:flex; gap:8px; margin-bottom:8px; align-items:center;">
                <button type="button" id="btn-gen-assign-select-all" style="background:none; border:none; color:#0066cc; font-size:12px; font-weight:600; cursor:pointer; padding:0;">Chọn tất cả</button>
                <span style="color:#cbd5e1;">|</span>
                <button type="button" id="btn-gen-assign-deselect-all" style="background:none; border:none; color:#64748b; font-size:12px; font-weight:600; cursor:pointer; padding:0;">Bỏ chọn</button>
                <span id="gen-assign-selected-count" style="margin-left:auto; font-size:12px; font-weight:700; color:#92400e;"></span>
              </div>
              <div id="gen-assign-students-list" style="max-height:160px; overflow-y:auto; border:1px solid #fde68a; border-radius:6px; padding:8px 10px; background:#ffffff; font-size:13px; color:#64748b;">
                Chọn lớp đích ở trên để tải danh sách học sinh...
              </div>
            </div>

            <!-- Toggles -->
            <div style="display:flex; gap:20px; align-items:center; flex-wrap:wrap;">
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

  // Unified Scope Panel Elements & Handlers
  const scopeGradeBlockSel = document.getElementById('gen-scope-grade-block')
  const scopeTreeContainer = document.getElementById('gen-scope-tree-container')
  const scopeSelectBlockBtn = document.getElementById('btn-scope-select-block')
  const scopeClearBtn = document.getElementById('btn-scope-clear-selection')
  const scopeExpandAllBtn = document.getElementById('btn-scope-expand-all')
  const scopeCollapseAllBtn = document.getElementById('btn-scope-collapse-all')

  scopeGradeBlockSel?.addEventListener('change', (e) => {
    generatorState.gradeBlock = e.target.value
    generatorState.selectedClassIds = []
    generatorState.selectedChapterIds = []
    generatorState.selectedLessonIds = []
    treeDataCache.expandedClasses.clear()
    treeDataCache.expandedChapters.clear()
    renderTreeForGradeBlock(generatorState.gradeBlock)
    updateTreeSelectionBadge()
    checkLiveAvailability()
  })

  function updateTreeSelectionBadge() {
    const badge = document.getElementById('scope-selection-badge')
    const badgeTextEl = document.getElementById('scope-selection-badge-text')
    const cCount = (generatorState.selectedClassIds || []).length
    const chCount = (generatorState.selectedChapterIds || []).length
    const lCount = (generatorState.selectedLessonIds || []).length
    const totalSelected = cCount + chCount + lCount

    const text = `Đã chọn: ${cCount} lớp, ${chCount} chương, ${lCount} bài`
    if (badgeTextEl) {
      badgeTextEl.textContent = text
    } else if (badge) {
      badge.textContent = text
    }

    if (badge) {
      if (totalSelected > 0) {
        badge.style.background = '#e0f2fe'
        badge.style.color = '#0369a1'
        badge.style.borderColor = '#bae6fd'
        const icon = badge.querySelector('i')
        if (icon) icon.style.color = '#0284c7'
      } else {
        badge.style.background = '#f1f5f9'
        badge.style.color = '#475569'
        badge.style.borderColor = '#e2e8f0'
        const icon = badge.querySelector('i')
        if (icon) icon.style.color = '#64748b'
      }
    }
  }

  // Checkbox cascading helpers
  function handleClassCheckbox(clId, isChecked) {
    if (isChecked) {
      if (!generatorState.selectedClassIds.includes(clId)) {
        generatorState.selectedClassIds.push(clId)
      }
      // Check all rendered chapter & lesson checkboxes under this class
      const classBox = document.querySelector(`.tree-class-node[data-class-id="${clId}"]`)
      if (classBox) {
        classBox.querySelectorAll('.chk-tree-chapter').forEach(chChk => {
          chChk.checked = true
          const chId = chChk.getAttribute('data-chapter-id')
          if (chId && !generatorState.selectedChapterIds.includes(chId)) {
            generatorState.selectedChapterIds.push(chId)
          }
        })
        classBox.querySelectorAll('.chk-tree-lesson').forEach(lChk => {
          lChk.checked = true
          const lId = lChk.getAttribute('data-lesson-id')
          if (lId && !generatorState.selectedLessonIds.includes(lId)) {
            generatorState.selectedLessonIds.push(lId)
          }
        })
      }
      // Also sync cached chapters & lessons if already loaded
      const cachedChs = treeDataCache.chapters[clId] || []
      cachedChs.forEach(ch => {
        if (!generatorState.selectedChapterIds.includes(ch.id)) {
          generatorState.selectedChapterIds.push(ch.id)
        }
        const cachedLs = treeDataCache.lessons[ch.id] || []
        cachedLs.forEach(l => {
          if (!generatorState.selectedLessonIds.includes(l.id)) {
            generatorState.selectedLessonIds.push(l.id)
          }
        })
      })
    } else {
      generatorState.selectedClassIds = generatorState.selectedClassIds.filter(id => id !== clId)
      const classBox = document.querySelector(`.tree-class-node[data-class-id="${clId}"]`)
      if (classBox) {
        classBox.querySelectorAll('.chk-tree-chapter').forEach(chChk => {
          chChk.checked = false
          const chId = chChk.getAttribute('data-chapter-id')
          generatorState.selectedChapterIds = generatorState.selectedChapterIds.filter(id => id !== chId)
        })
        classBox.querySelectorAll('.chk-tree-lesson').forEach(lChk => {
          lChk.checked = false
          const lId = lChk.getAttribute('data-lesson-id')
          generatorState.selectedLessonIds = generatorState.selectedLessonIds.filter(id => id !== lId)
        })
      }
      // Also uncheck from cache
      const cachedChs = treeDataCache.chapters[clId] || []
      cachedChs.forEach(ch => {
        generatorState.selectedChapterIds = generatorState.selectedChapterIds.filter(id => id !== ch.id)
        const cachedLs = treeDataCache.lessons[ch.id] || []
        cachedLs.forEach(l => {
          generatorState.selectedLessonIds = generatorState.selectedLessonIds.filter(id => id !== l.id)
        })
      })
    }
    updateTreeSelectionBadge()
    checkLiveAvailability()
  }

  function handleChapterCheckbox(chId, clId, isChecked) {
    if (isChecked) {
      if (!generatorState.selectedChapterIds.includes(chId)) {
        generatorState.selectedChapterIds.push(chId)
      }
      // Check all rendered lesson checkboxes under this chapter
      const chBox = document.querySelector(`.tree-chapter-node[data-chapter-id="${chId}"]`)
      if (chBox) {
        chBox.querySelectorAll('.chk-tree-lesson').forEach(lChk => {
          lChk.checked = true
          const lId = lChk.getAttribute('data-lesson-id')
          if (lId && !generatorState.selectedLessonIds.includes(lId)) {
            generatorState.selectedLessonIds.push(lId)
          }
        })
      }
      // Sync cached lessons
      const cachedLs = treeDataCache.lessons[chId] || []
      cachedLs.forEach(l => {
        if (!generatorState.selectedLessonIds.includes(l.id)) {
          generatorState.selectedLessonIds.push(l.id)
        }
      })
      // If all chapters of class are checked, check class
      const cachedChs = treeDataCache.chapters[clId] || []
      if (cachedChs.length > 0 && cachedChs.every(ch => generatorState.selectedChapterIds.includes(ch.id))) {
        if (!generatorState.selectedClassIds.includes(clId)) {
          generatorState.selectedClassIds.push(clId)
        }
        const cChk = document.querySelector(`.chk-tree-class[data-class-id="${clId}"]`)
        if (cChk) cChk.checked = true
      }
    } else {
      generatorState.selectedChapterIds = generatorState.selectedChapterIds.filter(id => id !== chId)
      const chBox = document.querySelector(`.tree-chapter-node[data-chapter-id="${chId}"]`)
      if (chBox) {
        chBox.querySelectorAll('.chk-tree-lesson').forEach(lChk => {
          lChk.checked = false
          const lId = lChk.getAttribute('data-lesson-id')
          generatorState.selectedLessonIds = generatorState.selectedLessonIds.filter(id => id !== lId)
        })
      }
      const cachedLs = treeDataCache.lessons[chId] || []
      cachedLs.forEach(l => {
        generatorState.selectedLessonIds = generatorState.selectedLessonIds.filter(id => id !== l.id)
      })
      // Uncheck parent class
      generatorState.selectedClassIds = generatorState.selectedClassIds.filter(id => id !== clId)
      const cChk = document.querySelector(`.chk-tree-class[data-class-id="${clId}"]`)
      if (cChk) cChk.checked = false
    }
    updateTreeSelectionBadge()
    checkLiveAvailability()
  }

  function handleLessonCheckbox(lId, chId, clId, isChecked) {
    if (isChecked) {
      if (!generatorState.selectedLessonIds.includes(lId)) {
        generatorState.selectedLessonIds.push(lId)
      }
      // Check if all lessons of chapter are checked -> check chapter
      const cachedLs = treeDataCache.lessons[chId] || []
      if (cachedLs.length > 0 && cachedLs.every(l => generatorState.selectedLessonIds.includes(l.id))) {
        if (!generatorState.selectedChapterIds.includes(chId)) {
          generatorState.selectedChapterIds.push(chId)
        }
        const chChk = document.querySelector(`.chk-tree-chapter[data-chapter-id="${chId}"]`)
        if (chChk) chChk.checked = true

        // Check if all chapters of class are checked -> check class
        const cachedChs = treeDataCache.chapters[clId] || []
        if (cachedChs.length > 0 && cachedChs.every(ch => generatorState.selectedChapterIds.includes(ch.id))) {
          if (!generatorState.selectedClassIds.includes(clId)) {
            generatorState.selectedClassIds.push(clId)
          }
          const cChk = document.querySelector(`.chk-tree-class[data-class-id="${clId}"]`)
          if (cChk) cChk.checked = true
        }
      }
    } else {
      generatorState.selectedLessonIds = generatorState.selectedLessonIds.filter(id => id !== lId)
      // Uncheck parent chapter & class
      generatorState.selectedChapterIds = generatorState.selectedChapterIds.filter(id => id !== chId)
      const chChk = document.querySelector(`.chk-tree-chapter[data-chapter-id="${chId}"]`)
      if (chChk) chChk.checked = false

      generatorState.selectedClassIds = generatorState.selectedClassIds.filter(id => id !== clId)
      const cChk = document.querySelector(`.chk-tree-class[data-class-id="${clId}"]`)
      if (cChk) cChk.checked = false
    }
    updateTreeSelectionBadge()
    checkLiveAvailability()
  }

  // Load and render Lessons under a Chapter (hỗ trợ cả constant và curriculum)
  async function loadAndRenderLessons(chId, lBox, clId) {
    if (!lBox) return
    if (!treeDataCache.lessons[chId]) {
      const constCh = (constantTaxonomyState.chapters || []).find(ch => ch.id === chId)
      if (constCh) {
        treeDataCache.lessons[chId] = (constantTaxonomyState.lessons || []).filter(l => l.chapter_id === chId)
      } else {
        lBox.innerHTML = '<div style="color:#0284c7; font-size:11px; padding:4px 0;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải bài học...</div>'
        try {
          const ls = await api.getLessons(chId)
          treeDataCache.lessons[chId] = ls || []
        } catch (e) {
          treeDataCache.lessons[chId] = []
        }
      }
    }
    renderLessons(chId, lBox, clId)
  }

  function renderLessons(chId, lBox, clId) {
    const lessons = treeDataCache.lessons[chId] || []
    if (lessons.length === 0) {
      lBox.innerHTML = '<div style="font-size:11.5px; color:#94a3b8; padding:3px 0;"><i class="fa-solid fa-circle-exclamation"></i> Không có bài học nào trong chương này</div>'
      return
    }

    const isParentChecked = generatorState.selectedChapterIds.includes(chId) || generatorState.selectedClassIds.includes(clId)

    let lHtml = ''
    lessons.forEach(l => {
      if (isParentChecked && !generatorState.selectedLessonIds.includes(l.id)) {
        generatorState.selectedLessonIds.push(l.id)
      }
      const isLChecked = generatorState.selectedLessonIds.includes(l.id)
      lHtml += `
        <div style="padding:4px 0; display:flex; align-items:center; gap:6px;">
          <label style="display:inline-flex; align-items:center; gap:6px; cursor:pointer; font-size:12px; color:#475569; margin:0;">
            <input type="checkbox" class="chk-tree-lesson" data-lesson-id="${l.id}" data-chapter-id="${chId}" data-class-id="${clId}" ${isLChecked ? 'checked' : ''} style="width:14px; height:14px; cursor:pointer; accent-color:#0284c7;" />
            <i class="fa-solid fa-file-lines" style="color:#0284c7; font-size:11px;"></i>
            <span>${escapeHtml(l.title)}</span>
          </label>
        </div>
      `
    })

    lBox.innerHTML = lHtml

    // Bind Lesson Checkboxes
    lBox.querySelectorAll('.chk-tree-lesson').forEach(lChk => {
      lChk.addEventListener('change', (e) => {
        const lId = lChk.getAttribute('data-lesson-id')
        handleLessonCheckbox(lId, chId, clId, e.target.checked)
      })
    })
  }

  // Load and render Chapters under a Class (hỗ trợ cả constant và curriculum)
  async function loadAndRenderChapters(clId, childrenBox) {
    if (!childrenBox) return
    if (!treeDataCache.chapters[clId]) {
      const constCl = (constantTaxonomyState.classes || []).find(c => c.id === clId)
      if (constCl) {
        treeDataCache.chapters[clId] = (constantTaxonomyState.chapters || []).filter(ch => ch.class_id === clId)
        treeDataCache.chapters[clId].forEach(ch => {
          treeDataCache.lessons[ch.id] = (constantTaxonomyState.lessons || []).filter(l => l.chapter_id === ch.id)
        })
      } else {
        childrenBox.innerHTML = '<div style="color:#0284c7; font-size:12px; padding:6px 0;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải chương...</div>'
        try {
          const chs = await api.getChapters(clId, true)
          treeDataCache.chapters[clId] = chs || []
          // Populate preloaded lessons if any
          chs?.forEach(ch => {
            if (Array.isArray(ch.lessons)) {
              treeDataCache.lessons[ch.id] = ch.lessons
            }
          })
        } catch (e) {
          treeDataCache.chapters[clId] = []
        }
      }
    }
    renderChapters(clId, childrenBox)
  }

  function renderChapters(clId, childrenBox) {
    const chapters = treeDataCache.chapters[clId] || []
    if (chapters.length === 0) {
      childrenBox.innerHTML = '<div style="font-size:12px; color:#94a3b8; padding:4px 0;"><i class="fa-solid fa-circle-exclamation"></i> Không có chương nào trong lớp này</div>'
      return
    }

    const isClassChecked = generatorState.selectedClassIds.includes(clId)

    let chHtml = ''
    chapters.forEach(ch => {
      if (isClassChecked && !generatorState.selectedChapterIds.includes(ch.id)) {
        generatorState.selectedChapterIds.push(ch.id)
      }
      const isChChecked = generatorState.selectedChapterIds.includes(ch.id)
      const isChExpanded = treeDataCache.expandedChapters.has(ch.id)

      chHtml += `
        <div class="tree-chapter-node" data-chapter-id="${ch.id}" data-class-id="${clId}" style="margin-bottom:6px; border:1px solid #f1f5f9; border-radius:6px; background:#ffffff; overflow:hidden;">
          <div style="padding:6px 10px; display:flex; align-items:center; gap:8px; background:#f8fafc;">
            <button type="button" class="btn-tree-expand-chapter" data-chapter-id="${ch.id}" title="${isChExpanded ? 'Thu gọn' : 'Mở rộng bài học'}" style="border:1px solid #e2e8f0; background:#ffffff; cursor:pointer; color:#64748b; font-size:10px; width:20px; height:20px; display:flex; align-items:center; justify-content:center; border-radius:4px; transition:all 0.15s ease;">
              <i class="fa-solid ${isChExpanded ? 'fa-chevron-down' : 'fa-chevron-right'} tree-chevron-chapter-${ch.id}"></i>
            </button>
            <label style="display:inline-flex; align-items:center; gap:6px; cursor:pointer; font-weight:600; font-size:12.5px; color:#334155; margin:0; flex:1;">
              <input type="checkbox" class="chk-tree-chapter" data-chapter-id="${ch.id}" data-class-id="${clId}" ${isChChecked ? 'checked' : ''} style="width:15px; height:15px; cursor:pointer; accent-color:#0284c7;" />
              <i class="fa-solid fa-book-bookmark" style="color:#d97706;"></i>
              <span>${escapeHtml(ch.title)}</span>
            </label>
          </div>
          <div class="tree-chapter-children" id="tree-chapter-children-${ch.id}" style="display:${isChExpanded ? 'block' : 'none'}; padding:6px 10px 6px 32px; border-top:1px dashed #f1f5f9; background:#ffffff;">
            <!-- lessons rendered here -->
          </div>
        </div>
      `
    })

    childrenBox.innerHTML = chHtml

    // Restore expanded chapters if any
    chapters.forEach(ch => {
      if (treeDataCache.expandedChapters.has(ch.id)) {
        const lBox = document.getElementById(`tree-chapter-children-${ch.id}`)
        if (lBox) {
          loadAndRenderLessons(ch.id, lBox, clId)
        }
      }
    })

    // Bind Chapter Expand buttons
    childrenBox.querySelectorAll('.btn-tree-expand-chapter').forEach(chBtn => {
      chBtn.addEventListener('click', async () => {
        const chId = chBtn.getAttribute('data-chapter-id')
        const lBox = document.getElementById(`tree-chapter-children-${chId}`)
        const chChevron = chBtn.querySelector(`.tree-chevron-chapter-${chId}`)
        if (!lBox) return

        if (lBox.style.display === 'block') {
          lBox.style.display = 'none'
          treeDataCache.expandedChapters.delete(chId)
          if (chChevron) {
            chChevron.classList.remove('fa-chevron-down')
            chChevron.classList.add('fa-chevron-right')
          }
          chBtn.title = 'Mở rộng bài học'
          return
        }

        lBox.style.display = 'block'
        treeDataCache.expandedChapters.add(chId)
        if (chChevron) {
          chChevron.classList.remove('fa-chevron-right')
          chChevron.classList.add('fa-chevron-down')
        }
        chBtn.title = 'Thu gọn'

        if (!lBox.children.length || lBox.innerHTML.includes('fa-spinner')) {
          await loadAndRenderLessons(chId, lBox, clId)
        }
      })
    })

    // Bind Chapter Checkboxes
    childrenBox.querySelectorAll('.chk-tree-chapter').forEach(chChk => {
      chChk.addEventListener('change', (e) => {
        const chId = chChk.getAttribute('data-chapter-id')
        handleChapterCheckbox(chId, clId, e.target.checked)
      })
    })
  }

  // Render Tree View for a Grade Block (tổng hợp cả constant và curriculum)
  function renderTreeForGradeBlock(block) {
    const treeContainer = document.getElementById('gen-scope-tree-container')
    if (!treeContainer) return

    // MỤC TIÊU A — cây scope chỉ gồm lớp CONSTANT. Trước đây cây trộn cả lớp động
    // (dynClasses từ allClasses) nên giáo viên có thể bốc nhầm câu hỏi động.
    const constClasses = (constantTaxonomyState.classes || []).map(c => ({
      id: c.id,
      name: c.name,
      gradeBlock: c.grade_block || '12-Toán',
      isConstant: true
    }))
    const combinedClasses = constClasses

    const blockClasses = (!block || block === 'ALL')
      ? combinedClasses
      : combinedClasses.filter(c => (c.gradeBlock || c.grade_block || '').trim() === block.trim())

    if (blockClasses.length === 0) {
      treeContainer.innerHTML = `
        <div class="tree-empty-state" style="text-align:center; padding:28px 16px; color:#64748b; font-size:13px;">
          <i class="fa-solid fa-folder-open" style="font-size:32px; color:#cbd5e1; margin-bottom:8px; display:block;"></i>
          <div style="font-weight:600; color:#334155; margin-bottom:4px;">Không tìm thấy lớp học nào${block && block !== 'ALL' ? ` thuộc khối ${escapeHtml(block)}` : ''}</div>
          <div style="font-size:12px; color:#94a3b8;">Vui lòng chọn khối khác hoặc chọn "Tất cả Khối học" ở trên.</div>
        </div>
      `
      return
    }

    let treeHtml = ''
    blockClasses.forEach(c => {
      const isClassChecked = generatorState.selectedClassIds.includes(c.id)
      const isExpanded = treeDataCache.expandedClasses.has(c.id)
      treeHtml += `
        <div class="tree-class-node" data-class-id="${c.id}" style="border:1px solid #e2e8f0; border-radius:8px; margin-bottom:8px; background:#ffffff; overflow:hidden;">
          <div style="padding:8px 12px; display:flex; align-items:center; gap:8px; background:#f8fafc; border-bottom:1px solid ${isExpanded ? '#e2e8f0' : 'transparent'};">
            <button type="button" class="btn-tree-expand-class" data-class-id="${c.id}" aria-expanded="${isExpanded ? 'true' : 'false'}" title="${isExpanded ? 'Thu gọn' : 'Mở rộng chương & bài'}" style="border:1px solid #cbd5e1; background:#ffffff; cursor:pointer; color:#475569; font-size:11px; width:22px; height:22px; display:flex; align-items:center; justify-content:center; border-radius:4px; transition:all 0.15s ease;">
              <i class="fa-solid ${isExpanded ? 'fa-chevron-down' : 'fa-chevron-right'} tree-chevron-class-${c.id}"></i>
            </button>
            <label style="display:inline-flex; align-items:center; gap:8px; cursor:pointer; font-weight:600; font-size:13px; color:#1e293b; margin:0; flex:1;">
              <input type="checkbox" class="chk-tree-class" data-class-id="${c.id}" ${isClassChecked ? 'checked' : ''} style="width:16px; height:16px; cursor:pointer; accent-color:#0284c7;" />
              <i class="fa-solid fa-chalkboard-user" style="color:#0284c7;"></i>
              <span>${escapeHtml(c.name)}</span>
              <span style="font-size:11px; color:#94a3b8; font-weight:normal;">(${escapeHtml(c.gradeBlock || c.grade_block || 'Chưa gán khối')})</span>
            </label>
          </div>
          <div class="tree-class-children" id="tree-class-children-${c.id}" style="display:${isExpanded ? 'block' : 'none'}; padding:8px 12px 8px 34px; border-top:1px dashed #e2e8f0; background:#fbfcfe;">
            <!-- chapters rendered here -->
          </div>
        </div>
      `
    })

    treeContainer.innerHTML = treeHtml

    // Restore expanded classes if any
    blockClasses.forEach(c => {
      if (treeDataCache.expandedClasses.has(c.id)) {
        const childrenBox = document.getElementById(`tree-class-children-${c.id}`)
        if (childrenBox) {
          loadAndRenderChapters(c.id, childrenBox)
        }
      }
    })

    // Bind Class Expand buttons
    treeContainer.querySelectorAll('.btn-tree-expand-class').forEach(btn => {
      btn.addEventListener('click', async () => {
        const clId = btn.getAttribute('data-class-id')
        const childrenBox = document.getElementById(`tree-class-children-${clId}`)
        const chevron = btn.querySelector(`.tree-chevron-class-${clId}`)
        if (!childrenBox) return

        if (childrenBox.style.display === 'block') {
          childrenBox.style.display = 'none'
          treeDataCache.expandedClasses.delete(clId)
          if (chevron) {
            chevron.classList.remove('fa-chevron-down')
            chevron.classList.add('fa-chevron-right')
          }
          btn.title = 'Mở rộng chương & bài'
          btn.setAttribute('aria-expanded', 'false')
          return
        }

        childrenBox.style.display = 'block'
        treeDataCache.expandedClasses.add(clId)
        if (chevron) {
          chevron.classList.remove('fa-chevron-right')
          chevron.classList.add('fa-chevron-down')
        }
        btn.title = 'Thu gọn'
        btn.setAttribute('aria-expanded', 'true')

        if (!childrenBox.children.length || childrenBox.innerHTML.includes('fa-spinner')) {
          await loadAndRenderChapters(clId, childrenBox)
        }
      })
    })

    // Bind Class Checkboxes
    treeContainer.querySelectorAll('.chk-tree-class').forEach(cChk => {
      cChk.addEventListener('change', (e) => {
        const clId = cChk.getAttribute('data-class-id')
        handleClassCheckbox(clId, e.target.checked)
      })
    })
  }

  // Unified Scope Toolbar Actions
  scopeSelectBlockBtn?.addEventListener('click', () => {
    const curBlock = generatorState.gradeBlock
    // MỤC TIÊU A — "Chọn cả khối" chỉ chọn lớp CONSTANT của khối (trước đây dùng
    // allClasses nên nhét cả id lớp động vào selectedClassIds dù cây không hiển thị chúng).
    const constClasses = (constantTaxonomyState.classes || [])
    const blockClasses = (!curBlock || curBlock === 'ALL')
      ? constClasses
      : constClasses.filter(c => (c.grade_block || c.gradeBlock || '').trim() === curBlock.trim())

    blockClasses.forEach(c => {
      if (!generatorState.selectedClassIds.includes(c.id)) {
        generatorState.selectedClassIds.push(c.id)
      }
      const cachedChs = treeDataCache.chapters[c.id] || []
      cachedChs.forEach(ch => {
        if (!generatorState.selectedChapterIds.includes(ch.id)) {
          generatorState.selectedChapterIds.push(ch.id)
        }
        const cachedLs = treeDataCache.lessons[ch.id] || []
        cachedLs.forEach(l => {
          if (!generatorState.selectedLessonIds.includes(l.id)) {
            generatorState.selectedLessonIds.push(l.id)
          }
        })
      })
    })

    document.querySelectorAll('.chk-tree-class, .chk-tree-chapter, .chk-tree-lesson').forEach(chk => {
      chk.checked = true
    })
    updateTreeSelectionBadge()
    checkLiveAvailability()
  })

  scopeClearBtn?.addEventListener('click', () => {
    generatorState.selectedClassIds = []
    generatorState.selectedChapterIds = []
    generatorState.selectedLessonIds = []
    document.querySelectorAll('.chk-tree-class, .chk-tree-chapter, .chk-tree-lesson').forEach(chk => {
      chk.checked = false
    })
    updateTreeSelectionBadge()
    checkLiveAvailability()
  })

  scopeExpandAllBtn?.addEventListener('click', async () => {
    const curBlock = generatorState.gradeBlock
    // MỤC TIÊU A — mở rộng tất cả cũng chỉ duyệt lớp CONSTANT (đồng bộ với cây scope).
    const constClasses = (constantTaxonomyState.classes || [])
    const blockClasses = (!curBlock || curBlock === 'ALL')
      ? constClasses
      : constClasses.filter(c => (c.grade_block || c.gradeBlock || '').trim() === curBlock.trim())

    for (const c of blockClasses) {
      treeDataCache.expandedClasses.add(c.id)
      const childrenBox = document.getElementById(`tree-class-children-${c.id}`)
      const chevron = document.querySelector(`.tree-chevron-class-${c.id}`)
      const expandBtn = document.querySelector(`.btn-tree-expand-class[data-class-id="${c.id}"]`)
      if (childrenBox) {
        childrenBox.style.display = 'block'
        if (chevron) {
          chevron.classList.remove('fa-chevron-right')
          chevron.classList.add('fa-chevron-down')
        }
        if (expandBtn) {
          expandBtn.title = 'Thu gọn'
          expandBtn.setAttribute('aria-expanded', 'true')
        }
        await loadAndRenderChapters(c.id, childrenBox)
        const chapters = treeDataCache.chapters[c.id] || []
        for (const ch of chapters) {
          treeDataCache.expandedChapters.add(ch.id)
          const lBox = document.getElementById(`tree-chapter-children-${ch.id}`)
          const chChevron = document.querySelector(`.tree-chevron-chapter-${ch.id}`)
          const chExpandBtn = document.querySelector(`.btn-tree-expand-chapter[data-chapter-id="${ch.id}"]`)
          if (lBox) {
            lBox.style.display = 'block'
            if (chChevron) {
              chChevron.classList.remove('fa-chevron-right')
              chChevron.classList.add('fa-chevron-down')
            }
            if (chExpandBtn) {
              chExpandBtn.title = 'Thu gọn'
              chExpandBtn.setAttribute('aria-expanded', 'true')
            }
            await loadAndRenderLessons(ch.id, lBox, c.id)
          }
        }
      }
    }
  })

  scopeCollapseAllBtn?.addEventListener('click', () => {
    treeDataCache.expandedClasses.clear()
    treeDataCache.expandedChapters.clear()
    document.querySelectorAll('.tree-class-children').forEach(box => { box.style.display = 'none' })
    document.querySelectorAll('.tree-chapter-children').forEach(box => { box.style.display = 'none' })
    document.querySelectorAll('[class*="tree-chevron-class-"]').forEach(icon => {
      icon.classList.remove('fa-chevron-down')
      icon.classList.add('fa-chevron-right')
    })
    document.querySelectorAll('[class*="tree-chevron-chapter-"]').forEach(icon => {
      icon.classList.remove('fa-chevron-down')
      icon.classList.add('fa-chevron-right')
    })
    document.querySelectorAll('.btn-tree-expand-class').forEach(btn => {
      btn.title = 'Mở rộng chương & bài'
      btn.setAttribute('aria-expanded', 'false')
    })
    document.querySelectorAll('.btn-tree-expand-chapter').forEach(btn => {
      btn.title = 'Mở rộng bài học'
      btn.setAttribute('aria-expanded', 'false')
    })
  })

  // Cascading destination selects & Student assignment
  const destClassSel = document.getElementById('gen-dest-class')
  const destChapterSel = document.getElementById('gen-dest-chapter')
  const destLessonSel = document.getElementById('gen-dest-lesson')

  const genAssignListEl = () => document.getElementById('gen-assign-students-list')
  const updateGenAssignCount = () => {
    const n = document.querySelectorAll('.gen-assign-student-cb:checked').length
    const el = document.getElementById('gen-assign-selected-count')
    if (el) el.textContent = n > 0 ? `Đã chọn ${n} học sinh` : ''
  }

  async function loadGenAssignStudents(classId) {
    const box = genAssignListEl()
    if (!box) return
    if (!classId) {
      box.innerHTML = 'Chọn lớp đích ở trên để tải danh sách học sinh...'
      updateGenAssignCount()
      return
    }
    box.innerHTML = '<span style="color:#0284c7;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải học sinh...</span>'
    try {
      const res = await api.getStudents({ classId }, { silent: true })
      const list = Array.isArray(res) ? res : (res?.items || [])
      if (list.length === 0) {
        box.innerHTML = 'Lớp này chưa có học sinh nào.'
      } else {
        box.innerHTML = list.map(s => `
          <label style="display:flex; align-items:center; gap:8px; padding:5px 6px; border-radius:6px; cursor:pointer; font-size:13px; color:#334155;">
            <input type="checkbox" class="gen-assign-student-cb" value="${s.id}" style="width:15px; height:15px; accent-color:#0066cc; cursor:pointer;">
            <span style="font-weight:600;">${s.fullName || s.username}</span>
            <span style="font-size:11px; color:#94a3b8;">${s.username || ''}</span>
          </label>
        `).join('')
        box.querySelectorAll('.gen-assign-student-cb').forEach(cb => {
          cb.addEventListener('change', updateGenAssignCount)
        })
      }
    } catch (err) {
      box.innerHTML = 'Không tải được danh sách học sinh.'
    }
    updateGenAssignCount()
  }

  document.getElementById('btn-gen-assign-select-all')?.addEventListener('click', () => {
    document.querySelectorAll('.gen-assign-student-cb').forEach(cb => { cb.checked = true })
    updateGenAssignCount()
  })
  document.getElementById('btn-gen-assign-deselect-all')?.addEventListener('click', () => {
    document.querySelectorAll('.gen-assign-student-cb').forEach(cb => { cb.checked = false })
    updateGenAssignCount()
  })

  destClassSel?.addEventListener('change', async (e) => {
    const clId = e.target.value
    if (clId) {
      await Promise.all([
        loadChaptersForClass(clId, destChapterSel),
        loadGenAssignStudents(clId)
      ])
    } else {
      destChapterSel.innerHTML = '<option value="">-- Chọn chương đích --</option>'
      loadGenAssignStudents(null)
    }
    destLessonSel.innerHTML = '<option value="">-- Chọn bài học đích --</option>'
    updateLiveExamTitle()
  })

  destChapterSel?.addEventListener('change', async (e) => {
    const chId = e.target.value
    if (chId) {
      await loadLessonsForChapter(chId, destLessonSel)
    } else {
      destLessonSel.innerHTML = '<option value="">-- Chọn bài học đích --</option>'
    }
    updateLiveExamTitle()
  })

  destLessonSel?.addEventListener('change', () => {
    updateLiveExamTitle()
  })

  function updateLiveExamTitle() {
    const raw = document.getElementById('gen-exam-title')?.value.trim() || ''
    const lessonText = destLessonSel?.options[destLessonSel.selectedIndex]?.text || ''
    let display = raw || 'Đề kiểm tra xem trước'
    if (lessonText && !lessonText.startsWith('--')) {
      if (raw) {
        display = `${lessonText} - ${raw}`
      } else {
        display = `${lessonText} - Đề kiểm tra`
      }
    }
    const titlePreviewEl = document.getElementById('preview-exam-title')
    if (titlePreviewEl) titlePreviewEl.textContent = display
  }

  document.getElementById('gen-exam-title')?.addEventListener('input', updateLiveExamTitle)

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

  // Distribute part values according to standard proportions
  function distributePartValues(part, val) {
    if (val <= 0) {
      setSubValues(part, 0, 0, 0, 0)
      return
    }
    if (part === 'mc') {
      const nb = Math.round(val * 0.4)
      const th = Math.round(val * 0.35)
      const vd = Math.round(val * 0.15)
      const vdc = Math.max(0, val - nb - th - vd)
      setSubValues('mc', nb, th, vd, vdc)
    } else if (part === 'tf') {
      const nb = Math.max(1, Math.round(val * 0.25))
      const th = Math.round(val * 0.5)
      const vd = Math.max(0, val - nb - th)
      setSubValues('tf', nb, th, vd, 0)
    } else if (part === 'sa') {
      const nb = 0
      const th = Math.round(val * 0.35)
      const vd = Math.round(val * 0.5)
      const vdc = Math.max(0, val - th - vd)
      setSubValues('sa', nb, th, vd, vdc)
    }
  }

  // Handle main part input change: if 0 reset sub-inputs, if >0 auto-fill if empty
  function handleMainPartInput(part) {
    const mainEl = document.getElementById(`gen-matrix-${part}`)
    const val = Number(mainEl?.value) || 0
    if (val === 0) {
      setSubValues(part, 0, 0, 0, 0)
    } else {
      const curSum = getSubInputSum(part)
      if (curSum === 0) {
        distributePartValues(part, val)
      }
    }
    updateMatrixSum()
  }

  // Sync sub inputs from totals if opening advanced
  function syncSubInputsFromTotals() {
    ['mc', 'tf', 'sa'].forEach(part => {
      const mainVal = Number(document.getElementById(`gen-matrix-${part}`)?.value) || 0
      const curSum = getSubInputSum(part)
      if (curSum === 0 && mainVal > 0) {
        distributePartValues(part, mainVal)
      }
    })
    updateMatrixSum()
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

  // Handle Sub-input changes (two-way sync updates parent count)
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

  // Bind quick auto-distribute buttons
  document.querySelectorAll('.btn-auto-distribute').forEach(btn => {
    btn.addEventListener('click', () => {
      const part = btn.getAttribute('data-part')
      if (part) {
        const mainEl = document.getElementById(`gen-matrix-${part}`)
        const val = Number(mainEl?.value) || 0
        distributePartValues(part, val)
        updateMatrixSum()
      }
    })
  })

  function updateSubMatchStatuses() {
    ['mc', 'tf', 'sa'].forEach(part => {
      const mainVal = Number(document.getElementById(`gen-matrix-${part}`)?.value) || 0
      const subSum = getSubInputSum(part)
      const statusEl = document.getElementById(`${part}-match-status`)
      if (!statusEl) return
      if (mainVal === 0 && subSum === 0) {
        statusEl.innerHTML = ''
      } else if (mainVal === subSum) {
        statusEl.innerHTML = `<span style="color:#16a34a; font-size:10.5px; font-weight:700;"><i class="fa-solid fa-check"></i> Khớp (${subSum}/${mainVal})</span>`
      } else {
        statusEl.innerHTML = `<span style="color:#dc2626; font-size:10.5px; font-weight:700;"><i class="fa-solid fa-triangle-exclamation"></i> Lệch (${subSum}/${mainVal})</span>`
      }
    })
  }

  const updateMatrixSum = () => {
    const mc = Number(mcInput?.value) || 0
    const tf = Number(tfInput?.value) || 0
    const sa = Number(saInput?.value) || 0
    const total = mc + tf + sa
    const points = (mc * 0.25 + tf * 1.0 + sa * 0.5).toFixed(2).replace(/\.00$/, '.0')
    if (totalCountEl) totalCountEl.textContent = total
    const pointsEl = document.getElementById('gen-matrix-total-points')
    if (pointsEl) pointsEl.textContent = points
    updateSubMatchStatuses()
    updateAvailBadgesAndAlerts(generatorState.availableStats || { mc: 0, tf: 0, sa: 0, total: 0 })
  }

  mcInput?.addEventListener('input', () => handleMainPartInput('mc'))
  tfInput?.addEventListener('input', () => handleMainPartInput('tf'))
  saInput?.addEventListener('input', () => handleMainPartInput('sa'))

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

  // Discard responses for earlier selections so a slow request cannot overwrite
  // the counts shown for the currently selected scope.
  let availabilityRequestId = 0
  // Live availability function (supports both QUICK and MULTI mode)
  async function checkLiveAvailability() {
    const requestId = ++availabilityRequestId
    try {
      const hasSelection = (generatorState.selectedClassIds && generatorState.selectedClassIds.length > 0) ||
        (generatorState.selectedChapterIds && generatorState.selectedChapterIds.length > 0) ||
        (generatorState.selectedLessonIds && generatorState.selectedLessonIds.length > 0)

      if (!hasSelection) {
        generatorState.availableStats = { mc: 0, tf: 0, sa: 0, total: 0, byTypeAndDifficulty: {} }
        updateAvailBadgesAndAlerts(generatorState.availableStats)
        const totalEl = document.getElementById('avail-total')
        if (totalEl) totalEl.textContent = 'Tổng có: 0 câu (Chưa chọn mục trong cây phân cấp)'
        return
      }

      let params = 'scopeType=MULTI&constantOnly=true&'
      if (generatorState.gradeBlock && generatorState.gradeBlock !== 'ALL') {
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

      const res = await api.checkQuestionBankAvailability(params)
      if (requestId === availabilityRequestId && document.getElementById('matrix-gen-backdrop') && res) {
        generatorState.availableStats = res
        updateAvailBadgesAndAlerts(res)
      }
    } catch (e) {
      if (requestId === availabilityRequestId && document.getElementById('matrix-gen-backdrop')) {
        generatorState.availableStats = { mc: 0, tf: 0, sa: 0, total: 0, byTypeAndDifficulty: {} }
        updateAvailBadgesAndAlerts(generatorState.availableStats)
        const totalEl = document.getElementById('avail-total')
        if (totalEl) totalEl.textContent = 'Không tải được số câu khả dụng — vui lòng thử chọn lại phạm vi'
        console.warn('[QuestionBank] Availability check failed:', e)
      }
    }
  }

  // Trigger initial tree render & availability check
  renderTreeForGradeBlock(generatorState.gradeBlock)
  updateTreeSelectionBadge()
  checkLiveAvailability()

  // Cụm cấu hình bài tập dùng chung form tạo bài tập
  bindHomeworkConfigFields('mx')
  bindHomeworkTypeCoupling('gen-exam-type', 'mx-attempts', 'mx-violations')

  // Step 1 -> Step 2: Roll & Preview
  const btnRollPreview = document.getElementById('btn-roll-preview')
  const btnFinalize = document.getElementById('btn-finalize-create-hw')
  const step1 = document.getElementById('matrix-gen-step1')
  const step2 = document.getElementById('matrix-gen-step2')

  btnRollPreview?.addEventListener('click', async () => {
    const hasAnySelection = (generatorState.selectedClassIds && generatorState.selectedClassIds.length > 0) ||
      (generatorState.selectedChapterIds && generatorState.selectedChapterIds.length > 0) ||
      (generatorState.selectedLessonIds && generatorState.selectedLessonIds.length > 0)
    if (!hasAnySelection) {
      return showToast('Vui lòng chọn ít nhất một Lớp học, Chương học hoặc Bài học trong cây phân cấp!', 'warning')
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

    // Construct structured scope object with MULTI scopeType
    // MỤC TIÊU A — scope này luôn constantOnly: backend chỉ bốc câu hỏi gắn danh mục
    // constant, kể cả khi distribution/swap kế thừa currentScope này.
    const scopePayload = {
      scopeType: 'MULTI',
      constantOnly: true,
      gradeBlock: generatorState.gradeBlock && generatorState.gradeBlock !== 'ALL' ? generatorState.gradeBlock : null,
      classIds: [...new Set(generatorState.selectedClassIds || [])],
      chapterIds: [...new Set(generatorState.selectedChapterIds || [])],
      lessonIds: [...new Set(generatorState.selectedLessonIds || [])]
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
        titleInput.value = `Đề kiểm tra (${generatorState.previewQuestions.length} câu)`
      }
      updateLiveExamTitle()

      const activeDuration = document.getElementById('mx-duration')?.value || 90
      document.getElementById('preview-meta-desc').textContent = `${generatorState.previewQuestions.length} câu hỏi • ${activeDuration} phút`

      // Auto-preselect destination class if available from Step 1 selections
      if (destClassSel && !destClassSel.value) {
        let firstClassId = (generatorState.selectedClassIds && generatorState.selectedClassIds[0]) || null
        if (!firstClassId) {
          const checkedEl = document.querySelector('.chk-tree-chapter:checked, .chk-tree-lesson:checked')
          firstClassId = checkedEl?.getAttribute('data-class-id') || null
        }
        if (firstClassId) {
          destClassSel.value = firstClassId
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
              <select class="preview-q-diff-select" data-index="${idx}" data-id="${q.id}" title="Đổi mức độ nhận thức cho câu hỏi này" style="font-size:11px; font-weight:700; padding:2px 6px; border-radius:6px; background:${diffBadgeInfo.bg}; color:${diffBadgeInfo.color}; border:1px solid ${diffBadgeInfo.border}; cursor:pointer; outline:none; transition:all 0.2s;">
                <option value="NHAN_BIET" ${q.difficulty === 'NHAN_BIET' ? 'selected' : ''}>Nhận biết</option>
                <option value="THONG_HIEU" ${q.difficulty === 'THONG_HIEU' ? 'selected' : ''}>Thông hiểu</option>
                <option value="VAN_DUNG" ${q.difficulty === 'VAN_DUNG' ? 'selected' : ''}>Vận dụng</option>
                <option value="VAN_DUNG_CAO" ${q.difficulty === 'VAN_DUNG_CAO' ? 'selected' : ''}>Vận dụng cao</option>
              </select>
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

    // Bind Difficulty Change directly on preview cards
    container.querySelectorAll('.preview-q-diff-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const qIdx = parseInt(sel.getAttribute('data-index'), 10)
        const qId = sel.getAttribute('data-id')
        const newDiff = sel.value
        if (generatorState.previewQuestions[qIdx]) {
          generatorState.previewQuestions[qIdx].difficulty = newDiff
          if (generatorState.previewQuestions[qIdx].prompt && typeof generatorState.previewQuestions[qIdx].prompt === 'object') {
            generatorState.previewQuestions[qIdx].prompt.difficulty = newDiff
          }
        }
        const newStyle = diffMap[newDiff] || diffMap['THONG_HIEU']
        sel.style.background = newStyle.bg
        sel.style.color = newStyle.color
        sel.style.borderColor = newStyle.border
        try {
          await api.updateQuestionInBank({ id: qId, difficulty: newDiff })
          showToast(`Đã chuyển Câu ${qIdx + 1} sang mức độ "${newStyle.text}"!`, 'info')
        } catch (err) {
          console.warn('[updateQuestionInBank error]', err)
        }
      })
    })

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
  // Finalize Create Exam
  btnFinalize?.addEventListener('click', async () => {
    const rawTitle = document.getElementById('gen-exam-title')?.value?.trim()
    if (!rawTitle) {
      return showToast('Vui lòng nhập tên bài tập!', 'warning')
    }

    const destLessonId = destLessonSel?.value
    if (!destLessonId) {
      return showToast('Vui lòng chọn Bài học đích để lưu trữ bài tập!', 'warning')
    }

    const destLessonTitle = destLessonSel?.options[destLessonSel.selectedIndex]?.text || ''
    let title = rawTitle
    if (destLessonTitle && !destLessonTitle.startsWith('--')) {
      const prefix = `${destLessonTitle} - `
      if (!rawTitle.startsWith(prefix) && !rawTitle.startsWith(destLessonTitle)) {
        title = `${prefix}${rawTitle}`
      }
    }

    const assignedStudentIds = Array.from(document.querySelectorAll('.gen-assign-student-cb:checked')).map(cb => cb.value)

    const type = document.getElementById('gen-exam-type')?.value || 'PRACTICE'
    const cfg = collectHomeworkConfig('mx')
    const showSolutions = cfg.showSolutions

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
        durationMinutes: cfg.durationMinutes,
        maxAttempts: type === 'EXAM' ? 1 : cfg.maxAttempts,
        maxViolations: cfg.maxViolations,
        deadline: cfg.deadline,
        passScore: 5.0,
        maxScore: 10.0,
        showSolutions,
        questionBankIds,
        variantCodes,
        assignedStudentIds
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
