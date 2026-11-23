# KASIR 2.0.1

- Menu Utama dashboard: 10 kartu lengkap (sebelumnya hanya Pengaturan, sehingga menu di HP tidak bisa dibuka).
- Menu Pengeluaran disusun ulang menjadi 3 tab: Daftar pengeluaran, Karyawan, Laporan.
  - Tambah/Edit pengeluaran: jenis, item, qty, satuan, harga satuan, nominal (otomatis qty x harga), metode bayar, karyawan, tanggal, keterangan. Jenis berkelompok Gaji wajib memilih karyawan.
  - Tambah/Edit/Hapus jenis & item. Setiap jenis punya Kelompok laporan: Belanja Bahan, Belanja Operasional, atau Gaji Karyawan (bawaan: "Bahan baku" = Bahan, "Gaji" = Gaji, lainnya = Operasional).
  - Tambah/Edit/Hapus karyawan (nama, tanggal masuk, posisi, no HP, no rekening/e-wallet). Mengubah nama karyawan ikut memperbarui catatan pengeluaran.
  - Laporan per periode: Total, Belanja Bahan, Belanja Operasional, HPP (Bahan + Operasional), Gaji Karyawan, dan Per Metode Bayar.
- Form "Input gaji" terpisah dihapus; gaji dicatat lewat Tambah pengeluaran (jenis Gaji + karyawan). Data gaji lama tetap terbaca.
- Perbaikan: tombol Selesai di dialog jenis & item bisa menutup dialog; memilih jenis di dialog tidak lagi kembali ke jenis pertama.
- Catatan: mengubah Kelompok sebuah jenis ikut mengubah klasifikasi catatan lama pada jenis itu di laporan.
