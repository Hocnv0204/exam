# Tasks 003 — Công thức cấu tạo Hóa học

Đánh dấu `[x]` chỉ sau khi Claude review & verify.

- [x] T1 [ChatGPT gpt-5.6-terra] `chem-ctct.js` + `test-chem-ctct.mjs`
- [x] T2 [Claude] `chem-smiles.js` + `test-chem-smiles.mjs`
- [x] T3 [Claude] Nối dây renderer/fence/parser/print, bỏ CDN, thêm dependency, đăng ký test
- [x] T4 [Gemini gemini-3.8-flash-high] `docs/MD_QUY_CHUAN_VE_CTCT.md` + cập nhật `docs/MD_QUY_CHUAN_SOAN_DE.md`
- [-] T5 [Gemini, chỉ đọc] Review T1 — bỏ: không thuộc nhóm rủi ro cao (chỉ hiển thị, không tiền/bài thi/DB); Claude tự review + chạy lại test + render 14 ca
- [x] T6 [Claude] `npm test`, `npm run build`, chụp headless Sáng/Tối 360/1440, bản in

## Ghi chú verify (Claude)
- T1: sửa thêm ngoặc polime bao cả nhánh rộng (C6H5 không đè chỉ số n).
- T2: thêm kiểm tra số đóng vòng lẻ (SmilesDrawer bỏ qua `C1CC`).
- T4: sửa ví dụ "sai" DANGLING_BOND (bản đầu thực ra vẽ được); chạy toàn bộ khối ví dụ trong 2 tài liệu qua renderer thật: ví dụ đúng → OK, ví dụ sai → đúng mã lỗi.
- T6: `npm test` (trừ test-diagrams lỗi sẵn do tài liệu dời sang docs/), `npm run build` xanh; headless app thật (#create-homework, preview) Sáng 1440 / Tối 360: 4 SVG, không lỗi JS, không tràn ngang.
