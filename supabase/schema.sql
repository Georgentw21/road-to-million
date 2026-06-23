-- ============================================================
-- Road To Million Journal — Supabase schema
-- รันทั้งไฟล์นี้ใน Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================================

-- 1) ตารางเก็บ journal (ผู้ใช้ 1 คน = 1 แถว, เก็บข้อมูลทั้งหมดเป็น JSON)
create table if not exists public.journals (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.journals enable row level security;

-- ผู้ใช้เห็น/แก้ได้เฉพาะแถวของตัวเอง
drop policy if exists "journals_select_own" on public.journals;
create policy "journals_select_own" on public.journals
  for select using (auth.uid() = user_id);

drop policy if exists "journals_insert_own" on public.journals;
create policy "journals_insert_own" on public.journals
  for insert with check (auth.uid() = user_id);

drop policy if exists "journals_update_own" on public.journals;
create policy "journals_update_own" on public.journals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2) Storage bucket สำหรับรูปภาพ (อ่านสาธารณะผ่าน URL, เขียนได้เฉพาะเจ้าของ)
insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;

-- อัปโหลด/แก้รูปได้เฉพาะในโฟลเดอร์ของ user ตัวเอง (ชื่อโฟลเดอร์ = user id)
drop policy if exists "images_insert_own" on storage.objects;
create policy "images_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "images_update_own" on storage.objects;
create policy "images_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "images_delete_own" on storage.objects;
create policy "images_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);

-- อ่านรูปได้ทุกคน (เพราะ bucket public) — path มี user id เป็น uuid จึงเดายาก
drop policy if exists "images_read_public" on storage.objects;
create policy "images_read_public" on storage.objects
  for select using (bucket_id = 'images');
