-- question_bank.difficulty is qb_difficulty (enum), while extraDifficulty is
-- extracted from JSON as text. PostgreSQL cannot plan enum = text, even when
-- the optional filter is NULL. Preserve the deployed RPC body and privileges.
DO $$
DECLARE
  v_definition text;
  v_old text := 'difficulty = v_extra_diff';
  v_new text := 'difficulty::text = v_extra_diff';
BEGIN
  SELECT pg_get_functiondef(to_regprocedure('public.fn_qb_counts(jsonb)')) INTO v_definition;
  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'fn_qb_counts(jsonb) must exist before applying the enum fix';
  END IF;

  IF position(v_new IN v_definition) > 0 THEN
    RETURN; -- Idempotent when rerun.
  END IF;
  IF (length(v_definition) - length(replace(v_definition, v_old, ''))) <> length(v_old) THEN
    RAISE EXCEPTION 'Unexpected fn_qb_counts definition; enum comparison was not changed';
  END IF;

  EXECUTE replace(v_definition, v_old, v_new);
END;
$$;
