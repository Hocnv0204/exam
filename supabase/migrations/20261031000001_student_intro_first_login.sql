-- Migration: cờ một lần cho tour giới thiệu học sinh (chỉ lần đăng nhập đầu tiên).
--
-- Vì sao cần cờ server thay vì seen_tours / localStorage:
-- - seen_tours rỗng KHÔNG chứng minh tài khoản mới: tài khoản cũ có thể chưa từng
--   mở tour (hoặc tour đã bị reset) nên mảng vẫn rỗng.
-- - localStorage chỉ đúng trên một trình duyệt/máy, không đúng khi đổi thiết bị.
--
-- auto_intro_pending = true: học sinh còn lượt tự mở tour giới thiệu dashboard.
-- Login Edge Function sẽ tiêu thụ cờ này atomically (UPDATE ... WHERE true)
-- ngay sau khi xác thực thành công và chỉ với role STUDENT.
--
-- Thứ tự triển khai: chạy migration này TRƯỚC khi deploy function login,
-- vì function select/update cột auto_intro_pending.

alter table public.profiles
  add column if not exists auto_intro_pending boolean not null default true;

comment on column public.profiles.auto_intro_pending is
  'Cờ một lần: true = còn lượt tự mở tour giới thiệu dashboard ở lần đăng nhập đầu tiên (chỉ STUDENT).';

-- Backfill: mọi tài khoản đã từng đăng nhập phải là false, kể cả khi seen_tours rỗng.
-- Bằng chứng "đã từng đăng nhập" lấy từ auth.users.last_sign_in_at, log LOGIN,
-- hoặc đã có tour được đánh dấu. Tài khoản chưa từng đăng nhập giữ true.
update public.profiles p
set auto_intro_pending = false
where p.auto_intro_pending = true
  and (
    coalesce(cardinality(p.seen_tours), 0) > 0
    or exists (
      select 1
      from public.user_activity_logs l
      where l.user_id = p.id
        and l.action = 'LOGIN'
    )
    or exists (
      select 1
      from auth.users u
      where u.id = p.id
        and u.last_sign_in_at is not null
    )
  );
