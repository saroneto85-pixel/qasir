# KASIR DBL — pengembangan 1.1.0

Source dasar: `kasir_dbl_source_fitur_lengkap(1).zip`.

## Perubahan tahap ini
- Menambahkan plugin Android `PhoneContacts` dengan izin runtime `READ_CONTACTS`.
- Kontak native dikirim sebagai `JSArray` berisi `JSObject`; tidak mengonversi `JSONArray` menjadi array primitif.
- Sinkronisasi pelanggan mencocokkan nomor HP yang dinormalisasi dan mempertahankan alamat/catatan lama.
- Menambahkan master data karyawan dan pencatatan pembayaran gaji.
- Memperluas pencatatan pengeluaran: jenis, item, qty, satuan, harga satuan, nominal, metode pembayaran, dan karyawan.
- Menambahkan pengelompokan laporan pengeluaran.
- Memperluas backup/pemulihan untuk pelanggan, karyawan, dan pembayaran gaji.
- Memindahkan akses riwayat dari navigasi bawah (riwayat tetap tersedia dari dashboard), memperbesar tombol transaksi utama pada navigasi mobile.
- Nama aplikasi Android/PWA menjadi KASIR.

## Penyimpanan
Android tetap menggunakan SQLite di direktori privat aplikasi. Store tambahan menggunakan tabel `pos_records` generik yang sudah ada; data lama tidak dihapus.

## Verifikasi
`node --check app.js` dan `node --check db.js` lulus. Build Gradle/APK dan uji perangkat belum dijalankan pada lingkungan ini.
