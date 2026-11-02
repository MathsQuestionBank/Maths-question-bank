-- Applied to live Maths Question Bank Supabase on 2026-11-02.
-- Remove the 18 temporary practice questions once used to test teacher onboarding.
-- Protect the Edexcel archive and any worksheet or shadow-paper references.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.questions q
  WHERE q.metadata->>'content_rights'='original'
    AND q.metadata->>'demo'='true'
    AND q.metadata->>'id' ~ '^ORIGINAL-PRACTICE-(0[1-9]|1[0-8])$'
    AND q.paper_id IS NULL AND q.shadow_paper_id IS NULL
    AND q.question_storage_path IS NULL AND q.mark_scheme_storage_path IS NULL;
  IF n <> 18 THEN RAISE EXCEPTION 'Expected 18 placeholder questions, found %; no changes applied.', n; END IF;

  IF EXISTS (
    SELECT 1 FROM public.assessment_questions aq JOIN public.questions q ON q.id=aq.question_id
    WHERE q.metadata->>'content_rights'='original' AND q.metadata->>'demo'='true'
      AND q.metadata->>'id' ~ '^ORIGINAL-PRACTICE-(0[1-9]|1[0-8])$'
  ) OR EXISTS (
    SELECT 1 FROM public.questions linked JOIN public.questions q ON q.id=linked.shadow_of_question_id
    WHERE q.metadata->>'content_rights'='original' AND q.metadata->>'demo'='true'
      AND q.metadata->>'id' ~ '^ORIGINAL-PRACTICE-(0[1-9]|1[0-8])$'
  ) OR EXISTS (
    SELECT 1 FROM public.assessments a JOIN public.questions q
      ON a.configuration::text LIKE '%' || q.id::text || '%'
    WHERE q.metadata->>'content_rights'='original' AND q.metadata->>'demo'='true'
      AND q.metadata->>'id' ~ '^ORIGINAL-PRACTICE-(0[1-9]|1[0-8])$'
  ) THEN
    RAISE EXCEPTION 'Placeholder questions still referenced by saved work; no changes applied.';
  END IF;

  DELETE FROM public.questions q
  WHERE q.metadata->>'content_rights'='original'
    AND q.metadata->>'demo'='true'
    AND q.metadata->>'id' ~ '^ORIGINAL-PRACTICE-(0[1-9]|1[0-8])$'
    AND q.paper_id IS NULL AND q.shadow_paper_id IS NULL
    AND q.question_storage_path IS NULL AND q.mark_scheme_storage_path IS NULL;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n <> 18 THEN RAISE EXCEPTION 'Unexpected deletion count %. Roll back.', n; END IF;
END $$;
