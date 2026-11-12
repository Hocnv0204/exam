// ==========================================================================
// Trang LỘ TRÌNH HỌC giao diện Mochi (dùng chung cho 4 môn).
// Gốc: <div class="m-roadmap" data-roadmap-theme="..." data-roadmap-id="...">
// ==========================================================================
import { escapeHtml } from '../../utils/download-helper.js'
import { roadmapStats } from '../../utils/roadmap-schema.js'
import { loadMochiStyles } from '../../ui-flag.js'
import { renderMascot } from '../../components/mascot.js'
import { getStudentTheme } from '../../theme.js'
import { renderMochiPublicTopbar, bindMochiPublicTopbar } from '../../components/mochi-public-topbar.js'

if (typeof document !== 'undefined' && document.head) {
  import('../../../css/mochi/roadmap.css')
}


export function normalizeSearchText(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
}

function fmt(n) {
  if (n == null) return ''
  return String(n).replace('.', ',')
}

function renderScoreCurveSVG(points, stages) {
  if (!Array.isArray(points) || points.length < 2) return ''
  const W = 540
  const H = 280
  const m = { l: 36, r: 24, t: 26, b: 54 }
  const iw = W - m.l - m.r
  const ih = H - m.t - m.b
  const maxW = Math.max(...points.map(p => Number(p?.week) || 0)) || 12

  const x = w => m.l + (iw * w) / maxW
  const y = s => m.t + ih * (1 - Math.max(0, Math.min(10, Number(s) || 0)) / 10)

  let stageRects = ''
  if (Array.isArray(stages) && stages.length > 0) {
    stages.forEach((st, idx) => {
      if (Array.isArray(st.weeks) && st.weeks.length === 2) {
        const x0 = x(Math.max(0, st.weeks[0] - 1))
        const x1 = x(st.weeks[1])
        const rw = Math.max(0, x1 - x0)
        const isAlt = idx % 2 === 1
        stageRects += `<rect x="${x0}" y="${m.t}" width="${rw}" height="${ih}" fill="var(--m-surface2)" opacity="${isAlt ? '0.65' : '0.25'}" />`
      }
    })
  }

  const y10 = y(10)
  const y8 = y(8)
  const targetZone = `
    <rect x="${m.l}" y="${y10}" width="${iw}" height="${Math.max(0, y8 - y10)}" fill="var(--m-accent2-soft)" opacity="0.6" />
    <line x1="${m.l}" x2="${W - m.r}" y1="${y8}" y2="${y8}" stroke="var(--m-accent2)" stroke-width="2" stroke-dasharray="6 4" />
    <text x="${m.l + 8}" y="${y(8.8)}" fill="var(--m-accent2)" font-weight="800" font-size="11">Vùng mục tiêu 8+</text>
  `

  let gridLines = ''
  for (let g = 0; g <= 10; g += 2) {
    const yg = y(g)
    gridLines += `
      <line x1="${m.l}" x2="${W - m.r}" y1="${yg}" y2="${yg}" stroke="var(--m-line)" stroke-width="1" />
      <text x="${m.l - 8}" y="${yg + 4}" text-anchor="end" font-size="11" font-weight="700" fill="var(--m-muted)">${g}</text>
    `
  }

  const pts = points.map(p => [x(p.week), y(p.score)])
  let d = 'M' + pts[0][0] + ',' + pts[0][1]
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    d += ' C' + (p1[0] + (p2[0] - p0[0]) / 6) + ',' + (p1[1] + (p2[1] - p0[1]) / 6) + ' ' +
      (p2[0] - (p3[0] - p1[0]) / 6) + ',' + (p2[1] - (p3[1] - p1[1]) / 6) + ' ' + p2[0] + ',' + p2[1]
  }

  let dotsAndLabels = ''
  points.forEach((p, i) => {
    const cx = pts[i][0]
    const cy = pts[i][1]
    const isFirst = i === 0
    const isLast = i === points.length - 1
    const anchor = isFirst ? 'start' : (isLast ? 'end' : 'middle')
    const tx = isFirst ? cx - 4 : (isLast ? cx + 4 : cx)
    const scoreText = p.score >= 8 ? '8+' : '≈ ' + fmt(p.score)

    dotsAndLabels += `
      <circle cx="${cx}" cy="${cy}" r="${isLast ? 8 : 6}" fill="var(--m-surface)" stroke="var(--m-accent)" stroke-width="3" />
      <circle cx="${cx}" cy="${cy}" r="${isLast ? 4 : 3}" fill="${isLast ? 'var(--m-accent2)' : 'var(--m-accent)'}" />
      <text x="${tx}" y="${cy - 12}" text-anchor="${anchor}" font-size="12" font-weight="800" fill="${isLast ? 'var(--m-accent2)' : 'var(--m-ink)'}">${scoreText}</text>
      <text x="${tx}" y="${H - 24}" text-anchor="${anchor}" font-size="11" font-weight="600" fill="var(--m-muted)">Tuần ${p.week}</text>
      <text x="${tx}" y="${H - 10}" text-anchor="${anchor}" font-size="11" font-weight="700" fill="var(--m-ink)">${escapeHtml(p.label)}</text>
    `
  })

  return `
    <svg class="m-rm-curve-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Biểu đồ đường cong điểm mục tiêu từ ${fmt(points[0].score)} lên ${fmt(points[points.length - 1].score)}">
      ${stageRects}
      ${targetZone}
      ${gridLines}
      <path d="${d}" fill="none" stroke="var(--m-accent)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
      ${dotsAndLabels}
    </svg>
  `
}

export function renderMochiRoadmap(subject) {
  const currentTheme = getStudentTheme()
  const data = subject?.data || {}
  const meta = data.meta || {}
  const stats = roadmapStats(data)

  const regularChapters = (data.chapters || []).filter(c => c.id !== 'c0' && c.code !== 'Tổng ôn' && c.group !== 'Tổng ôn')
  const chCount = regularChapters.length || stats.chapters

  // 1. Top bar (dùng chung với trang học thử)
  const topbar = renderMochiPublicTopbar({ active: subject.route })

  // 2. Hero Section
  const hasEntrance = Boolean(meta.entranceHomeworkId)
  const heroCta = hasEntrance ? `
    <button type="button" class="m-rm-btn m-rm-btn-primary" id="m-rm-entrance" data-m-rm-entrance>
      <i class="fa-solid fa-play" aria-hidden="true"></i> Làm bài kiểm tra đầu vào (Miễn phí)
    </button>
    <button type="button" class="m-rm-btn m-rm-btn-outline" data-m-rm-scroll="m-rm-timeline">
      <i class="fa-solid fa-timeline" aria-hidden="true"></i> Xem lộ trình ${escapeHtml(meta.durationWeeks)} tuần
    </button>
  ` : `
    <a href="#trial?tab=lessons" class="m-rm-btn m-rm-btn-primary">
      <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Luyện bài học thử
    </a>
    <button type="button" class="m-rm-btn m-rm-btn-accent" id="m-rm-register" data-m-rm-register>
      <i class="fa-solid fa-user-plus" aria-hidden="true"></i> Đăng ký học
    </button>
    <button type="button" class="m-rm-btn m-rm-btn-outline" data-m-rm-scroll="m-rm-timeline">
      <i class="fa-solid fa-timeline" aria-hidden="true"></i> Xem lộ trình ${escapeHtml(meta.durationWeeks)} tuần
    </button>
  `

  const heroCard = data.scoreCurve ? `
    <div class="m-rm-hero-card">
      <div class="m-rm-hero-card-head">
        <div class="m-rm-hero-card-mascot">${renderMascot({ mood: 'cheer', size: 68 })}</div>
        <div>
          <h2 class="m-rm-hero-card-title">Đường cong tiến bộ mục tiêu</h2>
          <p class="m-rm-hero-card-subtitle">Mục tiêu tăng từ điểm xuất phát lên ${escapeHtml(meta.targetScore || '8+')}</p>
        </div>
      </div>
      ${renderScoreCurveSVG(data.scoreCurve, data.stages)}
      ${Array.isArray(data.stages) && data.stages.length > 0 ? `
        <div class="m-rm-curve-stages-legend" aria-label="Chú thích các chặng">
          ${data.stages.map((st, idx) => `
            <div class="m-rm-curve-stage-item">
              <span class="m-rm-curve-stage-badge">Chặng ${idx + 1}${st.weeks ? ` (T${st.weeks[0]}–${st.weeks[1]})` : ''}</span>
              <span class="m-rm-curve-stage-name">${escapeHtml(st.name || '')}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
      <p class="m-rm-hero-card-footer">
        <strong>Tiến độ tham chiếu:</strong> Đạt kết quả tối ưu khi học khoảng ${escapeHtml(meta.hoursPerWeek || '8–10')} giờ/tuần và hoàn thành bài tập.
      </p>
    </div>
  ` : `
    <div class="m-rm-hero-card">
      <div class="m-rm-hero-card-head">
        <div class="m-rm-hero-card-mascot">${renderMascot({ mood: 'cheer', size: 68 })}</div>
        <div>
          <h2 class="m-rm-hero-card-title">Phân phối chương trình học</h2>
          <p class="m-rm-hero-card-subtitle">${escapeHtml(meta.durationWeeks)} tuần chuẩn khung SGK ${escapeHtml(meta.textbook || '')}</p>
        </div>
      </div>
      <div class="m-rm-stages-summary">
        ${(data.stages || []).map(st => `
          <div class="m-rm-stage-sum-item">
            <div class="m-rm-stage-sum-header">
              <span class="m-rm-stage-sum-name">${escapeHtml(st.name)}</span>
              ${st.weeks ? `<span class="m-rm-stage-sum-weeks">Tuần ${st.weeks[0]} – ${st.weeks[1]}</span>` : ''}
            </div>
            ${st.desc ? `<p class="m-rm-stage-sum-desc">${escapeHtml(st.desc)}</p>` : ''}
            ${st.goal ? `<span class="m-rm-stage-sum-goal"><i class="fa-solid fa-bullseye" aria-hidden="true"></i> Mục tiêu: ${escapeHtml(st.goal)}</span>` : ''}
          </div>
        `).join('')}
      </div>
      <p class="m-rm-hero-card-footer">
        Được chia nhỏ thành ${stats.lessons} bài học trọng tâm và ${stats.forms} dạng bài tập.
      </p>
    </div>
  `

  const hero = `
    <section class="m-rm-hero" aria-labelledby="m-rm-title">
      <div class="m-rm-hero-grid">
        <div class="m-rm-hero-content">
          <div class="m-rm-badge">
            <i class="fa-solid fa-graduation-cap" aria-hidden="true"></i>
            <span>${escapeHtml(meta.badge)}</span>
          </div>
          <h1 class="m-rm-title" id="m-rm-title">${escapeHtml(meta.title)}</h1>
          <p class="m-rm-subtitle">${escapeHtml(meta.subtitle)}</p>

          <div class="m-rm-cta-group">
            ${heroCta}
          </div>

          <div class="m-rm-stats-grid">
            <div class="m-rm-stat-card">
              <span class="m-rm-stat-num">${escapeHtml(meta.durationWeeks)}</span>
              <span class="m-rm-stat-lbl">tuần học</span>
            </div>
            <div class="m-rm-stat-card">
              <span class="m-rm-stat-num">${chCount}</span>
              <span class="m-rm-stat-lbl">chương trọng tâm</span>
            </div>
            <div class="m-rm-stat-card">
              <span class="m-rm-stat-num">${stats.lessons}</span>
              <span class="m-rm-stat-lbl">bài học</span>
            </div>
            <div class="m-rm-stat-card">
              <span class="m-rm-stat-num">${stats.forms}+</span>
              <span class="m-rm-stat-lbl">dạng bài thi</span>
            </div>
          </div>
        </div>

        <div class="m-rm-hero-aside">
          ${heroCard}
        </div>
      </div>
    </section>
  `

  // 3. Exam Structure (if data.exam exists)
  let examSec = ''
  if (data.exam) {
    const ex = data.exam
    const totalTarget = (ex.target || []).reduce((s, t) => s + (Number(t.points) || 0), 0)

    const partsCards = (ex.parts || []).map(p => {
      const t = (ex.target || []).find(x => x.id === p.id)
      return `
        <article class="m-rm-part-card">
          <span class="m-rm-part-badge">Phần ${escapeHtml(p.id)}</span>
          <h3 class="m-rm-part-name">${escapeHtml(p.name)}</h3>
          <p class="m-rm-part-detail">${escapeHtml(p.detail)}</p>
          <div class="m-rm-part-points">Tối đa: <strong>${fmt(p.points)} điểm</strong></div>
          ${t ? `
            <div class="m-rm-part-target">
              <i class="fa-solid fa-bullseye" aria-hidden="true"></i>
              <span>Mục tiêu 8+: <strong>${fmt(t.points)} điểm</strong> (${escapeHtml(t.note)})</span>
            </div>
          ` : ''}
        </article>
      `
    }).join('')

    const targetBar = ex.target ? `
      <div class="m-rm-target-bar-wrap">
        <div class="m-rm-target-bar-head">
          <span>Phân bổ điểm mục tiêu để đạt ${fmt(totalTarget)} điểm:</span>
          <span>Không cần làm đúng tuyệt đối mọi câu</span>
        </div>
        <div class="m-rm-target-bar" role="img" aria-label="Mục tiêu ${fmt(totalTarget)} điểm chia làm 3 phần">
          ${ex.target.map(t => `
            <div class="m-rm-target-seg m-rm-target-${escapeHtml(t.id)}" style="--w:${(Number(t.points) / 10) * 100}%">
              Phần ${escapeHtml(t.id)}: ${fmt(t.points)} đ
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''

    examSec = `
      <section class="m-rm-section m-rm-exam-sec" id="m-rm-exam" aria-labelledby="m-rm-exam-title">
        <div class="m-rm-sec-header">
          <span class="m-rm-sec-badge"><i class="fa-solid fa-file-signature" aria-hidden="true"></i> Cấu trúc đề</span>
          <h2 class="m-rm-sec-title" id="m-rm-exam-title">Cấu trúc đề thi tốt nghiệp THPT</h2>
          <p class="m-rm-sec-desc">${escapeHtml(ex.questions)} câu hỏi · ${escapeHtml(ex.durationMin)} phút làm bài · Điểm tối đa 10,0 điểm.</p>
        </div>

        <div class="m-rm-exam-parts">
          ${partsCards}
        </div>

        ${targetBar}

        <div class="m-rm-exam-note">
          <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
          <span>Nhãn I/II/III ở mỗi dạng bài cho biết dạng đó hay xuất hiện ở phần nào của đề.</span>
        </div>
      </section>
    `
  }

  // 4. Timeline Section
  const timelineStages = (data.stages || []).map(st => {
    const stageWeeks = (data.weeks || []).filter(w => {
      if (w.stage === st.id) return true
      if (Array.isArray(st.weeks) && st.weeks.length === 2) {
        return w.n >= st.weeks[0] && w.n <= st.weeks[1]
      }
      return false
    })

    const weeksHtml = stageWeeks.map(w => {
      return `
        <button type="button" class="m-rm-week-btn" data-m-rm-week="${w.n}" aria-label="Xem bài học tuần ${w.n}: ${escapeHtml(w.theme)}">
          <span class="m-rm-week-circle" aria-hidden="true">${w.n}</span>
          <span class="m-rm-week-info">
            <span class="m-rm-week-theme">${escapeHtml(w.theme)}</span>
            ${w.desc ? `<span class="m-rm-week-desc">${escapeHtml(w.desc)}</span>` : ''}
            ${w.milestone ? `
              <span class="m-rm-week-milestone">
                <i class="fa-solid fa-flag-checkered" aria-hidden="true"></i>
                ${escapeHtml(w.milestone)}
              </span>
            ` : ''}
          </span>
          <i class="fa-solid fa-chevron-right m-rm-week-arrow" aria-hidden="true"></i>
        </button>
      `
    }).join('')

    return `
      <div class="m-rm-stage-block">
        <div class="m-rm-stage-header">
          <div class="m-rm-stage-title-wrap">
            <h3 class="m-rm-stage-title">${escapeHtml(st.name)}</h3>
            ${st.desc ? `<p class="m-rm-stage-desc">${escapeHtml(st.desc)}</p>` : ''}
          </div>
          <div class="m-rm-stage-badges">
            ${st.weeks ? `<span class="m-rm-stage-weeks-tag"><i class="fa-regular fa-calendar" aria-hidden="true"></i> Tuần ${st.weeks[0]} – ${st.weeks[1]}</span>` : ''}
            ${st.goal ? `<span class="m-rm-stage-goal-tag"><i class="fa-solid fa-bullseye" aria-hidden="true"></i> ${escapeHtml(st.goal)}</span>` : ''}
          </div>
        </div>
        <div class="m-rm-weeks-grid">
          ${weeksHtml}
        </div>
      </div>
    `
  }).join('')

  const timelineSec = `
    <section class="m-rm-section m-rm-timeline-sec" id="m-rm-timeline" aria-labelledby="m-rm-timeline-title">
      <div class="m-rm-sec-header">
        <span class="m-rm-sec-badge"><i class="fa-solid fa-route" aria-hidden="true"></i> Bản đồ lộ trình</span>
        <h2 class="m-rm-sec-title" id="m-rm-timeline-title">Lộ trình theo từng tuần</h2>
        <p class="m-rm-sec-desc">Bấm vào một tuần bất kỳ để mở và cuộn nhanh đến danh sách bài học và dạng bài của tuần đó.</p>
      </div>

      <div class="m-rm-stages-list">
        ${timelineStages}
      </div>
    </section>
  `

  // 5. Chapters & Lessons Section
  const tierLabels = meta.tiers || { nen: 'Nền tảng', nang: 'Nâng cao', top: 'Chinh phục 8+' }

  const chaptersHtml = (data.chapters || []).map(c => {
    const lessonsCount = (c.lessons || []).length
    const formsCount = (c.lessons || []).reduce((n, l) => n + (l.forms || []).length, 0)
    const showGroup = Boolean(c.group && c.group.trim() && c.group.trim().toLowerCase() !== String(c.code || '').trim().toLowerCase())

    const lessonsList = (c.lessons || []).map(l => {
      const tag = l.no != null ? `Bài ${l.no}` : (l.tag || 'Bài học')
      const searchableLessonText = normalizeSearchText(`${tag} ${l.title}`)

      const keyPointsHtml = (l.keyPoints || []).map(kp => `<li>${escapeHtml(kp)}</li>`).join('')

      const formsHtml = (l.forms || []).map(f => {
        const searchableFormText = normalizeSearchText(`${f.name} ${f.tip || ''}`)
        return `
          <li class="m-rm-form-item" data-tier="${escapeHtml(f.tier)}" data-text="${escapeHtml(searchableFormText)}">
            <div class="m-rm-form-head">
              <span class="m-rm-tier-chip m-rm-tier-${escapeHtml(f.tier)}">${escapeHtml(tierLabels[f.tier] || f.tier)}</span>
              <span class="m-rm-form-name">${escapeHtml(f.name)}</span>
              <span class="m-rm-parts">
                ${(f.parts || []).map(p => `<span class="m-rm-part-badge-sm" title="Phần ${escapeHtml(p)}">${escapeHtml(p)}</span>`).join('')}
              </span>
            </div>
            ${f.tip ? `<p class="m-rm-form-tip"><i class="fa-regular fa-lightbulb" aria-hidden="true"></i> ${escapeHtml(f.tip)}</p>` : ''}
          </li>
        `
      }).join('')

      return `
        <div class="m-rm-lesson" data-lesson-id="${escapeHtml(l.id)}" data-week="${l.week}" data-text="${escapeHtml(searchableLessonText)}" id="m-rm-lesson-${escapeHtml(l.id)}">
          <label class="m-rm-done-wrap" title="Đánh dấu đã học: ${escapeHtml(l.title)}">
            <input type="checkbox" class="m-rm-done-cb" data-m-rm-done="${escapeHtml(l.id)}">
            <span class="m-rm-cb-custom" aria-hidden="true"><i class="fa-solid fa-check" aria-hidden="true"></i></span>
            <span class="sr-only">Đánh dấu đã học: ${escapeHtml(l.title)}</span>
          </label>

          <details class="m-rm-details" id="m-rm-details-${escapeHtml(l.id)}">
            <summary class="m-rm-summary">
              <span class="m-rm-ls-tag">${escapeHtml(tag)}</span>
              <span class="m-rm-ls-info">
                <span class="m-rm-ls-title">${escapeHtml(l.title)}</span>
                <span class="m-rm-ls-meta">Tuần ${l.week} · ${l.hours} giờ · ${(l.forms || []).length} dạng bài</span>
              </span>
              <span class="m-rm-chevron" aria-hidden="true"><i class="fa-solid fa-chevron-down"></i></span>
            </summary>
            <div class="m-rm-ls-content">
              ${(l.keyPoints || []).length > 0 ? `
                <div class="m-rm-kp-box">
                  <h4 class="m-rm-box-heading"><i class="fa-solid fa-bookmark" aria-hidden="true"></i> Kiến thức trọng tâm</h4>
                  <ul class="m-rm-kp-list">
                    ${keyPointsHtml}
                  </ul>
                </div>
              ` : ''}

              <div class="m-rm-forms-box">
                <h4 class="m-rm-box-heading"><i class="fa-solid fa-layer-group" aria-hidden="true"></i> Các dạng bài thi</h4>
                <ul class="m-rm-forms-list">
                  ${formsHtml}
                </ul>
              </div>
            </div>
          </details>
        </div>
      `
    }).join('')

    return `
      <article class="m-rm-chapter-card" data-chapter-id="${escapeHtml(c.id)}">
        <header class="m-rm-ch-header">
          <div class="m-rm-ch-icon-wrap" aria-hidden="true">
            <span>${escapeHtml(c.icon || c.code.slice(0, 4))}</span>
          </div>
          <div class="m-rm-ch-main">
            <div class="m-rm-ch-code-line">
              <span class="m-rm-ch-code">${escapeHtml(c.code)}</span>
              ${showGroup ? `<span class="m-rm-ch-group">· ${escapeHtml(c.group.trim())}</span>` : ''}
            </div>
            <h3 class="m-rm-ch-title">${escapeHtml(c.title)}</h3>
            ${c.summary ? `<p class="m-rm-ch-summary">${escapeHtml(c.summary)}</p>` : ''}
          </div>
          <div class="m-rm-ch-meta">
            <span class="m-rm-ch-badge">${lessonsCount} bài · ${formsCount} dạng</span>
            ${c.priority ? `
              <div class="m-rm-ch-prio" title="Mức độ trọng tâm: ${c.priority}/3 sao" aria-label="Mức độ trọng tâm: ${c.priority} trên 3 sao">
                <span>Trọng tâm</span>
                <span class="m-rm-prio-stars">${[1, 2, 3].map(i => `<i class="fa-solid fa-star${i <= c.priority ? ' is-on' : ' is-off'}" aria-hidden="true"></i>`).join('')}</span>
              </div>
            ` : ''}
          </div>
        </header>
        <div class="m-rm-ch-lessons">
          ${lessonsList}
        </div>
      </article>
    `
  }).join('')

  const chaptersSec = `
    <section class="m-rm-section m-rm-chapters-sec" id="m-rm-chapters" aria-labelledby="m-rm-chapters-title">
      <div class="m-rm-sec-header">
        <span class="m-rm-sec-badge"><i class="fa-solid fa-book-open" aria-hidden="true"></i> Chi tiết bài học</span>
        <h2 class="m-rm-sec-title" id="m-rm-chapters-title">Chương &amp; dạng bài trọng tâm</h2>
        <p class="m-rm-sec-desc">Đánh dấu ô bên trái khi bạn học xong một bài để lưu lại tiến độ học tập trên thiết bị này.</p>
      </div>

      <div class="m-rm-toolbar" id="m-rm-toolbar">
        <div class="m-rm-toolbar-inner">
          <div class="m-rm-progress-bar-row">
            <div class="m-rm-progress-label">
              <i class="fa-solid fa-chart-line" aria-hidden="true"></i>
              <span id="m-rm-progress-txt">Đã hoàn thành <strong id="m-rm-p-done">0</strong>/<span id="m-rm-p-total">${stats.lessons}</span> bài</span>
            </div>
            <div class="m-rm-meter" role="progressbar" aria-valuemin="0" aria-valuemax="${stats.lessons}" aria-valuenow="0" id="m-rm-meter">
              <div class="m-rm-meter-fill" style="--w:0%"></div>
            </div>
            <button type="button" class="m-rm-btn-text m-rm-reset-btn" id="m-rm-btn-reset">Xóa tiến độ</button>
          </div>

          <div class="m-rm-filter-row">
            <div class="m-rm-search-box">
              <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
              <label for="m-rm-search" class="sr-only">Tìm kiếm dạng bài</label>
              <input type="search" id="m-rm-search" class="m-rm-search-input" placeholder="Tìm dạng bài, ví dụ: este, amine, tích phân..." autocomplete="off">
              <button type="button" id="m-rm-search-clear" class="m-rm-search-clear" aria-label="Xóa tìm kiếm" hidden><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
            </div>

            <div class="m-rm-tier-group" role="group" aria-label="Lọc theo mức độ">
              <button type="button" class="m-rm-tier-btn" data-m-rm-tier="all" aria-pressed="true">
                Tất cả <em>${stats.forms}</em>
              </button>
              <button type="button" class="m-rm-tier-btn" data-m-rm-tier="nen" aria-pressed="false">
                ${escapeHtml(tierLabels.nen)} <em>${stats.tiers.nen}</em>
              </button>
              <button type="button" class="m-rm-tier-btn" data-m-rm-tier="nang" aria-pressed="false">
                ${escapeHtml(tierLabels.nang)} <em>${stats.tiers.nang}</em>
              </button>
              <button type="button" class="m-rm-tier-btn" data-m-rm-tier="top" aria-pressed="false">
                ${escapeHtml(tierLabels.top)} <em>${stats.tiers.top}</em>
              </button>
            </div>

            <div class="m-rm-expand-group">
              <button type="button" class="m-rm-btn-text" data-m-rm-expand-all="1">Mở tất cả</button>
              <span class="m-rm-sep" aria-hidden="true">·</span>
              <button type="button" class="m-rm-btn-text" data-m-rm-expand-all="0">Thu gọn</button>
            </div>
          </div>

          <div class="m-rm-live-count" id="m-rm-live-count" aria-live="polite"></div>
        </div>
      </div>

      <div class="m-rm-chapter-list" id="m-rm-chapter-list">
        ${chaptersHtml}
      </div>

      <div class="m-rm-empty" id="m-rm-empty" hidden>
        <div class="m-rm-empty-mascot">${renderMascot({ mood: 'wink', size: 96 })}</div>
        <p class="m-rm-empty-title">Không tìm thấy dạng bài phù hợp</p>
        <p class="m-rm-empty-desc">Thử tìm kiếm với từ khóa ngắn hơn hoặc bấm nút bên dưới để khôi phục danh sách.</p>
        <button type="button" class="m-rm-btn m-rm-btn-secondary" id="m-rm-clear-filter">
          <i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Đặt lại bộ lọc
        </button>
      </div>
    </section>
  `

  // 6. Footer Section
  const footCta = hasEntrance ? `
    <button type="button" class="m-rm-btn m-rm-btn-primary" data-m-rm-entrance>
      <i class="fa-solid fa-play" aria-hidden="true"></i> Làm bài kiểm tra đầu vào (Miễn phí)
    </button>
    <button type="button" class="m-rm-btn m-rm-btn-outline" data-m-rm-scroll="m-rm-timeline">
      <i class="fa-solid fa-timeline" aria-hidden="true"></i> Xem lại lộ trình
    </button>
  ` : `
    <a href="#trial?tab=lessons" class="m-rm-btn m-rm-btn-primary">
      <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Luyện bài học thử
    </a>
    <button type="button" class="m-rm-btn m-rm-btn-accent" data-m-rm-register>
      <i class="fa-solid fa-user-plus" aria-hidden="true"></i> Đăng ký học chính thức
    </button>
    <button type="button" class="m-rm-btn m-rm-btn-outline" data-m-rm-scroll="m-rm-timeline">
      <i class="fa-solid fa-timeline" aria-hidden="true"></i> Xem lại lộ trình
    </button>
  `

  const footer = `
    <footer class="m-rm-footer">
      <div class="m-rm-footer-inner">
        <div class="m-rm-footer-cta">
          <h2 class="m-rm-foot-title">Bắt đầu hành trình bứt phá mục tiêu ngay hôm nay!</h2>
          <p class="m-rm-foot-subtitle">Học thử bài giảng chất lượng cao hoặc kiểm tra đầu vào miễn phí để định hướng học tập chính xác.</p>
          <div class="m-rm-cta-group">
            ${footCta}
          </div>
        </div>

        ${Array.isArray(meta.sources) && meta.sources.length > 0 ? `
          <div class="m-rm-sources">
            <h3 class="m-rm-sources-title"><i class="fa-solid fa-book-bookmark" aria-hidden="true"></i> Nguồn tham khảo</h3>
            <ul class="m-rm-sources-list">
              ${meta.sources.map(s => `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> ${escapeHtml(s.label)}</a></li>`).join('')}
            </ul>
          </div>
        ` : ''}

        ${meta.disclaimer ? `<p class="m-rm-disclaimer">${escapeHtml(meta.disclaimer)}</p>` : ''}
        ${meta.updated ? `<p class="m-rm-updated"><i class="fa-regular fa-clock" aria-hidden="true"></i> Lộ trình được cập nhật ngày ${escapeHtml(meta.updated)}</p>` : ''}
      </div>
    </footer>
  `

  return `
    <div class="m-roadmap" data-roadmap-theme="${currentTheme}" data-roadmap-id="${escapeHtml(subject.id)}">
      ${topbar}
      <main class="m-rm-main" id="m-rm-main">
        ${hero}
        ${examSec}
        ${timelineSec}
        ${chaptersSec}
      </main>
      ${footer}
    </div>
  `
}

export function bindMochiRoadmapEvents(root, subject) {
  if (!root || !subject) return
  loadMochiStyles()

  const data = subject.data || {}
  const meta = data.meta || {}
  const stats = roadmapStats(data)
  const totalLessons = stats.lessons || 1
  const storageKey = `m-roadmap:done:v1:${subject.id}`
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  bindMochiPublicTopbar(root)

  // Action Handlers
  function startEntranceTest() {
    const hwId = meta.entranceHomeworkId
    if (!hwId) return
    if (typeof window.confirmStartTrialHomework === 'function') {
      window.confirmStartTrialHomework(hwId)
    } else {
      window.location.hash = `#homework-attempt?homeworkId=${encodeURIComponent(hwId)}&trial=true`
    }
  }

  function openRegisterModal() {
    if (typeof window.showTrialRegistrationModal === 'function') {
      window.showTrialRegistrationModal()
    }
  }

  root.querySelectorAll('[data-m-rm-entrance]').forEach(btn => btn.addEventListener('click', startEntranceTest))
  root.querySelectorAll('[data-m-rm-register]').forEach(btn => btn.addEventListener('click', openRegisterModal))

  // Scroll smooth handler
  root.querySelectorAll('[data-m-rm-scroll]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.mRmScroll
      const targetEl = root.querySelector('#' + targetId)
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
      }
    })
  })

  // Progress tracking via localStorage
  let doneSet = new Set()
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) doneSet = new Set(parsed)
    }
  } catch (_) {
    doneSet = new Set()
  }

  function saveProgress() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(doneSet)))
    } catch (_) {}
  }

  function updateProgressUI() {
    const count = doneSet.size
    const doneTxt = root.querySelector('#m-rm-p-done')
    if (doneTxt) doneTxt.textContent = String(count)

    const meter = root.querySelector('#m-rm-meter')
    if (meter) {
      meter.setAttribute('aria-valuenow', String(count))
      const fill = meter.querySelector('.m-rm-meter-fill')
      if (fill) {
        const pct = Math.min(100, Math.round((count / totalLessons) * 100))
        fill.style.setProperty('--w', `${pct}%`)
      }
    }

    root.querySelectorAll('.m-rm-lesson').forEach(ls => {
      const id = ls.dataset.lessonId
      const isDone = doneSet.has(id)
      ls.classList.toggle('is-done', isDone)
      const cb = ls.querySelector('input[data-m-rm-done]')
      if (cb) cb.checked = isDone
    })
  }

  root.addEventListener('change', e => {
    const cb = e.target.closest?.('input[data-m-rm-done]')
    if (!cb) return
    const id = cb.dataset.mRmDone
    if (cb.checked) {
      doneSet.add(id)
    } else {
      doneSet.delete(id)
    }
    saveProgress()
    updateProgressUI()
  })

  const resetBtn = root.querySelector('#m-rm-btn-reset')
  resetBtn?.addEventListener('click', () => {
    if (doneSet.size === 0 || window.confirm('Xóa toàn bộ tiến độ đã đánh dấu?')) {
      doneSet.clear()
      saveProgress()
      updateProgressUI()
    }
  })

  // Filter & Search
  let currentTier = 'all'
  const searchInput = root.querySelector('#m-rm-search')
  const clearSearchBtn = root.querySelector('#m-rm-search-clear')
  const liveCount = root.querySelector('#m-rm-live-count')
  const emptyState = root.querySelector('#m-rm-empty')

  function applyFilter() {
    const term = normalizeSearchText(searchInput?.value || '')
    const tier = currentTier
    let shownForms = 0
    let anyChapterVisible = false

    root.querySelectorAll('[data-chapter-id]').forEach(ch => {
      let chVisible = false
      ch.querySelectorAll('.m-rm-lesson').forEach(ls => {
        const lsText = ls.dataset.text || ''
        const titleHit = term && lsText.includes(term)
        let lsVisible = false

        ls.querySelectorAll('.m-rm-form-item').forEach(f => {
          const fTier = f.dataset.tier
          const fText = f.dataset.text || ''
          const tierOk = tier === 'all' || fTier === tier
          const textOk = !term || titleHit || fText.includes(term)
          const isVisible = tierOk && textOk

          f.hidden = !isVisible
          if (isVisible) {
            lsVisible = true
            shownForms++
          }
        })

        ls.hidden = !lsVisible
        if (lsVisible) {
          chVisible = true
          if (term || tier !== 'all') {
            const d = ls.querySelector('details')
            if (d) d.open = true
          }
        }
      })

      ch.hidden = !chVisible
      if (chVisible) anyChapterVisible = true
    })

    if (emptyState) emptyState.hidden = anyChapterVisible
    if (clearSearchBtn) clearSearchBtn.hidden = !term

    if (liveCount) {
      if (term || tier !== 'all') {
        liveCount.textContent = `Tìm thấy ${shownForms} dạng bài phù hợp`
      } else {
        liveCount.textContent = ''
      }
    }
  }

  // Tier buttons
  root.querySelectorAll('[data-m-rm-tier]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTier = btn.dataset.mRmTier
      root.querySelectorAll('[data-m-rm-tier]').forEach(b => {
        b.setAttribute('aria-pressed', String(b.dataset.mRmTier === currentTier))
      })
      applyFilter()
    })
  })

  // Search input
  if (searchInput) {
    searchInput.addEventListener('input', applyFilter)
  }

  clearSearchBtn?.addEventListener('click', () => {
    if (searchInput) {
      searchInput.value = ''
      searchInput.focus()
    }
    applyFilter()
  })

  const resetAllFiltersBtn = root.querySelector('#m-rm-clear-filter')
  resetAllFiltersBtn?.addEventListener('click', () => {
    if (searchInput) searchInput.value = ''
    currentTier = 'all'
    root.querySelectorAll('[data-m-rm-tier]').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.mRmTier === 'all'))
    })
    applyFilter()
  })

  // Expand / collapse all
  root.querySelectorAll('[data-m-rm-expand-all]').forEach(btn => {
    btn.addEventListener('click', () => {
      const open = btn.dataset.mRmExpandAll === '1'
      root.querySelectorAll('.m-rm-lesson:not([hidden]) details').forEach(d => {
        d.open = open
      })
    })
  })

  // Timeline week click -> scroll & open & highlight lesson
  root.querySelectorAll('[data-m-rm-week]').forEach(wBtn => {
    wBtn.addEventListener('click', () => {
      const wNum = wBtn.dataset.mRmWeek
      const matchedLessons = root.querySelectorAll(`.m-rm-lesson[data-week="${wNum}"]`)
      if (matchedLessons.length > 0) {
        if (searchInput && searchInput.value) {
          searchInput.value = ''
        }
        if (currentTier !== 'all') {
          currentTier = 'all'
          root.querySelectorAll('[data-m-rm-tier]').forEach(b => {
            b.setAttribute('aria-pressed', String(b.dataset.mRmTier === 'all'))
          })
        }
        applyFilter()

        matchedLessons.forEach(ls => {
          const d = ls.querySelector('details')
          if (d) d.open = true
          ls.classList.add('is-highlighted')
          setTimeout(() => ls.classList.remove('is-highlighted'), 2200)
        })

        matchedLessons[0].scrollIntoView({
          behavior: reduceMotion ? 'auto' : 'smooth',
          block: 'center'
        })
      } else {
        const chSec = root.querySelector('#m-rm-chapters')
        if (chSec) {
          chSec.scrollIntoView({
            behavior: reduceMotion ? 'auto' : 'smooth',
            block: 'start'
          })
        }
      }
    })
  })

  // Initialize
  updateProgressUI()
  applyFilter()
}
