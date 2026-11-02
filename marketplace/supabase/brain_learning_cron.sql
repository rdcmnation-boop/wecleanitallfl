-- Nightly brain learning (06:00 UTC). Apply only after brain_learning.sql, and after the LEARN_SECRET function
-- secret is set to the same value as the Vault secret named 'brain_learn_secret'. The secret is not stored in this file.
-- Requires the pg_cron and pg_net extensions (available on Supabase).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('brain-learn-nightly')
  where exists (select 1 from cron.job where jobname = 'brain-learn-nightly');

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
