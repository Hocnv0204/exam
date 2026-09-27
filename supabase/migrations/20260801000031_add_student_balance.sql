-- =========================================================
-- MIGRATION: 20260801000031_add_student_balance.sql
-- DESCRIPTION: Thêm số dư học phí (balance) cho học sinh và logic điểm danh trừ tiền
-- =========================================================

-- 1. Bổ sung cột balance vào profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS balance NUMERIC(12,2) NOT NULL DEFAULT 0;

-- 2. Update fn_save_attendance để trừ balance khi điểm danh
CREATE OR REPLACE FUNCTION public.fn_save_attendance(
    p_class_id UUID,
    p_session_date DATE,
    p_note TEXT,
    p_records JSONB,
    p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_class_tuition NUMERIC(12,2);
    v_session_id UUID;
    v_session_fee NUMERIC(12,2);
    v_record JSONB;
    v_student_id UUID;
    v_is_present BOOLEAN;
    v_existing_status TEXT;
    v_existing_paid_at TIMESTAMPTZ;
    v_existing_fee_amount NUMERIC(12,2);
    v_fee NUMERIC(12,2);
    v_status TEXT;
    v_paid_at TIMESTAMPTZ;
    v_present_count INT := 0;
    v_absent_count INT := 0;
    v_student_balance NUMERIC(12,2);
BEGIN
    -- Lấy tuition fee hiện tại của lớp
    SELECT COALESCE(tuition_fee, 0) INTO v_class_tuition
    FROM public.classes
    WHERE id = p_class_id;

    IF v_class_tuition IS NULL THEN
        v_class_tuition := 0;
    END IF;

    -- Kiểm tra xem session đã tồn tại hay chưa
    SELECT id, fee_per_session INTO v_session_id, v_session_fee
    FROM public.attendance_sessions
    WHERE class_id = p_class_id AND session_date = p_session_date;

    IF v_session_id IS NOT NULL THEN
        -- Đã có buổi: Cập nhật note, giữ snapshot fee cũ
        UPDATE public.attendance_sessions
        SET note = p_note,
            updated_at = NOW()
        WHERE id = v_session_id;
    ELSE
        -- Buổi mới: Lấy học phí snapshot từ lớp
        v_session_fee := v_class_tuition;
        INSERT INTO public.attendance_sessions (
            class_id, session_date, note, fee_per_session, created_by, created_at, updated_at
        ) VALUES (
            p_class_id, p_session_date, p_note, v_session_fee, p_created_by, NOW(), NOW()
        )
        RETURNING id INTO v_session_id;
    END IF;

    -- Đồng bộ vào class_sessions (tương thích ngược cho Dashboard cũ)
    INSERT INTO public.class_sessions (class_id, session_date)
    VALUES (p_class_id, p_session_date)
    ON CONFLICT (class_id, session_date) DO NOTHING;

    -- Lặp qua từng học sinh trong mảng p_records
    FOR v_record IN SELECT * FROM jsonb_array_elements(p_records)
    LOOP
        v_student_id := (v_record->>'student_id')::UUID;
        v_is_present := COALESCE((v_record->>'is_present')::BOOLEAN, false);

        -- Lấy trạng thái hiện tại (nếu có bản ghi cũ)
        SELECT payment_status, paid_at, fee_amount INTO v_existing_status, v_existing_paid_at, v_existing_fee_amount
        FROM public.attendance_records
        WHERE session_id = v_session_id AND student_id = v_student_id;

        -- Lấy balance của student
        SELECT balance INTO v_student_balance
        FROM public.profiles
        WHERE id = v_student_id;

        IF v_is_present THEN
            v_present_count := v_present_count + 1;
            v_fee := v_session_fee;

            -- Nếu học sinh đã đóng trước đó -> giữ nguyên trạng thái paid
            IF v_existing_status = 'paid' THEN
                v_status := 'paid';
                v_paid_at := v_existing_paid_at;
            ELSIF v_existing_status = 'waived' THEN
                v_status := 'waived';
                v_paid_at := NULL;
            ELSE
                -- Nếu chưa đóng học phí, ta trừ tiền từ balance
                IF v_student_balance > 0 AND v_student_balance >= v_fee THEN
                    -- Đủ tiền trừ
                    UPDATE public.profiles
                    SET balance = balance - v_fee,
                        updated_at = NOW()
                    WHERE id = v_student_id;
                    
                    v_status := 'paid';
                    v_paid_at := NOW();
                ELSE
                    -- Không đủ tiền, tính là chưa đóng
                    v_status := 'unpaid';
                    v_paid_at := NULL;
                END IF;
            END IF;

            -- Đồng bộ vào student_sessions
            INSERT INTO public.student_sessions (student_id, class_id, session_date, is_paid)
            VALUES (v_student_id, p_class_id, p_session_date, (v_status = 'paid'))
            ON CONFLICT (student_id, class_id, session_date)
            DO UPDATE SET is_paid = (v_status = 'paid');
        ELSE
            v_absent_count := v_absent_count + 1;
            v_fee := 0;
            v_status := 'none';
            v_paid_at := NULL;

            -- Nếu trạng thái cũ là 'paid', hoàn lại tiền vào balance
            IF v_existing_status = 'paid' THEN
                UPDATE public.profiles
                SET balance = balance + COALESCE(v_existing_fee_amount, 0),
                    updated_at = NOW()
                WHERE id = v_student_id;
            END IF;

            -- Xóa khỏi student_sessions nếu vắng
            DELETE FROM public.student_sessions
            WHERE student_id = v_student_id AND class_id = p_class_id AND session_date = p_session_date;
        END IF;

        -- Upsert vào attendance_records
        INSERT INTO public.attendance_records (
            session_id, student_id, is_present, fee_amount, payment_status, paid_at, created_at, updated_at
        ) VALUES (
            v_session_id, v_student_id, v_is_present, v_fee, v_status, v_paid_at, NOW(), NOW()
        )
        ON CONFLICT (session_id, student_id)
        DO UPDATE SET
            is_present = EXCLUDED.is_present,
            fee_amount = EXCLUDED.fee_amount,
            payment_status = EXCLUDED.payment_status,
            paid_at = EXCLUDED.paid_at,
            updated_at = NOW();
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'sessionId', v_session_id,
        'sessionDate', p_session_date,
        'feePerSession', v_session_fee,
        'presentCount', v_present_count,
        'absentCount', v_absent_count
    );
END;
$$;

-- 3. Function để thêm / nạp tiền vào balance
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
BEGIN
    UPDATE public.profiles
    SET balance = balance + p_amount,
        updated_at = NOW()
    WHERE id = p_student_id
    RETURNING balance INTO v_new_balance;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Student not found');
    END IF;

    RETURN jsonb_build_object('success', true, 'balance', v_new_balance);
END;
$$;
