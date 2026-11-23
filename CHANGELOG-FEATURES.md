# Perubahan pada paket source ini

1. PIN admin ditingkatkan menjadi enam digit dan diverifikasi dengan SHA-256 + salt.
2. Edit/hapus produk, edit transaksi, laporan, dan pengaturan meminta PIN.
3. Foto produk dapat dipilih dari kamera atau galeri; diperkecil sebelum disimpan di SQLite.
4. Ditambahkan menu pelanggan dengan tambah/edit/hapus, import/update CSV, template dan ekspor.
5. Ditambahkan native bridge Android Bluetooth Classic SPP dan perintah cetak ESC/POS untuk RPP02N.
6. Ditambahkan pembuatan struk PDF dan berbagi melalui Android Share Sheet agar dapat diteruskan ke WhatsApp.
7. Perhitungan keuntungan harian dan laporan yang sudah ada dipertahankan.


## KASIR 1.2.0
- Master kategori terpisah dan migrasi kategori produk lama.
- Laporan penjualan per item, jenis/kategori, tipe, dan kasir.
- Buku kas tunai dan arus kas seluruh metode.
- Logo toko untuk cetak dan PDF struk.
- PIN pada pengelolaan kategori, pelanggan, karyawan, pengeluaran, transaksi, backup restore, dan penghapusan data.
- IndexedDB schema v3 dan migrasi SQLite kategori idempoten.
