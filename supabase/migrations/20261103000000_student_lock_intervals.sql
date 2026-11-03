-- =========================================================
-- MIGRATION: 20261103000000_student_lock_intervals.sql
-- DESCRIPTION: Vòng đời khóa tài khoản học sinh theo khoảng ngày.
--
-- Quy ước ngày (Asia/Ho_Chi_Minh):
--   * Khóa có hiệu lực từ start_date (tính cả ngày khóa).
--   * Mở khóa có hiệu lực từ end_date (end_date không bị tính là ngày khóa).
--   * Khoảng đang mở (end_date IS NULL) khóa mọi buổi từ start_date trở đi.
--   * Mở khóa KHÔNG đưa các buổi trong khoảng đã khóa trở lại điểm danh/học phí.
--   * Khóa/mở khóa trong cùng một ngày => end_date = start_date + 1 ngày,
--     vì ngày đó đã là ngày khóa (cutoff theo session_date).
--
-- Hệ quả nghiệp vụ:
--   * Buổi trước start_date vẫn xem/sửa được (pre-lock).
--   * Buổi trong [start_date, end_date) bị loại khỏi điểm danh và học phí.
--   * profiles.is_locked vẫn là cờ auth nhanh; bảng interval là nguồn sự thật
--     cho cutoff điểm danh/học phí lịch sử.
--   * student_classes.status thủ công PAUSED trước khi khóa được giữ nguyên.
--     Chỉ các lớp ACTIVE bị hệ thống tự chuyển PAUSED mới được khôi phục ACTIVE
--     khi mở khóa (đánh dấu bằng student_classes.lock_interval_id).
-- =========================================================

-- 1. Bảng khoảng khóa bền vững
CREATE TABLE IF NOT EXISTS public.student_lock_intervals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE,
    locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unlocked_at TIMESTAMPTZ,
    locked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    unlocked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reason TEXT,
    unlock_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT student_lock_intervals_date_order
        CHECK (end_date IS NULL OR end_date >= start_date)
);

-- Mỗi học sinh chỉ có tối đa 1 khoảng đang mở.
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_lock_intervals_open
    ON public.student_lock_intervals(student_id)
    WHERE end_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_student_lock_intervals_lookup
    ON public.student_lock_intervals(student_id, start_date, end_date);

GRANT ALL ON TABLE public.student_lock_intervals TO service_role;
GRANT SELECT ON TABLE public.student_lock_intervals TO authenticated;

ALTER TABLE public.student_lock_intervals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role bypass student_lock_intervals" ON public.student_lock_intervals;
CREATE POLICY "Service role bypass student_lock_intervals" ON public.student_lock_intervals
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admin full access student_lock_intervals" ON public.student_lock_intervals;
CREATE POLICY "Admin full access student_lock_intervals" ON public.student_lock_intervals
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ADMIN'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ADMIN'));

DROP POLICY IF EXISTS "Student read own lock intervals" ON public.student_lock_intervals;
CREATE POLICY "Student read own lock intervals" ON public.student_lock_intervals
    FOR SELECT TO authenticated
    USING (student_id = auth.uid());

-- 2. Đánh dấu lớp nào do interval này tự PAUSED.
--    Nhờ vậy mở khóa không blanket ACTIVE các lớp admin đã PAUSED thủ công.
ALTER TABLE public.student_classes
    ADD COLUMN IF NOT EXISTS lock_interval_id UUID
    REFERENCES public.student_lock_intervals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_student_classes_lock_interval
    ON public.student_classes(lock_interval_id)
    WHERE lock_interval_id IS NOT NULL;

-- Mọi writer đều không được kích hoạt/ghi danh lớp cho tài khoản đang khóa.
CREATE OR REPLACE FUNCTION public.fn_guard_locked_student_enrollment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.status = 'ACTIVE' AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = NEW.student_id AND is_locked = TRUE
    ) THEN
        RAISE EXCEPTION 'STUDENT_LOCKED: cannot activate enrollment for locked student'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_student_classes_locked_guard ON public.student_classes;
CREATE TRIGGER trg_student_classes_locked_guard
    BEFORE INSERT OR UPDATE ON public.student_classes
    FOR EACH ROW EXECUTE FUNCTION public.fn_guard_locked_student_enrollment();

-- Giữ ví ở 0 và không đổi lớp mặc định qua các đường cập nhật profile khác
-- (trong đó có create-student?action=update) khi tài khoản vẫn bị khóa.
CREATE OR REPLACE FUNCTION public.fn_guard_locked_profile_state()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.is_locked = TRUE THEN
        IF COALESCE(NEW.balance, 0) <> 0 THEN
            RAISE EXCEPTION 'STUDENT_LOCKED: balance must remain zero'
                USING ERRCODE = 'P0001';
        END IF;
        IF TG_OP = 'UPDATE' AND NEW.class_id IS DISTINCT FROM OLD.class_id THEN
            RAISE EXCEPTION 'STUDENT_LOCKED: cannot change class while locked'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_locked_state_guard ON public.profiles;
CREATE TRIGGER trg_profiles_locked_state_guard
    BEFORE INSERT OR UPDATE OF balance, is_locked, class_id ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.fn_guard_locked_profile_state();

-- 3. Tiện ích ngày Việt Nam + kiểm tra khóa theo session_date
CREATE OR REPLACE FUNCTION public.fn_vn_today()
RETURNS DATE
LANGUAGE sql
STABLE
AS $$
    SELECT (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
$$;

-- Kiểm tra 1 học sinh có bị khóa trong 1 ngày buổi học hay không.
-- Fallback cho hồ sơ is_locked=true chưa có interval (ví dụ migrate một phần).
CREATE OR REPLACE FUNCTION public.fn_student_locked_on(
    p_student_id UUID,
    p_session_date DATE
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT
        p_session_date IS NOT NULL
        AND (
            EXISTS (
                SELECT 1
                FROM public.student_lock_intervals i
                WHERE i.student_id = p_student_id
                  AND p_session_date >= i.start_date
                  AND (i.end_date IS NULL OR p_session_date < i.end_date)
            )
            OR EXISTS (
                SELECT 1
                FROM public.profiles p
                WHERE p.id = p_student_id
                  AND p.is_locked = TRUE
                  AND NOT EXISTS (
                      SELECT 1 FROM public.student_lock_intervals oi
                      WHERE oi.student_id = p.id AND oi.end_date IS NULL
                  )
                  AND p_session_date >= (p.updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
            )
        );
$$;

REVOKE ALL ON FUNCTION public.fn_student_locked_on(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_student_locked_on(UUID, DATE) TO service_role;

-- 4. Loại bỏ điểm danh/học phí trong khoảng khóa của 1 học sinh.
--    Không hoàn vào ví: admin hoàn tiền ngoài hệ thống và khóa tất toán ví về 0.
--    Giao dịch cũ trong sổ vẫn giữ để đối chiếu, không xóa lịch sử thu.
--    - Chỉ đụng tới các buổi trong [p_from_date, p_to_date); không đụng pre-lock.
CREATE OR REPLACE FUNCTION public.fn_purge_student_locked_attendance(
    p_student_id UUID,
    p_from_date DATE,
    p_to_date DATE DEFAULT NULL,
    p_actor UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rec RECORD;
    v_count INTEGER := 0;
BEGIN
    IF p_student_id IS NULL OR p_from_date IS NULL THEN
        RETURN 0;
    END IF;
    IF p_to_date IS NOT NULL AND p_to_date <= p_from_date THEN
        RETURN 0;
    END IF;

    FOR v_rec IN
        SELECT ar.id, ar.fee_amount, ar.payment_status, s.session_date, s.class_id
        FROM public.attendance_records ar
        JOIN public.attendance_sessions s ON s.id = ar.session_id
        WHERE ar.student_id = p_student_id
          AND s.session_date >= p_from_date
          AND (p_to_date IS NULL OR s.session_date < p_to_date)
        FOR UPDATE OF ar
    LOOP
        DELETE FROM public.attendance_records WHERE id = v_rec.id;
        v_count := v_count + 1;
    END LOOP;

    -- student_sessions là nguồn dashboard dùng để đếm buổi có mặt / công nợ.
    DELETE FROM public.student_sessions
    WHERE student_id = p_student_id
      AND session_date >= p_from_date
      AND (p_to_date IS NULL OR session_date < p_to_date);

    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_purge_student_locked_attendance(UUID, DATE, DATE, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_purge_student_locked_attendance(UUID, DATE, DATE, UUID) TO service_role;

-- Bút toán tất toán số dư (không phải khoản hoàn tự động). Admin trả tiền
-- thủ công ngoài hệ thống; amount âm khi số dư ví trước khóa dương.
ALTER TABLE public.tuition_transactions
    DROP CONSTRAINT IF EXISTS tuition_transactions_type_check;
ALTER TABLE public.tuition_transactions
    ADD CONSTRAINT tuition_transactions_type_check
    CHECK (type IN ('topup', 'auto_deduct', 'refund', 'manual_collect', 'waive', 'lock_settlement'));

-- 5. Backfill cho tài khoản đang is_locked=true.
--    profiles.updated_at được set lúc khóa nên là mốc gần đúng nhất; nếu có
--    cập nhật profile sau đó thì start_date muộn hơn ngày khóa thật (an toàn
--    cho dữ liệu pre-lock, có thể còn sót buổi khóa cũ trước mốc này).
--    Không gắn lock_interval_id cho các lớp đang PAUSED lúc backfill vì không
--    phân biệt được PAUSED thủ công với PAUSED do cơ chế khóa cũ. Vì vậy mở
--    khóa sẽ không tự bật lại các lớp đó; admin cần kiểm tra và bật nếu cần.
INSERT INTO public.student_lock_intervals (student_id, start_date, locked_at, reason)
SELECT
    p.id,
    LEAST((p.updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, public.fn_vn_today()),
    p.updated_at,
    'Backfill khoảng khóa hiện có'
FROM public.profiles p
WHERE p.role = 'STUDENT'
  AND p.is_locked = TRUE
  AND NOT EXISTS (
      SELECT 1 FROM public.student_lock_intervals i
      WHERE i.student_id = p.id AND i.end_date IS NULL
  );

-- Dọn dữ liệu điểm danh/học phí còn sót trong khoảng khóa đang mở.
DO $$
DECLARE
    v_lock RECORD;
BEGIN
    FOR v_lock IN
        SELECT student_id, start_date
        FROM public.student_lock_intervals
        WHERE end_date IS NULL
    LOOP
        PERFORM public.fn_purge_student_locked_attendance(
            v_lock.student_id,
            v_lock.start_date,
            NULL,
            NULL
        );
    END LOOP;
END;
$$;

-- 6. RPC khóa/mở khóa nguyên tử, giữ trạng thái PAUSED thủ công.
CREATE OR REPLACE FUNCTION public.fn_set_student_lock(
    p_student_id UUID,
    p_locked BOOLEAN,
    p_actor UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role TEXT;
    v_is_locked BOOLEAN;
    v_profile_updated_at TIMESTAMPTZ;
    v_old_balance NUMERIC(12,2);
    v_interval_id UUID;
    v_start_date DATE;
    v_end_date DATE;
    v_today DATE := public.fn_vn_today();
    v_purged INTEGER := 0;
BEGIN
    IF p_student_id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'code', 'STUDENT_NOT_FOUND');
    END IF;

    -- Khóa profile row để serialize với fn_save_attendance / thao tác khác.
    SELECT role::text, is_locked, updated_at, balance
    INTO v_role, v_is_locked, v_profile_updated_at, v_old_balance
    FROM public.profiles
    WHERE id = p_student_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'code', 'STUDENT_NOT_FOUND');
    END IF;
    IF v_role <> 'STUDENT' THEN
        RETURN jsonb_build_object('success', FALSE, 'code', 'NOT_A_STUDENT');
    END IF;

    IF p_locked THEN
        SELECT id, start_date
        INTO v_interval_id, v_start_date
        FROM public.student_lock_intervals
        WHERE student_id = p_student_id AND end_date IS NULL
        ORDER BY start_date DESC
        LIMIT 1
        FOR UPDATE;

        IF v_interval_id IS NULL THEN
            INSERT INTO public.student_lock_intervals
                (student_id, start_date, locked_at, locked_by, reason)
            VALUES
                (p_student_id, v_today, NOW(), p_actor, NULLIF(p_reason, ''))
            RETURNING id, start_date INTO v_interval_id, v_start_date;
        ELSE
            UPDATE public.student_lock_intervals
            SET reason = COALESCE(NULLIF(p_reason, ''), reason),
                updated_at = NOW()
            WHERE id = v_interval_id;
        END IF;

        UPDATE public.profiles
        SET is_locked = TRUE,
            balance = 0,
            updated_at = NOW()
        WHERE id = p_student_id;

        IF v_old_balance IS DISTINCT FROM 0 THEN
            INSERT INTO public.tuition_transactions
                (student_id, type, amount, balance_after, receipt_no, note, created_by)
            VALUES (
                p_student_id, 'lock_settlement', -COALESCE(v_old_balance, 0), 0,
                'BL-' || to_char(NOW(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 8),
                'Tất toán số dư khi khóa tài khoản; admin hoàn/đối soát thủ công bên ngoài hệ thống', p_actor
            );
        END IF;

        -- Chỉ ACTIVE mới bị auto-pause; PAUSED thủ công giữ nguyên (không marker).
        UPDATE public.student_classes
        SET status = 'PAUSED',
            lock_interval_id = v_interval_id
        WHERE student_id = p_student_id
          AND status = 'ACTIVE';

        -- Chặn cả dữ liệu future/đã nhập trước khi khóa. Không đụng pre-lock.
        v_purged := public.fn_purge_student_locked_attendance(
            p_student_id,
            v_start_date,
            NULL,
            p_actor
        );

        RETURN jsonb_build_object(
            'success', TRUE,
            'userId', p_student_id,
            'locked', TRUE,
            'intervalId', v_interval_id,
            'startDate', v_start_date,
            'endDate', NULL,
            'purgedAttendanceCount', v_purged
        );
    END IF;

    -- Mở khóa
    SELECT id, start_date
    INTO v_interval_id, v_start_date
    FROM public.student_lock_intervals
    WHERE student_id = p_student_id AND end_date IS NULL
    ORDER BY start_date DESC
    LIMIT 1
    FOR UPDATE;

    IF v_interval_id IS NULL THEN
        IF v_is_locked IS NOT TRUE THEN
            RETURN jsonb_build_object(
                'success', TRUE,
                'userId', p_student_id,
                'locked', FALSE,
                'alreadyUnlocked', TRUE
            );
        END IF;

        -- Hồ sơ legacy bị khóa nhưng chưa có interval: tạo rồi đóng ngay.
        v_start_date := LEAST(
            COALESCE((v_profile_updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, v_today),
            v_today
        );
        INSERT INTO public.student_lock_intervals
            (student_id, start_date, locked_at, locked_by, reason)
        VALUES
            (p_student_id, v_start_date, v_profile_updated_at, p_actor, 'Backfill khi mở khóa')
        RETURNING id INTO v_interval_id;
    END IF;

    v_end_date := v_today;
    -- Cùng ngày khóa/mở: ngày đó vẫn là ngày khóa (cutoff theo session_date).
    IF v_end_date <= v_start_date THEN
        v_end_date := v_start_date + 1;
    END IF;

    UPDATE public.student_lock_intervals
    SET end_date = v_end_date,
        unlocked_at = NOW(),
        unlocked_by = p_actor,
        unlock_reason = NULLIF(p_reason, ''),
        updated_at = NOW()
    WHERE id = v_interval_id;

    UPDATE public.profiles
    SET is_locked = FALSE,
        updated_at = NOW()
    WHERE id = p_student_id;

    -- Chỉ khôi phục các lớp do chính interval này auto-pause.
    UPDATE public.student_classes
    SET status = 'ACTIVE',
        lock_interval_id = NULL
    WHERE student_id = p_student_id
      AND lock_interval_id = v_interval_id
      AND status = 'PAUSED';

    -- Quét lại [start, end) để dọn dữ liệu future đã nhập trong lúc khóa.
    v_purged := public.fn_purge_student_locked_attendance(
        p_student_id,
        v_start_date,
        v_end_date,
        p_actor
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'userId', p_student_id,
        'locked', FALSE,
        'intervalId', v_interval_id,
        'startDate', v_start_date,
        'endDate', v_end_date,
        'purgedAttendanceCount', v_purged
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_set_student_lock(UUID, BOOLEAN, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_set_student_lock(UUID, BOOLEAN, UUID, TEXT) TO service_role;

-- 7. Trigger phòng thủ: mọi writer (kể cả fallback cũ / PostgREST trực tiếp)
--    đều không thể ghi điểm danh cho học sinh đang khóa trong ngày đó.
CREATE OR REPLACE FUNCTION public.fn_guard_locked_attendance_record()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_session_date DATE;
BEGIN
    -- Với INSERT mới, khóa profile row để serialize với fn_set_student_lock.
    -- Nếu không, một insert bắt đầu trước lúc interval commit có thể lọt sau purge.
    -- UPDATE không cần khóa ở đây: purge đã khóa/đọc row hiện hữu và sẽ dọn nó;
    -- khóa profile trong UPDATE dễ gây deadlock với purge (row -> profile vs
    -- profile -> row). Sau khi chờ, câu lệnh SQL kế tiếp đọc snapshot mới.
    IF TG_OP = 'INSERT' THEN
        PERFORM 1 FROM public.profiles WHERE id = NEW.student_id FOR UPDATE;
    END IF;

    SELECT s.session_date INTO v_session_date
    FROM public.attendance_sessions s
    WHERE s.id = NEW.session_id;

    IF v_session_date IS NOT NULL
       AND public.fn_student_locked_on(NEW.student_id, v_session_date) THEN
        RAISE EXCEPTION 'ATTENDANCE_LOCKED_STUDENT: student % is locked on %',
            NEW.student_id, v_session_date
            USING ERRCODE = 'P0001',
                  HINT = 'Locked-period attendance is excluded; unlock does not retroactively include it.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_records_locked_guard ON public.attendance_records;
CREATE TRIGGER trg_attendance_records_locked_guard
    BEFORE INSERT OR UPDATE ON public.attendance_records
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_guard_locked_attendance_record();

CREATE OR REPLACE FUNCTION public.fn_guard_locked_student_session()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Cùng lý do với trigger attendance_records: chỉ INSERT mới cần khóa
    -- profile để chặn phantom insert sau purge.
    IF TG_OP = 'INSERT' THEN
        PERFORM 1 FROM public.profiles WHERE id = NEW.student_id FOR UPDATE;
    END IF;

    IF public.fn_student_locked_on(NEW.student_id, NEW.session_date) THEN
        RAISE EXCEPTION 'ATTENDANCE_LOCKED_STUDENT: student % is locked on %',
            NEW.student_id, NEW.session_date
            USING ERRCODE = 'P0001',
                  HINT = 'Locked-period student sessions are excluded; unlock does not retroactively include it.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_student_sessions_locked_guard ON public.student_sessions;
CREATE TRIGGER trg_student_sessions_locked_guard
    BEFORE INSERT OR UPDATE ON public.student_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_guard_locked_student_session();

-- 8. fn_save_attendance: bỏ qua học sinh bị khóa trong ngày, không trừ ví.
--    Giữ nguyên toàn bộ logic snapshot fee / ledger / hoàn tiền vắng.
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
    v_skipped_locked_count INT := 0;
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

        -- Khóa profile row: serialize với fn_set_student_lock. Nếu khóa chen
        -- giữa lúc kiểm tra và ghi, transaction khóa sẽ chờ và cutoff vẫn đúng.
        PERFORM 1 FROM public.profiles WHERE id = v_student_id FOR UPDATE;

        IF public.fn_student_locked_on(v_student_id, p_session_date) THEN
            v_skipped_locked_count := v_skipped_locked_count + 1;
            -- Dọn record còn sót (nếu có) trong đúng ngày/khóa này.
            PERFORM public.fn_purge_student_locked_attendance(
                v_student_id,
                p_session_date,
                p_session_date + 1,
                p_created_by
            );
            CONTINUE;
        END IF;

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

                    v_receipt := 'BL-' || to_char(NOW(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 6);
                    BEGIN
                        INSERT INTO public.tuition_transactions
                            (student_id, class_id, type, amount, balance_after, receipt_no, note, created_by)
                        VALUES
                            (v_student_id, p_class_id, 'auto_deduct', -v_fee, v_balance_after, v_receipt,
                             'Điểm danh tự trừ ví ngày ' || p_session_date::text, p_created_by);
                    EXCEPTION WHEN unique_violation THEN
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
        'absentCount', v_absent_count,
        'skippedLockedCount', v_skipped_locked_count
    );
END;
$$;

-- 9. fn_add_student_balance: không gạch nợ buổi thuộc khoảng khóa.
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
    UPDATE public.profiles
    SET balance = balance + p_amount,
        updated_at = NOW()
    WHERE id = p_student_id
      AND is_locked = FALSE
    RETURNING balance INTO v_new_balance;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy học sinh hoặc tài khoản đang khóa');
    END IF;

    v_after_topup := v_new_balance;

    FOR v_record IN (
        SELECT ar.session_id, ar.fee_amount, ass.session_date, ass.class_id
        FROM public.attendance_records ar
        JOIN public.attendance_sessions ass ON ar.session_id = ass.id
        WHERE ar.student_id = p_student_id
          AND ar.payment_status = 'unpaid'
          AND NOT public.fn_student_locked_on(ar.student_id, ass.session_date)
        ORDER BY ass.session_date ASC
    )
    LOOP
        IF v_new_balance >= v_record.fee_amount THEN
            v_new_balance := v_new_balance - v_record.fee_amount;
            v_total_deducted := v_total_deducted + v_record.fee_amount;
            v_paid_count := v_paid_count + 1;
            v_paid_session_dates := v_paid_session_dates || v_record.session_date::text;
            v_paid_fees := v_paid_fees || v_record.fee_amount;

            UPDATE public.attendance_records
            SET payment_status = 'paid',
                paid_at = NOW(),
                updated_at = NOW()
            WHERE session_id = v_record.session_id AND student_id = p_student_id;

            UPDATE public.student_sessions
            SET is_paid = true
            WHERE student_id = p_student_id
              AND class_id = v_record.class_id
              AND session_date = v_record.session_date;
        ELSE
            EXIT;
        END IF;
    END LOOP;

    IF v_paid_count > 0 THEN
        UPDATE public.profiles
        SET balance = v_new_balance,
            updated_at = NOW()
        WHERE id = p_student_id;
    END IF;

    BEGIN
        v_receipt := 'BL-' || to_char(NOW(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 6);
        INSERT INTO public.tuition_transactions
            (student_id, class_id, type, amount, balance_after, receipt_no, note)
        VALUES
            (p_student_id, NULL, 'topup', p_amount, v_after_topup, v_receipt,
             'Nạp tiền vào ví học phí');

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

    RETURN jsonb_build_object(
        'success', true,
        'balance', v_new_balance,
        'paid_sessions_count', v_paid_count,
        'total_deducted', v_total_deducted
    );
END;
$$;

-- 10. fn_mark_student_class_tuition_paid: bỏ qua buổi thuộc khoảng khóa.
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
      AND ar.is_present = TRUE
      AND ar.payment_status = 'unpaid'
      AND NOT public.fn_student_locked_on(ar.student_id, s.session_date);

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    UPDATE public.student_sessions
    SET is_paid = TRUE
    WHERE student_id = p_student_id
      AND class_id = p_class_id
      AND NOT public.fn_student_locked_on(student_id, session_date);

    RETURN jsonb_build_object('success', true, 'updatedCount', v_updated_count);
END;
$$;
