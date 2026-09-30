/* =========================================================
   FIRESENTRY KARHUTLA - Konfigurasi Supabase
   =========================================================
   Isi dua nilai di bawah dari dashboard project Supabase kalian:
   Settings -> API -> "Project URL" dan "anon public" key.

   Nilai "anon public" AMAN untuk ditaruh di kode frontend (memang
   didesain untuk itu oleh Supabase) SELAMA Row Level Security (RLS)
   sudah diaktifkan di semua tabel — lihat sql/schema.sql. JANGAN PERNAH
   memakai/menaruh "service_role" key di file ini atau di mana pun di
   kode frontend — itu kunci penuh yang melewati RLS.
   ========================================================= */
const SUPABASE_URL = "https://oqowjrapbynnxiydccpn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_HtuwEzyNiYz-0AiM2sJiGA_rg4hFY5v";

const supabaseClient = (SUPABASE_URL.startsWith("http"))
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

if(!supabaseClient){
  console.warn("[FireSentry] Supabase belum dikonfigurasi — isi SUPABASE_URL & SUPABASE_ANON_KEY di assets/js/supabase-config.js. Login & database tidak akan berfungsi sebelum ini diisi.");
}
