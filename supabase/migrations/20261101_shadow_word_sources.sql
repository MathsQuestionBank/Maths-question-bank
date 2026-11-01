-- Word/PDF are both accepted as immutable source material for shadow sets.
-- Convert DOC/DOCX to PDF in the review workflow; never crop the raw Word file.
alter table public.shadow_papers rename column question_pdf_path to question_source_path;
alter table public.shadow_papers rename column mark_scheme_pdf_path to mark_scheme_source_path;
alter table public.shadow_papers
 add column question_format text not null default 'pdf' check (question_format in ('pdf','docx','doc')),
 add column mark_scheme_format text not null default 'pdf' check (mark_scheme_format in ('pdf','docx','doc'));
alter table public.shadow_papers drop constraint if exists shadow_papers_status_check;
alter table public.shadow_papers add constraint shadow_papers_status_check
 check (status in ('awaiting-conversion','awaiting-review','in-review','reviewed'));
comment on table public.shadow_papers is 'Owner-only official shadow source files. review status is separate from source file availability.';
