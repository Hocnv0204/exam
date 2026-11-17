# Plan 003 — Công thức cấu tạo Hóa học

## Kiến trúc

```
fence.js (thêm 'ctct')  ──►  diagram-renderer.js
                               ├─ ctct   → diagrams/chem-ctct.js   renderCtct(code) → {ok, svg, diagnostics}
                               └─ smiles → diagrams/chem-smiles.js renderSmiles(code) → {ok, svg, diagnostics}
                                              └─ smiles-drawer/src/Parser + DrawerBase (chỉ toạ độ)
```

- Hai module thuần (không DOM), test được bằng Node; trả cấu trúc giống `compileDiagram` để dùng chung `renderErrorBlock` và `validateDiagramsInText`.
- Diagnostic: `{ severity:'error', code, field:null, line, message }` (line tính theo dòng trong file đề = dòng mở fence + dòng trong khối).
- Bọc SVG: `<div class="diagram-wrap chem-wrap" ...><svg class="chem-svg" ... data-smiles|data-ctct>` với `stroke/fill="currentColor"`, `max-width:100%;height:auto`.
- Bỏ thẻ `<script>` SmilesDrawer CDN ở `fe/index.html`; thêm `smiles-drawer@2.0.1` vào `fe/package.json` dependencies.
- `exam-parser.js`: regex fence nội bộ thêm `ctct`; `exam-print.js`: bỏ chờ setTimeout cho SMILES (giữ nhịp chờ cũ cũng được, vô hại).

## Thuật toán smiles (từ bản thử đã duyệt)

1. Tách dòng SMILES + tuỳ chọn; đếm `*`.
2. `Parser.parse` → `DrawerBase.initDraw/processGraph` → toạ độ đỉnh, cạnh (bondType `-`,`=`,`#`), vòng (SSSR).
3. Polime: xoay để 2 nguyên tử nối với `*` nằm ngang; nếu phần thân ở trên thì lật; `condensed` → mạch chính ngang, nhánh xoay dựng xuống; ngoặc dựng đứng bao thân, nét đầu mạch xuyên ngoặc, chỉ số ở góc dưới phải.
4. Nhãn: dị tố/ C ngoài vòng (condensed) + số H ngầm định theo hoá trị; đảo `HO`/`H2N` khi liên kết ở bên phải; điện tích từ nguyên tử ngoặc vuông.
5. Nét: đơn/đôi/ba; đôi trong vòng vẽ nét phụ phía trong; vòng thơm vẽ vòng tròn; rút ngắn nét theo bề rộng nhãn.

## Phân công (CLAUDE.md)

| Task | Provider | File |
|---|---|---|
| T1 chem-ctct.js + test | ChatGPT `openai/gpt-5.6-terra` | `fe/src/js/utils/diagrams/chem-ctct.js`, `fe/scripts/test-chem-ctct.mjs` |
| T2 chem-smiles.js + test | Claude (thuật toán toạ độ/hình học, bản thử do Claude viết) | `fe/src/js/utils/diagrams/chem-smiles.js`, `fe/scripts/test-chem-smiles.mjs` |
| T3 nối dây (file dùng chung) | Claude | `diagram-renderer.js`, `fence.js`, `exam-parser.js`, `exam-print.js`, `index.html`, `package.json` |
| T4 tài liệu | Gemini `gemini-3.8-flash-high` | `docs/MD_QUY_CHUAN_VE_CTCT.md`, `docs/MD_QUY_CHUAN_SOAN_DE.md` |
| T5 review chéo T1 | Gemini (chỉ đọc) | — |
| T6 verify cuối | Claude | test, build, trình duyệt headless |
