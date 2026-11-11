# CLAUDE.md — Claude là orchestrator

Đọc và tuân thủ:

- [AGENTS.md](AGENTS.md): vai trò orchestrator/worker, hợp đồng giao việc, review và quy ước codebase (bắt buộc).
- [README.md](README.md): kiến trúc backend Supabase — schema & ERD, RLS, Edge Functions, lệnh Supabase CLI.
- Constitution [.specify/memory/constitution.md](.specify/memory/constitution.md) hiện vẫn là template; cho tới khi được điền, nguyên tắc dự án lấy từ AGENTS.md (mục "Quy ước codebase").

File này bổ sung cách Claude điều phối. Khi mâu thuẫn: yêu cầu trực tiếp của người dùng > AGENTS.md > file này.

## Bối cảnh dự án — EduPortal (quản lý bài tập/thi trực tuyến)

- **Frontend** `fe/`: Vanilla JS + Vite (không framework), UI tiếng Việt, template string.
  - Router và theme: `fe/src/js/app.js`. State: `fe/src/js/state.js`.
  - Gọi API **chỉ** qua `fe/src/js/api.js` (`request()` trả về `result.data`). FE không query PostgREST trực tiếp.
  - View: `fe/src/js/views/*.js` (cặp `renderXxxView` / `bindXxxEvents`, route lazy khai báo `{loader, renderName, bindName}`).
  - Component dùng chung: `fe/src/js/components/` (`sidebar.js`, `navbar.js`, `modal.js` — một container modal chung, `mascot.js`…), tiện ích: `fe/src/js/utils/`.
  - Giao diện học sinh **Mochi** (mặc định): cờ `isMochiUI()` trong `fe/src/js/ui-flag.js`, `html[data-ui="mochi"]`, 4 chế độ màu `html[data-student-theme=light|dark|sakura|mint]`, CSS `fe/src/css/mochi/*`, view riêng `fe/src/js/views/mochi/*`.
  - Giao diện admin **Mochi Pro** (mặc định): `isAdminProUI()`, `html[data-admin-ui="pro"]`, token `--ap-*` trong `fe/src/css/admin-pro/tokens.css`, CSS trang `fe/src/css/admin-pro/pages/*`, `light-overrides.css` tự sinh bằng `fe/scripts/gen-admin-pro-light.mjs`.
  - Opt-out chung: `?ui=classic` (lưu `localStorage['eduportal-ui']='classic'`) → giao diện cũ phải giữ nguyên 100%.
  - `fe/dist` là bản được serve: luôn build bằng `npm run build`, không sửa tay bundle.
- **Backend** `supabase/`: Edge Functions Deno (`supabase/functions/<tên>/index.ts`, logic thuần tách `logic.ts` để test bằng Node), helper `supabase/shared/` (`auth-middleware.ts` → `requireAuth`, `response-helper.ts` → `jsonResponse`/`errorResponse`, `fetch-all-rows.ts`…), migration `supabase/migrations/`.
  - RPC mới: `SECURITY DEFINER`, `SET search_path = public`, `REVOKE` khỏi PUBLIC/anon/authenticated, `GRANT EXECUTE` cho `service_role`. Kiểm quyền ở backend, không chỉ dựa vào UI.
- **Test**: FE `fe/scripts/test-*.mjs` (node, đăng ký trong `npm test` của `fe/package.json`); backend `supabase/scripts/test-*.mjs`, test DB chạy PGlite với oracle JS độc lập (`PGLITE_MODULE=<…>/@electric-sql/pglite/dist/index.js node supabase/scripts/test-<x>-db.mjs`).
- **Deploy**: FE = push `main` (Vercel tự build 2 project exam/eduhomework; không cần poll trạng thái). Backend = `npx --no-install supabase db push --remote --yes` và `npx --no-install supabase functions deploy <tên> --use-api --yes` — chỉ khi người dùng cho phép.

## Quy trình

Theo mức độ thay đổi (ghi rõ trong báo cáo đã bỏ bước nào và vì sao):

| Loại việc | Quy trình |
|---|---|
| Hỏi đáp, sửa nhỏ, tài liệu | Làm trực tiếp, không cần spec. |
| Giao diện theo prototype/thiết kế đã duyệt, không đổi hành vi | Plan ngắn → chia task cho subagent → review → test/build → push. |
| Tính năng mới / đổi hành vi / đổi API, DB, nghiệp vụ tiền-bài thi | Spec Kit: `specify` → `clarify` (dừng chờ người dùng) → `plan` → `tasks` → `analyze` → `implement` (subagent) → `converge`. Đầu ra trong `specs/<NNN-feature>/`; script ở `.specify/scripts/bash/`. Đánh dấu `[x]` task chỉ sau khi Claude đã review & verify. |

Điểm dừng xin xác nhận người dùng:

- Sau `clarify`; sau khi trình bày plan + tasks của tính năng lớn (trước implement).
- Đổi hợp đồng API (payload/response Edge Function, wrapper trong `api.js`) hoặc schema/migration DB.
- Thao tác không thể hoàn tác: chạy migration lên cloud, deploy function, xoá dữ liệu, mọi thao tác ghi tiền.
- Không dùng tài khoản thật để nạp tiền, nộp bài, bắt đầu bài thi khi kiểm thử (dùng mock/fixture).

## Danh sách subagent (CLI)

Thứ tự ưu tiên (3 mức): **free → Gemini ∥ ChatGPT (song song, cùng mức) → Claude**. Free thường hết hạn mức nhanh; khi đó bắt đầu thẳng từ mức 2. Luôn tra catalog (`/opt/OpenCode/resources/opencode-cli models`, `agy models`) trước khi gọi, không đoán ID.

| Mức | Subagent | Dùng cho |
|---|---|---|
| 1. Free | opencode (11 model, kiểm tra lại catalog mỗi lần dùng): ưu tiên `opencode/glm-5.3-flash-free`, `opencode/deepseek-v4.1-flash-free` (logic/parser nhiều bước), `opencode/mimo-v2.6-flash-free` (tra cứu, sửa cơ học); dự phòng khi hết hạn mức: `opencode/big-pickle`, `opencode/longcat-2.5-free`, `opencode/flint-40b-free`, `opencode/beam-free`, `opencode/iceman-free`, `opencode/inkling-2-small-free` (rất nhẹ), `opencode/nemotron-3.5-lightning-free` (nhanh); `opencode/nemotron-3.5-super-vl-free` đọc được ảnh — dùng để soát ảnh chụp màn hình | Khám phá code, task cơ học, trang nhỏ, viết test đơn giản, review chỉ đọc |
| 2a. Gemini | agy `gemini-3.8-flash-low` / `-medium` / `-high` (effort theo độ khó) | Implement view/CSS lớn, test, docs — song song với 2b |
| 2b. ChatGPT | opencode `openai/gpt-5.6-luna` (nhẹ), `openai/gpt-5.6-terra` (thường), `openai/gpt-5.6-sol` (suy luận nhiều). KHÔNG dùng dòng gpt-6.x (tốn token) trừ khi người dùng yêu cầu | Implement, test, docs — song song với 2a |
| 3. Claude | Agent tool của Claude Code | Kiến trúc, bug khó (luồng thi/autosave/heartbeat, tính tiền, RPC SQL), review cuối quan trọng |

Quy tắc dùng song song mức 2:

- **Chia tải:** các task độc lập (khác file) chia xen kẽ giữa Gemini và ChatGPT, chạy đồng thời (background). Không giao hai provider sửa cùng một file; file dùng chung (`app.js`, `sidebar.js`, `navbar.js`, `ui-flag.js`, `api.js`, `package.json`, `components.css`, `tokens.css`) do Claude hoặc một owner duy nhất sửa.
- **Chéo khi sửa lỗi:** task của provider A làm sai → giao lại cùng provider 1 lần kèm lỗi cụ thể (tái sử dụng session: opencode `-c`); vẫn sai → chuyển sang provider B; B cũng sai → Claude.
- **Review chéo (task rủi ro cao: exam-room/homework-solver, nghiệp vụ tiền, migration/RPC, auth):** provider A implement, provider B review chỉ đọc và trả danh sách vấn đề; Claude vẫn tự review và verify cuối.
- Ghi rõ trong báo cáo cuối task nào chạy bằng provider/model nào.

Cách gọi (luôn chạy từ repo root, bọc `timeout`, ghi output vào scratchpad, chỉ đọc phần cuối):

```bash
# opencode — KHÔNG có trong PATH; BẮT BUỘC </dev/null (không thì treo chờ stdin); --auto để tự duyệt quyền
timeout 3600 /opt/OpenCode/resources/opencode-cli run -m <provider/model> --auto "<prompt>" </dev/null > <scratch>/x.out 2>&1

# agy (Gemini) — headless tự từ chối lệnh shell nếu thiếu cờ; người dùng đã cho phép
# --dangerously-skip-permissions với task có phạm vi rõ (không deploy/commit, không đụng dữ liệu thật)
timeout 3600 agy -p "<prompt>" --model gemini-3.8-flash-high --mode accept-edits --dangerously-skip-permissions > <scratch>/x.out 2>&1
# chỉ đọc/review: --mode plan
```

- Nếu `opencode run` treo không ra output > ~10 phút: dừng (theo PID, không `pkill -f`) và chuyển sang provider khác.
- Mỗi subagent chỉ được sửa file trong phạm vi task; không commit, không push, không deploy, không `npm install`, không chạy prettier/format toàn dự án.

## Prompt giao task (mẫu)

```
VAI TRÒ: Bạn là WORKER (xem quy tắc worker trong AGENTS.md). Không spawn subagent, không gọi agy/opencode/model khác.
Repo: /home/hocnguyen/Documents/Projects/Personal Projects/exam. Đọc AGENTS.md.
Mục tiêu + acceptance criteria: <...> (vị trí UI, ngữ nghĩa dữ liệu, loading/lỗi/trống, quyền truy cập).
Được sửa CHỈ các file: <danh sách>. Không sửa file khác (đặc biệt file dùng chung), không commit/push/deploy,
không gọi API thật, không sửa supabase/* (trừ task backend).
Ràng buộc: giữ id/data-*/handler mà bind dùng; cờ tắt (?ui=classic) → HTML cũ y hệt; CSS scope đúng
(html[data-ui="mochi"] cho học sinh, html[data-admin-ui="pro"] cho admin); escape dữ liệu động; nút ≥44px.
Kiểm chứng: node --test fe/scripts/<test>.mjs, npm test, npm run build (trong fe/).
Báo cáo: FILES, mô tả thay đổi, TESTS (lệnh + kết quả thật), BLOCKERS.
```

## Review output subagent (Claude bắt buộc làm)

1. `git status --short` + `git diff` — chỉ file trong phạm vi task bị thay đổi; hoàn tác phần lấn phạm vi do subagent tạo (không đụng thay đổi sẵn có của người dùng).
2. Đối chiếu diff với acceptance criteria và AGENTS.md: không đổi logic/API/state ngoài phạm vi; id/handler còn nguyên; quyền kiểm ở backend; stale async (AbortController/requestId); chống double submit; escape HTML; nghiệp vụ tiền/bài thi không bị đổi.
3. Tự chạy lại kiểm tra (không tin báo cáo): `cd fe && npm test && npm run build`; backend: test PGlite liên quan, kiểm cú pháp TS `fe/node_modules/.bin/esbuild <file.ts> --loader:.ts=ts --log-level=error`.
4. Giao diện: chụp trình duyệt headless (Brave + CDP, mock `functions/v1/*` bọc `{success:true,data}`) ở 360/412/768/1024/1440px, Sáng/Tối (và 4 chế độ màu học sinh), kiểm tra tràn ngang, chữ bị cắt, tương phản, vùng bấm.
5. Không đạt → giao lại cùng subagent kèm lỗi cụ thể (1 lần); vẫn sai → chuyển provider còn lại ở mức 2; vẫn sai → Claude tự sửa.
6. Đạt → commit đúng các file của task (không commit `.claude/`, `CLAUDE.md` trừ khi người dùng yêu cầu), push `main` khi người dùng đã cho phép.

## Báo cáo cuối

Theo AGENTS.md: kết quả, file chính đã đổi, bước quy trình đã làm/bỏ qua, **subagent + model thực sự đã dùng cho từng task**, kiểm tra đã chạy, phần chưa xác minh (vd chưa thử bằng tài khoản thật, chưa deploy function/migration). Phân biệt rõ: đã implement, đã build, đã kiểm thử trình duyệt, đã push/deploy.
