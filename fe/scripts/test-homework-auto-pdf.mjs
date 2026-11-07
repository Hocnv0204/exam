import test from 'node:test'
import assert from 'node:assert/strict'

if (!globalThis.localStorage) {
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }
}

const {
  toSafeAsciiFileName,
  extractHomeworkIdsFromCreateResponse,
  attachGeneratedPdfToHomeworks,
  queueAutoPdfGeneration
} = await import('../src/js/utils/homework-auto-pdf.js')

test('toSafeAsciiFileName: chuẩn hoá tiếng Việt có dấu, ký tự đặc biệt thành tên ASCII an toàn', () => {
  assert.equal(toSafeAsciiFileName('Đề kiểm tra giữa kỳ 1 - Lớp 12A'), 'De_kiem_tra_giua_ky_1_-_Lop_12A.pdf')
  assert.equal(toSafeAsciiFileName('  Toán học / Vật lý \\ Hóa học: Test * ? < > | '), 'Toan_hoc_Vat_ly_Hoa_hoc_Test.pdf')
  assert.equal(toSafeAsciiFileName(''), 'De_bai.pdf')
  assert.equal(toSafeAsciiFileName(null), 'De_bai.pdf')
  assert.equal(toSafeAsciiFileName('___'), 'De_bai.pdf')
})

test('extractHomeworkIdsFromCreateResponse: trích xuất đúng id cho cả đơn đề và đa mã đề', () => {
  // 1. Đơn đề
  assert.deepEqual(extractHomeworkIdsFromCreateResponse({ homeworkId: 'hw-single-1' }), ['hw-single-1'])

  // 2. Đa mã đề (variants)
  const multiRes = {
    isMultiVariant: true,
    variants: [
      { code: '101', homeworkId: 'hw-101' },
      { code: '102', homeworkId: 'hw-102' },
      { code: '103', homeworkId: 'hw-103' }
    ]
  }
  assert.deepEqual(extractHomeworkIdsFromCreateResponse(multiRes), ['hw-101', 'hw-102', 'hw-103'])

  // 3. Biên / không hợp lệ
  assert.deepEqual(extractHomeworkIdsFromCreateResponse(null), [])
  assert.deepEqual(extractHomeworkIdsFromCreateResponse({}), [])
  assert.deepEqual(extractHomeworkIdsFromCreateResponse({ isMultiVariant: true, variants: [] }), [])
})

test('attachGeneratedPdfToHomeworks: gọi update đúng homeworkId với URL upload trả về khi thành công', async () => {
  const calls = {
    getDetail: [],
    renderPdf: [],
    uploadFile: [],
    updateHomework: []
  }

  const mockApi = {
    getHomeworkDetail: async (id) => {
      calls.getDetail.push(id)
      return {
        homework: { id, title: `Đề thi số ${id}`, durationMinutes: 45 },
        questions: [{ question_number: 1, prompt: 'Câu 1' }]
      }
    },
    uploadFile: async (file) => {
      calls.uploadFile.push(file)
      return `https://r2.test/cdn/${file.name}`
    },
    updateHomework: async (payload) => {
      calls.updateHomework.push(payload)
      return { success: true }
    }
  }

  const mockRenderBlob = async (params) => {
    calls.renderPdf.push(params)
    return new Blob(['fake-pdf-content'], { type: 'application/pdf' })
  }

  const results = await attachGeneratedPdfToHomeworks(
    ['hw-1', 'hw-2'],
    { title: 'Tiêu đề mặc định', durationMinutes: 60 },
    { api: mockApi, renderExamPdfBlob: mockRenderBlob }
  )

  // Verify getHomeworkDetail
  assert.deepEqual(calls.getDetail, ['hw-1', 'hw-2'])

  // Verify renderExamPdfBlob: mode 'student'
  assert.equal(calls.renderPdf.length, 2)
  assert.equal(calls.renderPdf[0].mode, 'student')
  assert.equal(calls.renderPdf[0].title, 'Đề thi số hw-1')
  assert.equal(calls.renderPdf[0].meta.durationMinutes, 45)

  // Verify uploadFile
  assert.equal(calls.uploadFile.length, 2)
  assert.equal(calls.uploadFile[0].name, 'De_thi_so_hw-1.pdf')
  assert.equal(calls.uploadFile[1].name, 'De_thi_so_hw-2.pdf')

  // Verify updateHomework
  assert.deepEqual(calls.updateHomework, [
    { homeworkId: 'hw-1', pdfPath: 'https://r2.test/cdn/De_thi_so_hw-1.pdf' },
    { homeworkId: 'hw-2', pdfPath: 'https://r2.test/cdn/De_thi_so_hw-2.pdf' }
  ])

  // Verify return shape
  assert.deepEqual(results, [
    { homeworkId: 'hw-1', ok: true, pdfUrl: 'https://r2.test/cdn/De_thi_so_hw-1.pdf' },
    { homeworkId: 'hw-2', ok: true, pdfUrl: 'https://r2.test/cdn/De_thi_so_hw-2.pdf' }
  ])
})

test('attachGeneratedPdfToHomeworks: lỗi upload ở bài 1 không ngăn bài 2; không gọi update khi upload lỗi; không retry upload', async () => {
  const uploadAttempts = []
  const updatedIds = []

  const mockApi = {
    getHomeworkDetail: async (id) => ({
      homework: { id, title: `Bài ${id}` },
      questions: [{ question_number: 1, prompt: 'Câu 1' }]
    }),
    uploadFile: async (file) => {
      uploadAttempts.push(file.name)
      if (file.name.includes('hw-fail')) {
        throw new Error('R2 Network Timeout')
      }
      return `https://r2.test/cdn/${file.name}`
    },
    updateHomework: async (payload) => {
      updatedIds.push(payload.homeworkId)
      return { success: true }
    }
  }

  const mockRenderBlob = async () => new Blob(['pdf-bytes'], { type: 'application/pdf' })

  const results = await attachGeneratedPdfToHomeworks(
    ['hw-fail', 'hw-ok'],
    {},
    { api: mockApi, renderExamPdfBlob: mockRenderBlob }
  )

  // Upload cho hw-fail được gọi đúng 1 lần (KHÔNG retry)
  assert.equal(uploadAttempts.filter(n => n.includes('hw-fail')).length, 1)

  // hw-fail KHÔNG gọi updateHomework
  assert.ok(!updatedIds.includes('hw-fail'))

  // hw-ok vẫn được gọi và updateHomework thành công
  assert.ok(updatedIds.includes('hw-ok'))

  // Kết quả phản ánh rõ ràng
  assert.equal(results.length, 2)
  assert.equal(results[0].homeworkId, 'hw-fail')
  assert.equal(results[0].ok, false)
  assert.match(results[0].error, /R2 Network Timeout/)

  assert.equal(results[1].homeworkId, 'hw-ok')
  assert.equal(results[1].ok, true)
  assert.ok(results[1].pdfUrl.includes('hw-ok'))
})

test('attachGeneratedPdfToHomeworks: đề không có câu hỏi thì bỏ qua an toàn, không gọi upload/update', async () => {
  let uploadCalled = false
  let updateCalled = false

  const mockApi = {
    getHomeworkDetail: async () => ({
      homework: { id: 'hw-empty', title: 'Đề rỗng' },
      questions: []
    }),
    uploadFile: async () => { uploadCalled = true; return 'url' },
    updateHomework: async () => { updateCalled = true }
  }

  const results = await attachGeneratedPdfToHomeworks(
    ['hw-empty'],
    {},
    { api: mockApi, renderExamPdfBlob: async () => new Blob([]) }
  )

  assert.equal(uploadCalled, false)
  assert.equal(updateCalled, false)
  assert.equal(results[0].ok, false)
  assert.match(results[0].error, /không có câu hỏi/)
})

test('queueAutoPdfGeneration: hiển thị toast tiến trình và kết quả tuần tự chống chạy trùng', async () => {
  const toasts = []
  const mockToast = (msg, type) => { toasts.push({ msg, type }) }

  let runningCount = 0
  let maxConcurrent = 0

  const mockAttach = async (ids) => {
    runningCount++
    maxConcurrent = Math.max(maxConcurrent, runningCount)
    await new Promise(r => setTimeout(r, 15))
    runningCount--
    return ids.map(id => ({ homeworkId: id, ok: true, pdfUrl: `https://test/${id}.pdf` }))
  }

  // Khởi chạy 2 task liên tiếp
  const p1 = queueAutoPdfGeneration(['hw-a'], {}, { showToast: mockToast, attachGeneratedPdfToHomeworks: mockAttach })
  const p2 = queueAutoPdfGeneration(['hw-b'], {}, { showToast: mockToast, attachGeneratedPdfToHomeworks: mockAttach })

  await Promise.all([p1, p2])

  // Đảm bảo không chạy song song (max concurrent = 1)
  assert.equal(maxConcurrent, 1, 'hàng đợi phải chạy tuần tự, max concurrent = 1')

  // Kiểm tra toasts
  const infoToasts = toasts.filter(t => t.type === 'info')
  const successToasts = toasts.filter(t => t.type === 'success')

  assert.equal(infoToasts.length, 2)
  assert.ok(infoToasts[0].msg.includes('Đang tạo file PDF đề'))
  assert.equal(successToasts.length, 2)
  assert.ok(successToasts[0].msg.includes('Đã gắn PDF cho 1 đề'))
})
