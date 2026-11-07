-- =========================================================
-- MIGRATION: 20261107002000_debt_and_dashboard_rpc.sql
-- DESCRIPTION: SQL RPCs for class debt summary, attendance history,
--   KPI stats, and dashboard financial aggregates.
-- =========================================================

-- 1. RPC: fn_get_class_debt_summary
CREATE OR REPLACE FUNCTION public.fn_get_class_debt_summary(
    p_class_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tuition_fee NUMERIC(12,2) := 0;
    v_result JSONB;
BEGIN
    IF p_class_id IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.classes WHERE id = p_class_id) THEN
        RAISE EXCEPTION 'Class not found';
    END IF;

    SELECT COALESCE(tuition_fee, 0)
    INTO v_tuition_fee
    FROM public.classes
    WHERE id = p_class_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Class not found';
    END IF;

    WITH enrolled_students AS (
        SELECT
            p.id AS student_id,
            p.username,
            COALESCE(p.full_name, p.username) AS full_name,
            'HS-' || p.username AS student_code,
            COALESCE(sc.status, 'ACTIVE') AS status,
            COALESCE(p.balance, 0)::NUMERIC(12,2) AS balance,
            1 AS source_rank
        FROM public.student_classes sc
        JOIN public.profiles p ON p.id = sc.student_id
        WHERE sc.class_id = p_class_id
          AND p.role = 'STUDENT'

        UNION ALL

        SELECT
            p.id AS student_id,
            p.username,
            COALESCE(p.full_name, p.username) AS full_name,
            'HS-' || p.username AS student_code,
            'ACTIVE' AS status,
            COALESCE(p.balance, 0)::NUMERIC(12,2) AS balance,
            2 AS source_rank
        FROM public.profiles p
        WHERE p.class_id = p_class_id
          AND p.role = 'STUDENT'
          AND NOT EXISTS (
              SELECT 1 FROM public.student_classes sc2
              WHERE sc2.class_id = p_class_id AND sc2.student_id = p.id
          )
    ),
    ss_filtered AS (
        SELECT
            ss.id AS record_id,
            NULL::uuid AS session_id,
            ss.student_id,
            to_char(ss.session_date, 'YYYY-MM-DD') AS session_date_str,
            ss.session_date,
            NULL::text AS session_note,
            TRUE AS is_present,
            (ss.is_paid IS TRUE) AS is_paid,
            v_tuition_fee AS fee_amount,
            CASE WHEN ss.is_paid IS TRUE THEN 'paid' ELSE 'unpaid' END AS payment_status,
            NULL::text AS paid_at,
            'student_sessions'::text AS source
        FROM public.student_sessions ss
        JOIN enrolled_students es ON es.student_id = ss.student_id
        WHERE ss.class_id = p_class_id
          AND NOT EXISTS (
              SELECT 1 FROM public.student_lock_intervals sli
              WHERE sli.student_id = ss.student_id
                AND sli.start_date <= ss.session_date
                AND (sli.end_date IS NULL OR ss.session_date < sli.end_date)
          )
    ),
    ar_filtered AS (
        SELECT
            ar.id AS record_id,
            ase.id AS session_id,
            ar.student_id,
            to_char(ase.session_date, 'YYYY-MM-DD') AS session_date_str,
            ase.session_date,
            ase.note AS session_note,
            (ar.is_present IS TRUE) AS is_present,
            CASE
                WHEN ar.fee_amount IS NOT NULL AND ar.fee_amount > 0 THEN ar.fee_amount
                ELSE NULL
            END AS fee_amount_raw,
            COALESCE(ar.payment_status, 'none') AS payment_status_raw,
            ar.paid_at AS paid_at_value
        FROM public.attendance_records ar
        JOIN public.attendance_sessions ase ON ase.id = ar.session_id
        JOIN enrolled_students es ON es.student_id = ar.student_id
        WHERE ase.class_id = p_class_id
          AND NOT EXISTS (
              SELECT 1 FROM public.student_lock_intervals sli
              WHERE sli.student_id = ar.student_id
                AND sli.start_date <= ase.session_date
                AND (sli.end_date IS NULL OR ase.session_date < sli.end_date)
          )
    ),
    merged_sessions AS (
        SELECT
            COALESCE(ss.student_id, ar.student_id) AS student_id,
            COALESCE(ss.session_date_str, ar.session_date_str) AS session_date_str,
            COALESCE(ss.session_date, ar.session_date) AS session_date_val,
            CASE
                WHEN ar.record_id IS NOT NULL THEN
                    CASE
                        WHEN ar.is_present THEN
                            jsonb_build_object(
                                'recordId', ar.record_id,
                                'sessionId', ar.session_id,
                                'sessionDate', ar.session_date_str,
                                'sessionNote', ar.session_note,
                                'isPresent', true,
                                'isPaid', (ar.payment_status_raw = 'paid' OR COALESCE(ss.is_paid, false)),
                                'feeAmount', COALESCE(ar.fee_amount_raw, ss.fee_amount, v_tuition_fee),
                                'paymentStatus', CASE
                                    WHEN (ar.payment_status_raw = 'paid' OR COALESCE(ss.is_paid, false)) THEN 'paid'
                                    WHEN ar.payment_status_raw = 'waived' THEN 'waived'
                                    ELSE 'unpaid'
                                END,
                                'paidAt', ar.paid_at_value,
                                'source', 'attendance_records'
                            )
                        WHEN ss.record_id IS NOT NULL THEN
                            jsonb_build_object(
                                'recordId', ss.record_id,
                                'sessionId', null,
                                'sessionDate', ss.session_date_str,
                                'sessionNote', null,
                                'isPresent', true,
                                'isPaid', ss.is_paid,
                                'feeAmount', ss.fee_amount,
                                'paymentStatus', ss.payment_status,
                                'paidAt', null,
                                'source', 'student_sessions'
                            )
                        ELSE
                            jsonb_build_object(
                                'recordId', ar.record_id,
                                'sessionId', ar.session_id,
                                'sessionDate', ar.session_date_str,
                                'sessionNote', ar.session_note,
                                'isPresent', false,
                                'isPaid', false,
                                'feeAmount', 0,
                                'paymentStatus', 'none',
                                'paidAt', null,
                                'source', 'attendance_records'
                            )
                    END
                ELSE
                    jsonb_build_object(
                        'recordId', ss.record_id,
                        'sessionId', null,
                        'sessionDate', ss.session_date_str,
                        'sessionNote', null,
                        'isPresent', true,
                        'isPaid', ss.is_paid,
                        'feeAmount', ss.fee_amount,
                        'paymentStatus', ss.payment_status,
                        'paidAt', null,
                        'source', 'student_sessions'
                    )
            END AS session_obj
        FROM ss_filtered ss
        FULL OUTER JOIN ar_filtered ar
            ON ss.student_id = ar.student_id
           AND ss.session_date = ar.session_date
    ),
    student_aggregates AS (
        SELECT
            es.student_id,
            es.username,
            es.full_name,
            es.student_code,
            es.status,
            es.balance,
            es.source_rank,
            COUNT(ms.session_obj) AS total_sessions,
            COUNT(ms.session_obj) FILTER (WHERE (ms.session_obj->>'isPresent')::boolean = true) AS attended_sessions,
            COUNT(ms.session_obj) FILTER (WHERE (ms.session_obj->>'isPresent')::boolean = true AND (ms.session_obj->>'isPaid')::boolean = true) AS paid_sessions,
            COUNT(ms.session_obj) FILTER (WHERE (ms.session_obj->>'isPresent')::boolean = true AND (ms.session_obj->>'isPaid')::boolean = false AND ms.session_obj->>'paymentStatus' != 'waived') AS unpaid_sessions,
            COUNT(ms.session_obj) FILTER (WHERE (ms.session_obj->>'isPresent')::boolean = true AND ms.session_obj->>'paymentStatus' = 'waived') AS waived_sessions,
            COALESCE(SUM((ms.session_obj->>'feeAmount')::numeric) FILTER (WHERE (ms.session_obj->>'isPresent')::boolean = true AND (ms.session_obj->>'isPaid')::boolean = true), 0) AS paid_amount,
            COALESCE(SUM((ms.session_obj->>'feeAmount')::numeric) FILTER (WHERE (ms.session_obj->>'isPresent')::boolean = true AND (ms.session_obj->>'isPaid')::boolean = false AND ms.session_obj->>'paymentStatus' != 'waived'), 0) AS unpaid_debt,
            COALESCE(
                jsonb_agg(ms.session_obj ORDER BY ms.session_date_str DESC) FILTER (WHERE ms.session_obj IS NOT NULL),
                '[]'::jsonb
            ) AS sessions
        FROM enrolled_students es
        LEFT JOIN merged_sessions ms ON ms.student_id = es.student_id
        GROUP BY es.student_id, es.username, es.full_name, es.student_code, es.status, es.balance, es.source_rank
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'studentId', sa.student_id,
                'username', sa.username,
                'fullName', sa.full_name,
                'studentCode', sa.student_code,
                'status', sa.status,
                'balance', sa.balance,
                'attendedSessions', sa.attended_sessions,
                'totalSessions', sa.total_sessions,
                'paidSessions', sa.paid_sessions,
                'unpaidSessions', sa.unpaid_sessions,
                'waivedSessions', sa.waived_sessions,
                'paidAmount', sa.paid_amount,
                'unpaidDebt', sa.unpaid_debt,
                'attendanceRate', CASE
                    WHEN sa.total_sessions > 0 THEN ROUND((sa.attended_sessions::numeric * 100.0) / sa.total_sessions::numeric)
                    ELSE 100
                END,
                'isFullyPaid', (sa.unpaid_debt = 0),
                'sessions', sa.sessions
            )
            ORDER BY sa.source_rank, sa.student_id
        ),
        '[]'::jsonb
    )
    INTO v_result
    FROM student_aggregates sa;

    RETURN v_result;
END;
$$;


-- 2. RPC: fn_get_class_attendance_history
CREATE OR REPLACE FUNCTION public.fn_get_class_attendance_history(
    p_class_id UUID,
    p_month TEXT DEFAULT NULL,
    p_page INT DEFAULT 1,
    p_page_size INT DEFAULT 10,
    p_has_paging BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tuition_fee NUMERIC(12,2) := 0;
    v_page_size INT := 10;
    v_safe_page INT := 1;
    v_formatted JSONB := '[]'::jsonb;
BEGIN
    IF p_class_id IS NULL THEN
        IF p_has_paging THEN
            RETURN jsonb_build_object(
                'items', '[]'::jsonb,
                'total', 0,
                'page', 1,
                'pageSize', COALESCE(p_page_size, 10),
                'totalPages', 1,
                'months', '[]'::jsonb
            );
        ELSE
            RETURN '[]'::jsonb;
        END IF;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.classes WHERE id = p_class_id) THEN
        RAISE EXCEPTION 'Class not found';
    END IF;

    SELECT COALESCE(tuition_fee, 0)
    INTO v_tuition_fee
    FROM public.classes
    WHERE id = p_class_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Class not found';
    END IF;

    v_page_size := LEAST(100, GREATEST(1, COALESCE(p_page_size, 10)));
    v_safe_page := GREATEST(1, COALESCE(p_page, 1));

    WITH enrolled_students AS (
        SELECT p.id AS student_id
        FROM public.student_classes sc
        JOIN public.profiles p ON p.id = sc.student_id
        WHERE sc.class_id = p_class_id
          AND p.role = 'STUDENT'

        UNION

        SELECT p.id AS student_id
        FROM public.profiles p
        WHERE p.class_id = p_class_id
          AND p.role = 'STUDENT'
    ),
    enrolled_count AS (
        SELECT COUNT(*)::INT AS total_enrolled FROM enrolled_students
    ),
    att_sessions AS (
        SELECT
            ase.id AS session_id,
            ase.session_date,
            to_char(ase.session_date, 'YYYY-MM-DD') AS session_date_str,
            ase.note,
            CASE
                WHEN ase.fee_per_session IS NOT NULL AND ase.fee_per_session > 0 THEN ase.fee_per_session
                ELSE v_tuition_fee
            END AS fee_per_session,
            ase.created_at AS created_at_value
        FROM public.attendance_sessions ase
        WHERE ase.class_id = p_class_id
    ),
    att_records AS (
        SELECT
            ar.session_id,
            ase.session_date,
            to_char(ase.session_date, 'YYYY-MM-DD') AS session_date_str,
            ar.student_id,
            (ar.is_present IS TRUE) AS is_present,
            CASE
                WHEN ar.fee_amount IS NOT NULL AND ar.fee_amount > 0 THEN ar.fee_amount
                ELSE
                    CASE
                        WHEN ase.fee_per_session IS NOT NULL AND ase.fee_per_session > 0 THEN ase.fee_per_session
                        ELSE v_tuition_fee
                    END
            END AS fee_amount,
            COALESCE(ar.payment_status, 'none') AS payment_status
        FROM public.attendance_records ar
        JOIN public.attendance_sessions ase ON ase.id = ar.session_id
        JOIN enrolled_students es ON es.student_id = ar.student_id
        WHERE ase.class_id = p_class_id
          AND NOT EXISTS (
              SELECT 1 FROM public.student_lock_intervals sli
              WHERE sli.student_id = ar.student_id
                AND sli.start_date <= ase.session_date
                AND (sli.end_date IS NULL OR ase.session_date < sli.end_date)
          )
    ),
    stu_sessions AS (
        SELECT
            ss.student_id,
            ss.session_date,
            to_char(ss.session_date, 'YYYY-MM-DD') AS session_date_str,
            (ss.is_paid IS TRUE) AS is_paid
        FROM public.student_sessions ss
        JOIN enrolled_students es ON es.student_id = ss.student_id
        WHERE ss.class_id = p_class_id
          AND NOT EXISTS (
              SELECT 1 FROM public.student_lock_intervals sli
              WHERE sli.student_id = ss.student_id
                AND sli.start_date <= ss.session_date
                AND (sli.end_date IS NULL OR ss.session_date < sli.end_date)
          )
    ),
    all_dates AS (
        SELECT session_date, session_date_str FROM att_sessions
        UNION
        SELECT session_date, session_date_str FROM stu_sessions
    ),
    date_meta AS (
        SELECT
            ad.session_date,
            ad.session_date_str,
            ase.session_id,
            ase.note,
            COALESCE(ase.fee_per_session, v_tuition_fee) AS fee_per_session,
            ase.created_at_value
        FROM all_dates ad
        LEFT JOIN att_sessions ase ON ase.session_date = ad.session_date
    ),
    merged_records AS (
        SELECT
            COALESCE(ar.session_date, ss.session_date) AS session_date,
            COALESCE(ar.session_date_str, ss.session_date_str) AS session_date_str,
            COALESCE(ar.student_id, ss.student_id) AS student_id,
            -- Attendance history builds the attendance-record map first.  A
            -- same-day student_session may add a missing record or upgrade
            -- payment to paid, but it does not turn an existing absence into
            -- presence (different from the KPI merge order below).
            CASE
                WHEN ar.student_id IS NOT NULL THEN ar.is_present
                WHEN ss.student_id IS NOT NULL THEN true
                ELSE false
            END AS is_present,
            CASE
                WHEN ar.student_id IS NOT NULL THEN
                    CASE
                        WHEN ss.is_paid IS TRUE THEN 'paid'
                        ELSE ar.payment_status
                    END
                ELSE
                    CASE WHEN ss.is_paid IS TRUE THEN 'paid' ELSE 'unpaid' END
            END AS payment_status,
            CASE
                WHEN ar.student_id IS NOT NULL THEN ar.fee_amount
                ELSE NULL
            END AS ar_fee_amount
        FROM att_records ar
        FULL OUTER JOIN stu_sessions ss
            ON ss.session_date = ar.session_date
           AND ss.student_id = ar.student_id
        WHERE ar.student_id IS NOT NULL OR ss.student_id IS NOT NULL
    ),
    active_students_on_date AS (
        SELECT
            ad.session_date_str,
            COUNT(es.student_id)::INT AS active_count
        FROM all_dates ad
        CROSS JOIN enrolled_students es
        WHERE NOT EXISTS (
            SELECT 1 FROM public.student_lock_intervals sli
            WHERE sli.student_id = es.student_id
              AND sli.start_date <= ad.session_date
              AND (sli.end_date IS NULL OR ad.session_date < sli.end_date)
        )
        GROUP BY ad.session_date_str
    ),
    date_summary AS (
        SELECT
            dm.session_date_str AS session_date,
            COALESCE(dm.session_id::text, 'session-' || dm.session_date_str) AS id,
            p_class_id AS class_id,
            dm.note,
            dm.fee_per_session,
            dm.created_at_value AS created_at,
            COUNT(mr.student_id) FILTER (WHERE mr.is_present = true)::INT AS present_count,
            CASE
                WHEN (SELECT total_enrolled FROM enrolled_count) > 0 THEN COALESCE(aod.active_count, 0)
                ELSE COUNT(mr.student_id)::INT
            END AS total_count,
            COUNT(mr.student_id) FILTER (WHERE mr.is_present = true AND mr.payment_status = 'paid')::INT AS paid_count,
            COUNT(mr.student_id) FILTER (WHERE mr.is_present = true AND mr.payment_status = 'unpaid')::INT AS unpaid_count,
            COALESCE(SUM(COALESCE(mr.ar_fee_amount, dm.fee_per_session)) FILTER (WHERE mr.is_present = true AND mr.payment_status != 'waived'), 0)::NUMERIC(12,2) AS total_fee
        FROM date_meta dm
        LEFT JOIN merged_records mr ON mr.session_date = dm.session_date
        LEFT JOIN active_students_on_date aod ON aod.session_date_str = dm.session_date_str
        GROUP BY dm.session_date_str, dm.session_date, dm.session_id, dm.note, dm.fee_per_session, dm.created_at_value, aod.active_count
    ),
    formatted_dates AS (
        SELECT
            ds.id,
            ds.class_id AS "classId",
            ds.session_date AS "sessionDate",
            ds.note,
            ds.fee_per_session AS "feePerSession",
            ds.created_at AS "createdAt",
            ds.present_count AS "presentCount",
            CASE
                WHEN ds.total_count > ds.present_count THEN ds.total_count - ds.present_count
                ELSE 0
            END AS "absentCount",
            ds.total_count AS "totalCount",
            ds.paid_count AS "paidCount",
            ds.unpaid_count AS "unpaidCount",
            ds.total_fee AS "totalFee",
            CASE
                WHEN ds.total_count > 0 THEN ROUND((ds.present_count::numeric * 100.0) / ds.total_count::numeric)
                ELSE 0
            END AS "attendanceRate"
        FROM date_summary ds
        ORDER BY ds.session_date DESC
    ),
    all_months AS (
        SELECT COALESCE(
            jsonb_agg(DISTINCT SUBSTRING("sessionDate" FROM 1 FOR 7) ORDER BY SUBSTRING("sessionDate" FROM 1 FOR 7) DESC),
            '[]'::jsonb
        ) AS months
        FROM formatted_dates
    ),
    scoped AS (
        SELECT fd.*
        FROM formatted_dates fd
        WHERE (p_month IS NULL OR p_month = '' OR fd."sessionDate" LIKE p_month || '%')
    ),
    total_cnt AS (
        SELECT COUNT(*)::INT AS cnt FROM scoped
    ),
    paged AS (
        SELECT *
        FROM scoped
        ORDER BY "sessionDate" DESC
        OFFSET ((LEAST(v_safe_page, GREATEST(1, CEIL((SELECT cnt FROM total_cnt)::numeric / v_page_size))) - 1) * v_page_size)
        LIMIT v_page_size
    )
    SELECT
        CASE
            WHEN NOT p_has_paging THEN
                COALESCE((SELECT jsonb_agg(to_jsonb(scoped) ORDER BY "sessionDate" DESC) FROM scoped), '[]'::jsonb)
            ELSE
                jsonb_build_object(
                    'items', COALESCE((SELECT jsonb_agg(to_jsonb(paged) ORDER BY "sessionDate" DESC) FROM paged), '[]'::jsonb),
                    'total', (SELECT cnt FROM total_cnt),
                    'page', LEAST(v_safe_page, GREATEST(1, CEIL((SELECT cnt FROM total_cnt)::numeric / v_page_size))),
                    'pageSize', v_page_size,
                    'totalPages', GREATEST(1, CEIL((SELECT cnt FROM total_cnt)::numeric / v_page_size)),
                    'months', (SELECT months FROM all_months)
                )
        END
    INTO v_formatted;

    RETURN v_formatted;
END;
$$;


-- 3. RPC: fn_get_class_kpi_stats
CREATE OR REPLACE FUNCTION public.fn_get_class_kpi_stats(
    p_class_id UUID,
    p_now TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tuition_fee NUMERIC(12,2) := 0;
    v_now TIMESTAMPTZ := COALESCE(p_now, NOW());
    v_now_iso TEXT := to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    v_thirty_days_ago_str TEXT := to_char((v_now - INTERVAL '30 days') AT TIME ZONE 'UTC', 'YYYY-MM-DD');
    v_today_str TEXT := to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD');
    v_month_prefix TEXT := SUBSTRING(v_today_str FROM 1 FOR 7);

    v_total_students INT := 0;
    v_active_students INT := 0;
    v_paused_students INT := 0;

    v_last30_present INT := 0;
    v_last30_total INT := 0;
    v_attendance_rate_30 NUMERIC(5,1) := 100.0;

    v_total_unpaid_amount NUMERIC(12,2) := 0;
    v_owing_students_count INT := 0;

    v_hw_total_count INT := 0;
    v_hw_open_count INT := 0;
    v_pending_submissions_count INT := 0;

    v_total_held INT := 0;
    v_month_held INT := 0;
    v_latest_date TEXT := NULL;
    v_latest_session JSONB := NULL;
    v_latest_note TEXT := NULL;
    v_latest_present INT := 0;
    v_latest_total INT := 0;
BEGIN
    IF p_class_id IS NULL THEN
        RETURN jsonb_build_object(
            'totalStudents', jsonb_build_object('total', 0, 'active', 0, 'paused', 0),
            'attendanceRate30Days', 100,
            'uncollectedTuition', jsonb_build_object('totalAmount', 0, 'owingStudentsCount', 0),
            'homeworks', jsonb_build_object('totalCount', 0, 'openCount', 0, 'pendingSubmissionsCount', 0),
            'sessions', jsonb_build_object('totalHeld', 0, 'monthHeld', 0, 'month', v_month_prefix),
            'latestSession', null
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.classes WHERE id = p_class_id) THEN
        RAISE EXCEPTION 'Class not found';
    END IF;

    SELECT COALESCE(tuition_fee, 0)
    INTO v_tuition_fee
    FROM public.classes
    WHERE id = p_class_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Class not found';
    END IF;

    WITH enrolled_students AS (
        SELECT
            p.id AS student_id,
            COALESCE(sc.status, 'ACTIVE') AS status
        FROM public.student_classes sc
        JOIN public.profiles p ON p.id = sc.student_id
        WHERE sc.class_id = p_class_id
          AND p.role = 'STUDENT'

        UNION

        SELECT
            p.id AS student_id,
            'ACTIVE' AS status
        FROM public.profiles p
        WHERE p.class_id = p_class_id
          AND p.role = 'STUDENT'
          AND NOT EXISTS (
              SELECT 1 FROM public.student_classes sc2
              WHERE sc2.class_id = p_class_id AND sc2.student_id = p.id
          )
    )
    SELECT
        COUNT(*)::INT,
        COUNT(*) FILTER (WHERE status != 'PAUSED')::INT,
        COUNT(*) FILTER (WHERE status = 'PAUSED')::INT
    INTO v_total_students, v_active_students, v_paused_students
    FROM enrolled_students;

    -- Merge sessions theo unifiedMap của từng student
    WITH enrolled_students AS (
        SELECT
            p.id AS student_id,
            COALESCE(sc.status, 'ACTIVE') AS status
        FROM public.student_classes sc
        JOIN public.profiles p ON p.id = sc.student_id
        WHERE sc.class_id = p_class_id
          AND p.role = 'STUDENT'

        UNION

        SELECT
            p.id AS student_id,
            'ACTIVE' AS status
        FROM public.profiles p
        WHERE p.class_id = p_class_id
          AND p.role = 'STUDENT'
          AND NOT EXISTS (
              SELECT 1 FROM public.student_classes sc2
              WHERE sc2.class_id = p_class_id AND sc2.student_id = p.id
          )
    ),
    stu_sessions AS (
        SELECT
            ss.student_id,
            to_char(ss.session_date, 'YYYY-MM-DD') AS session_date_str,
            ss.session_date,
            TRUE AS is_present,
            (ss.is_paid IS TRUE) AS is_paid,
            v_tuition_fee AS fee_amount
        FROM public.student_sessions ss
        JOIN enrolled_students es ON es.student_id = ss.student_id
        WHERE ss.class_id = p_class_id
          AND NOT EXISTS (
              SELECT 1 FROM public.student_lock_intervals sli
              WHERE sli.student_id = ss.student_id
                AND sli.start_date <= ss.session_date
                AND (sli.end_date IS NULL OR ss.session_date < sli.end_date)
          )
    ),
    att_records AS (
        SELECT
            ar.student_id,
            to_char(ase.session_date, 'YYYY-MM-DD') AS session_date_str,
            ase.session_date,
            (ar.is_present IS TRUE) AS is_present,
            (ar.payment_status = 'paid') AS is_paid_flag,
            (ar.payment_status = 'waived') AS is_waived_flag,
            CASE
                WHEN ar.fee_amount IS NOT NULL AND ar.fee_amount > 0 THEN ar.fee_amount
                ELSE NULL
            END AS fee_amount_raw,
            CASE
                WHEN ase.fee_per_session IS NOT NULL AND ase.fee_per_session > 0 THEN ase.fee_per_session
                ELSE v_tuition_fee
            END AS attendance_fee
        FROM public.attendance_records ar
        JOIN public.attendance_sessions ase ON ase.id = ar.session_id
        JOIN enrolled_students es ON es.student_id = ar.student_id
        WHERE ase.class_id = p_class_id
          AND NOT EXISTS (
              SELECT 1 FROM public.student_lock_intervals sli
              WHERE sli.student_id = ar.student_id
                AND sli.start_date <= ase.session_date
                AND (sli.end_date IS NULL OR ase.session_date < sli.end_date)
          )
    ),
    unified_sessions AS (
        SELECT
            COALESCE(ss.student_id, ar.student_id) AS student_id,
            COALESCE(ss.session_date_str, ar.session_date_str) AS session_date_str,
            CASE
                WHEN ar.student_id IS NOT NULL AND ar.is_present THEN true
                WHEN ss.student_id IS NOT NULL THEN true
                ELSE false
            END AS is_present,
            CASE
                WHEN ar.student_id IS NOT NULL THEN
                    CASE
                        WHEN ar.is_present THEN (ar.is_paid_flag OR ar.is_waived_flag OR COALESCE(ss.is_paid, false))
                        ELSE COALESCE(ss.is_paid, false)
                    END
                ELSE COALESCE(ss.is_paid, false)
            END AS is_paid,
            CASE
                WHEN ar.student_id IS NOT NULL THEN
                    CASE
                        WHEN ar.is_present THEN
                            CASE WHEN ar.is_waived_flag THEN 0 ELSE COALESCE(ar.fee_amount_raw, NULLIF(ss.fee_amount, 0), ar.attendance_fee, v_tuition_fee) END
                        WHEN ss.student_id IS NOT NULL THEN ss.fee_amount
                        ELSE 0
                    END
                ELSE ss.fee_amount
            END AS fee_amount
        FROM stu_sessions ss
        FULL OUTER JOIN att_records ar
            ON ss.student_id = ar.student_id
           AND ss.session_date = ar.session_date
        WHERE ss.student_id IS NOT NULL OR ar.student_id IS NOT NULL
    ),
    last_30_stats AS (
        SELECT
            COUNT(*)::INT AS l30_total,
            COUNT(*) FILTER (WHERE is_present = true)::INT AS l30_present
        FROM unified_sessions
        WHERE session_date_str >= v_thirty_days_ago_str
    ),
    per_student_debt AS (
        SELECT
            student_id,
            COALESCE(SUM(fee_amount) FILTER (WHERE is_present = true AND is_paid = false), 0) AS debt
        FROM unified_sessions
        GROUP BY student_id
    )
    SELECT
        (SELECT l30_present FROM last_30_stats),
        (SELECT l30_total FROM last_30_stats),
        COALESCE(SUM(debt) FILTER (WHERE debt > 0), 0),
        COUNT(*) FILTER (WHERE debt > 0)::INT
    INTO v_last30_present, v_last30_total, v_total_unpaid_amount, v_owing_students_count
    FROM per_student_debt;

    IF v_last30_total > 0 THEN
        v_attendance_rate_30 := ROUND((v_last30_present::numeric * 1000.0) / v_last30_total::numeric) / 10.0;
    ELSE
        v_attendance_rate_30 := 100.0;
    END IF;

    -- All dates calculation for sessions info
    WITH all_dates AS (
        SELECT to_char(session_date, 'YYYY-MM-DD') AS session_date_str
        FROM public.student_sessions ss
        WHERE ss.class_id = p_class_id
          AND EXISTS (
              -- Như JS gốc: chỉ tính học sinh role STUDENT (cả ghi danh student_classes lẫn legacy).
              SELECT 1 FROM public.student_classes sc JOIN public.profiles sp ON sp.id = sc.student_id
              WHERE sc.class_id = p_class_id AND sc.student_id = ss.student_id AND sp.role = 'STUDENT'
              UNION
              SELECT 1 FROM public.profiles p WHERE p.class_id = p_class_id AND p.role = 'STUDENT' AND p.id = ss.student_id
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.student_lock_intervals sli
              WHERE sli.student_id = ss.student_id
                AND sli.start_date <= ss.session_date
                AND (sli.end_date IS NULL OR ss.session_date < sli.end_date)
          )
        UNION
        SELECT to_char(session_date, 'YYYY-MM-DD') AS session_date_str
        FROM public.attendance_sessions
        WHERE class_id = p_class_id
    )
    SELECT
        COUNT(*)::INT,
        COUNT(*) FILTER (WHERE SUBSTRING(session_date_str FROM 1 FOR 7) = v_month_prefix AND session_date_str <= v_today_str)::INT,
        MAX(session_date_str)
    INTO v_total_held, v_month_held, v_latest_date
    FROM all_dates;

    -- Latest session info
    IF v_latest_date IS NOT NULL THEN
        SELECT NULLIF(note, '')  -- JS gốc: `note || null`
        INTO v_latest_note
        FROM public.attendance_sessions
        WHERE class_id = p_class_id
          AND to_char(session_date, 'YYYY-MM-DD') = v_latest_date
        LIMIT 1;

        WITH enrolled_students AS (
            SELECT p.id AS student_id
            FROM public.student_classes sc
            JOIN public.profiles p ON p.id = sc.student_id
            WHERE sc.class_id = p_class_id AND p.role = 'STUDENT'
            UNION
            SELECT p.id AS student_id
            FROM public.profiles p
            WHERE p.class_id = p_class_id AND p.role = 'STUDENT'
        ),
        date_records AS (
            SELECT
                es.student_id,
                CASE
                    WHEN ar.student_id IS NOT NULL AND ar.is_present THEN true
                    WHEN ss.student_id IS NOT NULL THEN true
                    ELSE false
                END AS is_present
            FROM enrolled_students es
            LEFT JOIN public.attendance_records ar
                ON ar.student_id = es.student_id
               AND EXISTS (
                   SELECT 1 FROM public.attendance_sessions ase
                   WHERE ase.id = ar.session_id
                     AND ase.class_id = p_class_id
                     AND to_char(ase.session_date, 'YYYY-MM-DD') = v_latest_date
               )
            LEFT JOIN public.student_sessions ss
                ON ss.student_id = es.student_id
               AND ss.class_id = p_class_id
               AND to_char(ss.session_date, 'YYYY-MM-DD') = v_latest_date
            WHERE (ar.student_id IS NOT NULL OR ss.student_id IS NOT NULL)
              AND NOT EXISTS (
                  SELECT 1 FROM public.student_lock_intervals sli
                  WHERE sli.student_id = es.student_id
                    AND sli.start_date <= v_latest_date::date
                    AND (sli.end_date IS NULL OR v_latest_date::date < sli.end_date)
              )
        )
        SELECT
            COUNT(*)::INT,
            COUNT(*) FILTER (WHERE is_present = true)::INT
        INTO v_latest_total, v_latest_present
        FROM date_records;

        IF v_latest_total = 0 THEN
            v_latest_total := v_active_students;
        END IF;

        v_latest_session := jsonb_build_object(
            'sessionDate', v_latest_date,
            'presentCount', v_latest_present,
            'totalCount', v_latest_total,
            'note', v_latest_note
        );
    END IF;

    -- Homework stats
    WITH class_homeworks AS (
        SELECT
            h.id,
            h.is_published,
            h.deadline
        FROM public.homeworks h
        JOIN public.lessons l ON l.id = h.lesson_id
        JOIN public.chapters c ON c.id = l.chapter_id
        WHERE c.class_id = p_class_id
    ),
    open_homeworks AS (
        SELECT id
        FROM class_homeworks
        WHERE is_published = true
          AND (deadline IS NULL OR deadline >= v_now)
    ),
    enrolled_students AS (
        SELECT p.id AS student_id
        FROM public.student_classes sc
        JOIN public.profiles p ON p.id = sc.student_id
        WHERE sc.class_id = p_class_id AND p.role = 'STUDENT'
        UNION
        SELECT p.id AS student_id
        FROM public.profiles p
        WHERE p.class_id = p_class_id AND p.role = 'STUDENT'
    ),
    eligible_students AS (
        SELECT es.student_id
        FROM enrolled_students es
        WHERE NOT EXISTS (
            SELECT 1 FROM public.student_lock_intervals sli
            WHERE sli.student_id = es.student_id
              AND sli.end_date IS NULL
        )
    ),
    submitted_pairs AS (
        SELECT sub.homework_id, sub.student_id
        FROM public.submissions sub
        JOIN open_homeworks oh ON oh.id = sub.homework_id
        WHERE sub.status = 'SUBMITTED'
    )
    SELECT
        (SELECT COUNT(*)::INT FROM class_homeworks),
        (SELECT COUNT(*)::INT FROM open_homeworks),
        COUNT(*)::INT
    INTO v_hw_total_count, v_hw_open_count, v_pending_submissions_count
    FROM open_homeworks oh
    CROSS JOIN eligible_students es
    LEFT JOIN submitted_pairs sp
        ON sp.homework_id = oh.id
       AND sp.student_id = es.student_id
    WHERE sp.homework_id IS NULL;

    RETURN jsonb_build_object(
        'totalStudents', jsonb_build_object(
            'total', v_total_students,
            'active', v_active_students,
            'paused', v_paused_students
        ),
        'attendanceRate30Days', v_attendance_rate_30,
        'uncollectedTuition', jsonb_build_object(
            'totalAmount', v_total_unpaid_amount,
            'owingStudentsCount', v_owing_students_count
        ),
        'homeworks', jsonb_build_object(
            'totalCount', v_hw_total_count,
            'openCount', v_hw_open_count,
            'pendingSubmissionsCount', v_pending_submissions_count
        ),
        'sessions', jsonb_build_object(
            'totalHeld', v_total_held,
            'monthHeld', v_month_held,
            'month', v_month_prefix
        ),
        'latestSession', v_latest_session
    );
END;
$$;


-- 4. RPC: fn_get_dashboard_financial_stats
CREATE OR REPLACE FUNCTION public.fn_get_dashboard_financial_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_students INT := 0;
    v_total_classes INT := 0;
    v_total_taught_sessions INT := 0;
    v_total_tuition_fee NUMERIC(14,2) := 0;
    v_total_paid_tuition_fee NUMERIC(14,2) := 0;
    v_total_unpaid_tuition_fee NUMERIC(14,2) := 0;
    v_collection_rate INT := 0;
    v_monthly_stats JSONB := '[]'::jsonb;
    v_student_attendance_stats JSONB := '[]'::jsonb;
BEGIN
    SELECT COUNT(*)::INT
    INTO v_total_students
    FROM public.profiles
    WHERE role = 'STUDENT';

    SELECT COUNT(*)::INT
    INTO v_total_classes
    FROM public.classes;

    -- Lọc student_sessions không bị lock
    WITH valid_student_sessions AS (
        SELECT
            ss.id,
            ss.student_id,
            ss.class_id,
            ss.session_date,
            to_char(ss.session_date, 'YYYY-MM-DD') AS session_date_str,
            to_char(ss.session_date, 'YYYY-MM') AS month_key,
            (ss.is_paid IS TRUE) AS is_paid,
            COALESCE(c.tuition_fee, 0)::NUMERIC(12,2) AS tuition_fee
        FROM public.student_sessions ss
        JOIN public.classes c ON c.id = ss.class_id
        WHERE NOT EXISTS (
            SELECT 1 FROM public.student_lock_intervals sli
            WHERE sli.student_id = ss.student_id
              AND sli.start_date <= ss.session_date
              AND (sli.end_date IS NULL OR ss.session_date < sli.end_date)
        )
    ),
    -- Class sessions duy nhất từ class_sessions + valid_student_sessions
    unique_taught_sessions AS (
        SELECT class_id, session_date, to_char(session_date, 'YYYY-MM') AS month_key
        FROM public.class_sessions
        UNION
        SELECT class_id, session_date, month_key
        FROM valid_student_sessions
    ),
    taught_counts AS (
        SELECT
            month_key,
            COUNT(*)::INT AS month_session_count
        FROM unique_taught_sessions
        GROUP BY month_key
    ),
    -- Thống kê tiền theo tháng
    monthly_money AS (
        SELECT
            vss.month_key,
            COUNT(*)::INT AS student_session_count,
            COALESCE(SUM(vss.tuition_fee), 0)::NUMERIC(14,2) AS tuition_fee,
            COALESCE(SUM(vss.tuition_fee) FILTER (WHERE vss.is_paid = true), 0)::NUMERIC(14,2) AS paid_tuition_fee
        FROM valid_student_sessions vss
        GROUP BY vss.month_key
    ),
    -- Tập hợp các tháng xuất hiện ở taught_sessions hoặc student_sessions
    all_months AS (
        SELECT DISTINCT month_key FROM unique_taught_sessions WHERE month_key IS NOT NULL
        UNION
        SELECT DISTINCT month_key FROM valid_student_sessions WHERE month_key IS NOT NULL
    ),
    monthly_combined AS (
        SELECT
            am.month_key AS month,
            'Tháng ' || SUBSTRING(am.month_key FROM 6 FOR 2) || '/' || SUBSTRING(am.month_key FROM 1 FOR 4) AS label,
            COALESCE(tc.month_session_count, 0) AS session_count,
            0 AS submission_count,
            COALESCE(mm.tuition_fee, 0) AS tuition_fee,
            COALESCE(mm.paid_tuition_fee, 0) AS paid_tuition_fee,
            (COALESCE(mm.tuition_fee, 0) - COALESCE(mm.paid_tuition_fee, 0)) AS unpaid_tuition_fee,
            COALESCE(mm.student_session_count, 0) AS student_session_count
        FROM all_months am
        LEFT JOIN taught_counts tc ON tc.month_key = am.month_key
        LEFT JOIN monthly_money mm ON mm.month_key = am.month_key
        ORDER BY am.month_key ASC
    ),
    -- Lấy thông tin lớp của từng học sinh (student_classes + profiles.class_id)
    student_class_mapping AS (
        SELECT sc.student_id, sc.class_id, c.name AS class_name, 1 AS source_rank
        FROM public.student_classes sc
        JOIN public.classes c ON c.id = sc.class_id

        UNION ALL

        SELECT p.id AS student_id, p.class_id, c.name AS class_name, 2 AS source_rank
        FROM public.profiles p
        JOIN public.classes c ON c.id = p.class_id
        WHERE p.role = 'STUDENT' AND p.class_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM public.student_classes sc
              WHERE sc.student_id = p.id AND sc.class_id = p.class_id
          )
    ),
    student_classes_grouped AS (
        SELECT
            scm.student_id,
            jsonb_agg(scm.class_id ORDER BY scm.source_rank, scm.class_id) AS class_ids,
            jsonb_agg(scm.class_name ORDER BY scm.source_rank, scm.class_id) AS class_names,
            string_agg(scm.class_name, ', ' ORDER BY scm.source_rank, scm.class_id) AS class_name
        FROM student_class_mapping scm
        GROUP BY scm.student_id
    ),
    -- Thống kê theo học sinh và theo tháng
    student_monthly_agg AS (
        SELECT
            vss.student_id,
            vss.month_key,
            COUNT(*)::INT AS attended_sessions,
            COUNT(*) FILTER (WHERE vss.is_paid = true)::INT AS paid_sessions,
            COUNT(*) FILTER (WHERE vss.is_paid = false)::INT AS unpaid_sessions,
            COALESCE(SUM(vss.tuition_fee), 0)::NUMERIC(14,2) AS tuition_fee,
            COALESCE(SUM(vss.tuition_fee) FILTER (WHERE vss.is_paid = true), 0)::NUMERIC(14,2) AS paid_tuition_fee,
            COALESCE(SUM(vss.tuition_fee) FILTER (WHERE vss.is_paid = false), 0)::NUMERIC(14,2) AS unpaid_tuition_fee
        FROM valid_student_sessions vss
        GROUP BY vss.student_id, vss.month_key
    ),
    student_monthly_json AS (
        SELECT
            sma.student_id,
            jsonb_object_agg(
                sma.month_key,
                jsonb_build_object(
                    'month', sma.month_key,
                    'label', 'Tháng ' || SUBSTRING(sma.month_key FROM 6 FOR 2) || '/' || SUBSTRING(sma.month_key FROM 1 FOR 4),
                    'attendedSessions', sma.attended_sessions,
                    'paidSessions', sma.paid_sessions,
                    'unpaidSessions', sma.unpaid_sessions,
                    'tuitionFee', sma.tuition_fee,
                    'paidTuitionFee', sma.paid_tuition_fee,
                    'unpaidTuitionFee', sma.unpaid_tuition_fee,
                    'isFullyPaid', (sma.unpaid_sessions = 0)
                )
            ) AS monthly_map
        FROM student_monthly_agg sma
        GROUP BY sma.student_id
    ),
    student_total_agg AS (
        SELECT
            p.id AS student_id,
            p.username,
            COALESCE(p.full_name, p.username) AS full_name,
            COALESCE(scg.class_ids, '[]'::jsonb) AS class_ids,
            COALESCE(scg.class_names, '[]'::jsonb) AS class_names,
            COALESCE(scg.class_name, 'Chưa vào lớp') AS class_name,
            COALESCE(smj.monthly_map, '{}'::jsonb) AS monthly,
            COUNT(vss.id)::INT AS attended_sessions,
            COUNT(vss.id) FILTER (WHERE vss.is_paid = true)::INT AS paid_sessions,
            COUNT(vss.id) FILTER (WHERE vss.is_paid = false)::INT AS unpaid_sessions,
            COALESCE(SUM(vss.tuition_fee), 0)::NUMERIC(14,2) AS tuition_fee,
            COALESCE(SUM(vss.tuition_fee) FILTER (WHERE vss.is_paid = true), 0)::NUMERIC(14,2) AS paid_tuition_fee,
            COALESCE(SUM(vss.tuition_fee) FILTER (WHERE vss.is_paid = false), 0)::NUMERIC(14,2) AS unpaid_tuition_fee
        FROM public.profiles p
        LEFT JOIN student_classes_grouped scg ON scg.student_id = p.id
        LEFT JOIN valid_student_sessions vss ON vss.student_id = p.id
        LEFT JOIN student_monthly_json smj ON smj.student_id = p.id
        WHERE p.role = 'STUDENT'
        GROUP BY p.id, p.username, p.full_name, scg.class_ids, scg.class_names, scg.class_name, smj.monthly_map
    )
    SELECT
        COALESCE((SELECT COUNT(DISTINCT (class_id, session_date)) FROM unique_taught_sessions), 0),
        COALESCE(SUM(vss.tuition_fee), 0),
        COALESCE(SUM(vss.tuition_fee) FILTER (WHERE vss.is_paid = true), 0),
        (COALESCE(SUM(vss.tuition_fee), 0) - COALESCE(SUM(vss.tuition_fee) FILTER (WHERE vss.is_paid = true), 0)),
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'month', mc.month,
                    'label', mc.label,
                    'sessionCount', mc.session_count,
                    'submissionCount', mc.submission_count,
                    'tuitionFee', mc.tuition_fee,
                    'paidTuitionFee', mc.paid_tuition_fee,
                    'unpaidTuitionFee', mc.unpaid_tuition_fee,
                    'studentSessionCount', mc.student_session_count
                ) ORDER BY mc.month
            )
            FROM monthly_combined mc
        ), '[]'::jsonb),
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'studentId', sta.student_id,
                    'username', sta.username,
                    'fullName', sta.full_name,
                    'classIds', sta.class_ids,
                    'classNames', sta.class_names,
                    'className', sta.class_name,
                    'monthly', sta.monthly,
                    'total', jsonb_build_object(
                        'attendedSessions', sta.attended_sessions,
                        'paidSessions', sta.paid_sessions,
                        'unpaidSessions', sta.unpaid_sessions,
                        'tuitionFee', sta.tuition_fee,
                        'paidTuitionFee', sta.paid_tuition_fee,
                        'unpaidTuitionFee', sta.unpaid_tuition_fee,
                        'isFullyPaid', (sta.unpaid_sessions = 0)
                    )
                )
                ORDER BY sta.unpaid_tuition_fee DESC, sta.attended_sessions DESC, sta.full_name ASC, sta.student_id ASC
            )
            FROM student_total_agg sta
        ), '[]'::jsonb)
    INTO v_total_taught_sessions, v_total_tuition_fee, v_total_paid_tuition_fee,
         v_total_unpaid_tuition_fee, v_monthly_stats, v_student_attendance_stats
    FROM valid_student_sessions vss;

    IF v_total_tuition_fee > 0 THEN
        v_collection_rate := ROUND((v_total_paid_tuition_fee * 100.0) / v_total_tuition_fee);
    ELSE
        v_collection_rate := 0;
    END IF;

    RETURN jsonb_build_object(
        'totalStudents', v_total_students,
        'totalClasses', v_total_classes,
        'totalTaughtSessions', v_total_taught_sessions,
        'totalTuitionFee', v_total_tuition_fee,
        'totalPaidTuitionFee', v_total_paid_tuition_fee,
        'totalUnpaidTuitionFee', v_total_unpaid_tuition_fee,
        'collectionRate', v_collection_rate,
        'monthlyStats', v_monthly_stats,
        'studentAttendanceStats', v_student_attendance_stats
    );
END;
$$;


-- Quyền truy cập: revoke public/anon/authenticated, grant service_role
REVOKE ALL ON FUNCTION public.fn_get_class_debt_summary(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_class_debt_summary(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.fn_get_class_attendance_history(UUID, TEXT, INT, INT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_class_attendance_history(UUID, TEXT, INT, INT, BOOLEAN) TO service_role;

REVOKE ALL ON FUNCTION public.fn_get_class_kpi_stats(UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_class_kpi_stats(UUID, TIMESTAMPTZ) TO service_role;

REVOKE ALL ON FUNCTION public.fn_get_dashboard_financial_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_dashboard_financial_stats() TO service_role;
