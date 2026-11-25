-- Migration: 20261125100000_student_report_notes.sql
-- Description: Bảng lưu nhận xét của giáo viên cho từng học sinh theo lớp và kỳ báo cáo

CREATE TABLE IF NOT EXISTS public.student_report_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  summary TEXT NULL,
  strengths TEXT NULL,
  improvements TEXT NULL,
  attitude TEXT NULL,
  goal_text TEXT NULL,
  goal_score NUMERIC(4, 2) NULL,
  teacher_support TEXT NULL,
  parent_actions TEXT NULL,
  updated_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT student_report_notes_period_dates_check CHECK (from_date <= to_date),
  CONSTRAINT student_report_notes_student_class_period_key UNIQUE (student_id, class_id, from_date, to_date),
  CONSTRAINT student_report_notes_summary_length_check CHECK (char_length(summary) <= 1500),
  CONSTRAINT student_report_notes_strengths_length_check CHECK (char_length(strengths) <= 1500),
  CONSTRAINT student_report_notes_improvements_length_check CHECK (char_length(improvements) <= 1500),
  CONSTRAINT student_report_notes_attitude_length_check CHECK (char_length(attitude) <= 1500),
  CONSTRAINT student_report_notes_goal_text_length_check CHECK (char_length(goal_text) <= 1500),
  CONSTRAINT student_report_notes_goal_score_range_check CHECK (goal_score >= 0 AND goal_score <= 10),
  CONSTRAINT student_report_notes_teacher_support_length_check CHECK (char_length(teacher_support) <= 1500),
  CONSTRAINT student_report_notes_parent_actions_length_check CHECK (char_length(parent_actions) <= 1500)
);

CREATE INDEX IF NOT EXISTS idx_student_report_notes_lookup
  ON public.student_report_notes (student_id, class_id, to_date DESC);

ALTER TABLE public.student_report_notes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.student_report_notes FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.student_report_notes TO service_role;
