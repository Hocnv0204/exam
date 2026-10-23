-- Migration: Add indexes for faster curriculum & lesson searches
-- Helps accelerate chapter-to-lessons JOIN and title lookup

CREATE INDEX IF NOT EXISTS idx_lessons_chapter_order ON public.lessons (chapter_id, order_index ASC);
CREATE INDEX IF NOT EXISTS idx_lessons_title ON public.lessons (title);
