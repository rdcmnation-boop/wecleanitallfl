-- Optional (run after schema.sql): private bucket for cleaner documents (insurance, ID, licences).
-- Cleaners can upload/read only inside their own folder; only admins can read everyone's.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('worker-docs', 'worker-docs', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do nothing;

drop policy if exists "worker docs own upload" on storage.objects;
create policy "worker docs own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'worker-docs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "worker docs own read" on storage.objects;
create policy "worker docs own read" on storage.objects for select to authenticated
  using (bucket_id = 'worker-docs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "worker docs own delete" on storage.objects;
create policy "worker docs own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'worker-docs' and (storage.foldername(name))[1] = auth.uid()::text);
