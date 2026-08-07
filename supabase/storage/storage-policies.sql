-- Storage Policies for pdf-files Bucket

-- Ensure bucket exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('pdf-files', 'pdf-files', true, 52428800, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Policies
CREATE POLICY "Admin full storage access pdf-files"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'pdf-files' AND public.is_admin())
WITH CHECK (bucket_id = 'pdf-files' AND public.is_admin());

CREATE POLICY "Student read pdf-files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'pdf-files');
