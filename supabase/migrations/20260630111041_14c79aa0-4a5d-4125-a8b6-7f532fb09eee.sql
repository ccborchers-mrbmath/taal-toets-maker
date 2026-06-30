
ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS school_logo_path text,
  ADD COLUMN IF NOT EXISTS date_of_assessment text;

CREATE POLICY "Users can read own paper logos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'paper-logos' AND (storage.foldername(name))[1] IN (
  SELECT id::text FROM public.assessments WHERE created_by = auth.uid()
));

CREATE POLICY "Users can upload own paper logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'paper-logos' AND (storage.foldername(name))[1] IN (
  SELECT id::text FROM public.assessments WHERE created_by = auth.uid()
));

CREATE POLICY "Users can update own paper logos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'paper-logos' AND (storage.foldername(name))[1] IN (
  SELECT id::text FROM public.assessments WHERE created_by = auth.uid()
));

CREATE POLICY "Users can delete own paper logos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'paper-logos' AND (storage.foldername(name))[1] IN (
  SELECT id::text FROM public.assessments WHERE created_by = auth.uid()
));
