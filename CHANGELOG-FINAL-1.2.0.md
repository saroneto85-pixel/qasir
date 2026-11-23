# KASIR DBL 1.2.0 — penyelesaian modul laporan dan master

## Implementasi
1. Master kategori produk tersendiri: tambah, ubah, hapus, validasi duplikasi, larangan menghapus kategori yang masih digunakan; kategori lama dimigrasikan dari produk.
2. Laporan penjualan: tab Per Item, Per Jenis/Kategori, Tipe Transaksi, dan Per Karyawan/Kasir, mengikuti filter periode, tipe, dan metode pembayaran.
3. Buku kas menampilkan arus tunai; Arus Kas menampilkan seluruh metode pembayaran. Saldo berjalan dihitung dari tanggal transaksi dan pengeluaran yang tersimpan.
4. Logo toko dari pengaturan ditampilkan pada cetak struk dan PDF berbagi.
5. PIN 6 digit diberlakukan untuk edit/hapus produk, kategori, pelanggan, karyawan, transaksi, pengeluaran, pemulihan cadangan, penghapusan data, serta akses laporan/pengaturan.
6. Store kategori ditambahkan pada SQLite/IndexedDB; versi IndexedDB dinaikkan untuk migrasi aman. SQLite menggunakan tabel generik `pos_records`, sehingga store baru tidak mengubah/menghapus tabel transaksi lama.
7. Workflow build diperbarui ke Node 24.

## Migrasi dan batasan
- SQLite: store `categories` dibuat otomatis dengan INSERT OR IGNORE dari kategori produk lama. ID kategori dinormalisasi huruf kecil; migrasi idempoten.
- IndexedDB: versi database dinaikkan ke 3; object store `categories` dibuat pada `onupgradeneeded`.
- Kategori yang sudah terpakai produk tidak bisa dihapus. Kategori lama tetap muncul sebagai pilihan.
- Buku kas dan arus kas dimulai dari saldo awal nol karena source saat ini belum memiliki field saldo awal/modal. Saldo berjalan adalah hasil transaksi yang tercatat, bukan rekonsiliasi rekening bank.
- Laporan per karyawan memakai field `cashier` pada transaksi. Tidak ada relasi employeeId eksplisit pada transaksi historis.
- Uji perangkat fisik (Bluetooth RPP02N, izin kontak, cetak, dan restore) tetap perlu dijalankan setelah APK dihasilkan.

## Validasi yang dilakukan pada source
- `node --check app.js`: lulus.
- `node --check db.js`: lulus.
- Pemeriksaan struktur ZIP: dilakukan setelah pengemasan.
- Build Gradle/APK: tidak dapat diklaim berhasil dari lingkungan ini; workflow GitHub Actions harus dijalankan.
