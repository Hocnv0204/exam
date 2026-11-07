import assert from 'node:assert/strict'
import { fetchAllRows, fetchAllRowsInChunks } from '../shared/fetch-all-rows.ts'

let passed = 0
const test = async (name, fn) => {
  await fn()
  passed++
  console.log(`  ✓ ${name}`)
}

// Tạo mock query builder dựa trên mảng dữ liệu mẫu
function createMockQuery(allData, { failAtOffset = null, errorMessage = 'Simulated DB Error' } = {}) {
  return () => ({
    range(from, to) {
      if (failAtOffset !== null && from >= failAtOffset) {
        return Promise.resolve({ data: null, error: { message: errorMessage } })
      }
      const slice = allData.slice(from, to + 1)
      return Promise.resolve({ data: slice, error: null })
    }
  })
}

// 1. Kiểm tra đọc đủ 2500 dòng với pageSize = 1000
await test('fetchAllRows: đọc đủ 2500 dòng theo phân trang, đúng thứ tự, không trùng lặp', async () => {
  const dataset = Array.from({ length: 2500 }, (_, i) => ({ id: `row-${i + 1}`, value: i + 1 }))
  const mock = createMockQuery(dataset)

  const rows = await fetchAllRows(mock, { pageSize: 1000 })
  assert.equal(rows.length, 2500, 'Phải đọc đủ 2500 dòng')
  assert.equal(rows[0].id, 'row-1', 'Dòng đầu tiên đúng thứ tự')
  assert.equal(rows[2499].id, 'row-2500', 'Dòng cuối cùng đúng thứ tự')

  const ids = rows.map(r => r.id)
  const uniqueIds = new Set(ids)
  assert.equal(uniqueIds.size, 2500, 'Không được có bản ghi trùng lặp')
})

// 2. Kiểm tra ném lỗi khi query trang gặp lỗi DB
await test('fetchAllRows: ném lỗi rõ ràng khi query gặp lỗi', async () => {
  const dataset = Array.from({ length: 1500 }, (_, i) => ({ id: `row-${i + 1}` }))
  const mock = createMockQuery(dataset, { failAtOffset: 1000, errorMessage: 'Connection timeout' })

  await assert.rejects(
    async () => {
      await fetchAllRows(mock, { pageSize: 500 })
    },
    /fetchAllRows query failed: Connection timeout/
  )
})

// 3. Kiểm tra ném lỗi khi vượt quá maxRows
await test('fetchAllRows: ném lỗi rõ ràng khi số dòng vượt maxRows', async () => {
  const dataset = Array.from({ length: 2500 }, (_, i) => ({ id: `row-${i + 1}` }))
  const mock = createMockQuery(dataset)

  await assert.rejects(
    async () => {
      await fetchAllRows(mock, { pageSize: 500, maxRows: 2000 })
    },
    /fetchAllRows exceeded maxRows limit of 2000/
  )
})

// 4. Kiểm tra limit (chặn ở ngưỡng mong muốn, ví dụ lấy tối đa 2000 dòng từ 2500 dòng)
await test('fetchAllRows: dừng chính xác khi đạt tham số limit (tránh cắt ở 1000)', async () => {
  const dataset = Array.from({ length: 2500 }, (_, i) => ({ id: `row-${i + 1}` }))
  const mock = createMockQuery(dataset)

  const rows = await fetchAllRows(mock, { pageSize: 1000, limit: 2000 })
  assert.equal(rows.length, 2000, 'Phải dừng đúng ở 2000 dòng')
  assert.equal(rows[1999].id, 'row-2000')
})

// 5. Kiểm tra tập rỗng (0 dòng)
await test('fetchAllRows: trả về mảng rỗng khi query không có dòng nào', async () => {
  const mock = createMockQuery([])
  const rows = await fetchAllRows(mock, { pageSize: 1000 })
  assert.deepEqual(rows, [])
})

// 6. Kiểm tra fetchAllRowsInChunks gộp đầy đủ các chunk và phân trang bên trong mỗi chunk
await test('fetchAllRowsInChunks: chia chunk id, phân trang và gộp đủ toàn bộ dữ liệu', async () => {
  const testIds = Array.from({ length: 350 }, (_, i) => `id-${i + 1}`)
  // Giả lập mỗi id có 2 bản ghi
  const idRecordMap = new Map()
  testIds.forEach(id => {
    idRecordMap.set(id, [
      { id: `${id}-rec1`, target_id: id },
      { id: `${id}-rec2`, target_id: id }
    ])
  })

  const chunksProcessed = new Set()
  const buildQueryForChunk = (chunk) => {
    chunksProcessed.add(chunk)
    const chunkData = chunk.flatMap(id => idRecordMap.get(id) || [])
    return {
      range(from, to) {
        return Promise.resolve({ data: chunkData.slice(from, to + 1), error: null })
      }
    }
  }

  // Chunk size 100: 350 ids => 4 chunk (100, 100, 100, 50)
  const rows = await fetchAllRowsInChunks(testIds, 100, buildQueryForChunk, { pageSize: 50 })
  assert.equal(chunksProcessed.size, 4, 'Phải chia thành 4 lượt chunk')
  assert.equal(rows.length, 700, 'Phải gộp đủ 700 bản ghi (350 ids * 2)')
  assert.equal(rows[0].id, 'id-1-rec1')
  assert.equal(rows[699].id, 'id-350-rec2')
})

// 7. fetchAllRowsInChunks ném lỗi khi tổng vượt maxRows
await test('fetchAllRowsInChunks: ném lỗi khi tổng số dòng gộp vượt maxRows', async () => {
  const testIds = ['id-1', 'id-2', 'id-3']
  const buildQueryForChunk = (chunk) => {
    const chunkData = Array.from({ length: 100 }, (_, i) => ({ id: `row-${i}` }))
    return {
      range(from, to) {
        return Promise.resolve({ data: chunkData.slice(from, to + 1), error: null })
      }
    }
  }

  await assert.rejects(
    async () => {
      await fetchAllRowsInChunks(testIds, 1, buildQueryForChunk, { pageSize: 50, maxRows: 150 })
    },
    /exceeded maxRows limit/
  )
})

console.log(`\nKết quả test-fetch-all-rows: ${passed} passed`)
