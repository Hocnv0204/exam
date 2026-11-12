// Hộp thoại Mochi thay cho confirm() / alert() / prompt() của trình duyệt.
// - Lớp riêng #m-dialog-root (nằm TRÊN #modal-container) → gọi được cả khi đang mở popup openModal.
// - Trả Promise: mochiConfirm → boolean, mochiAlert → void, mochiPrompt → string | null (null = huỷ).
// - Màu theo ngữ cảnh: học sinh Mochi (html[data-ui="mochi"]), admin Pro (html[data-admin-ui="pro"], 4 chế độ),
//   trang công khai Mochi (.m-roadmap → data-mochi-theme), còn lại dùng bảng Sáng mặc định.
// - Nội dung luôn được escape; xuống dòng trong message được giữ.
import { escapeHtml } from '../utils/download-helper.js'

if (typeof document !== 'undefined' && document.head) {
  import('../../css/mochi/dialog.css')
}

const TONES = {
  primary: { icon: 'fa-circle-question' },
  danger: { icon: 'fa-triangle-exclamation' },
  warning: { icon: 'fa-circle-exclamation' },
  info: { icon: 'fa-circle-info' },
  success: { icon: 'fa-circle-check' }
}

let queue = Promise.resolve()
// Khoá các hộp thoại đang mở/xếp hàng theo nội dung: một yêu cầu TRÙNG HỆT (bấm đúp nút) được trả
// về giá trị huỷ ngay — không bao giờ để 2 xác nhận cùng nội dung chạy nối tiếp (tránh gọi API 2 lần).
const activeKeys = new Set()
const BACKDROP_GUARD_MS = 350

function resolveTheme() {
  const html = document.documentElement
  const publicRoot = document.querySelector('.m-roadmap[data-roadmap-theme]')
  if (publicRoot) return publicRoot.dataset.roadmapTheme
  if (html.dataset.ui === 'mochi' && html.dataset.studentTheme) return html.dataset.studentTheme
  return ''
}

function getRoot() {
  let root = document.getElementById('m-dialog-root')
  if (!root) {
    root = document.createElement('div')
    root.id = 'm-dialog-root'
    document.body.appendChild(root)
  }
  const theme = resolveTheme()
  if (theme) root.dataset.mochiTheme = theme
  else delete root.dataset.mochiTheme
  return root
}

function normalize(input, defaults) {
  const opts = typeof input === 'string' ? { message: input } : { ...(input || {}) }
  return { ...defaults, ...opts }
}

function open(kind, opts) {
  const key = `${kind}|${opts.title}|${opts.message}`
  if (activeKeys.has(key)) {
    return Promise.resolve(kind === 'confirm' ? false : (kind === 'prompt' ? null : undefined))
  }
  activeKeys.add(key)
  const run = () => new Promise(resolve => {
    const openedAt = Date.now()
    const root = getRoot()
    const tone = TONES[opts.tone] ? opts.tone : (kind === 'alert' ? 'info' : 'primary')
    const previousFocus = document.activeElement
    const titleId = `m-dialog-title-${Date.now()}`
    const msgId = `${titleId}-msg`
    root.innerHTML = `
      <div class="m-dialog-backdrop" data-m-dialog-backdrop>
        <div class="m-dialog m-dialog--${tone}" role="${kind === 'alert' ? 'alertdialog' : 'dialog'}" aria-modal="true" aria-labelledby="${titleId}" aria-describedby="${msgId}">
          <div class="m-dialog-icon" aria-hidden="true"><i class="fa-solid ${TONES[tone].icon}"></i></div>
          <h2 class="m-dialog-title" id="${titleId}">${escapeHtml(opts.title)}</h2>
          ${opts.message ? `<p class="m-dialog-message" id="${msgId}">${escapeHtml(opts.message)}</p>` : `<span id="${msgId}" hidden></span>`}
          ${kind === 'prompt' ? `
            <label class="m-dialog-field">
              ${opts.label ? `<span>${escapeHtml(opts.label)}</span>` : ''}
              <input type="text" class="m-dialog-input" data-m-dialog-input value="${escapeHtml(opts.defaultValue || '')}" placeholder="${escapeHtml(opts.placeholder || '')}" autocomplete="off">
            </label>` : ''}
          <div class="m-dialog-actions">
            ${kind === 'alert' ? '' : `<button type="button" class="m-dialog-btn m-dialog-btn--ghost" data-m-dialog-cancel>${escapeHtml(opts.cancelLabel)}</button>`}
            <button type="button" class="m-dialog-btn m-dialog-btn--${tone === 'danger' ? 'danger' : 'primary'}" data-m-dialog-ok>${escapeHtml(opts.confirmLabel)}</button>
          </div>
        </div>
      </div>
    `
    document.body.classList.add('m-dialog-open')
    const dialog = root.querySelector('.m-dialog')
    const input = root.querySelector('[data-m-dialog-input]')
    const okBtn = root.querySelector('[data-m-dialog-ok]')
    let done = false

    const finish = value => {
      if (done) return
      done = true
      document.removeEventListener('keydown', onKey, true)
      root.innerHTML = ''
      document.body.classList.remove('m-dialog-open')
      try { previousFocus?.focus?.({ preventScroll: true }) } catch (_) {}
      resolve(value)
    }
    const cancelValue = kind === 'confirm' ? false : (kind === 'prompt' ? null : undefined)
    const okValue = () => (kind === 'confirm' ? true : (kind === 'prompt' ? (input?.value ?? '') : undefined))

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(cancelValue) }
      else if (e.key === 'Enter' && kind === 'prompt' && document.activeElement === input) { e.preventDefault(); finish(okValue()) }
      else if (e.key === 'Tab') {
        const items = [...dialog.querySelectorAll('button, input')].filter(el => !el.disabled)
        if (!items.length) return
        const first = items[0], last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey, true)
    okBtn.addEventListener('click', () => finish(okValue()))
    root.querySelector('[data-m-dialog-cancel]')?.addEventListener('click', () => finish(cancelValue))
    root.querySelector('[data-m-dialog-backdrop]').addEventListener('click', e => {
      // Bỏ qua cú bấm thứ 2 của thao tác bấm đúp rơi vào nền ngay sau khi hộp thoại mở.
      if (Date.now() - openedAt < BACKDROP_GUARD_MS) return
      if (e.target === e.currentTarget && kind !== 'alert') finish(cancelValue)
    })
    // Hành động nguy hiểm: focus nút Huỷ trước để Enter vô tình không xác nhận.
    const initial = input || (tone === 'danger' ? root.querySelector('[data-m-dialog-cancel]') : okBtn) || okBtn
    setTimeout(() => { initial?.focus(); if (input) input.select() }, 0)
  })
  // Xếp hàng: hộp thoại sau chỉ mở khi hộp thoại trước đóng.
  const p = queue.then(run, run)
  p.then(() => activeKeys.delete(key), () => activeKeys.delete(key))
  queue = p.catch(() => {})
  return p
}

/** @returns {Promise<boolean>} */
export function mochiConfirm(input) {
  return open('confirm', normalize(input, { title: 'Xác nhận', message: '', confirmLabel: 'Đồng ý', cancelLabel: 'Hủy', tone: 'primary' }))
}

/** @returns {Promise<void>} */
export function mochiAlert(input) {
  return open('alert', normalize(input, { title: 'Thông báo', message: '', confirmLabel: 'Đã hiểu', tone: 'info' }))
}

/** @returns {Promise<string|null>} null khi huỷ, chuỗi (có thể rỗng) khi đồng ý */
export function mochiPrompt(input) {
  return open('prompt', normalize(input, { title: 'Nhập thông tin', message: '', confirmLabel: 'Đồng ý', cancelLabel: 'Hủy', tone: 'primary', defaultValue: '', placeholder: '', label: '' }))
}

if (typeof window !== 'undefined') {
  window.mochiConfirm = mochiConfirm
  window.mochiAlert = mochiAlert
  window.mochiPrompt = mochiPrompt
}
