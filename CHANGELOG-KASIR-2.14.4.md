# KASIR 2.14.4 — WhatsApp pengembang untuk kode aktivasi

- Layar aktivasi: tombol hijau **Minta kode aktivasi via WhatsApp** → membuka WhatsApp ke **+62 813-7370-2192**
  (Mustanir Enterpreuner) dengan pesan berisi kode perangkat & nama toko. "Salin kode" & "Bagikan lewat aplikasi lain" tetap ada.
- Pengaturan → **Tentang aplikasi**: baris WhatsApp + tombol **Minta kode aktivasi / tingkatkan paket via WhatsApp**
  (pesan memuat kode perangkat, paket sekarang, versi aplikasi).
- Workflow tidak berubah dari 2.14.3 (cukup unggah zip).

# KASIR 2.14.3 — Build menghasilkan APK dan AAB

- Setiap build menghasilkan dua artifact: **APK** (`kasir-dbl-apk-…`, untuk dipasang/dibagikan) dan
  **AAB** (`kasir-dbl-aab-…`, untuk Google Play Console, disimpan 30 hari).
- Build rilis memverifikasi bahwa APK & AAB ditandatangani kunci rilis KASIR; ringkasan run menampilkan ukuran berkas.
- Workflow `build-android.yml` berubah → unggah ulang berkas ini ke `.github/workflows` (bot tidak boleh mengubah workflow).

# KASIR 2.14.2 — Tentang aplikasi

- Pengaturan → **Tentang aplikasi** (tampil di semua perangkat): versi, deskripsi, pengembang **Mustanir Enterpreuner**,
  email **saroneto85@gmail.com** (bisa diketuk / disalin).
- Layar aktivasi menampilkan kontak pengembang.

# KASIR 2.14.1 — Semua proses lewat github.com (browser)

- Workflow baru **"Terapkan paket update"**: cukup unggah `KASIR_UPDATE_x.zip` utuh (Add file → Upload files);
  zip diekstrak ke folder yang benar, dihapus, lalu build APK berjalan otomatis. Kunci publik lisensi tidak pernah ditimpa;
  berkas rahasia & path berbahaya ditolak; berkas workflow yang berubah dilaporkan untuk diperbarui manual.
- Kunci rilis kini dibuat **dan disimpan terenkripsi di repo** (`kunci/kasir-release.p12.enc`, AES-256 + PBKDF2):
  cukup satu secret `KASIR_KEYSTORE_PASSWORD` (min. 16 karakter); tidak perlu unduh/salin base64.
- Build tidak berjalan dua kali saat zip diunggah (zip diabaikan oleh build, diproses oleh penerap).
- Panduan ditulis ulang untuk browser (laptop/HP).

# KASIR 2.14.0 — Kunci rilis tetap & proteksi lisensi

## Tahap 1 — APK rilis bertanda tangan tetap
- Workflow baru **"Buat kunci rilis (SEKALI SAJA)"**: membuat keystore PKCS12 (RSA 4096, 100 tahun) dari GitHub Actions;
  menolak berjalan bila kunci sudah ada.
- Build utama memakai secrets `KASIR_KEYSTORE_BASE64` + `KASIR_KEYSTORE_PASSWORD` → **APK rilis**
  (`KASIR-DBL-<versi>-release.apk`). Tanpa secrets tetap membangun APK debug dengan peringatan.
- Update berikutnya bisa dipasang menimpa tanpa hapus aplikasi; siap untuk Play App Signing (kunci sendiri).
- `.gitignore` mencegah file kunci ikut ter-commit.

## Tahap 2 — Lisensi seumur hidup per perangkat
- Layar **Aktivasi**: kode perangkat (15 huruf) + tombol Salin / Kirim WhatsApp, kolom kode aktivasi.
- Kode aktivasi ditandatangani digital (ECDSA P-256) oleh **Alat Pembuat Kode Aktivasi**
  (`lisensi/pembuat-kode-aktivasi.html`, offline): tidak bisa dipalsukan, hanya berlaku di satu HP.
- Pemeriksaan di kode native (Java), bukan di JavaScript. APK yang dimodifikasi/ditandatangani ulang terdeteksi.
- Paket: **Basic** (1 perangkat), **Toko** (1 + 2 tambahan), **Pro** (1 + 5 tambahan), **Pemilik** (tanpa batas).
- Perangkat tambahan tidak perlu kode: pilih "Sambungkan ke Perangkat Utama". Perangkat Utama menolak pairing
  bila jatah paket penuh; panel Perangkat terhubung menampilkan "n dari batas".
- Perangkat tanpa lisensi tidak bisa menjadi Perangkat Utama / menjalankan server sinkronisasi.
- Pengaturan → **Lisensi aplikasi**: paket, jatah perangkat, kode perangkat, tombol tingkatkan paket.
- Alat pembuat kode: buat/pulihkan kunci (cadangan terenkripsi PBKDF2 + AES-GCM), swa-uji setiap kode,
  kirim via WhatsApp, riwayat lisensi + ekspor CSV.

## Penting
- Build gagal dengan pesan jelas bila `lisensi/kunci-publik.txt` belum diisi (lihat panduan langkah B).
- Jangan menimpa `lisensi/kunci-publik.txt` Anda dengan versi kosong dari paket update berikutnya.
- Panduan lengkap: `PANDUAN-KUNCI-RILIS-DAN-LISENSI.md`.

## Uji
- Lintas bahasa JS(WebCrypto) → Java: 18 + 18; batas perangkat SyncCore: 5 (total 91);
  layar aktivasi 14; alat pembuat kode dari file:// → diterima Java: 11.
