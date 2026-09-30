-- =====================================================================
-- FireSentry Karhutla — Skema Database Supabase
-- =====================================================================
-- Cara pakai:
-- 1. Buat project baru di https://supabase.com (gratis).
-- 2. Buka SQL Editor di dashboard Supabase project kalian.
-- 3. Copy-paste SELURUH isi file ini, lalu klik "Run".
-- 4. Ambil "Project URL" dan "anon public key" di Settings → API,
--    lalu isi ke assets/js/supabase-config.js
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROFILES — data admin/petugas (nama tampilan, peran/role)
--    Satu baris di sini untuk SETIAP akun yang dibuat di Supabase Auth.
--    id = auth.users.id (dibuat lewat scripts/buat-akun-massal.mjs atau
--    manual di Authentication → Users pada dashboard Supabase).
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nama text not null,
  role text not null default 'petugas' check (role in ('admin_penuh','petugas')),
  aktif boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'Data tampilan & peran setiap admin/petugas. role=admin_penuh (Admin Besar, akses & edit semua) atau role=petugas (isi & edit laporan sendiri, lihat semua halaman).';

-- Helper: cek apakah user yang sedang login adalah admin_penuh.
-- security definer supaya bisa dipakai di dalam RLS policy tanpa
-- terjebak rekursi (policy profiles memanggil fungsi yang query profiles).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin_penuh' and aktif = true
  );
$$;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_semua_login" on public.profiles;
create policy "profiles_select_semua_login"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "profiles_update_admin_saja" on public.profiles;
create policy "profiles_update_admin_saja"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Catatan: INSERT/DELETE ke profiles sengaja TIDAK dibuka untuk client
-- (anon/authenticated). Pembuatan akun baru dilakukan lewat
-- scripts/buat-akun-massal.mjs (service role key, dijalankan lokal oleh
-- Admin Besar) atau manual lewat dashboard Supabase — bukan dari browser.


-- ---------------------------------------------------------------------
-- 2. LAPORAN — riwayat laporan petugas lapangan (menggantikan
--    localStorage ews_karhutla_laporan_petugas yang lama).
-- ---------------------------------------------------------------------
create sequence if not exists public.laporan_id_seq start 2000;

create table if not exists public.laporan (
  id text primary key default ('RPT-' || nextval('public.laporan_id_seq')::text),
  nama_petugas text not null,
  tanggal date not null,
  waktu text,
  kecamatan text not null,
  kelurahan text,
  lat double precision,
  lng double precision,
  jenis_lahan text,
  tujuan_monitoring text,
  catatan_lokal text,
  ancaman_dampak text,
  jumlah_terdampak_kk integer default 0,
  tindakan_pencegahan text,
  tindakan_penanganan text,
  hasil_peninjauan text,
  dokumentasi_foto text[] not null default '{}',
  diinput_oleh text,
  diinput_oleh_role text,
  diedit_oleh text,
  diedit_pada timestamptz,
  dibuat_oleh_uid uuid references auth.users(id) default auth.uid(),
  dibuat_pada timestamptz not null default now()
);

comment on table public.laporan is
  'Satu baris = satu laporan kunjungan lapangan petugas. Riwayat lengkap, bisa diakses semua admin yang login.';

create index if not exists laporan_kecamatan_idx on public.laporan (kecamatan);
create index if not exists laporan_tanggal_idx on public.laporan (tanggal desc);

alter table public.laporan enable row level security;

-- Semua admin/petugas yang login boleh MELIHAT seluruh riwayat laporan
-- (sesuai desain awal: menu & halaman sama untuk semua akun).
drop policy if exists "laporan_select_semua_login" on public.laporan;
create policy "laporan_select_semua_login"
  on public.laporan for select
  to authenticated
  using (true);

-- Semua admin/petugas yang login boleh menambah laporan baru, tapi
-- dibuat_oleh_uid HARUS akun mereka sendiri (tidak bisa mengaku-aku
-- sebagai orang lain).
drop policy if exists "laporan_insert_milik_sendiri" on public.laporan;
create policy "laporan_insert_milik_sendiri"
  on public.laporan for insert
  to authenticated
  with check (dibuat_oleh_uid = auth.uid());

-- Edit: admin_penuh boleh edit laporan siapa saja; petugas biasa hanya
-- boleh edit laporan yang dia buat sendiri (memperbaiki typo dsb.).
drop policy if exists "laporan_update_admin_atau_pemilik" on public.laporan;
create policy "laporan_update_admin_atau_pemilik"
  on public.laporan for update
  to authenticated
  using (public.is_admin() or dibuat_oleh_uid = auth.uid())
  with check (public.is_admin() or dibuat_oleh_uid = auth.uid());

-- Hapus: HANYA admin_penuh (sama seperti perilaku tombol "🗑️ Hapus"
-- yang selama ini hanya muncul untuk Admin 1 / ewsAksesPenuh()).
drop policy if exists "laporan_delete_admin_saja" on public.laporan;
create policy "laporan_delete_admin_saja"
  on public.laporan for delete
  to authenticated
  using (public.is_admin());

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


-- ---------------------------------------------------------------------
-- 3. LOGIN_LOG — jejak audit siapa login kapan (opsional tapi berguna
--    untuk BPBD melacak aktivitas akun bersama 50+ petugas).
-- ---------------------------------------------------------------------
create table if not exists public.login_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id),
  nama text,
  waktu_login timestamptz not null default now(),
  user_agent text
);

alter table public.login_log enable row level security;

drop policy if exists "login_log_insert_diri_sendiri" on public.login_log;
create policy "login_log_insert_diri_sendiri"
  on public.login_log for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "login_log_select_admin_saja" on public.login_log;
create policy "login_log_select_admin_saja"
  on public.login_log for select
  to authenticated
  using (public.is_admin());
