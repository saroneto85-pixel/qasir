# Kasir DBL — Aplikasi Kasir Offline

Source code Android berbasis Vite + Capacitor 7 dengan database SQLite internal.

## Fitur
- Dashboard penjualan, pengeluaran, dan keuntungan.
- Produk dengan foto kamera/galeri; foto dikompresi dan disimpan di record SQLite produk.
- PIN admin 6 digit (hash SHA-256 + salt acak) untuk edit/hapus produk, edit transaksi, laporan, dan pengaturan.
- Pelanggan: tambah/edit/hapus, impor/update CSV, template CSV, ekspor CSV.
- Cetak thermal RPP02N melalui Bluetooth Classic SPP (ESC/POS) menggunakan plugin native Android di `android-native/`.
- Bagikan struk PDF melalui Android Share Sheet, lalu pilih WhatsApp.
- Backup dan restore data JSON.
- Konfirmasi Ya/Tidak saat tombol kembali Android ditekan.

## Import pelanggan CSV
Header: `kode_pelanggan,nama,no_hp,alamat,email,keterangan`.
Pembaruan dicocokkan berdasarkan kode pelanggan, kemudian nomor HP. Baris tanpa nama dilaporkan sebagai kesalahan. Data lain tidak dihapus.

## Printer RPP02N
Pasangkan printer dari menu Bluetooth Android terlebih dahulu. Di aplikasi, buka Pengaturan, tekan Cari printer, pilih RPP02N, lalu Hubungkan. Printer harus mendukung Bluetooth Classic SPP dan ESC/POS. Firmware printer dan dukungan karakter non-ASCII perlu diuji pada perangkat fisik.

## PIN
PIN pertama kali dibuat saat membuka fitur yang dilindungi. PIN harus enam angka dan disimpan sebagai hash SHA-256 dengan salt acak; tidak ada PIN bawaan. Catat PIN di tempat aman.

## Build APK lokal
```bash
npm install
npm run build
npx cap add android
npx cap sync android
mkdir -p android/app/src/main/java/id/kasmini/pos
cp android-native/src/main/java/id/kasmini/pos/*.java android/app/src/main/java/id/kasmini/pos/
python3 android-native/patch_manifest.py
cd android
./gradlew assembleDebug
```

## Build GitHub Actions
Workflow `.github/workflows/build-android.yml` menjalankan langkah di atas dan mengunggah `kasir-dbl-debug-apk` sebagai artifact.

## Catatan verifikasi
JavaScript telah diperiksa dengan `node --check`, dan workflow YAML berhasil diparse. Build Gradle penuh belum dijalankan di lingkungan penyusunan ZIP ini; lakukan build melalui GitHub Actions dan uji kamera, Bluetooth, PDF share, serta SQLite pada HP fisik sebelum distribusi.


## Pembaruan v1.3.3

Lihat `CHANGELOG-1.3.3-PERUBAHAN-MENU.md`. Capacitor menggunakan `capacitor.config.json`.
