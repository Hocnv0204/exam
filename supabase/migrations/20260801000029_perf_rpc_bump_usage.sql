-- Migration: Add atomic function to increment question_bank usage_count
CREATE OR REPLACE FUNCTION public.fn_bump_qb_usage(p_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.question_bank
  SET usage_count = COALESCE(usage_count, 0) + 1
  WHERE id = ANY(p_ids);
$$;

GRANT EXECUTE ON FUNCTION public.fn_bump_qb_usage(uuid[]) TO authenticated, service_role;
