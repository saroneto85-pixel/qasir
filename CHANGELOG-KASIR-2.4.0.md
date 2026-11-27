# KASIR 2.4.0 — Satu item persediaan, banyak produk kasir

- **Kontrol Persediaan › Kelola item › "Terhubung ke produk kasir"** kini berupa daftar centang: pilih satu atau lebih produk/SKU (ada kolom pencarian). Contoh: item **Rendang** terhubung ke *Nasi bungkus rendang*, *Paket rendang*, dan *Topping rendang*.
- **Kolom ×** per produk = stok item terpakai per 1 produk terjual (default 1; mis. Paket rendang berisi 2 porsi → ×2).
- Setiap penjualan salah satu produk terhubung otomatis mengisi **Terjual** dan mengurangi stok item (jumlah terjual × pengali, dijumlahkan seluruh produk). Stok tiap produk di Kelola Produk tetap berkurang sendiri-sendiri.
- **Naik ke depan** menambah stok produk "utama": produk ber-SKU sama dengan item, atau produk pertama yang dipilih bila SKU item kosong.
- Data lama (satu produk) otomatis terbaca dan bisa ditambah produk lain. Peringatan "belum terhubung" kini memperhitungkan semua tautan.
- Uji: `node test-persediaan-logic.mjs` (+6 pemeriksaan: tiga produk terhubung, pengali, SKU diganti, data lama).
