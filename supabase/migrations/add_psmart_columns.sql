-- Run this in the Supabase dashboard SQL editor
alter table aspirations
  add column if not exists psmart_score integer,
  add column if not exists psmart_feedback jsonb,
  add column if not exists psmart_scored_at timestamptz;

alter table milestones
  add column if not exists psmart_score integer,
  add column if not exists psmart_feedback jsonb,
  add column if not exists psmart_scored_at timestamptz;
