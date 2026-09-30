#!/usr/bin/env node
/* =========================================================================
   FireSentry Karhutla — Buat akun admin/petugas secara massal di Supabase.

   PENTING — jalankan ini HANYA di komputer lokal (bukan GitHub Actions,
   bukan browser), karena butuh SERVICE ROLE KEY (kunci penuh yang melewati
   semua Row Level Security). JANGAN PERNAH commit key ini ke git atau
   menaruhnya di kode frontend (assets/js/).

   Cara pakai:
   1. npm install @supabase/supabase-js  (sekali saja, di folder project ini)
   2. Siapkan file CSV, mis. akun.csv, dengan format:
        nama,email,password,role
        Ahmad Fauzi,ahmad.fauzi@bpbdpekanbaru.go.id,GantiSaya123!,petugas
        Budi Santoso,budi.santoso@bpbdpekanbaru.go.id,GantiSaya123!,admin_penuh
      (role hanya boleh "admin_penuh" atau "petugas"; kosongkan role untuk
      default "petugas")
   3. Ambil SERVICE ROLE KEY di dashboard Supabase: Settings -> API ->
      "service_role" (BUKAN "anon public").
   4. Jalankan:
        SUPABASE_URL="https://xxxxx.supabase.co" \
        SUPABASE_SERVICE_ROLE_KEY="isi-service-role-key" \
        node scripts/buat-akun-massal.mjs akun.csv
   5. Setiap petugas login pertama kali pakai email+password dari CSV, lalu
      SANGAT DISARANKAN langsung ganti password sendiri (lewat menu "Lupa
      Password" di Supabase Auth UI, atau minta admin reset lewat dashboard
      Supabase -> Authentication -> Users).
   ========================================================================= */

import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const csvPath = process.argv[2];

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Set dulu env SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY. Lihat komentar di atas file ini.");
  process.exit(1);
}
if (!csvPath) {
  console.error("Cara pakai: node scripts/buat-akun-massal.mjs akun.csv");
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

function parseCsv(teks) {
  const baris = teks.trim().split(/\r?\n/);
  const header = baris[0].split(",").map(h => h.trim().toLowerCase());
  return baris.slice(1).filter(b => b.trim() !== "").map(b => {
    const kolom = b.split(",").map(k => k.trim());
    const obj = {};
    header.forEach((h, i) => { obj[h] = kolom[i]; });
    return obj;
  });
}

async function main() {
  const isiCsv = await readFile(csvPath, "utf-8");
  const daftar = parseCsv(isiCsv);
  console.log(`Ditemukan ${daftar.length} akun di ${csvPath}.\n`);

  for (const baris of daftar) {
    const { nama, email, password } = baris;
    const role = (baris.role || "petugas").trim().toLowerCase();

    if (!nama || !email || !password) {
      console.warn(`⚠️  Baris dilewati (nama/email/password kosong):`, baris);
      continue;
    }
    if (!["admin_penuh", "petugas"].includes(role)) {
      console.warn(`⚠️  Baris dilewati (role tidak valid "${role}"):`, baris);
      continue;
    }

    // 1) Buat akun di Supabase Auth
    const { data: userData, error: errUser } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true
    });

    if (errUser) {
      console.error(`❌ Gagal membuat akun ${email}: ${errUser.message}`);
      continue;
    }

    // 2) Buat baris profil (nama tampilan + peran)
    const { error: errProfil } = await supabaseAdmin.from("profiles").insert({
      id: userData.user.id, nama, role, aktif: true
    });

    if (errProfil) {
      console.error(`❌ Akun ${email} dibuat, tapi gagal menyimpan profil: ${errProfil.message}`);
      continue;
    }

    console.log(`✅ ${nama} <${email}> (${role}) berhasil dibuat.`);
  }

  console.log("\nSelesai. Sampaikan email + password awal ke masing-masing petugas lewat jalur aman (bukan grup umum), dan minta mereka ganti password setelah login pertama.");
}

main().catch(err => {
  console.error("Terjadi error tak terduga:", err);
  process.exit(1);
});
