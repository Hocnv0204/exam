// fe/src/js/views/achievements.js - Màn hình Thành tích & Bảng vinh danh học sinh (Mochi)

if (typeof document !== 'undefined' && document.head) {
  import('../../css/mochi/achievements.css')
}

import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'
import { renderMascot } from '../components/mascot.js'
import { state } from '../state.js'
import { api } from '../api.js'
import { MOCHI_FEATURES, isMochiUI } from '../ui-flag.js'
import {
  escapeHtml,
  fetchStudentAchievements,
  fetchClassLeaderboard,
  updateNavbarStreak
} from '../components/progress-widgets.js'

function formatNumber(num) {
  return Number(num || 0).toLocaleString('vi-VN')
}

function formatDateVi(dateStr) {
  if (!dateStr) return 'Chưa có'
  try {
    const [y, m, d] = String(dateStr).split('-')
    if (y && m && d) return `${d}/${m}/${y}`
    return dateStr
  } catch (_) {
    return dateStr
  }
}

export function normalizeClasses(raw) {
  const list = Array.isArray(raw?.data) ? raw.data : (Array.isArray(raw) ? raw : [])
  return list.map(item => ({
    id: String(item.id || item.class_id || ''),
    name: item.name || item.class_name || 'Lớp học'
  })).filter(item => item.id)
}

function getStudentClasses(classesList = null) {
  const rawList = classesList !== null ? classesList : state.classes
  const allClasses = normalizeClasses(rawList)
  if (state.user?.role === 'STUDENT' && Array.isArray(state.user?.classIds)) {
    return allClasses.filter(c => state.user.classIds.includes(c.id))
  }
  return allClasses
}

export function renderLeaderboardContent({ leaderboard, classInfo, period = 'week' } = {}) {
  const entries = Array.isArray(leaderboard?.entries) ? leaderboard.entries : []
  const me = leaderboard?.me || null
  const totalStudents = leaderboard?.totalStudents || entries.length
  const fromDate = leaderboard?.fromDate ? formatDateVi(leaderboard.fromDate) : ''
  const toDate = leaderboard?.toDate ? formatDateVi(leaderboard.toDate) : ''
  const hasMeInTop10 = entries.some(e => e.isMe)

  const medals = ['🥇', '🥈', '🥉']

  if (!classInfo && !leaderboard) {
    return `
      <div class="m-card" style="margin-top:14px; text-align:center; padding:32px;">
        <p class="m-empty-copy">Bạn chưa tham gia lớp học nào.</p>
      </div>
    `
  }

  return `
    <div class="m-leaderboard-meta">
      ${fromDate && toDate ? `<span><i class="fa-solid fa-calendar-week" aria-hidden="true"></i> Kỳ xếp hạng: ${escapeHtml(fromDate)} – ${escapeHtml(toDate)}</span>` : ''}
      <span><i class="fa-solid fa-users" aria-hidden="true"></i> ${escapeHtml(totalStudents)} thành viên</span>
    </div>

    ${entries.length === 0 ? `
      <div style="padding:28px; text-align:center;">
        <p class="m-empty-copy">Chưa có dữ liệu xếp hạng trong kỳ này.</p>
      </div>
    ` : `
      <div class="m-leaderboard-list" role="list">
        ${entries.map((entry, idx) => {
          const rank = Number(entry.rank || idx + 1)
          const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : ''
          const medalIcon = rank <= 3 ? medals[rank - 1] : rank
          return `
            <div class="m-leaderboard-row ${entry.isMe ? 'is-me' : ''}" role="listitem">
              <span class="m-leaderboard-rank ${rankClass}">${medalIcon}</span>
              <span class="m-leaderboard-avatar" aria-hidden="true">${escapeHtml(entry.initials || 'HS')}</span>
              <div class="m-leaderboard-name">
                <span>${escapeHtml(entry.displayName)}</span>
                ${entry.isMe ? '<span class="m-leaderboard-me-badge">Bạn</span>' : ''}
              </div>
              <span class="m-leaderboard-xp">${escapeHtml(entry.xp)} XP</span>
            </div>
          `
        }).join('')}
      </div>

      ${!hasMeInTop10 && me && me.rank ? `
        <div class="m-leaderboard-my-rank" aria-label="Xếp hạng của bạn">
          <span><i class="fa-solid fa-user" aria-hidden="true"></i> Vị trí của bạn: <strong>Hạng ${escapeHtml(me.rank)}</strong></span>
          <span><strong>${escapeHtml(me.xp)} XP</strong></span>
        </div>
      ` : ''}

      <p class="m-leaderboard-privacy-note">
        <i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Tên bạn cùng lớp được rút gọn để bảo vệ quyền riêng tư.
      </p>
    `}
  `
}

export function renderAchievementsContent({
  achievements,
  leaderboard,
  selectedClassId,
  period = 'week',
  classes = []
} = {}) {
  const xp = achievements?.xp || {}
  const streak = achievements?.streak || {}
  const badges = Array.isArray(achievements?.badges) ? achievements.badges : []
  const rules = Array.isArray(achievements?.rules) ? achievements.rules : []
  const studentClasses = classes.length ? classes : getStudentClasses()
  const activeClass = studentClasses.find(c => c.id === selectedClassId) || studentClasses[0] || null

  const level = Number(xp.level || 1)
  const totalXp = Number(xp.total || 0)
  const levelXp = Number(xp.levelXp || 0)
  const nextLevelXp = Number(xp.nextLevelXp || 200)
  const levelPct = Math.min(100, Math.max(0, Math.round((levelXp / (nextLevelXp || 200)) * 100)))
  const thisWeekXp = Number(xp.thisWeek || 0)

  const currentStreak = Number(streak.current || 0)
  const bestStreak = Number(streak.best || 0)
  const activeToday = Boolean(streak.activeToday)
  const lastActiveDate = streak.lastActiveDate

  const earnedBadgesCount = badges.filter(b => b.earned).length

  return `
    <!-- 1. Stats Grid: XP Card & Streak Card -->
    <div class="m-achievements-stats-grid">
      ${MOCHI_FEATURES.xp ? `
        <div class="m-stat-card" aria-label="Chi tiết điểm kinh nghiệm">
          <div class="m-stat-card-header">
            <h2 class="m-stat-card-title">
              <i class="fa-solid fa-bolt" style="color:var(--m-accent);" aria-hidden="true"></i> Cấp độ &amp; XP
            </h2>
            <span class="m-chip m-chip--accent2">+${escapeHtml(thisWeekXp)} XP tuần này</span>
          </div>
          <div>
            <div class="m-stat-hero-number">Cấp ${escapeHtml(level)}</div>
            <div class="m-stat-progress-bar-wrap" style="margin-top:10px;">
              <div class="m-stat-progress-label">
                <span>Tiến trình cấp</span>
                <span><strong>${escapeHtml(levelXp)}</strong> / ${escapeHtml(nextLevelXp)} XP</span>
              </div>
              <div class="m-progress" role="progressbar" aria-valuenow="${levelXp}" aria-valuemin="0" aria-valuemax="${nextLevelXp}" aria-label="Tiến độ lên Cấp ${level + 1}">
                <span style="width: ${levelPct}%;"></span>
              </div>
            </div>
          </div>
          <div class="m-stat-card-footer">
            <span>Tổng tích luỹ: <strong>${escapeHtml(formatNumber(totalXp))} XP</strong></span>
            <span>Còn ${escapeHtml(nextLevelXp - levelXp)} XP lên cấp</span>
          </div>
        </div>
      ` : ''}

      ${MOCHI_FEATURES.streak ? `
        <div class="m-stat-card" aria-label="Chi tiết chuỗi ngày học">
          <div class="m-stat-card-header">
            <h2 class="m-stat-card-title">
              <i class="fa-solid fa-fire" style="color:var(--m-warn);" aria-hidden="true"></i> Chuỗi ngày học
            </h2>
            ${activeToday
              ? `<span class="m-chip m-chip--ok"><i class="fa-solid fa-check" aria-hidden="true"></i> Đã học hôm nay</span>`
              : `<span class="m-chip m-chip--warn">Chưa học hôm nay</span>`
            }
          </div>
          <div>
            <div class="m-stat-hero-number">${escapeHtml(currentStreak)} ngày</div>
            <p style="margin:4px 0 0; font-size:14px; font-weight:700; color:var(--m-muted);">
              ${activeToday ? 'Ngọn lửa học tập đang bùng cháy rực rỡ!' : 'Làm một bài tập hoặc điểm danh để giữ lửa chuỗi nhé!'}
            </p>
          </div>
          <div class="m-stat-card-footer">
            <span>Kỷ lục dài nhất: <strong>${escapeHtml(bestStreak)} ngày</strong></span>
            <span>Gần nhất: <strong>${escapeHtml(formatDateVi(lastActiveDate))}</strong></span>
          </div>
        </div>
      ` : ''}
    </div>

    <!-- 2. Badges Section -->
    ${MOCHI_FEATURES.badges ? `
      <section class="m-card" aria-labelledby="m-badges-heading">
        <div class="m-section-heading">
          <h2 id="m-badges-heading">Huy hiệu học tập</h2>
          <span class="m-chip m-chip--accent2">${escapeHtml(earnedBadgesCount)} / ${escapeHtml(badges.length)} đã đạt</span>
        </div>
        <p class="m-section-description">Mỗi nỗ lực và kiên trì của bạn đều được ghi nhận bằng những huy hiệu đặc biệt.</p>
        
        <div class="m-badges-grid" role="list">
          ${badges.map(badge => {
            const isEarned = Boolean(badge.earned)
            const progress = Number(badge.progress || 0)
            const target = Number(badge.target || 1)
            const pct = Math.min(100, Math.max(0, Math.round((progress / target) * 100)))

            return `
              <div class="m-badge-card ${isEarned ? 'is-earned' : 'is-locked'}" role="listitem">
                <div class="m-badge-top">
                  <div class="m-badge-icon">
                    <i class="fa-solid ${escapeHtml(badge.icon || 'fa-award')}" aria-hidden="true"></i>
                  </div>
                  ${isEarned
                    ? `<span class="m-chip m-chip--ok"><i class="fa-solid fa-check" aria-hidden="true"></i> Đã đạt</span>`
                    : `<span class="m-chip">Chưa đạt</span>`
                  }
                </div>
                <div class="m-badge-content">
                  <h3 class="m-badge-title">${escapeHtml(badge.title)}</h3>
                  <p class="m-badge-desc">${escapeHtml(badge.description)}</p>
                </div>
                ${!isEarned ? `
                  <div class="m-badge-progress-wrap">
                    <div class="m-badge-progress-label">
                      <span>Tiến độ</span>
                      <span>${escapeHtml(progress)} / ${escapeHtml(target)}</span>
                    </div>
                    <div class="m-progress" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="${target}" aria-label="Tiến độ huy hiệu ${escapeHtml(badge.title)}">
                      <span style="width: ${pct}%;"></span>
                    </div>
                  </div>
                ` : ''}
              </div>
            `
          }).join('')}
        </div>
      </section>
    ` : ''}

    <!-- 3. XP Rules Section -->
    ${rules.length > 0 ? `
      <section class="m-card" aria-labelledby="m-rules-heading">
        <div class="m-section-heading">
          <h2 id="m-rules-heading">Cách nhận điểm XP</h2>
        </div>
        <p class="m-section-description">Học đều đặn mỗi ngày và hoàn thành bài tập để thăng cấp nhanh hơn.</p>
        <div class="m-rules-grid">
          ${rules.map(rule => `
            <div class="m-rule-item">
              <span class="m-rule-label">${escapeHtml(rule.label)}</span>
              <span class="m-rule-xp">${escapeHtml(rule.xp)} XP</span>
            </div>
          `).join('')}
        </div>
      </section>
    ` : ''}

    <!-- 4. Class Leaderboard Section -->
    ${MOCHI_FEATURES.leaderboard ? `
      <section class="m-card" id="achievements-leaderboard-section" aria-labelledby="m-leaderboard-heading">
        <div class="m-section-heading">
          <h2 id="m-leaderboard-heading">Bảng xếp hạng lớp</h2>
        </div>
        <div class="m-leaderboard-controls">
          ${studentClasses.length > 1 ? `
            <div class="m-leaderboard-select-wrap">
              <label for="achievements-class-select" style="font-weight:700; font-size:14px;">Lớp học:</label>
              <select id="achievements-class-select" class="m-leaderboard-select" aria-label="Chọn lớp xem bảng xếp hạng">
                ${studentClasses.map(c => `
                  <option value="${escapeHtml(c.id)}" ${c.id === (activeClass?.id) ? 'selected' : ''}>
                    ${escapeHtml(c.name)}
                  </option>
                `).join('')}
              </select>
            </div>
          ` : activeClass?.name ? `
            <span class="m-chip m-chip--accent2" style="font-size:15px; padding:6px 14px;">
              <i class="fa-solid fa-graduation-cap" aria-hidden="true" style="margin-right:6px;"></i> ${escapeHtml(activeClass.name)}
            </span>
          ` : ''}

          <div class="m-tabs" role="tablist" aria-label="Thời gian xếp hạng">
            <button type="button" class="m-tab ${period === 'week' ? 'is-active' : ''}" data-period="week" role="tab" aria-selected="${period === 'week'}">
              Tuần này
            </button>
            <button type="button" class="m-tab ${period === 'month' ? 'is-active' : ''}" data-period="month" role="tab" aria-selected="${period === 'month'}">
              Tháng này
            </button>
          </div>
        </div>

        <div id="achievements-leaderboard-container" aria-live="polite">
          ${renderLeaderboardContent({ leaderboard, classInfo: activeClass, period })}
        </div>
      </section>
    ` : ''}
  `
}

export function renderAchievementsSkeleton() {
  return `
    <div class="m-achieve-skeleton" style="margin-top:20px;">
      <div class="m-achieve-skeleton-box" style="min-height:160px;"></div>
      <div class="m-achieve-skeleton-box" style="min-height:160px;"></div>
    </div>
    <div class="m-achieve-skeleton-box" style="min-height:220px; margin-top:20px;"></div>
  `
}

export function renderAchievementsView({ achievementsData = null, leaderboardData = null } = {}) {
  const classes = getStudentClasses()
  const firstClass = classes[0] || null

  const isPreloaded = Boolean(achievementsData)

  return `
    <div class="app-layout navy-student m-student-page m-achievements-page">
      ${renderSidebar('achievements')}
      <div class="main-content">
        ${renderNavbar('Thành tích')}
        <main class="content-body">
          <div class="m-page-wrap">
            <section class="m-achievements-hero" aria-labelledby="m-achievements-hero-title">
              <div class="m-achievements-hero-copy">
                <span class="m-chip m-chip--accent2"><i class="fa-solid fa-trophy" aria-hidden="true"></i> Bảng thành tích</span>
                <h1 id="m-achievements-hero-title">Thành tích &amp; Bảng vinh danh</h1>
                <p id="m-achievements-hero-subtitle">
                  ${achievementsData?.xp?.level
                    ? `Cấp ${escapeHtml(achievementsData.xp.level)} · ${formatNumber(achievementsData.xp.total)} XP tổng cộng`
                    : 'Khám phá cấp độ, chuỗi ngày học và huy hiệu của bạn.'
                  }
                </p>
              </div>
              <div class="m-achievements-hero-mascot">
                ${renderMascot({ mood: 'cheer', size: 140 })}
              </div>
            </section>

            <div id="achievements-content" aria-live="polite">
              ${isPreloaded
                ? renderAchievementsContent({
                    achievements: achievementsData,
                    leaderboard: leaderboardData,
                    selectedClassId: firstClass?.id,
                    period: 'week',
                    classes
                  })
                : renderAchievementsSkeleton()
              }
            </div>
          </div>
        </main>
      </div>
    </div>
  `
}

let activeAbortController = null
let activeRequestId = 0
let currentSelectedClassId = null
let currentPeriod = 'week'
let cachedAchievements = null

export async function bindAchievementsEvents() {
  bindSidebarEvents()

  const contentContainer = document.getElementById('achievements-content')
  if (!contentContainer) return

  activeAbortController?.abort()
  const lifecycleController = new AbortController()
  activeAbortController = lifecycleController
  const reqId = ++activeRequestId

  const onHashChange = () => {
    if (typeof window !== 'undefined' && window.location && window.location.hash.split('?')[0] !== '#achievements') {
      lifecycleController.abort()
    }
  }
  window.addEventListener?.('hashchange', onHashChange, { once: true })

  // Khởi tạo và nạp dữ liệu ban đầu
  await loadAllAchievementsData({ force: false, signal: lifecycleController.signal, reqId })
}

async function loadAllAchievementsData({ force = false, signal = null, reqId = null } = {}) {
  const contentContainer = document.getElementById('achievements-content')
  if (!contentContainer) return

  let currentSignal = signal
  let currentReqId = reqId

  if (!currentSignal) {
    activeAbortController?.abort()
    activeAbortController = new AbortController()
    currentSignal = activeAbortController.signal
    currentReqId = ++activeRequestId
  }

  const isActive = () => (
    !currentSignal.aborted &&
    currentReqId === activeRequestId &&
    document.getElementById('achievements-content') === contentContainer &&
    (typeof window === 'undefined' || !window.location || window.location.hash.split('?')[0] === '#achievements')
  )

  try {
    // 1. Kiểm tra state.classes, nếu rỗng thì nạp api.getClasses
    let classes = normalizeClasses(state.classes || [])
    if (!classes.length) {
      contentContainer.innerHTML = renderAchievementsSkeleton()
      try {
        const raw = await api.getClasses('', { signal: currentSignal })
        if (!isActive()) return
        classes = normalizeClasses(raw)
        state.classes = classes
      } catch (classErr) {
        if (!isActive() || classErr?.name === 'AbortError') return
        console.warn('[AchievementsView] Failed to load classes:', classErr)
        contentContainer.innerHTML = `
          <div class="m-card" style="text-align:center; padding:32px;">
            <h2>Không tải được danh sách lớp</h2>
            <p class="m-empty-copy" style="color:var(--m-warn); margin:8px 0;">
              ${escapeHtml(classErr?.message || 'Vui lòng thử lại.')}
            </p>
            <button type="button" class="m-btn m-btn--primary" id="btn-retry-achievements" style="margin-top:16px;">
              Thử lại
            </button>
          </div>
        `
        document.getElementById('btn-retry-achievements')?.addEventListener('click', () => {
          contentContainer.innerHTML = renderAchievementsSkeleton()
          loadAllAchievementsData({ force: true })
        })
        return
      }
    }

    if (!isActive()) return

    const studentClasses = getStudentClasses()
    if (!currentSelectedClassId || !studentClasses.some(c => c.id === currentSelectedClassId)) {
      currentSelectedClassId = studentClasses[0]?.id || null
    }
    const targetClassId = currentSelectedClassId

    const [achievements, leaderboard] = await Promise.all([
      fetchStudentAchievements({ force, signal: currentSignal }),
      targetClassId
        ? fetchClassLeaderboard({ classId: targetClassId, period: currentPeriod, force, signal: currentSignal }).catch(() => null)
        : Promise.resolve(null)
    ])

    if (!isActive()) return
    cachedAchievements = achievements

    // Update hero subtitle with level info if available
    const subtitle = document.getElementById('m-achievements-hero-subtitle')
    if (subtitle && achievements?.xp?.level) {
      subtitle.textContent = `Cấp ${achievements.xp.level} · ${formatNumber(achievements.xp.total)} XP tổng cộng`
    }

    contentContainer.innerHTML = renderAchievementsContent({
      achievements,
      leaderboard,
      selectedClassId: targetClassId,
      period: currentPeriod,
      classes: studentClasses
    })

    bindInteractiveControls()
    updateNavbarStreak(achievements)
  } catch (err) {
    if (!isActive() || err?.name === 'AbortError') return
    console.warn('[AchievementsView] Failed to load data:', err)
    contentContainer.innerHTML = `
      <div class="m-card" style="text-align:center; padding:32px;">
        <p class="m-empty-copy" style="color:var(--m-warn);">
          <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Không thể nạp dữ liệu thành tích.
        </p>
        <button type="button" class="m-btn m-btn--primary" id="btn-retry-achievements" style="margin-top:16px;">
          Thử lại
        </button>
      </div>
    `
    document.getElementById('btn-retry-achievements')?.addEventListener('click', () => {
      contentContainer.innerHTML = renderAchievementsSkeleton()
      loadAllAchievementsData({ force: true })
    })
  }
}

function bindInteractiveControls() {
  // Class selection change
  const classSelect = document.getElementById('achievements-class-select')
  classSelect?.addEventListener('change', async (e) => {
    currentSelectedClassId = e.target.value
    await reloadLeaderboardOnly()
  })

  // Period tab change
  const tabButtons = document.querySelectorAll?.('#achievements-leaderboard-section .m-tab')
  tabButtons?.forEach(btn => {
    btn.addEventListener('click', async () => {
      const period = btn.dataset.period
      if (period === currentPeriod) return
      currentPeriod = period
      tabButtons.forEach(b => {
        b.classList.remove('is-active')
        b.setAttribute('aria-selected', 'false')
      })
      btn.classList.add('is-active')
      btn.setAttribute('aria-selected', 'true')
      await reloadLeaderboardOnly()
    })
  })
}

async function reloadLeaderboardOnly() {
  const container = document.getElementById('achievements-leaderboard-container')
  if (!container) return

  container.innerHTML = `
    <div style="padding:28px; text-align:center;">
      <p class="m-loading"><i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Đang tải bảng xếp hạng...</p>
    </div>
  `

  if (activeAbortController) {
    activeAbortController.abort()
  }
  activeAbortController = new AbortController()
  const signal = activeAbortController.signal
  const reqId = ++activeRequestId

  try {
    const classes = getStudentClasses()
    const activeClass = classes.find(c => c.id === currentSelectedClassId) || classes[0] || null

    const leaderboard = activeClass?.id
      ? await fetchClassLeaderboard({ classId: activeClass.id, period: currentPeriod, signal })
      : null

    if (reqId !== activeRequestId || signal.aborted) return

    container.innerHTML = renderLeaderboardContent({
      leaderboard,
      classInfo: activeClass,
      period: currentPeriod
    })
  } catch (err) {
    if (reqId !== activeRequestId || signal.aborted || err?.name === 'AbortError') return
    console.warn('[AchievementsView] Failed to reload leaderboard:', err)
    container.innerHTML = `
      <div style="padding:28px; text-align:center;">
        <p class="m-empty-copy" style="color:var(--m-warn);">
          <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Không thể tải bảng xếp hạng.
        </p>
        <button type="button" class="m-btn m-btn--compact m-btn--secondary" id="btn-retry-leaderboard" style="margin-top:10px;">
          Thử lại
        </button>
      </div>
    `
    document.getElementById('btn-retry-leaderboard')?.addEventListener('click', () => {
      reloadLeaderboardOnly()
    })
  }
}
