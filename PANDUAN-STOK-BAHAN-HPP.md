# Panduan Stok Bahan Baku & HPP Menu — KASIR 2.9.0

## Alur data
```
Pengeluaran (belanja bahan, Kode Bahan B001) ──► Stok Bahan Baku  (+ stok)
Kasir (jual produk, SKU = Kode Menu M01) ──► HPP Menu (resep) ──► Stok Bahan Baku  (− stok)
Kode bahan = SKU item Persediaan ──► dipantau di Kontrol Persediaan ("Bahan masuk")
```

## Mulai pertama kali
1. **Stok Bahan Baku → Impor Excel HPP** → pilih file format HPP (sheet Bahan_Baku, Menu, Resep).
2. Di pratinjau, centang **Buat produk kasir** bila menu belum ada di kasir. Produk dibuat dengan SKU = kode menu. Bila produk sudah ada, pastikan SKU-nya sama dengan kode menu (mis. produk "Rendang Daging" ber-SKU `M01`), atau pilih produknya di **HPP Menu → Resep**.
3. **Catat → Stok awal** untuk bahan yang ada di dapur hari ini (dalam satuan stok, mis. gram).
4. Opsional: **HPP Menu → Isi harga modal produk** agar laporan laba memakai HPP resep.

## Sehari-hari
- **Belanja bahan**: Pengeluaran → Tambah → jenis Bahan baku (atau Operasional) → pilih **Kode bahan** dari dropdown. Item, satuan, harga, dan nominal terisi otomatis; stok bertambah saat disimpan.
- **Penjualan**: tidak perlu apa-apa — stok bahan berkurang sesuai resep.
- **Akhir hari/minggu**: Catat → **Stok opname** dengan hasil hitung fisik; selisihnya tercatat otomatis.
- **Akhir bulan**: Pembukuan → Ringkasan → Persediaan akhir → tekan **Pakai Rp…** (nilai bahan baku + produk jadi), sesuaikan dengan opname, lalu Simpan. Ini membuat HPP aktual mencerminkan bahan yang benar-benar terpakai.
- **Berkala**: Pengaturan → **Pemeriksaan data** untuk mendeteksi resep/kode bahan/harga modal yang tidak cocok.
- **Rusak/terbuang**: Catat → Rusak.
- Filter **Perlu belanja** menampilkan bahan menipis/habis (isi *Stok minimum* di Edit bahan).

## Bahan & menu yang dipantau di Kontrol Persediaan
- Ubah SKU item Persediaan menjadi kode bahan (mis. `B038`) bila bahan itu ingin dipantau di Persediaan. Belanja B038 otomatis tercatat sebagai *Bahan masuk* dapur di Persediaan; catat pemakaian/opname bahan itu di Persediaan.
- Menu yang porsinya dipantau di Persediaan (produk terhubung ke item Persediaan bagian depan): bahan dipotong saat masakan dicatat di dapur, bukan per penjualan.

## Tips
- Satuan stok sebaiknya satuan terkecil yang dipakai di resep (g, ml, butir). *Isi per satuan beli* = berapa satuan stok dalam 1 satuan beli (1 kg = 1000 g).
- Mengganti kode bahan di Edit bahan ikut mengganti kode di resep, belanja, dan catatan stok.
- Unduh Excel untuk laporan bulanan atau mengedit massal, lalu impor kembali.
