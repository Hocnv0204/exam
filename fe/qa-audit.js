// Temporary QA helper (delete after theme verification).
export function parseColor(c) {
  const m = c && c.match(/rgba?\(([^)]+)\)/)
  if (!m) return null
  const p = m[1].split(',').map(Number)
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
}

export function luminance(c) {
  const f = (v) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
}

export function contrast(a, b) {
  const l1 = luminance(a)
  const l2 = luminance(b)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

export function backgroundOf(el) {
  let n = el
  while (n && n.nodeType === 1) {
    const cs = getComputedStyle(n)
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return null
    const bg = parseColor(cs.backgroundColor)
    if (bg && bg.a > 0.5) return bg
    n = n.parentElement
  }
  const b = parseColor(getComputedStyle(document.body).backgroundColor)
  return (b && b.a > 0.5) ? b : { r: 255, g: 255, b: 255, a: 1 }
}

export function audit() {
  const issues = []
  const seen = new Set()
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.15) continue
    const rect = el.getBoundingClientRect()
    if (rect.width < 4 || rect.height < 4) continue
    const text = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(' ')
      .trim()
    if (!text) continue
    const fg = parseColor(cs.color)
    if (!fg || fg.a < 0.5) continue
    const bg = backgroundOf(el)
    if (!bg) continue
    const r = contrast(fg, bg)
    const size = parseFloat(cs.fontSize)
    const bold = parseInt(cs.fontWeight, 10) >= 600
    const large = size >= 24 || (size >= 18.66 && bold)
    const min = large ? 3 : 4.5
    if (r < min - 0.8) {
      const sig = text.slice(0, 40) + '|' + cs.color + '|' + `rgb(${bg.r}, ${bg.g}, ${bg.b})`
      if (!seen.has(sig)) {
        seen.add(sig)
        issues.push({
          text: text.slice(0, 48),
          cls: (typeof el.className === 'string' ? el.className : '').slice(0, 70),
          tag: el.tagName,
          color: cs.color,
          bg: `rgb(${bg.r}, ${bg.g}, ${bg.b})`,
          ratio: Math.round(r * 100) / 100,
          size
        })
      }
    }
  }
  const layout = document.querySelector('.app-layout') || document.querySelector('.exam-room-layout')
  return {
    theme: document.documentElement.dataset.theme,
    route: layout?.dataset.route || (layout ? 'exam-room' : 'none'),
    layoutClass: layout?.className || null,
    issues: issues.slice(0, 25),
    count: issues.length
  }
}

export function finishAnimations() {
  document.querySelectorAll('*').forEach((el) => {
    if (!el.getAnimations) return
    el.getAnimations().forEach((a) => {
      try {
        a.finish()
      } catch (_) {}
    })
  })
}

export async function goto(route) {
  location.hash = '#' + route
  const started = performance.now()
  while (performance.now() - started < 6000) {
    await new Promise((r) => setTimeout(r, 120))
    const layout = document.querySelector('.app-layout')
    if (layout?.dataset.route === route) {
      await new Promise((r) => setTimeout(r, 450))
      finishAnimations()
      return layout.dataset.route
    }
  }
  finishAnimations()
  return document.querySelector('.app-layout')?.dataset.route || '?'
}

export function toggle() {
  document.querySelector('[data-theme-toggle]')?.click()
  finishAnimations()
  return document.documentElement.dataset.theme
}

export function snapshot() {
  const pick = (sel, prop = 'backgroundColor') => {
    const el = document.querySelector(sel)
    return el ? getComputedStyle(el)[prop] : null
  }
  return {
    theme: document.documentElement.dataset.theme,
    stored: localStorage.getItem('eduportal-theme'),
    colorScheme: document.documentElement.style.colorScheme,
    layoutClass: document.querySelector('.app-layout')?.className || document.querySelector('.exam-room-layout')?.className || null,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    bodyColor: getComputedStyle(document.body).color,
    sidebarBg: pick('.sidebar'),
    navbarBg: pick('.top-navbar'),
    mainBg: pick('.main-content'),
    contentBg: pick('.content-body'),
    hasToggle: !!document.querySelector('[data-theme-toggle]'),
    toggleLabel: document.querySelector('[data-theme-toggle]')?.getAttribute('aria-label') || null
  }
}
