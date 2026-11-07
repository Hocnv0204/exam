const FACES = {
  happy: {
    eyes: '<circle cx="58" cy="92" r="5" fill="var(--m-ink)"/><circle cx="102" cy="92" r="5" fill="var(--m-ink)"/>',
    mouth: '<path d="M72 106 Q80 116 88 106" fill="none" stroke="var(--m-ink)" stroke-width="4.5" stroke-linecap="round"/>'
  },
  cheer: {
    eyes: '<path d="M52 92 Q58 84 64 92M96 92 Q102 84 108 92" fill="none" stroke="var(--m-ink)" stroke-width="5" stroke-linecap="round"/>',
    mouth: '<path d="M69 105 Q80 122 91 105" fill="var(--m-accent2-soft)" stroke="var(--m-ink)" stroke-width="4" stroke-linejoin="round"/>'
  },
  wink: {
    eyes: '<path d="M52 92 Q58 84 64 92" fill="none" stroke="var(--m-ink)" stroke-width="5" stroke-linecap="round"/><circle cx="102" cy="92" r="5" fill="var(--m-ink)"/>',
    mouth: '<path d="M73 107 Q82 114 90 105" fill="none" stroke="var(--m-ink)" stroke-width="4.5" stroke-linecap="round"/>'
  }
}

export function renderMascot({ mood = 'happy', size = 160 } = {}) {
  const face = FACES[mood] || FACES.happy
  const safeSize = Number.isFinite(Number(size)) ? Math.max(24, Number(size)) : 160
  return `<svg class="m-mascot m-mascot--${FACES[mood] ? mood : 'happy'}" width="${safeSize}" height="${safeSize}" viewBox="0 0 160 160" aria-hidden="true" focusable="false">
    <ellipse cx="80" cy="148" rx="46" ry="8" fill="var(--m-block)"/>
    <path d="M38 58 L46 18 L70 44 Z" fill="var(--m-accent2-soft)" stroke="var(--m-ink)" stroke-width="5" stroke-linejoin="round"/>
    <path d="M122 58 L114 18 L90 44 Z" fill="var(--m-accent2-soft)" stroke="var(--m-ink)" stroke-width="5" stroke-linejoin="round"/>
    <path d="M22 96 C22 58 48 40 80 40 C112 40 138 58 138 96 C138 128 112 144 80 144 C48 144 22 128 22 96 Z" fill="var(--m-surface)" stroke="var(--m-ink)" stroke-width="5"/>
    ${face.eyes}
    <ellipse cx="46" cy="108" rx="9" ry="6" fill="#FFB3C9"/><ellipse cx="114" cy="108" rx="9" ry="6" fill="#FFB3C9"/>
    ${face.mouth}
    <path d="M118 126 Q140 120 142 100" fill="none" stroke="var(--m-ink)" stroke-width="5" stroke-linecap="round"/>
    <rect x="60" y="120" width="40" height="24" rx="6" fill="var(--m-accent)" stroke="var(--m-ink)" stroke-width="4"/>
    <path d="M80 122 V142" stroke="var(--m-accent-ink)" stroke-width="3"/>
  </svg>`
}
