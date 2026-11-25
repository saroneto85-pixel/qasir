# KASIR 2.5.0 — Edit & hapus transaksi di Riwayat (PIN)

- **Riwayat Transaksi**: setiap nota punya tombol **Detail · Edit · Hapus** (tampil sebagai kartu di HP). Nota yang pernah diubah diberi tanda "diedit".
- **Edit transaksi** (PIN sekali per sesi, diminta ulang bila terkunci): tanggal, waktu, kasir, tipe, pelanggan, **item (jumlah ± / harga / hapus item / tambah produk)**, diskon, metode bayar, uang diterima, catatan. Total dihitung ulang langsung.
- **Hapus transaksi** (PIN + konfirmasi): dari daftar Riwayat atau dari dialog edit.
- **Dampak otomatis:** stok produk disesuaikan dengan selisih jumlah (dikembalikan saat item dikurangi/dihapus, dikurangi saat ditambah); kolom Terjual di Persediaan diperbarui (tanggal lama dan baru); piutang Tempo/Kasbon dibuat/diperbarui/dihapus; laporan, Pembukuan, dan Buku Kas ikut berubah.
- **Pengaman:** transaksi minimal 1 item; diskon ≤ subtotal; Tunai wajib uang diterima ≥ total; tidak bisa mengubah dari Tempo ke non-Tempo atau menurunkan total di bawah pembayaran piutang yang sudah tercatat; menghapus nota yang piutangnya sudah dibayar meminta konfirmasi tambahan.
- Catatan: stok produk yang tidak dilacak (kosong) tidak diubah.
