# KASIR DBL RESTO 1.3.3 – Perubahan menu dan master pengeluaran

- Menu utama tidak menampilkan tombol/menu Karyawan; pengelolaan karyawan dan input gaji dipindahkan ke halaman Pengeluaran.
- Dashboard tidak menampilkan Produk aktif.
- Informasi keuntungan harian disembunyikan secara default dan dapat dibuka melalui tombol yang meminta PIN keamanan, dengan tampilan sementara selama 60 detik.
- Master jenis dan item pengeluaran mendukung edit serta hapus. Pengubahan nama jenis/item turut memperbarui entri pengeluaran yang cocok; penghapusan hanya menghapus dari master, catatan lama dipertahankan.
- Capacitor config diubah dari TypeScript ke JSON untuk menghindari error parsing config TS pada workflow.


### Revisi menu 1.3.3
- Menghapus menu Meja & Pesanan dan Dapur dari dashboard serta navigasi.
- Menghapus halaman terkait dan dialog pesanan meja dari antarmuka; transaksi langsung tetap tersedia.
- Modul resto.js tidak dimuat pada aplikasi karena alur meja/dapur dihapus.
