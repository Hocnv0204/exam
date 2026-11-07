-- Migration: Add missing performance indexes and clean trial state invariant
-- 1. Performance indexes:
--    - student_sessions(class_id, session_date): accelerates class attendance & session lookups
--      Proven by: supabase/functions/create-class/index.ts (lines 208-212, 577, 2246)
--    - homeworks(is_published, deadline): accelerates weekly calendar and student queries
--      Proven by: supabase/functions/weekly-calendar/index.ts (lines 144-148)
-- 2. Clean trial submission invariant:
--    - One-time cleanup: formal student submissions (student_id IS NOT NULL) must never be trial
--    - Invariant trigger guard: enforce is_trial = false and guest fields = NULL on INSERT or UPDATE

-- 1. Indexes
CREATE INDEX IF NOT EXISTS idx_student_sessions_class_date 
  ON public.student_sessions(class_id, session_date);

CREATE INDEX IF NOT EXISTS idx_homeworks_published_deadline 
  ON public.homeworks(is_published, deadline);

-- 2. One-time cleanup
UPDATE public.submissions 
SET is_trial = false, guest_name = NULL, guest_phone = NULL 
WHERE is_trial = true AND student_id IS NOT NULL;

-- 3. Invariant trigger guard
CREATE OR REPLACE FUNCTION public.trg_fn_submissions_clean_trial()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.student_id IS NOT NULL AND NEW.is_trial = true THEN
    NEW.is_trial := false;
    NEW.guest_name := NULL;
    NEW.guest_phone := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_submissions_clean_trial ON public.submissions;
CREATE TRIGGER trg_submissions_clean_trial
  BEFORE INSERT OR UPDATE ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_submissions_clean_trial();
