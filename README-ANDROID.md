# Kasir DBL — Source Android

Source project Kasir DBL berbasis Vite + Capacitor + SQLite.

## Identitas aplikasi
- Nama aplikasi: **Kasir DBL**
- Logo aplikasi: `logo-dbl.png` (logo Bumbu Lengkep yang diberikan pengguna)
- ID aplikasi: `id.kasmini.pos`
- Penyimpanan Android: SQLite pada direktori privat aplikasi di memori internal HP.
- Browser/PWA: IndexedDB.

## Fitur yang tersedia dalam source ini
- Dashboard penjualan, transaksi, pengeluaran, produk, dan keuntungan harian.
- Manajemen produk dan transaksi penjualan.
- Riwayat transaksi dan rincian struk.
- Laporan periode, termasuk estimasi keuntungan.
- Pengeluaran operasional.
- Backup dan pemulihan JSON.
- Identitas toko dan logo struk.
- Dialog konfirmasi Ya/Tidak saat tombol kembali Android ditekan dari Dashboard.

## Rumus keuntungan
Keuntungan pada laporan dihitung sebagai:

`Total penjualan bersih - HPP item terjual - pengeluaran pada periode tersebut`.

HPP menggunakan `costPrice` yang tersimpan pada masing-masing item transaksi. Untuk transaksi lama yang tidak menyimpan HPP item, nilai HPP dianggap nol; hasil historis transaksi tersebut bisa lebih tinggi dari keuntungan sebenarnya.

## Perbaikan teknis pada source
- Pemanggilan `SQLiteDBConnection.query()` dan `run()` memakai bentuk argumen `(statement, values)` untuk kompatibilitas API plugin SQLite v7.
- Store `customers` disiapkan pada adapter database untuk pengembangan data pelanggan selanjutnya.
- Workflow GitHub Actions diperbarui untuk runner Ubuntu 24.04, setup actions terbaru, Android SDK platform 35, serta upload artifact APK.

## Fitur yang belum diimplementasikan dalam ZIP ini
Agar tidak menimbulkan kesan keliru, fitur berikut belum aktif/terintegrasi pada source ini:
- PIN admin 5 digit dan pembatasan akses edit/hapus produk, edit transaksi, laporan, dan pengaturan.
- Form foto produk kamera/galeri dan penyimpanan file foto.
- Import/update/ekspor pelanggan CSV beserta antarmuka pelanggan.
- Bluetooth SPP ESC/POS khusus printer RPP02N. Tombol cetak saat ini masih memakai dialog cetak sistem/browser.
- Berbagi struk PDF/gambar langsung ke WhatsApp.
- Pengeditan transaksi dari riwayat.

Fitur tersebut perlu implementasi dan pengujian terpisah sebelum dinyatakan tersedia.

## Build APK melalui GitHub Actions
1. Unggah isi folder `kasmini_android` ke root repository pada branch `main` atau `master`.
2. Buka tab **Actions**.
3. Jalankan workflow **Build Kasir DBL Android APK** (atau tunggu workflow berjalan setelah push).
4. Setelah sukses, unduh artifact `kasir-dbl-debug-apk`.
5. Ekstrak ZIP artifact dan instal `app-debug.apk`.

Workflow membangun APK debug untuk pengujian. APK belum dibangun atau diuji dari arsip source ini. Perlu koneksi internet untuk mengambil npm/Gradle dependencies dan Android SDK.

## Menjaga data
Database SQLite berada di direktori privat aplikasi Android. Jangan menghapus data aplikasi atau uninstall sebelum membuat backup JSON jika data transaksi perlu dipertahankan. Pergantian `applicationId` juga dapat membuat aplikasi diperlakukan sebagai aplikasi berbeda.

## Versi 2.2.0
Lihat `CHANGELOG-KASIR-2.2.0.md`. Jalankan `node test-pembukuan-logic.mjs` dan `node test-persediaan-logic.mjs` untuk uji rumus.
