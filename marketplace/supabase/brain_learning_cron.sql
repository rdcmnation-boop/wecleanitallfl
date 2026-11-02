-- Nightly brain learning (06:00 UTC). Apply after brain_learning.sql.
-- The shared secret is generated inside the database and stored in Vault. It is never written to this repository.
-- Requires the pg_cron and pg_net extensions (available on Supabase).

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'brain_learn_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'brain_learn_secret'
    );
  end if;
end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'brain-learn-nightly';

select cron.schedule('brain-learn-nightly', '0 6 * * *', $$
  select net.http_post(
    url := 'https://fqajygzjteauxornipva.supabase.co/functions/v1/brain-learn',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-learn-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'brain_learn_secret')
    ),
    body := '{}'::jsonb
  );
$$);
