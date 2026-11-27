# KASIR 2.1.0 — Kontrol Persediaan (Dapur & Depan)

Menu baru **Kontrol Persediaan** (sidebar, kartu Menu Utama, dan panel di Dashboard) menggantikan kebiasaan mengisi file Excel `Kontrol_Stok_revisi.xlsx`.

## Alur
- DAPUR: stok awal / bahan masuk → **Olah jadi menu** (bahan berkurang, menu hasil bertambah) → **Naik ke depan** → sisa dapur. Ada juga Dipakai dan Rusak.
- DEPAN: menu yang naik otomatis menjadi stok awal depan → Penjualan / Rusak → sisa depan. Sisa sore otomatis menjadi stok awal hari berikutnya.
- Semua saldo dihitung dari catatan, tidak diketik. Peringatan bila saldo akan menjadi minus.

## Tampilan
- Ringkasan (padanan Dashboard Excel): stok awal, masuk, dipakai/terjual, rusak, sisa dapur, sisa depan, total sisa, cukup (hari), status AMAN / MENIPIS / HABIS, kroscek.
- Tab Dapur, tab Depan (posisi stok + daftar catatan, Edit/Hapus), Kartu harian per item (padanan sheet per item).
- Dashboard utama: panel DAPUR (masuk, dipakai/naik, rusak, sisa) dan DEPAN (masuk, terjual, rusak, sisa).
- Kelola item: nama, satuan, ada/tidak bagian depan, hubungkan ke produk kasir. Tombol "Isi item contoh" memuat item dari file Excel.
- Depan: tombol "Tarik penjualan dari kasir" mengisi penjualan dari transaksi kasir untuk produk yang dihubungkan.

## Data & cadangan
- Store baru `invItems` dan `invEntries` (IndexedDB v6 / SQLite generik); ikut Backup, Restore, dan Hapus data.
- Edit / Hapus catatan dan Kelola item meminta PIN; mencatat tidak.

## Uji
- `node test-persediaan-logic.mjs` memutar ulang data Excel (10 item, termasuk rantai Dencis) dan membandingkan 88 angka dengan Dashboard Excel: semuanya cocok.
