-- =========================================================
-- MIGRATION: 20261007000002_update_fn_add_student_balance.sql
-- DESCRIPTION: Ghi sổ nạp tiền + gạch nợ cũ ngay trong fn_add_student_balance
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
    v_after_topup NUMERIC(12,2);
    v_record RECORD;
    v_paid_count INT := 0;
    v_total_deducted NUMERIC(12,2) := 0;
    v_receipt TEXT;
    v_paid_session_dates TEXT[] := '{}';
    v_paid_fees NUMERIC(12,2)[] := '{}';
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

    v_after_topup := v_new_balance;

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
            v_paid_session_dates := v_paid_session_dates || v_record.session_date::text;
            v_paid_fees := v_paid_fees || v_record.fee_amount;

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

    -- 4. Ghi sổ giao dịch (bỏ qua nếu bảng ledger chưa tồn tại)
    BEGIN
        v_receipt := 'BL-' || to_char(NOW(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 6);
        INSERT INTO public.tuition_transactions
            (student_id, class_id, type, amount, balance_after, receipt_no, note)
        VALUES
            (p_student_id, NULL, 'topup', p_amount, v_after_topup, v_receipt,
             'Nạp tiền vào ví học phí');

        -- Mỗi buổi nợ cũ được gạch: 1 dòng trừ tiền để đối chiếu
        FOR i IN 1 .. v_paid_count LOOP
            v_receipt := 'BL-' || to_char(NOW(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 6);
            BEGIN
                INSERT INTO public.tuition_transactions
                    (student_id, class_id, type, amount, receipt_no, note)
                VALUES
                    (p_student_id, NULL, 'auto_deduct', -v_paid_fees[i], v_receipt,
                     'Gạch nợ cũ buổi ' || v_paid_session_dates[i] || ' khi nạp ví');
            EXCEPTION WHEN unique_violation THEN
                NULL;
            END;
        END LOOP;
    EXCEPTION WHEN undefined_table THEN
        NULL;
    END;

    -- 5. Trả về kết quả
    RETURN jsonb_build_object(
        'success', true,
        'balance', v_new_balance,
        'paid_sessions_count', v_paid_count,
        'total_deducted', v_total_deducted
    );
END;
$$;
