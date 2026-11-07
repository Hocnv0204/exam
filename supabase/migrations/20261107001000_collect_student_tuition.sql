-- =========================================================
-- MIGRATION: 20261107001000_collect_student_tuition.sql
-- DESCRIPTION: Thu toàn bộ nợ học phí của 1 học sinh trong 1 lớp,
--   nguyên tử (student_sessions + attendance_records + ledger).
--
-- Giữ đúng ngữ nghĩa cũ của action mark-student-tuition-paid:
--   1. student_sessions của HS/lớp có is_paid = false -> true.
--   2. attendance_records present + unpaid của HS/lớp -> paid + paid_at.
--   3. Chỉ khi có record vừa đổi mới ghi 1 dòng tuition_transactions
--      type 'manual_collect', amount = tổng fee_amount các record đó.
--
-- Khác biệt có chủ ý so với code Edge cũ: mọi bước chạy trong CÙNG một
-- transaction. Nếu trigger khóa học sinh (ATTENDANCE_LOCKED_STUDENT) hoặc
-- insert ledger lỗi thì toàn bộ thay đổi được rollback, không còn trạng thái
-- "đã đánh dấu đóng nhưng thiếu sổ".
-- =========================================================

CREATE OR REPLACE FUNCTION public.fn_collect_student_tuition(
    p_class_id UUID,
    p_student_id UUID,
    p_actor_id UUID,
    p_receipt_no TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated_sessions INT := 0;
    v_updated_records INT := 0;
    v_amount NUMERIC(12,2) := 0;
    v_transaction_id UUID;
BEGIN
    IF p_class_id IS NULL OR p_student_id IS NULL THEN
        RAISE EXCEPTION 'p_class_id and p_student_id are required'
            USING ERRCODE = '22023';
    END IF;

    -- Khóa hồ sơ học sinh để hai request đồng thời cho cùng HS phải xếp hàng.
    -- Nhờ vậy request thứ hai (sau khi request đầu commit) thấy 0 record unpaid
    -- và không sinh thêm dòng sổ trùng.
    PERFORM 1
    FROM public.profiles
    WHERE id = p_student_id
    FOR UPDATE;

    -- 1. Đồng bộ student_sessions (toàn bộ nợ của HS trong lớp).
    WITH updated AS (
        UPDATE public.student_sessions
        SET is_paid = TRUE
        WHERE student_id = p_student_id
          AND class_id = p_class_id
          AND is_paid = FALSE
        RETURNING 1
    )
    SELECT COUNT(*)::INT
    INTO v_updated_sessions
    FROM updated;

    -- 2. Chỉ các record có mặt + chưa đóng mới bị chuyển paid.
    --    UPDATE ... RETURNING tự khóa dòng; request đồng thời thứ hai sẽ thấy
    --    điều kiện payment_status = 'unpaid' không còn thỏa sau khi chờ lock.
    WITH updated AS (
        UPDATE public.attendance_records ar
        SET payment_status = 'paid',
            paid_at = NOW(),
            updated_at = NOW()
        FROM public.attendance_sessions ass
        WHERE ar.session_id = ass.id
          AND ass.class_id = p_class_id
          AND ar.student_id = p_student_id
          AND ar.is_present = TRUE
          AND ar.payment_status = 'unpaid'
        RETURNING ar.fee_amount
    )
    SELECT COUNT(*)::INT, COALESCE(SUM(fee_amount), 0)
    INTO v_updated_records, v_amount
    FROM updated;

    -- 3. Không có record nào -> không ghi sổ (idempotent tự nhiên).
    IF v_updated_records > 0 THEN
        INSERT INTO public.tuition_transactions (
            student_id,
            class_id,
            type,
            amount,
            receipt_no,
            note,
            created_by
        )
        VALUES (
            p_student_id,
            p_class_id,
            'manual_collect',
            v_amount,
            p_receipt_no,
            format('Thu toàn bộ nợ (%s buổi)', v_updated_records),
            p_actor_id
        )
        RETURNING id INTO v_transaction_id;
    END IF;

    RETURN jsonb_build_object(
        'updated_sessions', v_updated_sessions,
        'updated_records', v_updated_records,
        'amount', v_amount,
        'transaction_id', v_transaction_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_collect_student_tuition(UUID, UUID, UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_collect_student_tuition(UUID, UUID, UUID, TEXT)
    TO service_role;
