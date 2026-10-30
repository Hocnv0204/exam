-- Essay answer persistence and question-bank integrity.
ALTER TABLE public.submission_answers
  ADD COLUMN IF NOT EXISTS teacher_feedback TEXT,
  ADD COLUMN IF NOT EXISTS grading_status TEXT NOT NULL DEFAULT 'AUTO_GRADED';

ALTER TABLE public.submission_answers
  DROP CONSTRAINT IF EXISTS submission_answers_grading_status_check;
ALTER TABLE public.submission_answers
  ADD CONSTRAINT submission_answers_grading_status_check
  CHECK (grading_status IN ('AUTO_GRADED', 'PENDING', 'MANUALLY_GRADED'));

ALTER TABLE public.question_bank DROP CONSTRAINT IF EXISTS chk_qb_answer_by_type;
ALTER TABLE public.question_bank ADD CONSTRAINT chk_qb_answer_by_type CHECK (
  (question_type = 'MULTIPLE_CHOICE' AND mc_answer IN ('A','B','C','D') AND tf_answers IS NULL AND sa_answer IS NULL)
  OR (question_type = 'TRUE_FALSE' AND tf_answers IS NOT NULL AND mc_answer IS NULL AND sa_answer IS NULL)
  OR (question_type = 'SHORT_ANSWER' AND sa_answer IS NOT NULL AND mc_answer IS NULL AND tf_answers IS NULL)
  OR (question_type = 'ESSAY' AND mc_answer IS NULL AND tf_answers IS NULL AND sa_answer IS NULL)
);

CREATE OR REPLACE FUNCTION public.fn_qb_before_insert_or_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.class_id IS NOT NULL THEN
    SELECT grade_block INTO NEW.grade_block FROM public.classes WHERE id = NEW.class_id;
  END IF;
  IF NEW.prompt IS NOT NULL THEN
    NEW.content_hash := public.fn_compute_qb_content_hash(NEW.question_type, NEW.prompt);
  END IF;
  IF NEW.question_type = 'MULTIPLE_CHOICE' THEN
    NEW.tf_answers := NULL; NEW.sa_answer := NULL;
  ELSIF NEW.question_type = 'TRUE_FALSE' THEN
    NEW.mc_answer := NULL; NEW.sa_answer := NULL;
  ELSIF NEW.question_type = 'SHORT_ANSWER' THEN
    NEW.mc_answer := NULL; NEW.tf_answers := NULL;
  ELSIF NEW.question_type = 'ESSAY' THEN
    NEW.mc_answer := NULL; NEW.tf_answers := NULL; NEW.sa_answer := NULL;
  END IF;
  RETURN NEW;
END;
$$;
