# Panduan Kunci Rilis & Lisensi — KASIR DBL 2.14.4 (semua lewat github.com di browser)

Tidak perlu GitHub Desktop. Bisa dari laptop atau HP (Chrome).
Langkah **1–5 cukup sekali**. Setelah itu, setiap update hanya langkah **6**.

Yang Anda butuhkan dari paket ini:
- `KASIR_UPDATE_2_14_4.zip` (jangan diekstrak — diunggah utuh)
- 3 berkas workflow: `build-android.yml`, `buat-kunci-rilis.yml`, `terapkan-update.yml`
- `pembuat-kode-aktivasi.html` (alat pembuat kode aktivasi)

---

## 1. Pasang 3 berkas workflow (sekali)

1. github.com → repo `qasir` → buka folder **`.github`** → **`workflows`**.
2. **Add file → Upload files** → pilih ketiga berkas `.yml` di atas.
3. Di kolom pesan commit tulis: **`[skip ci] perbarui workflow`** → **Commit changes**.
   (`[skip ci]` mencegah build berjalan sebelum langkah lain selesai. Jika terlanjur muncul build gagal, abaikan.)

## 2. Kata sandi kunci rilis (sekali)

1. Buat kata sandi **minimal 16 karakter** (campur huruf besar, kecil, angka). **Catat di 2 tempat.**
2. Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
   - Name: `KASIR_KEYSTORE_PASSWORD` · Secret: kata sandi tadi → **Add secret**.

> Di HP: menu Settings ada di tab paling kanan repo (geser), atau buka tampilan desktop di Chrome.

## 3. Buat kunci rilis (sekali)

1. Repo → tab **Actions** → di daftar kiri pilih **"Buat kunci rilis (SEKALI SAJA)"** → **Run workflow**
   → isi nama usaha → **Run workflow**. Tunggu ±1 menit sampai centang hijau.
2. Hasilnya: folder **`kunci/`** berisi `kasir-release.p12.enc` (kunci rilis, terenkripsi dengan kata sandi Anda).
3. **Cadangan:** buka `kunci/kasir-release.p12.enc` → tombol **Download raw file** → simpan di Google Drive pribadi
   + flashdisk, bersama catatan kata sandinya. Jangan pernah menghapus/mengganti file ini di repo.

> Workflow ini menolak berjalan bila kunci sudah ada, jadi aman dari tergantikan tanpa sengaja.
> Sangat disarankan repo `qasir` berstatus **Private** (Settings → General → Danger Zone → Change visibility).

## 4. Kunci lisensi (sekali)

1. Buka **`pembuat-kode-aktivasi.html`** di Chrome/Edge **laptop** (klik dua kali file-nya).
2. Isi kata sandi cadangan (min. 10 karakter) → **Buat kunci baru & unduh cadangan**.
   Simpan file `KASIRDBL-kunci-lisensi-CADANGAN.json` + kata sandinya di 2 tempat → tekan **Sudah saya simpan**.
3. Bagian **Kunci publik** → **Salin kunci publik**.
4. github.com → repo → **Add file → Create new file**
   - Nama file: `lisensi/kunci-publik.txt` (ketik garis miring, folder terbentuk otomatis)
   - Isi: tempel kunci publik → pesan commit **`[skip ci] kunci publik lisensi`** → **Commit changes**.

> Kunci publik boleh ada di repo. Kunci **rahasia** hanya ada di alat (browser laptop) dan file cadangan.
> Ganti laptop/browser: buka alat → **Pulihkan dari file cadangan**.

## 5. Unggah paket 2.14.4 → APK rilis dibuat otomatis

1. Repo (halaman utama) → **Add file → Upload files** → pilih **`KASIR_UPDATE_2_14_4.zip`** (utuh, jangan diekstrak)
   → **Commit changes**.
2. Tab **Actions**: workflow **"Terapkan paket update"** mengekstrak zip ke folder yang benar, menghapus zip-nya,
   lalu memulai **"Build Kasir DBL Android (APK + AAB)"**. Ringkasan berkas yang diperbarui ada di halaman run-nya.
3. Setelah build hijau: buka run build → **Artifacts**. Ada dua hasil:
   - **`kasir-dbl-apk-release`** → `KASIR-DBL-2.14.4-release.apk` — dipasang langsung di HP / dibagikan ke pembeli.
   - **`kasir-dbl-aab-release`** → `KASIR-DBL-2.14.4-release.aab` — khusus diunggah ke Google Play Console
     (AAB tidak bisa dipasang langsung di HP).
   Build memeriksa otomatis bahwa APK dan AAB ditandatangani kunci rilis yang sama.
   - Jika namanya `…-debug`: langkah 2–3 belum beres.
   - Jika gagal "Kunci publik lisensi belum diisi": ulangi langkah 4.4.
4. **Sekali ini saja di setiap HP** (karena kunci berganti dari debug ke rilis):
   Pengaturan → Data & perangkat → **Cadangkan data** → simpan file cadangan di luar aplikasi →
   hapus aplikasi lama → pasang APK rilis → **Pulihkan**. Update berikutnya cukup dipasang menimpa.

## 6. Setiap ada update berikutnya

**Add file → Upload files → `KASIR_UPDATE_x_x_x.zip` → Commit changes.** Selesai — APK dibangun otomatis.
- `lisensi/kunci-publik.txt` Anda tidak akan pernah ditimpa.
- Bila ringkasan run menulis **"Perbarui manual (berkas workflow)"**: ulangi langkah 1 untuk berkas yang disebut.

---

## 7. Mengaktifkan HP Anda sendiri

1. Buka aplikasi → layar **Aktivasi** → **Salin kode** (kode perangkat, 15 huruf).
2. Di alat: tempel kode → paket **Pemilik — tanpa batas** → **Buat kode aktivasi** → **Salin kode**.
3. Kirim ke HP (WhatsApp ke diri sendiri) → tempel di aplikasi → **Aktifkan**.

## 8. Melayani pembeli

1. Pembeli memasang APK → layar Aktivasi → **Minta kode aktivasi via WhatsApp** → WhatsApp terbuka ke
   **+62 813-7370-2192** dengan pesan berisi kode perangkat & nama toko (tinggal tekan Kirim).
   Tombol yang sama ada di Pengaturan → **Tentang aplikasi** (untuk tingkatkan paket).
2. Setelah bayar: di alat isi kode perangkat, nama toko, nomor WA, paket → **Buat kode aktivasi**
   → **Kirim via WhatsApp**.
3. Pembeli menempel kode → **Aktifkan**. Semua tercatat di **Riwayat lisensi** (unduh CSV).

| Paket | Perangkat Utama | Perangkat tambahan |
|---|---|---|
| Basic | 1 | — |
| Toko | 1 | 2 |
| Pro | 1 | 5 |
| Pemilik (khusus Anda) | 1 | tanpa batas |

- **Perangkat tambahan tidak perlu kode**: di layar Aktivasi pilih **Sambungkan ke Perangkat Utama**, lalu
  **Gabung ke Perangkat Utama** dengan kode pairing. Perangkat Utama menolak bila jatah paket penuh.
- **Upgrade paket**: buat kode baru (kode perangkat sama, paket lebih tinggi) → pembeli: Pengaturan →
  Lisensi aplikasi → **Masukkan kode aktivasi baru**.
- **Ganti HP / reset pabrik**: kode perangkat berubah → buatkan kode baru.

## 9. Batasan

- APK tetap bisa disalin, tetapi tidak bisa dipakai tanpa kode aktivasi untuk HP tersebut.
- Kode tidak bisa dipalsukan tanpa kunci rahasia Anda; kode untuk HP lain ditolak.
- APK yang dibongkar & ditandatangani ulang terdeteksi ("APK ini bukan versi resmi").
- Pembobol yang sangat niat tetap bisa membongkar aplikasi Android mana pun; proteksi ini membuatnya tidak praktis.

## 10. Nanti di Play Store

- Yang diunggah ke Play Console adalah berkas **AAB** dari artifact `kasir-dbl-aab-release` (bukan APK).
- Nomor versi (versionCode) naik otomatis dari nomor versi aplikasi, mis. 2.14.4 → 21403, sesuai syarat Play.

- Play Console → **Play App Signing → gunakan kunci sendiri**, unggah keystore dari `kunci/kasir-release.p12.enc`
  (minta bantuan untuk membukanya — butuh kata sandi Anda). Pembeli APK lama bisa update lewat Play Store,
  data tetap ada, kode aktivasi tetap berlaku.
