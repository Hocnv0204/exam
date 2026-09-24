-- =========================================================
-- MIGRATION: 20260801000030_create_attendance_system.sql
-- DESCRIPTION: Chức năng điểm danh và quản lý học phí lớp học
-- =========================================================

-- 1. Bổ sung cột status vào student_classes (ACTIVE / PAUSED)
ALTER TABLE public.student_classes 
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE' 
CHECK (status IN ('ACTIVE', 'PAUSED'));

-- 2. Bổ sung cột is_archived vào classes
ALTER TABLE public.classes 
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Bảng attendance_sessions (Buổi điểm danh)
CREATE TABLE IF NOT EXISTS public.attendance_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    session_date DATE NOT NULL,
    note TEXT,
    fee_per_session NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (class_id, session_date)
);

-- 4. Bảng attendance_records (Chi tiết điểm danh từng học sinh)
CREATE TABLE IF NOT EXISTS public.attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    is_present BOOLEAN NOT NULL DEFAULT FALSE,
    fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'waived', 'none')),
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, student_id)
);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_class_date ON public.attendance_sessions(class_id, session_date);
CREATE INDEX IF NOT EXISTS idx_attendance_records_session_student ON public.attendance_records(session_id, student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_student_status ON public.attendance_records(student_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_student_classes_status ON public.student_classes(class_id, status);

-- 6. Grant quyền truy cập
GRANT ALL ON TABLE public.attendance_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.attendance_sessions TO authenticated;

GRANT ALL ON TABLE public.attendance_records TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.attendance_records TO authenticated;

-- 7. Row Level Security (RLS)
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- Service role bypass
DROP POLICY IF EXISTS "Service role bypass attendance_sessions" ON public.attendance_sessions;
CREATE POLICY "Service role bypass attendance_sessions" ON public.attendance_sessions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role bypass attendance_records" ON public.attendance_records;
CREATE POLICY "Service role bypass attendance_records" ON public.attendance_records
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Admin full access
DROP POLICY IF EXISTS "Admin full access attendance_sessions" ON public.attendance_sessions;
CREATE POLICY "Admin full access attendance_sessions" ON public.attendance_sessions
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ADMIN'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ADMIN'));

DROP POLICY IF EXISTS "Admin full access attendance_records" ON public.attendance_records;
CREATE POLICY "Admin full access attendance_records" ON public.attendance_records
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ADMIN'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ADMIN'));

-- Student read access
DROP POLICY IF EXISTS "Student read attendance_sessions" ON public.attendance_sessions;
CREATE POLICY "Student read attendance_sessions" ON public.attendance_sessions
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.student_classes 
        WHERE student_id = auth.uid() AND class_id = attendance_sessions.class_id
    ));

DROP POLICY IF EXISTS "Student read own attendance_records" ON public.attendance_records;
CREATE POLICY "Student read own attendance_records" ON public.attendance_records
    FOR SELECT TO authenticated
    USING (student_id = auth.uid());

-- 8. Stored Procedures / RPC Functions

-- 8.1. fn_save_attendance: Lưu điểm danh nguyên tử và đồng bộ tương thích ngược
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
    v_fee NUMERIC(12,2);
    v_status TEXT;
    v_paid_at TIMESTAMPTZ;
    v_present_count INT := 0;
    v_absent_count INT := 0;
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
        SELECT payment_status, paid_at INTO v_existing_status, v_existing_paid_at
        FROM public.attendance_records
        WHERE session_id = v_session_id AND student_id = v_student_id;

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
                v_status := 'unpaid';
                v_paid_at := NULL;
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

-- 8.2. fn_mark_student_class_tuition_paid: Đánh dấu đã đóng toàn bộ học phí của 1 học sinh trong lớp
CREATE OR REPLACE FUNCTION public.fn_mark_student_class_tuition_paid(
    p_class_id UUID,
    p_student_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated_count INT;
BEGIN
    UPDATE public.attendance_records ar
    SET payment_status = 'paid',
        paid_at = NOW(),
        updated_at = NOW()
    FROM public.attendance_sessions s
    WHERE ar.session_id = s.id
      AND s.class_id = p_class_id
      AND ar.student_id = p_student_id
      AND ar.is_present = true
      AND ar.payment_status = 'unpaid';

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    -- Đồng bộ student_sessions
    UPDATE public.student_sessions
    SET is_paid = true
    WHERE student_id = p_student_id
      AND class_id = p_class_id;

    RETURN jsonb_build_object('success', true, 'updatedCount', v_updated_count);
END;
$$;
