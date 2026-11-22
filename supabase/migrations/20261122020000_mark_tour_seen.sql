-- Migration: fn_mark_tour_seen cập nhật nguyên tử trạng thái đã xem tour
-- An toàn khi gọi đồng thời từ nhiều tab/thiết bị, không trùng lặp key

CREATE OR REPLACE FUNCTION public.fn_mark_tour_seen(
  p_user_id uuid,
  p_key text
)
RETURNS text[]
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seen text[];
BEGIN
  IF p_key IS NULL OR trim(p_key) = '' THEN
    RAISE EXCEPTION 'p_key cannot be null or empty';
  END IF;

  UPDATE public.profiles
  SET seen_tours = CASE
    WHEN NOT (p_key = ANY(coalesce(seen_tours, '{}'::text[]))) THEN coalesce(seen_tours, '{}'::text[]) || p_key
    ELSE seen_tours
  END
  WHERE id = p_user_id
  RETURNING seen_tours INTO v_seen;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN v_seen;
END;
$$;

-- Phân quyền: chỉ service_role được gọi qua backend Edge Function
REVOKE ALL ON FUNCTION public.fn_mark_tour_seen(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_mark_tour_seen(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_mark_tour_seen(uuid, text) TO service_role;
