import { api } from '../api.js'
import { state } from '../state.js'
import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js'
import { renderNavbar } from '../components/navbar.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const labels = { OPEN: 'Chờ phản hồi', ANSWERED: 'Đã phản hồi', CLOSED: 'Đã đóng' }
export const escapeAppealHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const esc = escapeAppealHtml
const buttonStyle = 'width:auto!important;padding:8px 12px;'

export function questionAppealReviewContext(result, user, token, hash = '') {
  if (!result || !token || user?.role !== 'STUDENT' || hash.includes('trial=true')) return null
  const sub = result.submission || result
  if (result.isTrial || result.is_trial || sub.isTrial || sub.is_trial) return null
  const id = sub.id || sub.submissionId || result.submissionId
  const owner = sub.studentId || sub.student_id || result.studentId || result.student_id
  const status = sub.status || result.status
  // Legacy submit/history DTOs omit status, but only a completed review carries submittedAt.
  if (!UUID.test(id || '') || (owner && owner !== user.id) || (status && status !== 'SUBMITTED') ||
      (!status && !(sub.submittedAt || sub.submitted_at || result.submittedAt || result.submitted_at))) return null
  return { submissionId: id }
}

export function renderQuestionAppealSlot(answerId, questionNumber, questionType) {
  const id = UUID.test(answerId || '') ? answerId : ''
  const canResolve = Number.isInteger(questionNumber) && questionNumber > 0 && ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER'].includes(questionType)
  if (!id && !canResolve) return ''
  return `<section data-question-appeal-answer="${esc(id)}" data-appeal-question-number="${canResolve ? questionNumber : ''}" data-appeal-question-type="${canResolve ? questionType : ''}" style="margin-top:16px;padding-top:12px;border-top:1px solid #e2e8f0;" aria-label="Hỏi về câu này">
    <span role="status">Đang tải câu hỏi đã gửi…</span>
    <button type="button" class="btn-secondary" style="${buttonStyle}" disabled>Hỏi về câu này</button>
  </section>`
}

export function renderAppealThread(item, { admin = false } = {}) {
  // Plain escaped text only: no markdown, math, links, solution fields or arbitrary HTML.
  return `<div style="font-size:13px;color:#475569;"><strong>${esc(labels[item.status] || 'Yêu cầu')}</strong>
    <p style="white-space:pre-wrap;overflow-wrap:anywhere;"><strong>${admin ? 'Câu hỏi của học sinh' : 'Câu hỏi của bạn'}:</strong> ${esc(item.message)}</p>
    ${item.response ? `<p style="white-space:pre-wrap;overflow-wrap:anywhere;background:#eff6ff;padding:12px;border-radius:8px;"><strong>Phản hồi của giáo viên:</strong> ${esc(item.response)}</p>` : '<p>Giáo viên sẽ phản hồi tại đây.</p>'}
  </div>`
}

// A root-local token rejects responses from an older bind, route, account or detached view.
function bindLifetime(root, session = state) {
  const token = Symbol('question-appeals')
  root._questionAppealsBinding = token
  const hash = window.location.hash
  const userId = session.user?.id
  const authToken = session.token
  return () => root.isConnected && root._questionAppealsBinding === token && window.location.hash === hash &&
    session.user?.id === userId && session.token === authToken
}

export function bindReviewQuestionAppeals(root, submissionId, client = api, session = state) {
  if (!root || !UUID.test(submissionId || '')) return
  const active = bindLifetime(root, session)
  const slots = [...root.querySelectorAll('[data-question-appeal-answer]')]
  if (!slots.length) return
  const pending = new Set()
  let generation = 0
  let loaded = false
  let items = new Map()
  function paint() {
    for (const slot of slots) {
      const item = items.get(slot.dataset.questionAppealAnswer)
      slot.innerHTML = item ? renderAppealThread(item) : `<button type="button" data-appeal-action="ask" class="btn-secondary" style="${buttonStyle}">Hỏi về câu này</button>`
    }
  }
  async function load() {
    if (pending.size) return
    const ticket = ++generation
    loaded = false
    for (const slot of slots) slot.innerHTML = '<span role="status">Đang tải câu hỏi đã gửi…</span>'
    try {
      // submit-homework's legacy review omits answer IDs. Resolve only IDs via the
      // existing authenticated history endpoint; never replace the visible solution policy.
      if (slots.some(slot => !UUID.test(slot.dataset.questionAppealAnswer || ''))) {
        const detail = await client.getStudentHistory({ submissionId }, { silent: true })
        if (!active() || ticket !== generation) return
        if ((detail.submissionId || detail.submission?.id) !== submissionId || detail.isTrial || detail.submission?.isTrial) throw new Error('Bài nộp không hợp lệ.')
        for (const slot of slots) {
          if (UUID.test(slot.dataset.questionAppealAnswer || '')) continue
          const matches = (detail.answers || []).filter(answer => Number(answer.questionNumber) === Number(slot.dataset.appealQuestionNumber) && answer.questionType === slot.dataset.appealQuestionType)
          if (matches.length !== 1 || !UUID.test(matches[0].id || '')) throw new Error('Không tìm được câu đã nộp.')
          slot.dataset.questionAppealAnswer = matches[0].id
        }
      }
      const all = []
      let page = 1
      let total = 0
      do {
        const response = await client.listQuestionAppeals({ submissionId, page, pageSize: 100 }, { silent: true })
        if (!active() || ticket !== generation) return
        all.push(...response.items)
        total = response.total
        page++
        if (!response.items.length && all.length < total) throw new Error('Không thể tải đủ câu hỏi đã gửi.')
      } while (all.length < total)
      items = new Map(all.map(item => [item.submissionAnswerId, item]))
      loaded = true
      paint()
    } catch {
      if (!active() || ticket !== generation) return
      for (const slot of slots) slot.innerHTML = `<p role="alert">Không tải được câu hỏi đã gửi.</p><button type="button" data-appeal-action="reload" class="btn-secondary" style="${buttonStyle}">Thử tải lại</button>`
    }
  }
  root.addEventListener('click', event => {
    if (!active()) return
    const button = event.target.closest('[data-appeal-action]')
    if (!button || !root.contains(button)) return
    const slot = button.closest('[data-question-appeal-answer]')
    if (!slot || pending.has(slot.dataset.questionAppealAnswer)) return
    const action = button.dataset.appealAction
    if (action === 'reload') { void load(); return }
    if (!loaded || items.has(slot.dataset.questionAppealAnswer)) return
    if (action === 'cancel') {
      slot.innerHTML = `<button type="button" data-appeal-action="ask" class="btn-secondary" style="${buttonStyle}">Hỏi về câu này</button>`
      return
    }
    if (action !== 'ask') return
    slot.innerHTML = `<form data-question-appeal-create>
      <label style="display:block;">Hỏi về câu này (tối đa 1000 ký tự)
        <textarea name="message" maxlength="1000" required rows="3" style="display:block;width:100%;box-sizing:border-box;margin:8px 0;" placeholder="Nêu ngắn gọn điều em muốn hỏi về câu đã nộp."></textarea>
      </label><p style="font-size:12px;color:#64748b;">Yêu cầu không tự động thay đổi điểm. Mỗi câu chỉ gửi một lần.</p>
      <p data-appeal-error role="alert"></p>
      <button type="submit" class="btn-primary" style="${buttonStyle}">Gửi câu hỏi</button>
      <button type="button" data-appeal-action="cancel" class="btn-secondary" style="${buttonStyle}">Hủy</button>
    </form>`
    slot.querySelector('textarea')?.focus()
  })
  root.addEventListener('submit', async event => {
    const form = event.target.closest('[data-question-appeal-create]')
    if (!form || !root.contains(form)) return
    event.preventDefault()
    if (!active() || !loaded) return
    const slot = form.closest('[data-question-appeal-answer]')
    const answerId = slot.dataset.questionAppealAnswer
    if (pending.has(answerId) || items.has(answerId)) return
    const message = form.elements.message.value.trim()
    const errorNode = form.querySelector('[data-appeal-error]')
    if (!message || message.length > 1000) { errorNode.textContent = 'Nhập từ 1–1000 ký tự.'; return }
    pending.add(answerId)
    const buttons = [...form.querySelectorAll('button')]
    buttons.forEach(button => { button.disabled = true })
    errorNode.textContent = 'Đang gửi…'
    try {
      const item = await client.createQuestionAppeal({ submissionId, submissionAnswerId: answerId, message })
      if (!active()) return
      items.set(answerId, item)
      slot.innerHTML = renderAppealThread(item)
    } catch (error) {
      if (!active()) return
      errorNode.textContent = error.message || 'Chưa xác nhận được kết quả gửi. Hãy tải lại để kiểm tra.'
      // Read-only reconciliation before retry avoids duplicates after an ambiguous network failure.
      const retry = document.createElement('button')
      retry.type = 'button'; retry.className = 'btn-secondary'; retry.style.cssText = buttonStyle
      retry.dataset.appealAction = 'reload'; retry.textContent = 'Tải lại để kiểm tra'
      form.appendChild(retry)
    } finally {
      pending.delete(answerId)
      if (active() && form.isConnected) buttons.forEach(button => { button.disabled = false })
    }
  })
  void load()
}

export function renderQuestionAppealsView() {
  if (!state.token || state.user?.role !== 'ADMIN') return '<div class="content-body">Bạn không có quyền xem hộp thư này.</div>'
  return `<div class="app-layout">${renderSidebar('question-appeals')}<div class="main-content">
    ${renderNavbar('Quản trị / Hỏi về câu đã nộp')}
    <div class="content-body" id="question-appeals-view">
      <div class="page-header"><div><h1 class="page-title">Hỏi về câu đã nộp</h1><p class="page-description">Phản hồi cho học sinh; thao tác tại đây không thay đổi điểm.</p></div></div>
      <form id="appeal-filters" class="card" style="display:flex;gap:12px;flex-wrap:wrap;align-items:end;">
        <label>Trạng thái <select name="status"><option value="OPEN">Chờ phản hồi</option><option value="ANSWERED">Đã phản hồi</option><option value="CLOSED">Đã đóng</option><option value="">Tất cả</option></select></label>
        <label>Mã lớp (tùy chọn) <input name="classId" placeholder="UUID lớp" /></label>
        <label>Mã học sinh (tùy chọn) <input name="studentId" placeholder="UUID học sinh" /></label>
        <button type="submit" class="btn-primary" style="${buttonStyle}">Lọc / Tải lại</button>
      </form>
      <p id="appeal-inbox-error" role="alert"></p><div id="appeal-inbox-list" aria-live="polite">Đang tải…</div>
      <div style="display:flex;gap:12px;align-items:center;margin-top:16px;">
        <button type="button" data-inbox-page="-1" class="btn-secondary">Trước</button><span id="appeal-inbox-page"></span><button type="button" data-inbox-page="1" class="btn-secondary">Sau</button>
      </div>
    </div></div></div>`
}

export function renderAdminAppealCard(item) {
  const reviewLink = UUID.test(item.submissionId || '') && Number.isInteger(Number(item.questionNumber)) && Number(item.questionNumber) > 0
    ? `#assignment-review?submissionId=${encodeURIComponent(item.submissionId)}&questionNumber=${Number(item.questionNumber)}&from=question-appeals`
    : ''
  return `<article class="card" data-inbox-appeal="${esc(item.id)}">
    <h3>${esc(item.studentName || 'Học sinh')} · ${esc(item.className || 'Chưa có lớp')}</h3>
    <p>${esc(item.homeworkTitle)} · ${esc(item.partTitle || '')} · Câu ${esc(item.questionNumber ?? '?')}</p>
    <p style="font-size:12px;color:#64748b;">Mã học sinh: ${esc(item.studentId)} · Mã lớp: ${esc(item.classId)} · Bài nộp: ${esc(item.submissionId)}</p>
    ${reviewLink ? `<p><a href="${esc(reviewLink)}">Mở bài nộp tại câu ${Number(item.questionNumber)}</a> <span style="font-size:12px;color:#64748b;">(mở trong hệ thống, không thay đổi điểm)</span></p>` : ''}
    ${renderAppealThread(item, { admin: true })}
    ${item.status === 'OPEN' ? `<form data-appeal-reply><label>Phản hồi cho học sinh (tối đa 2000 ký tự)
      <textarea name="response" required maxlength="2000" rows="3" style="display:block;width:100%;box-sizing:border-box;margin:8px 0;"></textarea></label>
      <button type="submit" class="btn-primary" style="${buttonStyle}">Gửi phản hồi</button></form>` : ''}
    ${item.status === 'ANSWERED' ? `<button type="button" data-appeal-close class="btn-secondary" style="${buttonStyle}">Đóng yêu cầu</button>` : ''}
    <p data-appeal-row-error role="alert"></p>
  </article>`
}

export function bindQuestionAppealsEvents(client = api, session = state) {
  bindSidebarEvents()
  const root = document.getElementById('question-appeals-view')
  if (!root || !session.token || session.user?.role !== 'ADMIN') return
  const active = bindLifetime(root, session)
  const filters = root.querySelector('#appeal-filters')
  const list = root.querySelector('#appeal-inbox-list')
  const errorNode = root.querySelector('#appeal-inbox-error')
  const pageNode = root.querySelector('#appeal-inbox-page')
  const pageButtons = [...root.querySelectorAll('[data-inbox-page]')]
  let page = 1, total = 0, generation = 0, loading = false
  const pageSize = 20
  let items = new Map()
  const pending = new Set()
  let appliedFilters = { status: 'OPEN' }
  async function load() {
    const ticket = ++generation
    loading = true
    errorNode.textContent = ''
    list.innerHTML = '<p role="status">Đang tải hộp thư…</p>'
    pageButtons.forEach(button => { button.disabled = true })
    try {
      const response = await client.listQuestionAppeals({ ...appliedFilters, page, pageSize }, { silent: true })
      if (!active() || generation !== ticket) return
      total = response.total
      items = new Map(response.items.map(item => [item.id, item]))
      list.innerHTML = response.items.length ? response.items.map(renderAdminAppealCard).join('') : '<p>Không có yêu cầu phù hợp.</p>'
      pageNode.textContent = `Trang ${page} · ${total} yêu cầu`
    } catch (error) {
      if (!active() || generation !== ticket) return
      list.innerHTML = ''
      errorNode.textContent = error.message || 'Không tải được hộp thư. Dùng Lọc / Tải lại để thử lại.'
    } finally {
      if (active() && generation === ticket) {
        loading = false
        pageButtons.forEach(button => { button.disabled = button.dataset.inboxPage === '-1' ? page <= 1 : page * pageSize >= total })
      }
    }
  }
  filters.addEventListener('submit', event => {
    event.preventDefault()
    if (!active()) return
    const next = {}
    for (const key of ['status', 'studentId', 'classId']) {
      const value = filters.elements[key].value.trim()
      if (key !== 'status' && value && !UUID.test(value)) { errorNode.textContent = 'Mã lớp và mã học sinh phải là UUID hợp lệ.'; return }
      if (value) next[key] = value
    }
    appliedFilters = next
    page = 1
    void load()
  })
  root.addEventListener('click', event => {
    if (!active()) return
    const pager = event.target.closest('[data-inbox-page]')
    if (pager && !pager.disabled && !loading) { page += Number(pager.dataset.inboxPage); void load(); return }
    const close = event.target.closest('[data-appeal-close]')
    if (close) void write(close.closest('[data-inbox-appeal]'), 'close')
  })
  root.addEventListener('submit', event => {
    const form = event.target.closest('[data-appeal-reply]')
    if (!form) return
    event.preventDefault()
    void write(form.closest('[data-inbox-appeal]'), 'reply', form.elements.response.value.trim())
  })
  async function write(card, action, response) {
    if (!active() || !card || loading) return
    const item = items.get(card.dataset.inboxAppeal)
    if (!item || pending.has(item.id)) return
    const rowError = card.querySelector('[data-appeal-row-error]')
    if (action === 'reply' && (!response || response.length > 2000)) { rowError.textContent = 'Phản hồi cần từ 1–2000 ký tự.'; return }
    pending.add(item.id)
    const buttons = [...card.querySelectorAll('button')]
    buttons.forEach(button => { button.disabled = true })
    rowError.textContent = 'Đang lưu…'
    const ticket = generation
    try {
      const data = { appealId: item.id, version: item.version }
      if (action === 'reply') await client.replyQuestionAppeal({ ...data, response })
      else await client.closeQuestionAppeal(data)
      if (active() && ticket === generation) await load()
    } catch (error) {
      if (active() && ticket === generation && card.isConnected) rowError.textContent = `${error.message || 'Không thể lưu.'} Dùng Lọc / Tải lại để kiểm tra trạng thái trước khi thử lại.`
    } finally {
      pending.delete(item.id)
      if (active() && card.isConnected) buttons.forEach(button => { button.disabled = false })
    }
  }
  void load()
}
