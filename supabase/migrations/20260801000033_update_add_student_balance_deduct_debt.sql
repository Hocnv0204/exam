-- =========================================================
-- MIGRATION: 20260801000033_update_add_student_balance_deduct_debt.sql
-- DESCRIPTION: Cập nhật hàm fn_add_student_balance để tự động gạch nợ học phí cũ khi nạp tiền
-- =========================================================

CREATE OR REPLACE FUNCTION public.fn_add_student_balance(
    p_student_id UUID,
    p_amount NUMERIC(12,2)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_balance NUMERIC(12,2);
    v_record RECORD;
    v_paid_count INT := 0;
    v_total_deducted NUMERIC(12,2) := 0;
BEGIN
    -- 1. Cộng tiền vào số dư tài khoản
    UPDATE public.profiles
    SET balance = balance + p_amount,
        updated_at = NOW()
    WHERE id = p_student_id
    RETURNING balance INTO v_new_balance;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Student not found');
    END IF;

    -- 2. Tìm các buổi học chưa thanh toán (unpaid) và thanh toán dần
    FOR v_record IN (
        SELECT ar.session_id, ar.fee_amount, ass.session_date, ass.class_id
        FROM public.attendance_records ar
        JOIN public.attendance_sessions ass ON ar.session_id = ass.id
        WHERE ar.student_id = p_student_id
          AND ar.payment_status = 'unpaid'
        ORDER BY ass.session_date ASC -- Ưu tiên thanh toán nợ cũ trước
    )
    LOOP
        -- Kiểm tra xem số dư còn đủ thanh toán cho buổi này không
        IF v_new_balance >= v_record.fee_amount THEN
            -- Trừ tiền
            v_new_balance := v_new_balance - v_record.fee_amount;
            v_total_deducted := v_total_deducted + v_record.fee_amount;
            v_paid_count := v_paid_count + 1;

            -- Cập nhật trạng thái trong attendance_records
            UPDATE public.attendance_records
            SET payment_status = 'paid',
                paid_at = NOW(),
                updated_at = NOW()
            WHERE session_id = v_record.session_id AND student_id = p_student_id;

            -- Đồng bộ cập nhật trạng thái vào student_sessions
            UPDATE public.student_sessions
            SET is_paid = true
            WHERE student_id = p_student_id
              AND class_id = v_record.class_id
              AND session_date = v_record.session_date;
        ELSE
            -- Không đủ tiền thanh toán buổi này, dừng vòng lặp
            EXIT;
        END IF;
    END LOOP;

    -- 3. Cập nhật lại số dư cuối cùng sau khi đã trừ nợ (nếu có trừ)
    IF v_paid_count > 0 THEN
        UPDATE public.profiles
        SET balance = v_new_balance,
            updated_at = NOW()
        WHERE id = p_student_id;
    END IF;

    -- 4. Trả về kết quả
    RETURN jsonb_build_object(
        'success', true, 
        'balance', v_new_balance,
        'paid_sessions_count', v_paid_count,
        'total_deducted', v_total_deducted
    );
END;
$$;
