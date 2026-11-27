# KASIR 2.11.0 — Akses perangkat tambahan diatur Perangkat Utama

## Baru
- **Akses per perangkat**: di Perangkat Utama, tiap perangkat terhubung punya tombol **Akses**.
  Pilihan cepat Kasir / Pelayan / Dapur / Penuh, atau centang menu dan fitur sensitif satu per satu.
- Perangkat baru otomatis mendapat akses **Kasir** (Transaksi Baru, Riwayat, Pelanggan).
- Perangkat tambahan menampilkan aksesnya sendiri di panel Sinkronisasi.

## Perlindungan data owner (di sisi server, bukan sekadar disembunyikan)
- Data menu yang tidak diizinkan tidak dikirim sama sekali (Neraca Awal, Pembukuan, Evaluasi,
  Pengeluaran, Aset, Hutang, Gaji, Persediaan, Bahan/HPP sesuai izin).
- Tanpa izin HPP/modal: harga modal produk & modal item nota dihapus dari data yang dikirim,
  dan perangkat tambahan tidak bisa mengubah harga modal.
- Tulis ke data yang tidak diizinkan ditolak server; PIN owner tidak pernah dikirim.
- Saat akses dicabut, data terkait di perangkat tambahan dihapus otomatis.

## Tampilan perangkat tambahan
- Kotak Menu Utama, menu samping, kartu laba/pengeluaran dan nilai persediaan disembunyikan sesuai izin.
- Tombol Edit/Hapus transaksi, kolom & isian HPP, tombol backup/ekspor, tab Karyawan disembunyikan
  bila tidak diizinkan; membuka menu terlarang lewat jalur lain memunculkan pesan.

## Teknis
- `SyncPerms.java` (server), `permissions.js` (klien) — daftar izin identik, diuji paritas (317 cek).
- Uji: SyncCore 86, e2e sinkronisasi 78 (termasuk skenario perangkat kasir terbatas), uji tampilan 22.
- Workflow GitHub menjalankan `test-permissions.mjs`.
