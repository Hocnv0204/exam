// Danh mục lộ trình hiển thị ở trang Mochi. Thêm môn mới: tạo file dữ liệu theo
// utils/roadmap-schema.js rồi khai báo ở đây (route phải có trong app.js).
import { ROADMAP_DATA, ENTRANCE_TEST_HOMEWORK_ID } from '../../components/roadmap.js'
import { ROADMAP_11_DATA } from '../../components/roadmap-11.js'
import { fromHoa12, fromHoa11 } from '../../utils/roadmap-schema.js'
import { ROADMAP_MATH_12 } from './math-12.js'
import { ROADMAP_MATH_11 } from './math-11.js'

const hoa12 = fromHoa12(ROADMAP_DATA, { entranceHomeworkId: ENTRANCE_TEST_HOMEWORK_ID })
// Hóa 11 không có đề riêng: dùng chung cấu trúc 3 phần của đề Hóa để giải thích nhãn I/II/III.
const hoa11 = fromHoa11(ROADMAP_11_DATA, { exam: hoa12.exam })
// Toán 11 tương tự: mượn cấu trúc đề Toán (Toán 12) nếu dữ liệu không tự khai báo.
const toan11 = ROADMAP_MATH_11.exam ? ROADMAP_MATH_11 : { ...ROADMAP_MATH_11, exam: ROADMAP_MATH_12.exam }

export const ROADMAP_SUBJECTS = [
  { id: 'hoa-12', route: 'roadmap', label: 'Hóa 12', tagline: 'Bứt phá 8+ trong 90 ngày', icon: 'fa-flask', data: hoa12 },
  { id: 'toan-12', route: 'roadmap-math-12', label: 'Toán 12', tagline: 'Bứt phá 8+ trong 90 ngày', icon: 'fa-square-root-variable', data: ROADMAP_MATH_12 },
  { id: 'hoa-11', route: 'roadmap-11', label: 'Hóa 11', tagline: 'Chuẩn KNTT 35 tuần', icon: 'fa-vial', data: hoa11 },
  { id: 'toan-11', route: 'roadmap-math-11', label: 'Toán 11', tagline: 'Chuẩn KNTT 35 tuần', icon: 'fa-shapes', data: toan11 }
]

// Route cũ #roadmap-12 vẫn là Hóa 12.
const ROUTE_ALIASES = { 'roadmap-12': 'roadmap' }

export const ROADMAP_ROUTES = ['roadmap', 'roadmap-12', 'roadmap-11', 'roadmap-math-12', 'roadmap-math-11']

export function getRoadmapSubjectByRoute(route) {
  const key = ROUTE_ALIASES[route] || route
  return ROADMAP_SUBJECTS.find(s => s.route === key) || ROADMAP_SUBJECTS[0]
}
