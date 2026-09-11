-- Migration: Create Question Bank (Ngân hàng câu hỏi & đề thi)
-- Phân loại theo Môn học, Khối lớp, Lớp học, Chương, Bài học, Mức độ và Dạng câu

CREATE TABLE IF NOT EXISTS public.question_bank (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject TEXT NOT NULL DEFAULT 'TOAN',            -- 'TOAN', 'HOA_HOC'
    grade_level INT NOT NULL DEFAULT 12,              -- 10, 11, 12
    class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
    chapter_id UUID REFERENCES public.chapters(id) ON DELETE SET NULL,
    lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
    
    question_type question_type NOT NULL,             -- 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER'
    difficulty TEXT NOT NULL DEFAULT 'THONG_HIEU',    -- 'NHAN_BIET', 'THONG_HIEU', 'VAN_DUNG', 'VAN_DUNG_CAO'
    
    prompt TEXT NOT NULL,                             -- JSON { isInteractive: true, text, imageUrl, options, explanation }
    mc_answer TEXT,                                   -- 'A', 'B', 'C', 'D'
    tf_answers JSONB,                                 -- {"a": true, "b": false, "c": true, "d": true}
    sa_answer TEXT,                                   -- '2.67'
    sa_tolerance NUMERIC DEFAULT 0.00,
    points NUMERIC(5,2) DEFAULT 0.25,
    
    tags TEXT[] DEFAULT '{}',                         -- Tag chuyên đề: ["este", "đạo hàm", "hình chóp"]
    usage_count INT DEFAULT 0,                        -- Đếm số lần câu này đã được bốc vào đề thi
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes tối ưu tốc độ tìm kiếm, lọc & bốc câu hỏi ngẫu nhiên
CREATE INDEX IF NOT EXISTS idx_qb_filter ON public.question_bank(subject, grade_level, chapter_id, question_type, difficulty);
CREATE INDEX IF NOT EXISTS idx_qb_class_chapter ON public.question_bank(class_id, chapter_id);
CREATE INDEX IF NOT EXISTS idx_qb_usage_count ON public.question_bank(usage_count);

-- RLS: Chỉ Admin và Service Role có quyền truy cập ngân hàng câu hỏi
ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role bypass question_bank" ON public.question_bank;
CREATE POLICY "Service role bypass question_bank" ON public.question_bank
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admin full access question_bank" ON public.question_bank;
CREATE POLICY "Admin full access question_bank" ON public.question_bank
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
