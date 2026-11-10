# Tasks 001 — Exam focus shield

Đánh dấu `[x]` chỉ sau khi Claude đã review và verify.

| ID | Task | File | Worker | Phụ thuộc |
|---|---|---|---|---|
| T1 | Module logic `createFocusShield` + test Node `test-exam-focus-shield.mjs` (đăng ký `npm test` — Claude sửa `package.json`) | `fe/src/js/utils/exam-focus-shield.js`, `fe/scripts/test-exam-focus-shield.mjs` | Gemini medium | — |
| T2 | Component banner + CSS hoạt hoạ (Mochi 4 theme + classic, reduced-motion, print) | `fe/src/js/components/exam-focus-shield.js`, `fe/src/css/exam-focus-shield.css` | ChatGPT gpt-5.6-terra (song song T1) | — |
| T3 | Phòng thi: thay cơ chế vi phạm bằng màn che (Mochi + classic), sửa popup hướng dẫn, dọn `pendingLogKey` | `fe/src/js/views/exam-room.js` | Gemini high | T1, T2 |
| T4 | Nhánh EXAM của solver: cùng thay thế | `fe/src/js/views/homework-solver.js` | Gemini medium (sau T3, cùng pattern) | T1, T2 |
| T5 | Ẩn ô "Giới hạn vi phạm", giữ input hidden + payload | `components/homework-config-fields.js`, `views/create-hw.js`, `components/assign-homework-modal.js`, `views/homework-mgmt.js`, `views/exam-proctoring.js` | ChatGPT gpt-5.6-terra (song song T3) | — |
| T6 | Review chéo chỉ đọc T3/T4 (luồng thi rủi ro cao) | — | ChatGPT gpt-5.6-sol | T3, T4 |
| T7 | Claude: review diff, `npm test`, `npm run build`, chụp headless (360/768/1440, 4 theme + classic, sự kiện blur/hidden, đếm request exam-log), commit + push | — | Claude | T1–T6 |

## Checklist

- [x] T1
- [x] T2
- [x] T3
- [x] T4
- [x] T5
- [x] T6
- [x] T7

## Ghi chú review (2026-11-10)

- T4: hoàn tác 3 thay đổi ngoài phạm vi do worker thêm (chặn paste, điều kiện beforeunload, chặn điều hướng sau nộp).
- T3: bỏ `examLocked = true` thêm vào `handleSessionOverridden` (ngoài phạm vi; `cleanupExamEngine` đã detach shield).
- T6 (gpt-5.6-sol) phát hiện: mất focus trước khi bài thi active bị bỏ sót. Sửa: hỏi `document.hasFocus()` một lần lúc chuyển sang
  active; mở che khi `focus` hoặc khi học sinh chạm/bấm phím trên trang (chống kẹt ở webview báo `hasFocus()` sai).
