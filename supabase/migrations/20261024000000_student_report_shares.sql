-- Chia sẻ công khai báo cáo tiến bộ học sinh (gia sư tạo link, phụ huynh mở không cần đăng nhập).
--
-- Bảo mật:
-- - Không lưu raw token. Cột token_secret_hash chỉ lưu SHA-256 (hex) của PHẦN SECRET
--   trong token `<share_id>.<secret>`; raw token chỉ trả về đúng một lần ở response POST create.
-- - Edge Function dùng service role để đọc/ghi. RLS bật nhưng KHÔNG tạo policy:
--   anon/authenticated bị chặn hoàn toàn, không có đường truy cập public qua PostgREST.
-- - Thu hồi là soft revoke (revoked_at), không hard-delete, để giữ audit.
--
-- Ngày from_date/to_date là DATE theo lịch (inclusive). Edge Function tự kiểm tra
-- ngày hợp lệ và from_date <= to_date trước khi insert; check dưới đây là lớp phòng thủ cuối.

create table if not exists public.student_report_shares (
  id                 uuid primary key default gen_random_uuid(),
  token_secret_hash  text not null,
  student_id         uuid not null references public.profiles(id) on delete cascade,
  class_id           uuid not null references public.classes(id) on delete cascade,
  from_date          date not null,
  to_date            date not null,
  created_by         uuid not null references public.profiles(id) on delete cascade,
  expires_at         timestamptz not null default (now() + interval '30 days'),
  revoked_at         timestamptz,
  created_at         timestamptz not null default now(),
  constraint student_report_shares_token_hash_sha256
    check (token_secret_hash ~ '^[0-9a-f]{64}$'),
  constraint student_report_shares_period_valid
    check (from_date <= to_date),
  constraint student_report_shares_expiry_after_creation
    check (expires_at > created_at)
);

-- Mỗi secret 256-bit là duy nhất trên thực tế; unique index biến va chạm (nếu có)
-- thành lỗi insert thay vì hai share dùng chung hash.
create unique index if not exists student_report_shares_token_hash_key
  on public.student_report_shares (token_secret_hash);

-- Truy vấn quản lý theo học sinh/lớp (danh sách mới nhất trước).
create index if not exists student_report_shares_student_class_created_idx
  on public.student_report_shares (student_id, class_id, created_at desc);

-- Hỗ trợ lọc/theo dõi share theo người tạo và thời hạn.
create index if not exists student_report_shares_created_by_idx
  on public.student_report_shares (created_by);
create index if not exists student_report_shares_expires_at_idx
  on public.student_report_shares (expires_at);

alter table public.student_report_shares enable row level security;

-- Không policy nào cho anon/authenticated: chỉ service role (Edge Function) truy cập.
revoke all on table public.student_report_shares from anon, authenticated;
grant all on table public.student_report_shares to service_role;

comment on table public.student_report_shares is
  'Link công khai báo cáo tiến bộ (soft revoke). Chỉ lưu SHA-256 của secret, không lưu raw token.';
comment on column public.student_report_shares.token_secret_hash is
  'SHA-256 hex của secret trong token <share_id>.<secret>; raw token không bao giờ được lưu.';
comment on column public.student_report_shares.expires_at is
  'Thời điểm hết hạn (UTC). Mặc định API là 30 ngày, giới hạn 1..90 ngày.';
