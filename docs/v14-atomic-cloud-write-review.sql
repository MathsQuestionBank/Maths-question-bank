-- REVIEW ONLY. Not applied to the production database.
-- Existing assessment policies require is_approved_owner() and created_by=auth.uid().
-- This migration supports atomic, conflict-detecting writes for one user's assessment.
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 1;
CREATE OR REPLACE FUNCTION public.save_owned_assessment(
 p_id uuid, p_expected_revision bigint, p_title text, p_configuration jsonb, p_question_ids uuid[]
) RETURNS TABLE(saved_id uuid, saved_revision bigint)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE v_id uuid; v_revision bigint; v_count integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_approved_owner() THEN
  RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501';
 END IF;
 IF trim(coalesce(p_title,''))='' OR p_configuration IS NULL OR jsonb_typeof(p_configuration)<>'object' THEN
  RAISE EXCEPTION 'Invalid assessment';
 END IF;
 IF p_question_ids IS NULL OR cardinality(p_question_ids)=0 OR cardinality(p_question_ids)>500 THEN
  RAISE EXCEPTION 'Invalid questions';
 END IF;
 SELECT count(DISTINCT q) INTO v_count FROM unnest(p_question_ids) AS q;
 IF v_count<>cardinality(p_question_ids) THEN RAISE EXCEPTION 'Duplicate question IDs'; END IF;
 IF p_id IS NULL THEN
  IF p_expected_revision IS NOT NULL THEN RAISE EXCEPTION 'Invalid new revision'; END IF;
  INSERT INTO public.assessments(created_by,title,configuration)
  VALUES(auth.uid(),p_title,p_configuration)
  RETURNING id,revision INTO v_id,v_revision;
 ELSE
  SELECT a.id,a.revision INTO v_id,v_revision FROM public.assessments a
  WHERE a.id=p_id AND a.created_by=auth.uid() FOR UPDATE;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Assessment not found' USING ERRCODE='42501'; END IF;
  IF p_expected_revision IS NULL OR v_revision<>p_expected_revision THEN
   RAISE EXCEPTION 'Assessment was changed in another session' USING ERRCODE='40001';
  END IF;
  UPDATE public.assessments SET title=p_title,configuration=p_configuration,revision=revision+1
  WHERE id=v_id RETURNING revision INTO v_revision;
  DELETE FROM public.assessment_questions WHERE assessment_id=v_id;
 END IF;
 INSERT INTO public.assessment_questions(assessment_id,question_id,position)
 SELECT v_id,x.question_id,x.ord::integer-1 FROM unnest(p_question_ids) WITH ORDINALITY x(question_id,ord);
 RETURN QUERY SELECT v_id,v_revision;
END $$;

CREATE OR REPLACE FUNCTION public.delete_owned_assessment(p_id uuid,p_expected_revision bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE v_revision bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_approved_owner() THEN
  RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501';
 END IF;
 SELECT revision INTO v_revision FROM public.assessments
 WHERE id=p_id AND created_by=auth.uid() FOR UPDATE;
 IF v_revision IS NULL THEN RAISE EXCEPTION 'Assessment not found' USING ERRCODE='42501'; END IF;
 IF p_expected_revision IS NULL OR v_revision<>p_expected_revision THEN
  RAISE EXCEPTION 'Assessment changed in another session' USING ERRCODE='40001';
 END IF;
 DELETE FROM public.assessments WHERE id=p_id AND created_by=auth.uid();
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.save_owned_assessment(uuid,bigint,text,jsonb,uuid[]) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.delete_owned_assessment(uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_owned_assessment(uuid,bigint,text,jsonb,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_owned_assessment(uuid,bigint) TO authenticated;
