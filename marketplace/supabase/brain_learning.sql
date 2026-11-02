-- Brain learning: notes the brain can use, and anonymized questions it learns from.
-- Only the service role (edge functions) reads or writes these tables. RLS is on with no policies.
-- Notes start as "pending". The owner sets status = 'active' to publish a note to the assistants.

create table if not exists public.brain_notes (
  id          uuid primary key default gen_random_uuid(),
  topic       text not null check (char_length(topic) between 2 and 80),
  note        text not null check (char_length(note) between 10 and 600),
  source      text not null check (source in ('owner', 'learned')),
  status      text not null default 'pending' check (status in ('pending', 'active', 'rejected')),
  scope       text not null default 'all' check (scope in ('all', 'customer', 'worker', 'owner')),
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz
);
alter table public.brain_notes enable row level security;
create index if not exists brain_notes_status_scope on public.brain_notes (status, scope);

create table if not exists public.brain_questions (
  id         bigint generated always as identity primary key,
  role       text not null check (role in ('customer', 'worker')),
  question   text not null check (char_length(question) between 1 and 500),
  answered   boolean not null,
  learned    boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.brain_questions enable row level security;
create index if not exists brain_questions_unlearned on public.brain_questions (created_at) where learned = false;
