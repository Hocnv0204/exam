// Re-export dùng chung cho các Meet functions.
// Spec (meet.md §2.2) yêu cầu handle CORS qua `_shared/cors.ts`,
// triển khai thực tế trỏ về helper chuẩn của repo để giữ 1 hành vi duy nhất.
export {
  corsHeaders,
  handleCors,
  jsonResponse,
  errorResponse,
} from '../../shared/response-helper.ts'
