-- =========================================================
-- MIGRATION: 20261107001001_add_students_to_class_batch.sql
-- DESCRIPTION: Thêm nhiều học sinh vào lớp trong 1 transaction.
--
-- Tương thích hành vi add-student-to-class:
--   * Học sinh không tồn tại -> skip.
--   * Tài khoản không phải STUDENT -> skip.
--   * is_locked = true hoặc còn khoảng khóa đang mở -> skip.
--   * Đã có trong lớp -> skip. "Đã có" gồm:
--       - đã có dòng student_classes cho (student, class), hoặc
--       - profile legacy còn lưu profiles.class_id = lớp này dù chưa có
--         dòng student_classes.
--   * Còn lại: insert hàng loạt vào student_classes (status ACTIVE),
--     ON CONFLICT DO NOTHING để không tạo bản ghi trùng, sau đó set
--     profiles.class_id nếu đang NULL (giống endpoint cũ).
--     Nếu vì race mà insert không trả về dòng nào cho một HS đã được xếp
--     eligible, HS đó được đưa vào skipped với lý do "đã có trong lớp"
--     thay vì biến mất khỏi cả added lẫn skipped.
--
-- Trả { added: uuid[], skipped: [{studentId, reason}] }.
-- =========================================================

CREATE OR REPLACE FUNCTION public.fn_add_students_to_class(
    p_class_id UUID,
    p_student_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ids UUID[];
    v_added UUID[] := '{}'::UUID[];
    v_skipped JSONB := '[]'::JSONB;
BEGIN
    IF p_class_id IS NULL THEN
        RAISE EXCEPTION 'p_class_id is required' USING ERRCODE = '22023';
    END IF;

    IF p_student_ids IS NULL OR cardinality(p_student_ids) = 0 THEN
        RETURN jsonb_build_object('added', '[]'::JSONB, 'skipped', '[]'::JSONB);
    END IF;

    -- Khử trùng nhưng giữ thứ tự xuất hiện đầu tiên.
    SELECT array_agg(id ORDER BY first_ord)
    INTO v_ids
    FROM (
        SELECT id, MIN(ord) AS first_ord
        FROM unnest(p_student_ids) WITH ORDINALITY AS t(id, ord)
        WHERE id IS NOT NULL
        GROUP BY id
    ) deduped;

    IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
        RETURN jsonb_build_object('added', '[]'::JSONB, 'skipped', '[]'::JSONB);
    END IF;

    IF cardinality(v_ids) > 200 THEN
        RAISE EXCEPTION 'Chỉ được thêm tối đa 200 học sinh mỗi lần'
            USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.classes WHERE id = p_class_id) THEN
        RAISE EXCEPTION 'Không tìm thấy lớp học' USING ERRCODE = 'P0002';
    END IF;

    WITH input AS (
        SELECT id, MIN(ord) AS ord
        FROM unnest(v_ids) WITH ORDINALITY AS t(id, ord)
        GROUP BY id
    ),
    profile_data AS (
        SELECT i.id, i.ord, p.role, p.is_locked, p.class_id
        FROM input i
        LEFT JOIN public.profiles p ON p.id = i.id
    ),
    open_locks AS (
        SELECT DISTINCT sli.student_id
        FROM public.student_lock_intervals sli
        JOIN input i ON i.id = sli.student_id
        WHERE sli.end_date IS NULL
    ),
    already_enrolled AS (
        SELECT sc.student_id
        FROM public.student_classes sc
        JOIN input i ON i.id = sc.student_id
        WHERE sc.class_id = p_class_id
    ),
    ranked AS (
        SELECT
            pd.id,
            pd.ord,
            CASE
                WHEN pd.role IS NULL THEN 'missing'
                WHEN pd.role::TEXT <> 'STUDENT' THEN 'role'
                WHEN COALESCE(pd.is_locked, FALSE) OR ol.student_id IS NOT NULL THEN 'locked'
                -- Đã có dòng student_classes HOẶC profile legacy đã trỏ tới lớp này.
                WHEN ae.student_id IS NOT NULL OR pd.class_id = p_class_id THEN 'already'
                ELSE 'eligible'
            END AS status
        FROM profile_data pd
        LEFT JOIN open_locks ol ON ol.student_id = pd.id
        LEFT JOIN already_enrolled ae ON ae.student_id = pd.id
    ),
    inserted AS (
        INSERT INTO public.student_classes (class_id, student_id, status, lock_interval_id)
        SELECT p_class_id, r.id, 'ACTIVE', NULL
        FROM ranked r
        WHERE r.status = 'eligible'
        ON CONFLICT (student_id, class_id) DO NOTHING
        RETURNING student_id
    ),
    resolved AS (
        -- HS eligible nhưng INSERT không RETURNING nghĩa là đã bị một request
        -- khác chèn trước (ON CONFLICT DO NOTHING). Xếp vào 'already' để không
        -- bị mất khỏi cả added lẫn skipped.
        SELECT
            r.id,
            r.ord,
            CASE
                WHEN r.status = 'eligible' AND ins.student_id IS NULL THEN 'already'
                ELSE r.status
            END AS status
        FROM ranked r
        LEFT JOIN inserted ins ON ins.student_id = r.id
    )
    SELECT
        COALESCE((
            SELECT array_agg(r.id ORDER BY r.ord)
            FROM resolved r
            WHERE r.status = 'eligible'
        ), '{}'::UUID[]),
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'studentId', r.id,
                    'reason', CASE r.status
                        WHEN 'missing' THEN 'Không tìm thấy học sinh'
                        WHEN 'role' THEN 'Tài khoản không phải học sinh'
                        WHEN 'locked' THEN 'Học sinh đang bị khóa tài khoản, không thể thêm vào lớp'
                        WHEN 'already' THEN 'Học sinh đã có trong lớp'
                        ELSE 'Không thể thêm học sinh'
                    END
                )
                ORDER BY r.ord
            )
            FROM resolved r
            WHERE r.status <> 'eligible'
        ), '[]'::JSONB)
    INTO v_added, v_skipped;

    IF cardinality(v_added) > 0 THEN
        UPDATE public.profiles
        SET class_id = p_class_id,
            updated_at = NOW()
        WHERE id = ANY(v_added)
          AND class_id IS NULL;
    END IF;

    RETURN jsonb_build_object('added', to_jsonb(v_added), 'skipped', v_skipped);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_add_students_to_class(UUID, UUID[])
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_add_students_to_class(UUID, UUID[])
    TO service_role;
