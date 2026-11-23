# Kasir DBL — Fitur yang ditambahkan

## Fitur aplikasi
- PIN admin 6 digit dengan hash SHA-256 + salt acak; melindungi edit/hapus produk, edit transaksi, laporan, dan pengaturan.
- Foto produk dari kamera/galeri melalui input gambar; foto diperkecil dan disimpan di SQLite bersama data produk.
- Data pelanggan: tambah/edit/hapus, impor CSV upsert berdasar kode pelanggan atau nomor HP, template dan ekspor CSV.
- Printer Bluetooth Classic SPP untuk perangkat yang sudah dipasangkan; jembatan native Android mengirim ESC/POS ke RPP02N.
- Bagikan struk PDF melalui Android Share Sheet; pengguna dapat memilih WhatsApp.

## Catatan penggunaan
1. Pada Android, pasangkan RPP02N dari Settings > Bluetooth dahulu. Pilih di Pengaturan Kasir DBL, lalu Hubungkan.
2. Tombol Bagikan WhatsApp membuka Android Share Sheet; pilih WhatsApp dan kontak tujuan.
3. Import CSV menggunakan header: `kode_pelanggan,nama,no_hp,alamat,email,keterangan`.
4. PIN awal dibuat saat pertama kali membuka fitur yang dilindungi. Simpan PIN dengan aman. Tidak ada PIN bawaan.
5. PDF struk dibagikan melalui Android Sharesheet; browser akan mengunduh PDF.

## Build
Jalankan `npm install`, `npm run build`, `npx cap add android`, `npx cap sync android`. Untuk workflow GitHub, file native Bluetooth di `android-native/` disalin ke proyek Android hasil generate sebelum Gradle build.

## Kompatibilitas printer
Implementasi Bluetooth Classic memakai SPP UUID standar dan ESC/POS. RPP02N perlu sudah dipasangkan. Dukungan tetap perlu diuji pada perangkat printer fisik karena variasi firmware/encoding printer dapat berbeda.
