-- Single-owner lock. Additive, not yet applied.
-- At most ONE row can ever exist in public.admins, so no second admin can be added
-- by mistake or by anyone who gains SQL access without first dropping this index (which is logged by Supabase).
-- is_admin() already requires the 2-step (aal2) code; the admins table has no app policies.
-- Fails safely (and changes nothing) if more than one admin row exists today.
create unique index if not exists admins_single_owner on public.admins ((true));

-- To set YOURSELF as the owner (run once in the Supabase SQL editor, after you sign up and turn on 2-step):
--   insert into public.admins(user_id) select id from auth.users where email = 'YOUR_EMAIL';
