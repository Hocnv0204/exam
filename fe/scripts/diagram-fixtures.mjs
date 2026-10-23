/**
 * diagram-fixtures.mjs — Fixture kiểm thử cho khối hình toán.
 *
 * Nguồn:
 *  - TN-1 (đề trắc nghiệm Toán 12, file nguồn KHÔNG bị sửa): chỉ dùng những câu
 *    có CÔNG THỨC XÁC ĐỊNH rõ ràng để làm fixture đồ thị / bảng dấu.
 *    Mỗi fixture ghi rõ: nguồn, mục đích (hình gốc / minh họa), dữ liệu còn thiếu.
 *  - Fixture 3D: dựng riêng, có toạ độ kiểm chứng được (oracle toán học).
 */

/** Câu 14 TN-1: f'(x) = x(x+1)(x-4)^3 → dấu -, +, -, + (nghiệm kép bội ba tại 4 không đổi dấu). */
export const TN1_Q14_DERIVATIVE_SIGNS = {
  source: 'TN-1 câu 14',
  purpose: 'minh họa bảng xét dấu đạo hàm (không phải hình gốc)',
  missing: 'Chưa khôi phục được bảng biến thiên gốc của đề',
  json: {
    version: 2,
    knots: ['-inf', -1, 0, 4, '+inf'],
    signs: ['-', '+', '-', '+'],
    derivativeAt: [null, 'zero', 'zero', 'zero', null]
  }
}

/** Câu 22 TN-1: y = x^3 - 3x + 2, cực đại (-1, 4), cực tiểu (1, 0). */
export const TN1_Q22_GRAPH = {
  source: 'TN-1 câu 22',
  purpose: 'đồ thị hàm số có công thức xác định',
  missing: 'không có',
  json: {
    version: 2,
    viewport: { x: [-3, 3], y: [-2, 6] },
    scale: 'free',
    curves: [
      { id: 'f', expr: 'x^3-3*x+2', domain: [{ from: -3, to: 3, closed: [true, true] }], breaks: [] }
    ],
    points: [
      { curve: 'f', x: -1, label: '', guides: true },
      { curve: 'f', x: 1, label: '', guides: true }
    ],
    asymptotes: []
  }
}

/** Câu 24 TN-1: y = (x^2+3)/(x+1), miền R\{-1}, cực đại (-3,-6), cực tiểu (1,2). */
export const TN1_Q24_GRAPH = {
  source: 'TN-1 câu 24',
  purpose: 'đồ thị hàm số phân thức có cực trị',
  missing: 'không có',
  json: {
    version: 2,
    viewport: { x: [-4, 4], y: [-8, 4] },
    scale: 'free',
    curves: [
      {
        id: 'f',
        expr: '(x^2+3)/(x+1)',
        domain: [{ from: -4, to: -1, closed: [true, false] }, { from: -1, to: 4, closed: [false, true] }],
        breaks: [-1]
      }
    ],
    points: [
      { curve: 'f', x: -3, label: '', guides: true },
      { curve: 'f', x: 1, label: '', guides: true }
    ],
    asymptotes: [{ axis: 'x', value: -1 }]
  }
}

/** Câu 58 TN-1: y = sqrt(4-x^2) trên [-2,2] — nửa đường tròn bán kính 2 (scale equal). */
export const TN1_Q58_GRAPH = {
  source: 'TN-1 câu 58',
  purpose: 'đồ thị hàm số căn thức (nửa đường tròn, cần scale bằng nhau)',
  missing: 'không có',
  json: {
    version: 2,
    viewport: { x: [-3, 3], y: [-1, 3] },
    scale: 'equal',
    curves: [
      { id: 'f', expr: 'sqrt(4-x^2)', domain: [{ from: -2, to: 2, closed: [true, true] }], breaks: [] }
    ],
    points: [{ curve: 'f', x: 0, label: '', guides: true }],
    asymptotes: []
  }
}

/** Câu 66 TN-1: f(x) = sin x + cos 2x trên [0, π] (GTLN = 9/8 tại sin x = 1/4). */
export const TN1_Q66_GRAPH = {
  source: 'TN-1 câu 66',
  purpose: 'đồ thị hàm lượng giác',
  missing: 'không có',
  json: {
    version: 2,
    viewport: { x: [0, 3.2], y: [-1, 1.5] },
    scale: 'free',
    curves: [
      { id: 'f', expr: 'sin(x)+cos(2*x)', domain: [{ from: 0, to: 3.14159265358979, closed: [true, true] }], breaks: [] }
    ],
    points: [],
    asymptotes: []
  }
}

/** Bảng dấu minh họa theo lời giải câu 9 TN-1 (dấu không đổi qua 0 ⇒ 0 không phải cực trị). */
export const TN1_Q9_SIGN_TABLE = {
  source: 'TN-1 câu 9',
  purpose: 'bảng dấu minh họa theo lời giải, KHÔNG khẳng định là hình gốc',
  missing: 'Ảnh gốc của câu 9 chưa được khôi phục',
  json: {
    version: 2,
    knots: ['-inf', -1, 0, 1, '+inf'],
    signs: ['+', '-', '-', '+'],
    derivativeAt: [null, 'zero', 'zero', 'zero', null]
  }
}

/* ------------------------------------------------------------------ *
 * Fixture 3D — dựng riêng, có oracle toán học
 * ------------------------------------------------------------------ */

/**
 * Hình chóp S.ABCD có đáy là hình vuông cạnh 3, SA vuông góc đáy, SA = 4.
 * Oracle: H = hình chiếu của A trên SB = (1.92, 0, 1.44); AH ⊥ SB.
 */
export const GEO3D_PYRAMID = {
  source: 'Fixture dựng riêng (không lấy từ TN-1)',
  purpose: 'hình không gian 3D thật — kiểm chứng bằng toạ độ',
  oracle: 'H = (1.92, 0, 1.44)',
  json: {
    version: 2,
    points: {
      A: [0, 0, 0], B: [3, 0, 0], C: [3, 3, 0], D: [0, 3, 0], S: [0, 0, 4]
    },
    constructions: [
      { id: 'M', op: 'mid', args: ['S', 'C'] },
      { id: 'H', op: 'projectLine', args: ['A', 'S', 'B'] }
    ],
    edges: [
      { ends: ['S', 'A'], style: 'solid' },
      { ends: ['S', 'B'], style: 'solid' },
      { ends: ['S', 'C'], style: 'solid' },
      { ends: ['S', 'D'], style: 'dashed' },
      { ends: ['A', 'B'], style: 'solid' },
      { ends: ['B', 'C'], style: 'solid' },
      { ends: ['C', 'D'], style: 'dashed' },
      { ends: ['D', 'A'], style: 'dashed' },
      { ends: ['A', 'H'], style: 'solid' }
    ],
    rightAngles: [['S', 'A', 'B'], ['A', 'H', 'B']],
    camera: { projection: 'orthographic', eye: [7, -10, 7], target: [1.5, 1.5, 2], up: [0, 0, 1] },
    visibility: 'manual',
    labels: { M: { offset: [8, -8] }, H: { offset: [-12, 8] } }
  }
}

/** Hình hộp chữ nhật 3×2×4 (dùng để kiểm tra chiếu trực giao & cạnh thủ công). */
export const GEO3D_BOX = {
  source: 'Fixture dựng riêng',
  purpose: 'hộp chữ nhật — kiểm tra chiếu trực giao giữ đúng tỷ lệ cạnh',
  oracle: 'cạnh AB = 3, BC = 2, AA\' = 4',
  json: {
    version: 2,
    points: {
      A: [0, 0, 0], B: [3, 0, 0], C: [3, 2, 0], D: [0, 2, 0],
      "A'": [0, 0, 4], "B'": [3, 0, 4], "C'": [3, 2, 4], "D'": [0, 2, 4]
    },
    constructions: [
      { id: 'G', op: 'centroid', args: ['A', 'B', 'C'] },
      { id: 'N', op: 'ratio', args: ['A', 'B', 0.25] }
    ],
    edges: [
      { ends: ['A', 'B'], style: 'solid' },
      { ends: ['B', 'C'], style: 'solid' },
      // Audit (GEO3D_VISIBILITY_SOLUTION.md §1): camera eye [8,-9,7] — mặt nhìn thấy
      // là mặt trên, mặt trước ABB'A', mặt phải BCC'B'; CD và DA nằm sau ⇒ dashed.
      { ends: ['C', 'D'], style: 'dashed' },
      { ends: ['D', 'A'], style: 'dashed' },
      { ends: ["A'", "B'"], style: 'solid' },
      { ends: ["B'", "C'"], style: 'solid' },
      { ends: ["C'", "D'"], style: 'solid' },
      // D'A' kề mặt trên (nhìn thấy) ⇒ solid; CC' kề mặt phải (nhìn thấy) ⇒ solid.
      { ends: ["D'", "A'"], style: 'solid' },
      { ends: ['A', "A'"], style: 'solid' },
      { ends: ['B', "B'"], style: 'solid' },
      { ends: ['C', "C'"], style: 'solid' },
      { ends: ['D', "D'"], style: 'dashed' }
    ],
    rightAngles: [['A', 'B', 'C']],
    camera: { projection: 'orthographic', eye: [8, -9, 7], target: [1.5, 1, 2], up: [0, 0, 1] },
    visibility: 'manual',
    labels: { G: { offset: [6, 6] }, N: { offset: [4, -18] } }
  }
}

/**
 * Chóp S.ABCD khai báo faces và đường phụ, dùng visibility:"auto".
 * P1: schema + renderer tự phân loại cạnh theo faces/camera; đường phụ có depth test.
 * Đáy ABCD theo thứ tự A→B→C→D (khi nhìn từ dưới lên là ngược chiều kim, hợp lệ lồi).
 */
export const GEO3D_PYRAMID_AUTO = {
  source: 'Fixture dựng riêng (GEO3D_VISIBILITY_SOLUTION.md §2)',
  purpose: 'schema P0: faces + visibility auto + kind auxiliary — validate, chưa render',
  oracle: 'faces gồm 4 mặt bên + đáy; đường phụ AH, AC có kind:"auxiliary"',
  json: {
    version: 2,
    points: {
      A: [0, 0, 0], B: [3, 0, 0], C: [3, 3, 0], D: [0, 3, 0], S: [0, 0, 4]
    },
    constructions: [
      { id: 'O', op: 'mid', args: ['A', 'C'] },
      { id: 'H', op: 'projectLine', args: ['A', 'S', 'B'] }
    ],
    faces: [
      { id: 'SAB', vertices: ['S', 'A', 'B'] },
      { id: 'SBC', vertices: ['S', 'B', 'C'] },
      { id: 'SCD', vertices: ['S', 'C', 'D'] },
      { id: 'SDA', vertices: ['S', 'D', 'A'] },
      { id: 'ABCD', vertices: ['A', 'B', 'C', 'D'] }
    ],
    edges: [
      { ends: ['S', 'A'] }, { ends: ['S', 'B'] }, { ends: ['S', 'C'] },
      { ends: ['S', 'D'] }, { ends: ['A', 'B'] }, { ends: ['B', 'C'] },
      { ends: ['C', 'D'] }, { ends: ['D', 'A'] },
      { ends: ['A', 'H'], kind: 'auxiliary' },
      { ends: ['A', 'C'], kind: 'auxiliary', style: 'dashed' }
    ],
    camera: { projection: 'orthographic', eye: [7, -10, 7], target: [1.5, 1.5, 2], up: [0, 0, 1] },
    visibility: 'auto'
  }
}

/** Ví dụ đồ thị có lỗ thủng: (x^2-1)/(x-1) — lỗ thủng tại x = 1. */
export const GRAPH_HOLE = {
  source: 'Fixture toán học',
  purpose: 'lỗ thủng — không rút gọn mất điểm không xác định',
  json: {
    version: 2,
    viewport: { x: [-3, 3], y: [-4, 6] },
    scale: 'free',
    curves: [
      {
        id: 'f',
        expr: '(x^2-1)/(x-1)',
        domain: [{ from: -3, to: 3, closed: [true, true] }],
        breaks: [1]
      }
    ],
    points: [{ x: 1, y: 2, label: '', guides: false, marker: 'open' }],
    asymptotes: []
  }
}
