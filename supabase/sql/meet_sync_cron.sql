-- Cron meet-sync chạy cố định 2h00 sáng hàng ngày (chỉ chạy khi lên Cloud).
-- Yêu cầu extension pg_cron + pg_net và Vault (có sẵn trên Supabase Cloud).
-- Thay <PROJECT_REF> bằng ref project của bạn, sau đó chạy toàn bộ file này
-- một lần trong SQL Editor (role postgres).

-- 1. Lưu secret bảo vệ webhook (chỉ cần tạo 1 lần, thay chuỗi ngẫu nhiên của bạn)
select vault.create_secret('thay-chuoi-ngau-nhien-cron-secret-cua-ban', 'meet_cron_secret');

-- 2. Nếu đã schedule job cũ thì xóa trước để tránh trùng (chạy lại an toàn)
select cron.unschedule('meet-sync-job') where exists (
  select 1 from cron.job where jobname = 'meet-sync-job'
);
select cron.unschedule('meet-sync-retry-1') where exists (
  select 1 from cron.job where jobname = 'meet-sync-retry-1'
);
select cron.unschedule('meet-sync-retry-2') where exists (
  select 1 from cron.job where jobname = 'meet-sync-retry-2'
);

-- 3. Lập lịch gọi Edge Function meet-sync: lượt chính 2h00 + 2 lượt vét
-- 2h20, 2h40 để thử lại nếu lượt trước lỗi (session READY tự loại khỏi
-- hàng đợi nên chạy lại vô hại). Múi giờ DB, mặc định UTC -> lưu ý đổi nếu cần.
select cron.schedule(
  'meet-sync-job',
  '0 2 * * *', -- lượt chính 2h00
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/meet-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'meet_cron_secret')
    )
  );
  $$
);

select cron.schedule(
  'meet-sync-retry-1',
  '20 2 * * *', -- vét lần 1 lúc 2h20
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/meet-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'meet_cron_secret')
    )
  );
  $$
);

select cron.schedule(
  'meet-sync-retry-2',
  '40 2 * * *', -- vét lần 2 lúc 2h40
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/meet-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'meet_cron_secret')
    )
  );
  $$
);
