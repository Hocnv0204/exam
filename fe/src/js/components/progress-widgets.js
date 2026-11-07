// fe/src/js/components/progress-widgets.js
// Module dùng chung: nạp dữ liệu thành tích có cache ngắn (60s), cập nhật navbar streak và render widget trang chủ.

import { api } from '../api.js'
import { state } from '../state.js'
import { MOCHI_FEATURES } from '../ui-flag.js'

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
}

const ACHIEVEMENTS_CACHE_TTL_MS = 60 * 1000
let achievementsCache = {
  userId: null,
  timestamp: 0,
  data: null
}
let inFlightAchievementsPromise = null

const LEADERBOARD_CACHE_TTL_MS = 60 * 1000
const leaderboardCache = new Map() // key: `${classId}:${period}`, value: { data, timestamp, userId }
let inFlightLeaderboardPromises = new Map() // key -> Promise

export function clearAchievementsCache() {
  achievementsCache = {
    userId: null,
    timestamp: 0,
    data: null
  }
  inFlightAchievementsPromise = null
  leaderboardCache.clear()
  inFlightLeaderboardPromises.clear()
}

export async function fetchStudentAchievements({ force = false, signal } = {}) {
  const currentUserId = state.user?.id || 'anonymous'
  const now = Date.now()

  if (
    !force &&
    achievementsCache.data &&
    achievementsCache.userId === currentUserId &&
    (now - achievementsCache.timestamp < ACHIEVEMENTS_CACHE_TTL_MS)
  ) {
    return achievementsCache.data
  }

  if (inFlightAchievementsPromise) {
    return inFlightAchievementsPromise
  }

  inFlightAchievementsPromise = (async () => {
    try {
      const res = await api.getStudentAchievements({ signal })
      const data = res?.data || res
      achievementsCache = {
        userId: currentUserId,
        timestamp: Date.now(),
        data
      }
      updateNavbarStreak(data)
      return data
    } finally {
      inFlightAchievementsPromise = null
    }
  })()

  return inFlightAchievementsPromise
}

export async function fetchClassLeaderboard({ classId, period = 'week', force = false, signal } = {}) {
  if (!classId) return null
  const currentUserId = state.user?.id || 'anonymous'
  const key = `${classId}:${period}`
  const now = Date.now()
  const cached = leaderboardCache.get(key)

  if (
    !force &&
    cached &&
    cached.userId === currentUserId &&
    (now - cached.timestamp < LEADERBOARD_CACHE_TTL_MS)
  ) {
    return cached.data
  }

  if (inFlightLeaderboardPromises.has(key)) {
    return inFlightLeaderboardPromises.get(key)
  }

  const promise = (async () => {
    try {
      const res = await api.getClassLeaderboard({ classId, period }, { signal })
      const data = res?.data || res
      leaderboardCache.set(key, {
        userId: currentUserId,
        timestamp: Date.now(),
        data
      })
      return data
    } finally {
      inFlightLeaderboardPromises.delete(key)
    }
  })()

  inFlightLeaderboardPromises.set(key, promise)
  return promise
}

export function updateNavbarStreak(achievementsData = null) {
  if (typeof document === 'undefined') return
  const slots = document.querySelectorAll?.('[data-progress-slot]')
  if (!slots || slots.length === 0) return

  const data = achievementsData || achievementsCache.data
  const currentStreak = Number(data?.streak?.current || 0)

  // Chỉ hiện khi MOCHI_FEATURES.streak bật, dữ liệu đã tải và current > 0.
  // 0 hoặc lỗi -> giữ ẩn.
  if (MOCHI_FEATURES.streak && data && currentStreak > 0) {
    slots.forEach(slot => {
      slot.removeAttribute('hidden')
      slot.hidden = false
      slot.innerHTML = `
        <a href="#achievements" class="m-shell-streak-chip" title="Chuỗi học tập: ${escapeHtml(currentStreak)} ngày" aria-label="Chuỗi học tập: ${escapeHtml(currentStreak)} ngày">
          <i class="fa-solid fa-fire" aria-hidden="true"></i>
          <span class="m-streak-count">${escapeHtml(currentStreak)}</span><span class="m-streak-unit">&nbsp;ngày</span>
        </a>
      `
    })
  } else {
    slots.forEach(slot => {
      slot.setAttribute('hidden', '')
      slot.hidden = true
      slot.innerHTML = ''
    })
  }
}

export function renderHomeAchievementsSkeleton() {
  return `
    <div class="m-achieve-skeleton">
      <div class="m-achieve-skeleton-box"></div>
      <div class="m-achieve-skeleton-box"></div>
      <div class="m-achieve-skeleton-box"></div>
      <div class="m-achieve-skeleton-box"></div>
    </div>
  `
}

export function renderHomeAchievementsContent({ achievements, leaderboard, classInfo } = {}) {
  const cards = []

  // 1. Thẻ Cấp độ
  if (MOCHI_FEATURES.xp) {
    const xp = achievements?.xp || {}
    const level = Number(xp.level || 1)
    const levelXp = Number(xp.levelXp || 0)
    const nextLevelXp = Number(xp.nextLevelXp || 200)
    const pct = Math.min(100, Math.max(0, Math.round((levelXp / (nextLevelXp || 200)) * 100)))
    const thisWeek = Number(xp.thisWeek || 0)

    cards.push(`
      <div class="m-home-achieve-card" aria-label="Cấp độ và điểm kinh nghiệm">
        <div class="m-home-achieve-card-header">
          <h3 class="m-home-achieve-card-title">
            <i class="fa-solid fa-bolt" aria-hidden="true"></i> Cấp độ
          </h3>
          <span class="m-chip m-chip--accent2">+${escapeHtml(thisWeek)} XP tuần này</span>
        </div>
        <div>
          <div class="m-home-achieve-val">Cấp ${escapeHtml(level)}</div>
          <div class="m-stat-progress-bar-wrap" style="margin-top:6px;">
            <div class="m-stat-progress-label">
              <span>Tiến trình cấp</span>
              <span>${escapeHtml(levelXp)} / ${escapeHtml(nextLevelXp)} XP</span>
            </div>
            <div class="m-progress" role="progressbar" aria-valuenow="${levelXp}" aria-valuemin="0" aria-valuemax="${nextLevelXp}" aria-label="Tiến độ lên Cấp ${level + 1}">
              <span style="width: ${pct}%;"></span>
            </div>
          </div>
        </div>
        <p class="m-home-achieve-sub">Còn ${escapeHtml(nextLevelXp - levelXp)} XP để lên Cấp ${escapeHtml(level + 1)}</p>
      </div>
    `)
  }

  // 2. Thẻ Chuỗi ngày học
  if (MOCHI_FEATURES.streak) {
    const streak = achievements?.streak || {}
    const current = Number(streak.current || 0)
    const best = Number(streak.best || 0)
    const activeToday = Boolean(streak.activeToday)

    cards.push(`
      <div class="m-home-achieve-card" aria-label="Chuỗi ngày học">
        <div class="m-home-achieve-card-header">
          <h3 class="m-home-achieve-card-title m-home-achieve-streak-title">
            <i class="fa-solid fa-fire" aria-hidden="true"></i> Chuỗi ngày học
          </h3>
        </div>
        <div>
          <div class="m-home-achieve-val">${escapeHtml(current)} ngày</div>
          <div class="m-home-streak-status-wrap">
            ${activeToday
              ? `<span class="m-chip m-chip--ok m-nowrap"><i class="fa-solid fa-check" aria-hidden="true"></i> Đã học hôm nay</span>`
              : `<span class="m-chip m-chip--warn m-nowrap">Chưa học hôm nay</span>`
            }
          </div>
          <p class="m-home-achieve-sub" style="margin-top:6px;">Kỷ lục dài nhất: <strong>${escapeHtml(best)} ngày</strong></p>
        </div>
        <p class="m-home-achieve-sub" style="font-size:12px;">
          ${activeToday ? 'Tuyệt vời! Bạn đã duy trì ngọn lửa học tập.' : 'Làm 1 bài tập hoặc điểm danh để giữ chuỗi nhé!'}
        </p>
      </div>
    `)
  }

  // 3. Thẻ Huy hiệu gần đây
  if (MOCHI_FEATURES.badges) {
    const badges = Array.isArray(achievements?.badges) ? achievements.badges : []
    const earned = badges.filter(b => b.earned)

    let badgeContent = ''
    if (earned.length > 0) {
      const recentEarned = earned.slice(0, 4)
      badgeContent = `
        <div class="m-home-achieve-badge-list">
          ${recentEarned.map(b => `
            <span class="m-home-achieve-badge-item" title="${escapeHtml(b.title)}: ${escapeHtml(b.description)}">
              <i class="fa-solid ${escapeHtml(b.icon || 'fa-award')}" aria-hidden="true"></i>
              <span>${escapeHtml(b.title)}</span>
            </span>
          `).join('')}
        </div>
      `
    } else if (badges.length > 0) {
      // Chưa có huy hiệu nào -> huy hiệu gần đạt nhất
      const sorted = [...badges].sort((a, b) => {
        const ratioA = (a.progress || 0) / (a.target || 1)
        const ratioB = (b.progress || 0) / (b.target || 1)
        return ratioB - ratioA
      })
      const closest = sorted[0]
      const progress = Number(closest.progress || 0)
      const target = Number(closest.target || 1)
      const pct = Math.min(100, Math.max(0, Math.round((progress / target) * 100)))

      badgeContent = `
        <div style="margin-top:4px;">
          <div style="display:flex; align-items:center; gap:8px; font-weight:800; font-size:14px;">
            <i class="fa-solid ${escapeHtml(closest.icon || 'fa-seedling')}" style="color:var(--m-accent);" aria-hidden="true"></i>
            <span>${escapeHtml(closest.title)}</span>
          </div>
          <div class="m-stat-progress-bar-wrap" style="margin-top:6px;">
            <div class="m-stat-progress-label">
              <span>Gần hoàn thành</span>
              <span>${escapeHtml(progress)} / ${escapeHtml(target)}</span>
            </div>
            <div class="m-progress" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="${target}" aria-label="Tiến độ huy hiệu ${escapeHtml(closest.title)}">
              <span style="width: ${pct}%;"></span>
            </div>
          </div>
        </div>
      `
    } else {
      badgeContent = `<p class="m-empty-copy">Chưa có huy hiệu</p>`
    }

    cards.push(`
      <div class="m-home-achieve-card" aria-label="Huy hiệu học tập">
        <div class="m-home-achieve-card-header">
          <h3 class="m-home-achieve-card-title">
            <i class="fa-solid fa-award" aria-hidden="true"></i> Huy hiệu gần đây
          </h3>
          <span class="m-chip">${escapeHtml(earned.length)} / ${escapeHtml(badges.length)}</span>
        </div>
        <div>
          ${badgeContent}
        </div>
        <p class="m-home-achieve-sub"><a href="#achievements">Xem tất cả huy hiệu &rarr;</a></p>
      </div>
    `)
  }

  // 4. Mini Bảng xếp hạng tuần của lớp đầu tiên
  if (MOCHI_FEATURES.leaderboard) {
    const entries = Array.isArray(leaderboard?.entries) ? leaderboard.entries : []
    const top3 = entries.slice(0, 3)
    const myRank = leaderboard?.me?.rank
    const myXp = leaderboard?.me?.xp
    const inTop3 = top3.some(e => e.isMe)
    const medals = ['🥇', '🥈', '🥉']

    let lbContent = ''
    if (top3.length > 0) {
      lbContent = `
        <div class="m-home-leaderboard-list">
          ${top3.map((e, idx) => `
            <div class="m-home-leaderboard-item ${e.isMe ? 'is-me' : ''}">
              <div class="m-home-leaderboard-left">
                <span class="m-home-leaderboard-rank">${medals[idx] || (idx + 1)}</span>
                <span class="m-home-leaderboard-name" title="${escapeHtml(e.displayName)}">${escapeHtml(e.displayName)}</span>
                ${e.isMe ? '<span class="m-leaderboard-me-badge">Bạn</span>' : ''}
              </div>
              <span class="m-home-leaderboard-xp">${escapeHtml(e.xp)} XP</span>
            </div>
          `).join('')}
        </div>
        ${!inTop3 && myRank ? `
          <div class="m-home-leaderboard-my-rank">
            Vị trí của bạn: <strong>Hạng ${escapeHtml(myRank)}</strong> (${escapeHtml(myXp ?? 0)} XP)
          </div>
        ` : ''}
      `
    } else if (classInfo?.name) {
      lbContent = `<p class="m-empty-copy" style="font-size:13px; margin:8px 0;">Chưa có điểm thi đua tuần này.</p>`
    } else {
      lbContent = `<p class="m-empty-copy" style="font-size:13px; margin:8px 0;">Tham gia lớp học để xem xếp hạng.</p>`
    }

    cards.push(`
      <div class="m-home-achieve-card" aria-label="Bảng xếp hạng tuần">
        <div class="m-home-achieve-card-header m-home-achieve-card-header--stacked">
          <h3 class="m-home-achieve-card-title">
            <i class="fa-solid fa-ranking-star" aria-hidden="true"></i> Xếp hạng tuần
          </h3>
          ${classInfo?.name ? `<span class="m-chip m-home-class-chip" title="${escapeHtml(classInfo.name)}">${escapeHtml(classInfo.name)}</span>` : ''}
        </div>
        <div>
          ${lbContent}
        </div>
        <p class="m-home-achieve-sub"><a href="#achievements">Bảng vinh danh đầy đủ &rarr;</a></p>
      </div>
    `)
  }

  return `
    <div class="m-home-achieve-grid">
      ${cards.join('')}
    </div>
  `
}

let homeWidgetRequestId = 0

export async function mountHomeAchievementsWidget({ containerId = 'student-home-achievements', classes = [] } = {}) {
  if (typeof document === 'undefined') return
  const container = document.getElementById(containerId)
  if (!container) return

  const reqId = ++homeWidgetRequestId
  container.innerHTML = renderHomeAchievementsSkeleton()

  try {
    const studentClasses = Array.isArray(classes) && classes.length > 0
      ? classes
      : (Array.isArray(state.classes) ? state.classes : [])
    const firstClass = studentClasses[0] || null

    const [achievements, leaderboard] = await Promise.all([
      fetchStudentAchievements(),
      firstClass?.id ? fetchClassLeaderboard({ classId: firstClass.id, period: 'week' }).catch(() => null) : Promise.resolve(null)
    ])

    // Guard against stale response
    if (reqId !== homeWidgetRequestId) return

    container.innerHTML = renderHomeAchievementsContent({
      achievements,
      leaderboard,
      classInfo: firstClass
    })
  } catch (err) {
    if (reqId !== homeWidgetRequestId) return
    console.warn('[ProgressWidgets] Failed to load home achievements:', err)
    container.innerHTML = `
      <div class="m-home-achieve-error" role="alert">
        <p><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Chưa tải được thành tích</p>
        <button type="button" class="m-btn m-btn--compact m-btn--secondary" id="btn-retry-home-achievements">
          Thử lại
        </button>
      </div>
    `
    const retryBtn = document.getElementById('btn-retry-home-achievements')
    retryBtn?.addEventListener('click', () => {
      mountHomeAchievementsWidget({ containerId, classes })
    })
  }
}
