/**
 * homework-pdf-policy.js — Quy tắc hiển thị / tải PDF của bài tập.
 *
 * Nghiệp vụ: học sinh (STUDENT) tuyệt đối không được thấy link hoặc nút tải
 * PDF của BÀI THI (EXAM), kể cả bài đã gắn PDF. Các loại khác
 * (PRACTICE / ASSIGNMENT / QUIZ) và giáo viên / admin giữ nguyên hành vi.
 *
 * Dùng chung cho mọi view học sinh (danh sách, thẻ lớp, solver, xem trước,
 * chi tiết lớp, xem kết quả) để khỏi mỗi chỗ tự định nghĩa một kiểu.
 * Backend (create-homework, homework-detail) áp dụng cùng quy tắc khi trả
 * metadata PDF — không chỉ ẩn UI.
 *
 * Không import gì thêm để test node có thể import trực tiếp file này.
 */

/** Bài tập có phải loại BÀI THI không. Dữ liệu cũ thiếu type => coi là PRACTICE. */
export function isExamHomework(homework) {
  return (homework?.type || 'PRACTICE') === 'EXAM'
}

/**
 * Người xem có được thấy link / nút tải PDF của bài này không?
 * @param {string|undefined} role - vai trò người xem (STUDENT / TEACHER / ADMIN / undefined khách vãng lai)
 * @param {{ type?: string }|null|undefined} homework - bài tập (chỉ cần trường type)
 * @returns {boolean} false = ẩn hoàn toàn link/nút PDF; true = giữ nguyên hành vi.
 */
export function canViewHomeworkPdf(role, homework) {
  if (role === 'STUDENT' && isExamHomework(homework)) return false
  return true
}
