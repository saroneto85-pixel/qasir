# KASIR 2.9.0 — Stok Bahan Baku & HPP Menu

Dua menu baru yang saling terhubung dengan Pengeluaran, Kasir, dan Kontrol Persediaan. Formatnya mengikuti file "Format HPP untuk suntik aplikasi kasir" (sheet Bahan_Baku, Menu, Resep).

## Menu Stok Bahan Baku
- Daftar bahan berkode (**B001, B002, …**): satuan beli, harga beli, isi per satuan beli, satuan stok, stok minimum, dilacak/tidak.
- **Terhubung ke Pengeluaran lewat Kode Bahan.** Form pengeluaran berjenis belanja bahan punya kolom *Kode bahan*. Mengisi `B001` langsung mengisi nama item, satuan, dan harga, lalu belanja itu **otomatis masuk ke Stok Bahan Baku**: 2 kg Adonan (isi 1000 g) → stok bertambah 2000 g. Harga beli bahan ikut diperbarui ke harga belanja terakhir (bisa dimatikan per catatan).
- Stok **dihitung otomatis** dari catatan, tidak diketik manual:
  `stok awal/opname + belanja (Pengeluaran) − pemakaian dari penjualan (resep) − rusak/pemakaian lain`.
  Mengedit atau menghapus pengeluaran/transaksi langsung membetulkan stok.
- Tombol **Catat**: stok awal, stok opname (hitung fisik; selisih dicatat otomatis), rusak/terbuang, pemakaian atau masuk lain.
- **Kartu stok** per bahan per bulan: saldo awal, belanja, penjualan, penyesuaian, saldo berjalan.
- Ringkasan bulanan: awal, belanja, terpakai, penyesuaian, sisa, status (Aman / Menipis / Habis / Minus), nilai stok.
- Bahan bertanda *Dilacak Stok? = Tidak* (mis. Arang) tetap dihitung di HPP tetapi tidak dipotong stoknya.

## Menu HPP Menu
- Resep per menu berkode (**M01, M02, …**): bahan, kelompok, qty per batch, porsi per batch → **HPP per porsi, laba, food cost %**, status sama seperti di Excel (food cost > 70%, cek satuan jual, bahan tanpa harga).
- **Terhubung ke Kasir lewat kode menu.** Produk kasir yang SKU-nya sama dengan kode menu (atau dipilih manual) memakai resep tersebut: **setiap penjualan mengurangi stok bahan baku** sesuai resep (qty per batch ÷ porsi per batch × jumlah terjual).
- HPP mengikuti harga bahan terbaru. Tombol **Isi harga modal produk** menyalin HPP per porsi ke harga modal produk kasir, sehingga laporan laba memakai HPP resep.
- Daftar produk kasir yang belum punya resep (penjualannya belum mengurangi stok bahan).

## Kaitan dengan Kontrol Persediaan (melalui SKU)
- **Bahan** yang kodenya sama dengan SKU item Persediaan (mis. item "Daging Sapi" ber-SKU `B038`) **dipantau di Persediaan**: belanja ber-kode bahan itu otomatis tercatat sebagai *Bahan masuk* di bagian dapur. Satuannya mengikuti item Persediaan (kg → 2 kg; g → 2000 g). Di Stok Bahan Baku bahan ini ditandai *Dipantau di Persediaan* agar tidak dihitung ganda.
- **Menu** yang produknya terhubung ke satu item Persediaan bagian depan (masakan yang stok porsinya dipantau): bahan baku dipotong saat dapur mencatat masakan (*Bahan masuk/hasil olahan*), bukan per penjualan.
- Selebihnya, bahan dipantau di menu Stok Bahan Baku.
- Batasan lama di 2.7.0 ("pembelian di Pengeluaran dan bahan masuk di Persediaan tidak saling mengisi") kini teratasi untuk bahan yang memakai kode bahan.

## Impor & ekspor Excel
- **Impor Excel HPP** langsung di aplikasi (tanpa internet): file Anda terbaca utuh — **140 bahan, 28 menu, 431 baris resep**; HPP per porsi ke-28 menu **sama persis** dengan nilai di Excel. Kolom dikenali dari judulnya. Impor ulang memperbarui bahan/menu berkode sama tanpa menyentuh catatan stok, belanja, atau transaksi.
- Menu yang belum ada produknya di kasir bisa dibuatkan produk sekaligus (SKU = kode menu, harga jual & modal dari file). Menu juga dicocokkan otomatis dengan produk yang namanya sama.
- **Unduh Excel**: Stok_Bahan (bulanan), Bahan_Baku, Menu, Resep.

## Lain-lain
- Data baru (bahan, resep, catatan stok bahan) ikut **sinkron antar perangkat** (2.8.0), cadangan/pulihkan JSON, dan "Hapus seluruh data".
- Membuka HPP Menu dan mengubah bahan/resep dilindungi PIN.

## Pengujian
- `node test-bahan-logic.mjs`: 49 pemeriksaan (impor file Anda, HPP = Excel, belanja/penjualan/opname/rusak, edit & hapus, kaitan Persediaan, konversi satuan).
- Uji di aplikasi sebenarnya (browser, IndexedDB): impor file → 140 bahan/28 menu/28 produk; belanja B038 3 kg → stok +3000 g dan harga diperbarui; jual 2 porsi Rendang → B038 berkurang 333,33 g; hapus transaksi → stok kembali; bahan ber-SKU Persediaan → tercatat "Bahan masuk" 3 kg. 18/18 lulus tanpa galat.
- Semua uji lama tetap lulus (struk, audit, resto, persediaan, pembukuan, sinkronisasi 55 + 64).

## Catatan dari file Excel Anda
Status bawaan file tetap ditampilkan: 6 menu food cost > 70%, beberapa menu "cek satuan jual / porsi per batch" (mis. Telur Bulat 60 porsi/batch, Gulai Nangka 200), dan M28 punya 4 bahan tanpa harga. Periksa di menu HPP Menu → Resep.
