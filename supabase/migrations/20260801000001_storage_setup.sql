-- =========================================================
-- MIGRATION: 20260801000001_storage_setup.sql
-- DESCRIPTION: Supabase storage setup for pdf-files bucket and policies.
-- =========================================================

-- Create storage bucket pdf-files if not exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'pdf-files',
    'pdf-files',
    true, -- Public bucket to allow direct PDF downloads via public URL
    52428800, -- 50 MB
    ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 52428800,
    allowed_mime_types = ARRAY['application/pdf'];

-- Storage RLS Policies for pdf-files bucket

-- 1. Admin Full Storage Access
CREATE POLICY "Admin full storage access pdf-files"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'pdf-files' AND public.is_admin())
WITH CHECK (bucket_id = 'pdf-files' AND public.is_admin());

-- 2. Student Read Storage Access
CREATE POLICY "Student read pdf-files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'pdf-files');
