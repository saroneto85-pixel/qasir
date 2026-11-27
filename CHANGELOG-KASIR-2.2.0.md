# KASIR 2.2.0

## Perbaikan sesuai permintaan
1. **Ikon aplikasi**: ikon robot hijau berasal dari sisa ikon bawaan Capacitor (ikon bulat & foreground adaptif) yang tidak tertimpa. `android-native/apply_branding.py` kini menghapus semua ikon bawaan lalu memasang ikon KASIR (adaptif, bulat, dan lama). Perlu build ulang APK; bila ikon lama masih tampil, hapus-pasang ulang/ restart launcher (data dicadangkan dulu).
2. Tombol "Transaksi baru" hijau di kanan atas Dashboard dihapus.
3. Menu baru di Dashboard & sidebar: **Neraca Awal**, **Pembukuan**, **Evaluasi Usaha** (rumus dari `Pembukuan_DBL_revisi.xlsx`, diuji sama dengan Excel di `test-pembukuan-logic.mjs`). Neraca Awal dihapus dari menu Laporan.
   - Neraca Awal: kas, persediaan, peralatan & akumulasi penyusutan (otomatis dari menu Aset bila ada), hutang awal, sewa dibayar dimuka (otomatis), modal awal, jatuh tempo sewa, serta asumsi & target.
   - Pembukuan: indikator bulanan, peringatan otomatis, Laba Rugi 12 bulan, Arus Kas bulanan.
   - Evaluasi Usaha: nilai vs target + status per indikator.
   - Terhubung ke: Transaksi (penjualan), Pengeluaran (HPP & gaji), Aset (penyusutan), Hutang & Piutang (kas saat dibayar), Produk (nilai stok), Laporan (Buku Kas, Arus Kas, Laba Rugi).
4. Laporan: "Per Karyawan/Kasir" → "Per Kasir".
5. Pelanggan: Unduh template CSV & Ekspor CSV kini berfungsi di Android (memakai Filesystem + Share); tata letak dirapikan.
6–8. Unduh Excel di Pengeluaran, Aset & Penyusutan, Hutang & Piutang (berformat Rupiah/tanggal, ada sheet ringkasan).
9. Pengaturan › **Tambah kasir** (daftar kasir dipakai di Transaksi dan laporan Per Kasir).
10. PIN cukup 1 kali input per sesi (terkunci lagi bila aplikasi di latar >10 menit, atau tombol "Kunci sekarang").
11. Tombol **Batal** dan **×** berfungsi di semua dialog (penyebab: tombol ikut divalidasi form sehingga diam-diam gagal).
12. Menu Stok & Inventori dihapus.
13–14. SKU/kode: tambah/edit di Kelola Produk (unik, bisa dibuat otomatis) dan tampil di bawah nama produk di Transaksi, nota, laporan, ekspor, serta Persediaan.
15. Persediaan: tombol "+ Catat persediaan" dihapus; **Naik ke depan** menambah stok produk via SKU; **Terjual** diambil otomatis dari transaksi kasir via SKU (tombol "+ Penjualan" menarik data kasir) dan penjualan mengurangi stok produk.

## Temuan & perbaikan tambahan (butir 16)
- Tanggal memakai UTC → transaksi pukul 00.00–07.00 WIB tercatat di hari sebelumnya. Kini tanggal lokal.
- Keuntungan dihitung ganda (HPP produk + belanja bahan). Kini laba mengikuti Excel: penjualan − HPP(belanja bahan+operasional) − gaji − sewa − penyusutan − pajak.
- Metode non-tunai (QRIS dll.) tidak lagi mewajibkan "uang diterima".
- Penjualan Tempo/Kasbon otomatis menjadi piutang; belanja berstatus **Hutang** otomatis menjadi hutang. Pembayaran dicatat di Hutang & Piutang dan baru memengaruhi kas saat dibayar.
- Form tanpa validasi (produk, pelanggan, karyawan, aset, hutang) kini divalidasi; Enter di form tidak lagi menutup dialog.
- Tombol Transaksi Baru tidak lagi menutupi isi halaman dan disembunyikan di halaman Transaksi.
- Catatan: pada Excel, kolom Kas keluar di sheet Buku Kas hanya menjumlah Bahan+Operasional (Gaji tidak ikut). Di aplikasi gaji ikut mengurangi kas.
