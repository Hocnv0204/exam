-- =========================================================
-- MIGRATION: 20261007000001_tuition_ledger.sql
-- DESCRIPTION: Sổ giao dịch học phí cho từng học sinh
--  - tuition_transactions: ledger nạp/trừ/hoàn/thu/miễn (có số biên lai)
-- =========================================================

-- 1. Bảng sổ giao dịch học phí
CREATE TABLE IF NOT EXISTS public.tuition_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('topup', 'auto_deduct', 'refund', 'manual_collect', 'waive')),
    amount NUMERIC(12,2) NOT NULL,
    balance_after NUMERIC(12,2),
    attendance_record_id UUID REFERENCES public.attendance_records(id) ON DELETE SET NULL,
    receipt_no TEXT UNIQUE,
    note TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tuition_tx_student ON public.tuition_transactions(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tuition_tx_class ON public.tuition_transactions(class_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tuition_tx_receipt ON public.tuition_transactions(receipt_no);

GRANT ALL ON TABLE public.tuition_transactions TO service_role;
GRANT SELECT, INSERT ON TABLE public.tuition_transactions TO authenticated;

ALTER TABLE public.tuition_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role bypass tuition_transactions" ON public.tuition_transactions;
CREATE POLICY "Service role bypass tuition_transactions" ON public.tuition_transactions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admin full access tuition_transactions" ON public.tuition_transactions;
CREATE POLICY "Admin full access tuition_transactions" ON public.tuition_transactions
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ADMIN'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ADMIN'));

DROP POLICY IF EXISTS "Student read own tuition_transactions" ON public.tuition_transactions;
CREATE POLICY "Student read own tuition_transactions" ON public.tuition_transactions
    FOR SELECT TO authenticated
    USING (student_id = auth.uid());

-- 2. Cập nhật fn_save_attendance: ghi sổ tự động trừ/hoàn (giữ nguyên giá snapshot lớp)
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
    v_balance_after NUMERIC(12,2);
    v_receipt TEXT;
BEGIN
    SELECT COALESCE(tuition_fee, 0) INTO v_class_tuition
    FROM public.classes
    WHERE id = p_class_id;

    IF v_class_tuition IS NULL THEN
        v_class_tuition := 0;
    END IF;

    SELECT id, fee_per_session INTO v_session_id, v_session_fee
    FROM public.attendance_sessions
    WHERE class_id = p_class_id AND session_date = p_session_date;

    IF v_session_id IS NOT NULL THEN
        UPDATE public.attendance_sessions
        SET note = p_note,
            updated_at = NOW()
        WHERE id = v_session_id;
    ELSE
        v_session_fee := v_class_tuition;
        INSERT INTO public.attendance_sessions (
            class_id, session_date, note, fee_per_session, created_by, created_at, updated_at
        ) VALUES (
            p_class_id, p_session_date, p_note, v_session_fee, p_created_by, NOW(), NOW()
        )
        RETURNING id INTO v_session_id;
    END IF;

    INSERT INTO public.class_sessions (class_id, session_date)
    VALUES (p_class_id, p_session_date)
    ON CONFLICT (class_id, session_date) DO NOTHING;

    FOR v_record IN SELECT * FROM jsonb_array_elements(p_records)
    LOOP
        v_student_id := (v_record->>'student_id')::UUID;
        v_is_present := COALESCE((v_record->>'is_present')::BOOLEAN, false);

        SELECT payment_status, paid_at, fee_amount INTO v_existing_status, v_existing_paid_at, v_existing_fee_amount
        FROM public.attendance_records
        WHERE session_id = v_session_id AND student_id = v_student_id;

        SELECT balance INTO v_student_balance
        FROM public.profiles
        WHERE id = v_student_id;

        IF v_is_present THEN
            v_present_count := v_present_count + 1;
            v_fee := v_session_fee;

            IF v_existing_status = 'paid' THEN
                v_status := 'paid';
                v_paid_at := v_existing_paid_at;
            ELSIF v_existing_status = 'waived' THEN
                v_status := 'waived';
                v_paid_at := NULL;
            ELSE
                IF v_student_balance > 0 AND v_student_balance >= v_fee THEN
                    UPDATE public.profiles
                    SET balance = balance - v_fee,
                        updated_at = NOW()
                    WHERE id = v_student_id
                    RETURNING balance INTO v_balance_after;

                    v_status := 'paid';
                    v_paid_at := NOW();

                    -- Ghi sổ tự động trừ tiền ví
                    v_receipt := 'BL-' || to_char(NOW(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 6);
                    BEGIN
                        INSERT INTO public.tuition_transactions
                            (student_id, class_id, type, amount, balance_after, receipt_no, note, created_by)
                        VALUES
                            (v_student_id, p_class_id, 'auto_deduct', -v_fee, v_balance_after, v_receipt,
                             'Điểm danh tự trừ ví ngày ' || p_session_date::text, p_created_by);
                    EXCEPTION WHEN unique_violation THEN
                        -- bỏ qua nếu trùng số biên lai (hiếm)
                        NULL;
                    END;
                ELSE
                    v_status := 'unpaid';
                    v_paid_at := NULL;
                END IF;
            END IF;

            INSERT INTO public.student_sessions (student_id, class_id, session_date, is_paid)
            VALUES (v_student_id, p_class_id, p_session_date, (v_status = 'paid'))
            ON CONFLICT (student_id, class_id, session_date)
            DO UPDATE SET is_paid = (v_status = 'paid');
        ELSE
            v_absent_count := v_absent_count + 1;
            v_fee := 0;
            v_status := 'none';
            v_paid_at := NULL;

            IF v_existing_status = 'paid' THEN
                UPDATE public.profiles
                SET balance = balance + COALESCE(v_existing_fee_amount, 0),
                    updated_at = NOW()
                WHERE id = v_student_id
                RETURNING balance INTO v_balance_after;

                -- Ghi sổ hoàn tiền khi chuyển có mặt -> vắng
                v_receipt := 'BL-' || to_char(NOW(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 6);
                BEGIN
                    INSERT INTO public.tuition_transactions
                        (student_id, class_id, type, amount, balance_after, receipt_no, note, created_by)
                    VALUES
                        (v_student_id, p_class_id, 'refund', COALESCE(v_existing_fee_amount, 0), v_balance_after, v_receipt,
                         'Hoàn tiền vắng ngày ' || p_session_date::text, p_created_by);
                EXCEPTION WHEN unique_violation THEN
                    NULL;
                END;
            END IF;

            DELETE FROM public.student_sessions
            WHERE student_id = v_student_id AND class_id = p_class_id AND session_date = p_session_date;
        END IF;

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

-- 3. Ghi sổ nạp tiền + gạch nợ cũ ngay trong fn_add_student_balance
-- (single source of truth trong DB: nạp ở tab nào cũng có log,
-- kể cả khi edge function chưa deploy bản mới)
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
