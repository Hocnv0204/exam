-- =========================================================
-- MIGRATION: 20260801000003_role_grants.sql
-- DESCRIPTION: Grant proper permissions to anon, authenticated, 
-- and service_role PostgreSQL roles so Edge Functions and
-- RLS policies work correctly.
-- =========================================================

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Service role: full access to all tables (bypasses RLS via BYPASSRLS or explicit grants)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

-- Authenticated users: CRUD on public tables (RLS policies restrict access further)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Anonymous users: read-only to nothing by default (RLS will further restrict)
GRANT USAGE ON SCHEMA public TO anon;

-- Give service_role the BYPASSRLS attribute so it can skip RLS checks
DO $bypass$
BEGIN
    ALTER ROLE service_role BYPASSRLS;
EXCEPTION WHEN OTHERS THEN
    NULL; -- May not have superuser rights in all environments
END $bypass$;
