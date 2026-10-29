-- Cài lịch Meet cho project fpeqddxhhsngntybyson. Chạy bằng role postgres
-- SAU KHI đã bật pg_cron + pg_net và tạo Vault secret meet_cron_secret.
-- Giá trị Vault secret phải khớp Edge Function secret CRON_SECRET; không lưu
-- giá trị secret trong file SQL/repository. Không chạy file này ở project khác.
-- pg_cron chạy theo UTC: 19:00 UTC = 02:00 sáng hôm sau tại Việt Nam.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION 'Enable pg_cron and pg_net before scheduling meet-sync';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'meet_cron_secret') THEN
    RAISE EXCEPTION 'Create Vault secret meet_cron_secret before scheduling meet-sync';
  END IF;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN
    ('meet-sync-job', 'meet-sync-retry-1', 'meet-sync-retry-2');
END $$;

SELECT cron.schedule(
  'meet-sync-job', '0 19 * * *',
  $job$
    SELECT net.http_post(
      url := 'https://fpeqddxhhsngntybyson.supabase.co/functions/v1/meet-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'meet_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $job$
);

SELECT cron.schedule(
  'meet-sync-retry-1', '20 19 * * *',
  $job$
    SELECT net.http_post(
      url := 'https://fpeqddxhhsngntybyson.supabase.co/functions/v1/meet-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'meet_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $job$
);

SELECT cron.schedule(
  'meet-sync-retry-2', '40 19 * * *',
  $job$
    SELECT net.http_post(
      url := 'https://fpeqddxhhsngntybyson.supabase.co/functions/v1/meet-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'meet_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $job$
);
