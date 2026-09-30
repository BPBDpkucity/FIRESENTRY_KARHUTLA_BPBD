-- =====================================================================
-- MIGRASI: Dokumentasi Kejadian (foto) pada Laporan Petugas
-- Jalankan SEKALI di Supabase Dashboard -> SQL Editor untuk database yang
-- SUDAH berjalan (aman diulang). Project baru cukup menjalankan schema.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 2b. DOKUMENTASI FOTO LAPORAN — foto kejadian dari kamera/galeri petugas.
--     Kolom laporan.dokumentasi_foto menyimpan DAFTAR PATH file di bucket
--     privat "dokumentasi-laporan" (bukan URL), URL ditandatangani dibuat
--     saat foto ditampilkan. Path file: <uid_pengunggah>/<nama-file>.jpg
-- ---------------------------------------------------------------------
alter table public.laporan
  add column if not exists dokumentasi_foto text[] not null default '{}';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dokumentasi-laporan', 'dokumentasi-laporan', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Semua akun yang login boleh MELIHAT foto dokumentasi (selaras dengan
-- kebijakan baca tabel laporan).
drop policy if exists "dokumentasi_select_login" on storage.objects;
create policy "dokumentasi_select_login"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'dokumentasi-laporan');

-- Unggah hanya ke folder milik akun sendiri.
drop policy if exists "dokumentasi_insert_folder_sendiri" on storage.objects;
create policy "dokumentasi_insert_folder_sendiri"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'dokumentasi-laporan'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Hapus: admin_penuh, atau pengunggah sendiri (dipakai untuk membersihkan
-- foto bila laporan gagal disimpan).
drop policy if exists "dokumentasi_delete_admin_atau_pemilik" on storage.objects;
create policy "dokumentasi_delete_admin_atau_pemilik"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'dokumentasi-laporan'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );
