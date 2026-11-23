# KASIR 1.3.0 — modul rumah makan

Dibangun di atas source 1.2.2 (layout Kasmini). Semua fitur lama tetap berjalan.

## Alur baru
1. **Meja & Pesanan** — kartu meja (hijau = kosong, kuning = terisi). Ketuk meja untuk membuka/melanjutkan pesanan.
2. **Pesanan terbuka** — tambah menu, catatan per item ("tidak pedas"), nama pelanggan. Tersimpan otomatis tiap perubahan, jadi aman bila aplikasi tertutup.
3. **Kirim ke dapur** — hanya item baru yang dikirim (pesanan susulan menjadi tiket baru).
4. **Dapur** — antrian Baru → Diproses → Siap → Disajikan; tiket > 15 menit ditandai merah.
5. **Bayar & selesai** — membuat transaksi di store `transactions` yang sama, sehingga dashboard, riwayat, laporan, buku kas, struk PDF, dan printer RPP02N tidak berubah.
6. **Take Away / Delivery** — pesanan tanpa meja dengan nomor antrian otomatis per hari (TA-01, DLV-01).

## Pengaman
- Mengurangi item yang sudah dikirim ke dapur, membatalkan pesanan yang sudah dikirim, dan menghapus meja meminta PIN admin.
- Pembayaran ditolak bila uang kurang atau diskon melebihi subtotal. Peringatan bila masih ada item yang belum dikirim ke dapur.

## Teknis
- File baru: `resto.js` (UI), `resto-logic.js` (logika murni), `test-resto-logic.mjs` (uji; dijalankan di workflow).
- `db.js`: store baru `tables` dan `orders`; versi IndexedDB 3 → 4 (migrasi otomatis). SQLite memakai tabel generik, tidak perlu migrasi.
- Backup/restore JSON kini menyertakan `tables` dan `orders`. "Hapus data" ikut menghapus `orders`.

## Batasan yang perlu diketahui
- Data tersimpan lokal per perangkat: layar Dapur hanya melihat pesanan dari perangkat yang sama. Dapur di HP/tablet terpisah memerlukan sinkronisasi (belum ada).
- Tiket dapur belum dicetak ke printer; hanya tampil di layar Dapur.
- Belum ada pajak/service charge, gabung/pisah bill, atau pindah meja.
- Diuji di Chromium dengan plugin Capacitor di-stub (28 skenario lulus). Build APK, Bluetooth, dan SQLite native belum diuji; jalankan GitHub Actions lalu uji di HP.

---
# 1.3.1 — navigasi disusun ulang
- HP: bar menu bawah dihapus. Navigasi lewat **Menu Utama** di Dashboard; halaman lain punya tombol **←** di header. Tombol melayang **＋** (Transaksi Baru) dipertahankan tanpa bar, dan disembunyikan di halaman Transaksi.
- Menu Utama: Meja & Pesanan dan Transaksi Baru dibuat lebar di baris pertama; Dapur menyusul; sisanya berurutan. Grid kini penuh tanpa sel kosong (4 kolom desktop, 3 kolom HP/tablet).
- Sidebar desktop dikelompokkan: Operasional, Data, Keuangan, Pengaturan. Riwayat kini ada di sidebar.

---
# 1.3.2 — perbaikan tampilan di HP Android
- Header tidak lagi tertimpa jam/sinyal (status bar) dan tombol melayang tidak tertutup gesture bar: `adjustMarginsForEdgeToEdge: 'force'` di `capacitor.config.ts` + padding `env(safe-area-inset-*)` di CSS sebagai cadangan.
- Label versi "KASIR v1.3.2" di bagian bawah Dashboard dan di Pengaturan > Aplikasi, untuk memastikan APK yang terpasang adalah build terbaru.
