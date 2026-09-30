/* =========================================================
   FIRESENTRY KARHUTLA - Komponen bersama (sidebar, auth guard, util)
   ========================================================= */

// Catatan: "Data Cuaca" dan "Data Hotspot" sengaja TIDAK lagi punya menu
// sendiri — keduanya sudah digabungkan sebagai tab di dalam halaman
// "Monitoring Karhutla" (lihat monitoring.html: tab 🌦️ Data Cuaca & 📈 Data
// Hotspot). data-cuaca.html dan data-hotspot.html tetap ada sebagai alih
// arah (redirect) otomatis ke tab terkait, untuk menjaga tautan/bookmark
// lama tetap berfungsi. Halaman "Riwayat Kejadian" (riwayat.html) sudah
// dihapus sepenuhnya sesuai permintaan — tidak ada lagi menunya di sini.
const MENU_UTAMA = [
  { key:"dashboard", label:"Dashboard", icon:"📊", href:"dashboard.html" },
  { key:"monitoring", label:"Monitoring Karhutla", icon:"🔥", href:"monitoring.html" },
  { key:"peta", label:"Peta Wilayah", icon:"📍", href:"peta.html" },
  { key:"risiko", label:"Analisis Risiko", icon:"🧭", href:"analisis-risiko.html" },
  { key:"peringatan", label:"Peringatan", icon:"⚠️", href:"peringatan.html" },
];
const MENU_DATA = [
  { key:"laporan", label:"Laporan", icon:"📄", href:"laporan.html" },
];

/* ---------- Auth guard — Supabase Auth + tabel profiles ----------
   Login sungguhan (email+password lewat Supabase Auth, bukan lagi
   hardcode di JS) dengan peran per-akun disimpan di tabel `profiles`
   (lihat sql/schema.sql). Setelah sesi & profil berhasil dimuat, hasilnya
   disimpan di variabel module-level _ewsUser supaya SELURUH kode lain di
   project ini (ewsCurrentUser, ewsLevelAkses, ewsAksesPenuh, dst.) tetap
   berjalan tanpa perlu diubah satu-persatu — cukup panggil
   `await ewsRequireAuth()` sekali di awal setiap halaman (lihat
   ewsInitPage di bawah). ---------------------------------------------- */
let _ewsUser = null; // {uid, email, nama, role, levelAkses}

function ewsIsLoggedIn(){
  return !!_ewsUser;
}

function ewsCurrentUser(){
  if(!_ewsUser) return null;
  // Bentuk objek dijaga sama seperti versi lama (nama, role, levelAkses)
  // supaya laporan.html/monitoring.html/index.html yang membaca field ini
  // tidak perlu diubah.
  return {
    username: _ewsUser.email,
    nama: _ewsUser.nama,
    role: _ewsUser.role === "admin_penuh" ? "Admin Besar / Admin BPBD (Akses Penuh)" : "Petugas Lapangan (Akses Laporan)",
    levelAkses: _ewsUser.levelAkses,
    loginAt: _ewsUser.loginAt
  };
}

// "penuh"   = role=admin_penuh di tabel profiles — bisa mengakses DAN
//             mengedit seluruh halaman/fitur sistem.
// "laporan" = role=petugas — semua petugas lapangan BPBD, masing-masing
//             dengan akun sendiri (bukan lagi 1 akun bersama). Tampilan
//             menu SAMA seperti admin_penuh (tetap ada Dashboard,
//             Monitoring Karhutla, Peta Wilayah, Analisis Risiko,
//             Peringatan — semuanya boleh DILIHAT), tapi hak MENGUBAH
//             data dibatasi hanya untuk:
//               1) mengakses & mengisi (menambah) laporan baru di halaman
//                  Laporan, dan
//               2) mengedit laporan milik sendiri yang sudah tersimpan
//                  untuk memperbaiki kesalahan penulisan/kekeliruan data
//                  (aturan ini juga ditegakkan di database lewat Row
//                  Level Security — lihat sql/schema.sql — bukan cuma di
//                  tampilan, jadi tidak bisa diakali lewat DevTools).
//             Aksi lain yang mengubah data sistem (mis. tombol
//             "Sinkronkan Sekarang", "Tutup Peringatan", "Hapus Laporan")
//             disembunyikan/dinonaktifkan untuk petugas lewat ewsAksesPenuh().
function ewsLevelAkses(){
  return (_ewsUser && _ewsUser.levelAkses) || "laporan";
}

// true untuk admin_penuh (akses penuh: boleh mengedit semua bagian sistem,
// bukan cuma laporan). Dipakai di setiap halaman untuk menyembunyikan/
// menonaktifkan tombol yang mengubah data di luar Laporan (mis. sinkron
// data monitoring, menutup peringatan, menghapus laporan).
function ewsAksesPenuh(){
  return ewsLevelAkses() !== "laporan";
}

// Memuat sesi Supabase yang sedang aktif + baris profil (nama, role) dari
// tabel `profiles`, lalu menyimpannya ke _ewsUser. Dipanggil dari
// ewsRequireAuth() di setiap halaman terproteksi. Mengembalikan true kalau
// berhasil login & profil ditemukan; false kalau tidak (pemanggil yang
// mengarahkan ke index.html).
async function ewsMuatSesi(){
  if(!supabaseClient){
    console.error("[FireSentry] supabaseClient belum siap — cek assets/js/supabase-config.js");
    return false;
  }
  const { data: { session } } = await supabaseClient.auth.getSession();
  if(!session){ _ewsUser = null; return false; }

  const { data: profil, error } = await supabaseClient
    .from("profiles")
    .select("nama, role, aktif")
    .eq("id", session.user.id)
    .single();

  if(error || !profil || profil.aktif === false){
    // Login Supabase valid tapi tidak ada baris profil (atau dinonaktifkan
    // admin) — jangan anggap berhasil login.
    _ewsUser = null;
    return false;
  }

  _ewsUser = {
    uid: session.user.id,
    email: session.user.email,
    nama: profil.nama,
    role: profil.role,
    levelAkses: profil.role === "admin_penuh" ? "penuh" : "laporan",
    loginAt: new Date().toISOString()
  };
  return true;
}

// Dipanggil sekali di awal setiap halaman terproteksi (lewat ewsInitPage).
// Mengarahkan ke index.html kalau belum/tidak lagi login. Mengembalikan
// Promise<boolean> — pemanggil (ewsInitPage) menghentikan render halaman
// kalau hasilnya false.
async function ewsRequireAuth(){
  const ok = await ewsMuatSesi();
  if(!ok){
    window.location.href = "index.html";
    return false;
  }
  return true;
}

async function ewsLogout(){
  if(supabaseClient) await supabaseClient.auth.signOut();
  _ewsUser = null;
  window.location.href = "index.html";
}

/* ---------- Render sidebar ---------- */
function renderSidebar(activeKey){
  const mount = document.getElementById("sidebar-mount");
  if(!mount) return;
  const user = ewsCurrentUser() || { nama:"Petugas BPBD", role:"Monitoring & Operasional" };
  const initials = (user.nama || "P B").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();

  // Admin 1 maupun Admin 2 melihat menu yang SAMA PERSIS — Admin 2 hanya
  // dibatasi soal APA yang boleh diubah (lihat ewsAksesPenuh()), bukan
  // halaman mana yang boleh dibuka. Jadi menu tidak lagi disembunyikan
  // berdasarkan peran.
  const renderItems = (items) => items.map(it => `
    <li>
      <a class="nav-item ${it.key===activeKey ? "active" : ""}" href="${it.href}">
        <span class="nav-icon">${it.icon}</span>
        <span>${it.label}</span>
      </a>
    </li>`).join("");

  mount.innerHTML = `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-brand">
        <div class="brand-mark"><img src="assets/img/logo-bpbd.png" alt="Logo BPBD Kota Pekanbaru" class="brand-logo-img"></div>
        <div class="brand-text">
          <div class="brand-title">FIRESENTRY KARHUTLA</div>
          <div class="brand-sub">BPBD KOTA PEKANBARU</div>
        </div>
      </div>

      <div class="nav-group">
        <div class="nav-label">MENU UTAMA</div>
        <ul class="nav-list">${renderItems(MENU_UTAMA)}</ul>
      </div>

      <div class="nav-group">
        <div class="nav-label">DATA &amp; LAPORAN</div>
        <ul class="nav-list">${renderItems(MENU_DATA)}</ul>
      </div>

      <div class="sidebar-footer">
        <div class="nav-label" style="padding-left:2px;">SISTEM</div>
        <div class="user-chip">
          <div class="user-avatar">${initials}</div>
          <div class="user-meta">
            <div class="user-name">${user.nama || "Petugas BPBD"}</div>
            <div class="user-role">${user.role || "Monitoring & Operasional"}</div>
          </div>
        </div>
        <button class="logout-btn" onclick="ewsLogout()">⏻ Keluar</button>
      </div>
    </aside>`;
}

/* ---------- Topbar (judul halaman + status + notifikasi) ---------- */
function renderTopbar({title, subtitle}){
  const mount = document.getElementById("topbar-mount");
  if(!mount) return;
  mount.innerHTML = `
    <div class="mobile-topbar">
      <button onclick="document.getElementById('sidebar').classList.toggle('open')">☰</button>
      <strong>FIRESENTRY KARHUTLA</strong>
      <span></span>
    </div>
    <div class="topbar">
      <div>
        <h1 class="page-title">${title}</h1>
        <p class="page-sub">${subtitle || ""}</p>
      </div>
      <div class="topbar-actions">
        <span class="status-live"><span class="status-dot"></span>Sistem aktif</span>
        <button class="bell-btn" id="notif-btn" title="Notifikasi"><span class="dot"></span>🔔</button>
      </div>
    </div>`;

  const btn = document.getElementById("notif-btn");
  if(btn){
    btn.addEventListener("click", () => {
      const lines = (typeof NOTIF_LIST !== "undefined" ? NOTIF_LIST : [])
        .map(n => `• [${n.time}] ${n.text}`).join("\n");
      alert("Notifikasi Terbaru\n\n" + (lines || "Tidak ada notifikasi baru."));
    });
  }
}

/* ---------- Modal Edit Laporan Petugas ----------
   Dipakai bersama oleh laporan.html (tabel Riwayat Laporan Petugas) dan
   monitoring.html (tab "Laporan Petugas Lapangan"), supaya Admin 1 maupun
   Admin 2 bisa memperbaiki kesalahan penulisan pada laporan yang sudah
   tersimpan dari satu tempat saja. Butuh data.js (ewsSemuaLaporanPetugas,
   ewsPerbaruiLaporanPetugas) dan idealnya KECAMATAN_ADM4 sudah dimuat lebih
   dulu di halaman yang memanggilnya.
   Parameter onSaved: callback opsional dipanggil setelah perubahan
   tersimpan, supaya halaman pemanggil bisa me-render ulang tabelnya. */
function ewsBukaModalEditLaporan(id, onSaved){
  const l = (typeof ewsSemuaLaporanPetugas === "function") ? ewsSemuaLaporanPetugas().find(x => x.id === id) : null;
  if(!l){ alert("Laporan tidak ditemukan (mungkin sudah dihapus)."); return; }

  const lama = document.getElementById("ews-modal-edit-laporan");
  if(lama) lama.remove();

  const daftarKecamatan = (typeof KECAMATAN_ADM4 !== "undefined")
    ? Object.keys(KECAMATAN_ADM4).sort((a,b) => a.localeCompare(b))
    : [l.kecamatan].filter(Boolean);

  const aman = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  const overlay = document.createElement("div");
  overlay.id = "ews-modal-edit-laporan";
  overlay.style.cssText = "display:flex;position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:200;align-items:center;justify-content:center;padding:20px;";
  overlay.innerHTML = `
    <div class="card" style="width:100%;max-width:760px;max-height:90vh;overflow-y:auto;margin:16px;">
      <div class="card-head">
        <div class="card-head-left">
          <h3>✏️ Edit Laporan — ${aman(l.kecamatan)} · Kel. ${aman(l.kelurahan || "-")}</h3>
          <span class="tag">Perbaiki kesalahan penulisan pada laporan yang sudah tersimpan</span>
        </div>
        <button type="button" id="ews-ed-tutup" aria-label="Tutup" style="background:none;border:none;font-size:22px;line-height:1;color:var(--text-400);cursor:pointer;">&times;</button>
      </div>
      <form id="ews-ed-form">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 20px;">
          <div class="field"><label>Nama Petugas</label><input type="text" id="ed-nama" required></div>
          <div class="field"><label>Jenis Lahan</label><input type="text" id="ed-jenis"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 20px;">
          <div class="field"><label>Tanggal</label><input type="date" id="ed-tanggal" required></div>
          <div class="field"><label>Waktu</label><input type="time" id="ed-waktu" required></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 20px;">
          <div class="field"><label>Kecamatan</label><select id="ed-kecamatan" required></select></div>
          <div class="field"><label>Kelurahan</label><input type="text" id="ed-kelurahan" required></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 20px;">
          <div class="field"><label>Latitude</label><input type="number" step="0.0001" id="ed-lat"></div>
          <div class="field"><label>Longitude</label><input type="number" step="0.0001" id="ed-lng"></div>
        </div>
        <div class="field"><label>Jumlah Terdampak (KK)</label><input type="number" min="0" step="1" id="ed-kk"></div>
        <div class="field"><label>Catatan Lokal</label><textarea id="ed-catatan" rows="2"></textarea></div>
        <div class="field"><label>Tujuan Monitoring</label><textarea id="ed-tujuan" rows="2" required></textarea></div>
        <div class="field"><label>Ancaman dan Dampak</label><textarea id="ed-ancaman" rows="2"></textarea></div>
        <div class="field"><label>Tindakan Pencegahan</label><textarea id="ed-pencegahan" rows="2"></textarea></div>
        <div class="field"><label>Tindakan Penanganan</label><textarea id="ed-penanganan" rows="2"></textarea></div>
        <div class="field"><label>Hasil Peninjauan</label><textarea id="ed-hasil" rows="2" required></textarea></div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
          <button type="button" class="btn btn-outline" id="ews-ed-batal">Batal</button>
          <button type="submit" class="btn btn-primary">💾 Simpan Perubahan</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(overlay);

  const selKec = document.getElementById("ed-kecamatan");
  selKec.innerHTML = daftarKecamatan.map(k => `<option value="${aman(k)}">${aman(k)}</option>`).join("");

  document.getElementById("ed-nama").value = l.namaPetugas || "";
  document.getElementById("ed-jenis").value = l.jenisLahan || "";
  document.getElementById("ed-tanggal").value = l.tanggal || "";
  document.getElementById("ed-waktu").value = l.waktu || "";
  selKec.value = l.kecamatan || "";
  document.getElementById("ed-kelurahan").value = l.kelurahan || "";
  document.getElementById("ed-lat").value = isFinite(l.lat) ? l.lat : "";
  document.getElementById("ed-lng").value = isFinite(l.lng) ? l.lng : "";
  document.getElementById("ed-kk").value = l.jumlahTerdampakKK ?? 0;
  document.getElementById("ed-catatan").value = l.catatanLokal || "";
  document.getElementById("ed-tujuan").value = l.tujuanMonitoring || "";
  document.getElementById("ed-ancaman").value = l.ancamanDampak || "";
  document.getElementById("ed-pencegahan").value = l.tindakanPencegahan || "";
  document.getElementById("ed-penanganan").value = l.tindakanPenanganan || "";
  document.getElementById("ed-hasil").value = l.hasilPeninjauan || "";

  function tutup(){ overlay.remove(); }
  document.getElementById("ews-ed-tutup").addEventListener("click", tutup);
  document.getElementById("ews-ed-batal").addEventListener("click", tutup);
  overlay.addEventListener("click", (e) => { if(e.target === overlay) tutup(); });

  document.getElementById("ews-ed-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const patch = {
      namaPetugas: document.getElementById("ed-nama").value.trim(),
      jenisLahan: document.getElementById("ed-jenis").value.trim(),
      tanggal: document.getElementById("ed-tanggal").value,
      waktu: document.getElementById("ed-waktu").value,
      kecamatan: selKec.value,
      kelurahan: document.getElementById("ed-kelurahan").value.trim(),
      lat: parseFloat(document.getElementById("ed-lat").value),
      lng: parseFloat(document.getElementById("ed-lng").value),
      jumlahTerdampakKK: parseInt(document.getElementById("ed-kk").value || "0", 10),
      catatanLokal: document.getElementById("ed-catatan").value.trim(),
      tujuanMonitoring: document.getElementById("ed-tujuan").value.trim(),
      ancamanDampak: document.getElementById("ed-ancaman").value.trim(),
      tindakanPencegahan: document.getElementById("ed-pencegahan").value.trim(),
      tindakanPenanganan: document.getElementById("ed-penanganan").value.trim(),
      hasilPeninjauan: document.getElementById("ed-hasil").value.trim(),
      dieditOleh: (ewsCurrentUser() && ewsCurrentUser().nama) || "Tidak diketahui",
      dieditPada: new Date().toISOString()
    };
    ewsPerbaruiLaporanPetugas(id, patch);
    tutup();
    if(typeof onSaved === "function") onSaved();
    alert("Perubahan laporan berhasil disimpan.");
  });
}

/* ---------- Util umum ---------- */
function ewsBadgeClass(level){
  const l = (level || "").toLowerCase();
  if(l === "tinggi" || l === "high") return "badge-high";
  if(l === "sedang" || l === "medium") return "badge-medium";
  if(l === "rendah" || l === "low") return "badge-low";
  return "badge-neutral";
}

// Sekarang async (Supabase butuh 1 kali panggilan jaringan/local-cache
// untuk cek sesi). Panggilannya tetap sama di setiap halaman
// (`ewsInitPage("dashboard", {...})`, tanpa `await`) — halaman akan
// tampil begitu Promise ini selesai. Selama menunggu, halaman disembunyikan
// lewat class "ews-cek-auth" di <html> (lihat style.css) supaya konten
// terproteksi tidak sempat kelihatan sebelum status login dipastikan.
async function ewsInitPage(activeKey, topbarConfig){
  const ok = await ewsRequireAuth();
  if(!ok) return; // sudah diarahkan ke index.html oleh ewsRequireAuth()

  renderSidebar(activeKey);
  renderTopbar(topbarConfig);
  document.documentElement.classList.remove("ews-cek-auth");
  // Ditembakkan setelah _ewsUser dipastikan terisi — halaman yang punya
  // tampilan bergantung pada identitas/peran user (mis. nama akun aktif,
  // tombol yang cuma muncul untuk admin_penuh) mendengarkan event ini
  // supaya tidak dijalankan lebih dulu daripada proses login async selesai.
  document.dispatchEvent(new CustomEvent("ews:auth-ready"));

  // Catat log login satu kali per sesi (bukan di setiap halaman) memakai
  // sessionStorage sebagai penanda supaya tabel login_log tidak dibanjiri
  // baris tiap kali pindah halaman.
  if(supabaseClient && !sessionStorage.getItem("ews_login_tercatat")){
    sessionStorage.setItem("ews_login_tercatat", "1");
    supabaseClient.from("login_log").insert({
      user_id: _ewsUser.uid, nama: _ewsUser.nama, user_agent: navigator.userAgent
    }).then(({ error }) => { if(error) console.warn("[FireSentry] gagal mencatat login_log:", error.message); });
  }

  // Muat riwayat laporan petugas dari Supabase (menggantikan localStorage).
  // Fire-and-forget: halaman langsung dirender, tabel laporan akan
  // memperbarui diri sendiri lewat event "ews:laporan-updated" begitu data
  // selesai dimuat (lihat data.js + listener di laporan.html/monitoring.html).
  if(typeof ewsMuatLaporanPetugasDariServer === "function"){
    ewsMuatLaporanPetugasDariServer();
  }
}
