# KASIR 2.3.0 — Penyatuan penghitungan HPP (Opsi 1)

**Prinsip:** Metode B (pengeluaran) = HPP resmi untuk laba bulanan; Metode A (HPP per produk) = HPP standar sebagai pembanding & margin per item.

1. **Utilitas & Transportasi keluar dari HPP.** Kelompok baru "Beban Usaha Lain (di luar HPP)"; tetap mengurangi laba sebagai beban operasional. HPP pembelian = Belanja Bahan + Belanja Operasional langsung. Data lama dimigrasi otomatis sekali (Utilitas/Transportasi → kelompok baru); kelompok tiap jenis tetap bisa diubah di Pengeluaran › Master.
2. **HPP aktual disesuaikan persediaan:** persediaan awal + pembelian − persediaan akhir. Menu Pembukuan (Ringkasan) kini punya isian "Persediaan akhir" per bulan (stok opname), dengan tombol "Pakai nilai stok produk". Persediaan awal = akhir bulan sebelumnya (bulan pertama dari Neraca Awal). Bila belum diisi, HPP dianggap sama dengan pembelian.
3. **Selisih HPP aktual vs standar** (standar = HPP produk × terjual) tampil di Pembukuan, Evaluasi Usaha, dan peringatan otomatis. Peringatan bila selisih **lebih dari 10%** (dapat diubah di Neraca Awal › Batas selisih HPP). Tidak dinilai bila HPP produk baru terisi < 80% penjualan.
4. **Dashboard:** "Keuntungan hari ini" menjadi **"Laba kotor estimasi hari ini"** = penjualan − HPP produk (tidak lagi turun-naik mengikuti jadwal belanja).
5. Laba Rugi 12 bulan, ringkasan Excel Pengeluaran, dan kartu ringkasan Pengeluaran menampilkan rincian baru. Label HPP produk menjadi "HPP standar / porsi".
6. Perbaikan tampilan: tabel indikator Pembukuan pas di HP; warna peringatan "Aman" hijau (sebelumnya semua oranye).
7. Uji: `node test-pembukuan-logic.mjs` (64 pemeriksaan, termasuk batas 10%).
