
DO $$
DECLARE
  b text;
  op text;
  ops text[] := ARRAY['SELECT','INSERT','UPDATE','DELETE'];
  buckets text[] := ARRAY['option-images','exercise-audio','paper-pdfs','paper-audio'];
BEGIN
  FOREACH b IN ARRAY buckets LOOP
    FOREACH op IN ARRAY ops LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'Owners access '||b||' '||op);
    END LOOP;
  END LOOP;
END$$;

CREATE POLICY "Owners access option-images SELECT" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'option-images' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.assessments WHERE created_by = auth.uid()));
CREATE POLICY "Owners access option-images INSERT" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'option-images' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.assessments WHERE created_by = auth.uid()));
CREATE POLICY "Owners access option-images UPDATE" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'option-images' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.assessments WHERE created_by = auth.uid()));
CREATE POLICY "Owners access option-images DELETE" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'option-images' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.assessments WHERE created_by = auth.uid()));

CREATE POLICY "Owners access exercise-audio SELECT" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'exercise-audio' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.assessments WHERE created_by = auth.uid()));
CREATE POLICY "Owners access exercise-audio INSERT" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'exercise-audio' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.assessments WHERE created_by = auth.uid()));
CREATE POLICY "Owners access exercise-audio UPDATE" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'exercise-audio' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.assessments WHERE created_by = auth.uid()));
CREATE POLICY "Owners access exercise-audio DELETE" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'exercise-audio' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.assessments WHERE created_by = auth.uid()));

CREATE POLICY "Owners access paper-pdfs SELECT" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'paper-pdfs' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.assessments WHERE created_by = auth.uid()));
CREATE POLICY "Owners access paper-pdfs INSERT" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'paper-pdfs' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.assessments WHERE created_by = auth.uid()));
CREATE POLICY "Owners access paper-pdfs UPDATE" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'paper-pdfs' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.assessments WHERE created_by = auth.uid()));
CREATE POLICY "Owners access paper-pdfs DELETE" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'paper-pdfs' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.assessments WHERE created_by = auth.uid()));

CREATE POLICY "Owners access paper-audio SELECT" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'paper-audio' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.assessments WHERE created_by = auth.uid()));
CREATE POLICY "Owners access paper-audio INSERT" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'paper-audio' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.assessments WHERE created_by = auth.uid()));
CREATE POLICY "Owners access paper-audio UPDATE" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'paper-audio' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.assessments WHERE created_by = auth.uid()));
CREATE POLICY "Owners access paper-audio DELETE" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'paper-audio' AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.assessments WHERE created_by = auth.uid()));
