-- Migration: Create student_classes table for many-to-many relationship
CREATE TABLE IF NOT EXISTS public.student_classes (
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    PRIMARY KEY (student_id, class_id)
);

-- Copy existing class assignments from profiles to student_classes
INSERT INTO public.student_classes (student_id, class_id)
SELECT id, class_id 
FROM public.profiles 
WHERE class_id IS NOT NULL AND role = 'STUDENT'
ON CONFLICT DO NOTHING;
