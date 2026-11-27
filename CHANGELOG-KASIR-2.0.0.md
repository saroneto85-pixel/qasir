# KASIR 2.0.0 — pengembangan UI dan modul awal

- Nama aplikasi KASIR dan konfigurasi Capacitor memakai JSON untuk menghindari parsing config TypeScript di CI.
- Menu Meja & Pesanan dan Dapur dikeluarkan dari UI; transaksi langsung tetap digunakan.
- Riwayat dipusatkan di dashboard. Tombol Transaksi Baru dibuat fixed di bawah layar pada Android.
- UI hijau dan kuning dengan kartu menu dan ikon SVG lokal.
- Menu Stok dengan catatan tambah, revisi (stok target), penggunaan dan buang; perubahan stok diperbarui pada produk yang memiliki nilai stok.
- Pengeluaran: edit/hapus, master jenis/item edit/hapus; data karyawan dan input gaji berada pada halaman Pengeluaran. Pembayaran gaji dicatat juga sebagai pengeluaran.
- Menu Aset dan Penyusutan (estimasi garis lurus), Hutang/Piutang, dan Neraca Awal.
- Laporan menambah Buku Kas, Arus Kas, Laba Rugi estimasi dan Penyusutan.
- Keuntungan harian disembunyikan dan memerlukan PIN untuk ditampilkan.
- Backup JSON mencakup modul baru.

## Catatan verifikasi

Uji sintaks dan uji logika yang tersedia telah dijalankan. Build Vite/Android masih harus dijalankan di GitHub Actions; npm install di lingkungan kerja ini mengalami timeout.

## Batas modul saat ini

Neraca Awal hanya mencatat saldo pembukaan kas/bank; belum menyusun neraca akuntansi lengkap. Laba Rugi merupakan estimasi dari transaksi, HPP produk dan pengeluaran yang tercatat. Penyusutan dihitung garis lurus sebagai estimasi. Mutasi stok belum otomatis dikurangi dari stok saat setiap penjualan; perlu konfigurasi/validasi metode stok sebelum diaktifkan untuk operasional penuh.
