-- Migration: Enable RLS and create security policies for student_classes, class_sessions, and student_sessions

-- 1. student_classes
ALTER TABLE public.student_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role bypass student_classes" ON public.student_classes
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Admin full access student_classes" ON public.student_classes
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Student read own student_classes" ON public.student_classes
    FOR SELECT TO authenticated USING (student_id = auth.uid());

-- 2. class_sessions
ALTER TABLE public.class_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role bypass class_sessions" ON public.class_sessions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Admin full access class_sessions" ON public.class_sessions
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Student read assigned class_sessions" ON public.class_sessions
    FOR SELECT TO authenticated USING (
        class_id IN (
            SELECT class_id FROM public.student_classes WHERE student_id = auth.uid()
        ) OR class_id = (
            SELECT class_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- 3. student_sessions
ALTER TABLE public.student_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role bypass student_sessions" ON public.student_sessions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Admin full access student_sessions" ON public.student_sessions
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Student read own student_sessions" ON public.student_sessions
    FOR SELECT TO authenticated USING (student_id = auth.uid());
