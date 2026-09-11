-- Migration: Create grade_blocks table for managing grade blocks explicitly
CREATE TABLE IF NOT EXISTS public.grade_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index on name for quick lookups
CREATE INDEX IF NOT EXISTS idx_grade_blocks_name ON public.grade_blocks(name);

-- Enable Row Level Security
ALTER TABLE public.grade_blocks ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role full access grade_blocks"
  ON public.grade_blocks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users (including students & admins) can read grade blocks
CREATE POLICY "Authenticated users can view grade_blocks"
  ON public.grade_blocks
  FOR SELECT
  TO authenticated
  USING (true);

-- Admins can insert grade blocks
CREATE POLICY "Admins can insert grade_blocks"
  ON public.grade_blocks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'ADMIN'
    )
  );

-- Admins can update grade blocks
CREATE POLICY "Admins can update grade_blocks"
  ON public.grade_blocks
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'ADMIN'
    )
  );

-- Admins can delete grade blocks
CREATE POLICY "Admins can delete grade_blocks"
  ON public.grade_blocks
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'ADMIN'
    )
  );

-- Seed default standard grade blocks
INSERT INTO public.grade_blocks (name, description) VALUES
  ('12-Toán', 'Khối 12 chuyên đề Toán học'),
  ('12-Hóa', 'Khối 12 chuyên đề Hóa học'),
  ('11-Toán', 'Khối 11 chuyên đề Toán học'),
  ('11-Hóa', 'Khối 11 chuyên đề Hóa học')
ON CONFLICT (name) DO NOTHING;

-- Populate any other unique grade blocks already in classes
INSERT INTO public.grade_blocks (name)
SELECT DISTINCT grade_block
FROM public.classes
WHERE grade_block IS NOT NULL AND grade_block != ''
ON CONFLICT (name) DO NOTHING;
