-- =========================================================
-- FULL SCHEMA EXPORT FOR ONLINE HOMEWORK MANAGEMENT SYSTEM
-- =========================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('ADMIN', 'STUDENT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE question_type AS ENUM ('MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Tables
CREATE TABLE IF NOT EXISTS public.classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'STUDENT',
    class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.chapters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id UUID NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    order_index INT NOT NULL DEFAULT 0,
    content TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.homeworks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    pdf_path TEXT NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 60,
    pass_score NUMERIC(5,2) NOT NULL DEFAULT 5.00,
    max_score NUMERIC(5,2) NOT NULL DEFAULT 10.00,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    homework_id UUID NOT NULL REFERENCES public.homeworks(id) ON DELETE CASCADE,
    question_number INT NOT NULL,
    question_type question_type NOT NULL,
    prompt TEXT NOT NULL,
    points NUMERIC(5,2) NOT NULL DEFAULT 1.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_homework_question_num UNIQUE (homework_id, question_number)
);

CREATE TABLE IF NOT EXISTS public.question_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID UNIQUE NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    mc_answer TEXT CHECK (mc_answer IS NULL OR mc_answer IN ('A', 'B', 'C', 'D')),
    tf_answers JSONB,
    sa_answer NUMERIC,
    sa_tolerance NUMERIC DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    homework_id UUID NOT NULL REFERENCES public.homeworks(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    total_score NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    max_score NUMERIC(5,2) NOT NULL DEFAULT 10.00,
    correct_count INT NOT NULL DEFAULT 0,
    wrong_count INT NOT NULL DEFAULT 0,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.submission_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    given_answer JSONB NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    score_earned NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_submission_question UNIQUE (submission_id, question_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_class_id ON public.profiles(class_id);
CREATE INDEX IF NOT EXISTS idx_chapters_class_id ON public.chapters(class_id);
CREATE INDEX IF NOT EXISTS idx_lessons_chapter_id ON public.lessons(chapter_id);
CREATE INDEX IF NOT EXISTS idx_homeworks_lesson_id ON public.homeworks(lesson_id);
CREATE INDEX IF NOT EXISTS idx_questions_homework_id ON public.questions(homework_id);
CREATE INDEX IF NOT EXISTS idx_question_answers_question_id ON public.question_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student_id ON public.submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_homework_id ON public.submissions(homework_id);
CREATE INDEX IF NOT EXISTS idx_submission_answers_submission_id ON public.submission_answers(submission_id);

-- Functions
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'ADMIN'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_user_class_id()
RETURNS UUID AS $$
DECLARE
  v_class_id UUID;
BEGIN
  SELECT class_id INTO v_class_id
  FROM public.profiles
  WHERE id = auth.uid();
  
  RETURN v_class_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Enable RLS
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homeworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_answers ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admin full access profiles" ON public.profiles FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Student read own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());

CREATE POLICY "Admin full access classes" ON public.classes FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Student read assigned class" ON public.classes FOR SELECT TO authenticated USING (id = public.get_user_class_id());

CREATE POLICY "Admin full access chapters" ON public.chapters FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Student read assigned class chapters" ON public.chapters FOR SELECT TO authenticated USING (class_id = public.get_user_class_id());

CREATE POLICY "Admin full access lessons" ON public.lessons FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Student read assigned class lessons" ON public.lessons FOR SELECT TO authenticated USING (
    chapter_id IN (SELECT id FROM public.chapters WHERE class_id = public.get_user_class_id())
);

CREATE POLICY "Admin full access homeworks" ON public.homeworks FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Student read assigned published homeworks" ON public.homeworks FOR SELECT TO authenticated USING (
    is_published = TRUE AND lesson_id IN (
        SELECT l.id FROM public.lessons l
        JOIN public.chapters c ON l.chapter_id = c.id
        WHERE c.class_id = public.get_user_class_id()
    )
);

CREATE POLICY "Admin full access questions" ON public.questions FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Student read assigned homework questions" ON public.questions FOR SELECT TO authenticated USING (
    homework_id IN (
        SELECT h.id FROM public.homeworks h
        JOIN public.lessons l ON h.lesson_id = l.id
        JOIN public.chapters c ON l.chapter_id = c.id
        WHERE h.is_published = TRUE AND c.class_id = public.get_user_class_id()
    )
);

CREATE POLICY "Admin full access question_answers" ON public.question_answers FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admin full access submissions" ON public.submissions FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Student select own submissions" ON public.submissions FOR SELECT TO authenticated USING (student_id = auth.uid());
CREATE POLICY "Student insert own submission" ON public.submissions FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid());

CREATE POLICY "Admin full access submission_answers" ON public.submission_answers FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Student select own submission_answers" ON public.submission_answers FOR SELECT TO authenticated USING (
    submission_id IN (SELECT id FROM public.submissions WHERE student_id = auth.uid())
);
CREATE POLICY "Student insert own submission_answers" ON public.submission_answers FOR INSERT TO authenticated WITH CHECK (
    submission_id IN (SELECT id FROM public.submissions WHERE student_id = auth.uid())
);

-- Storage bucket & policies
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('pdf-files', 'pdf-files', false, 52428800, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admin full storage access pdf-files" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'pdf-files' AND public.is_admin()) WITH CHECK (bucket_id = 'pdf-files' AND public.is_admin());
CREATE POLICY "Student read pdf-files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'pdf-files');

-- Seed Admin
DO $$
DECLARE
    v_admin_id UUID := '00000000-0000-0000-0000-000000000001'::UUID;
    v_email TEXT := 'admin@system.local';
    v_username TEXT := 'admin';
    v_password TEXT := 'admin';
    v_encrypted_pw TEXT;
BEGIN
    v_encrypted_pw := crypt(v_password, gen_salt('bf', 10));

    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = v_email OR id = v_admin_id) THEN
        INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        VALUES ('00000000-0000-0000-0000-000000000000', v_admin_id, 'authenticated', 'authenticated', v_email, v_encrypted_pw, NOW(), '{"provider": "email", "providers": ["email"]}', '{"username": "admin", "role": "ADMIN"}', NOW(), NOW());
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_admin_id) THEN
        INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        VALUES (v_admin_id, v_admin_id, format('{"sub":"%s","email":"%s"}', v_admin_id, v_email)::jsonb, 'email', NOW(), NOW(), NOW());
    END IF;

    INSERT INTO public.profiles (id, username, full_name, role, class_id)
    VALUES (v_admin_id, v_username, 'System Administrator', 'ADMIN', NULL)
    ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, role = 'ADMIN';
END $$;
