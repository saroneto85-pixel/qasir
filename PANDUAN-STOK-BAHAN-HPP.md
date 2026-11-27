# Panduan Stok Bahan Baku & HPP Menu — KASIR 2.12.0

## Alur data
```
Pengeluaran (belanja bahan, Kode Bahan B001) ──► Stok Bahan Baku  (+ stok)
Kasir (jual produk, SKU = Kode Menu M01) ──► HPP Menu (resep) ──► Stok Bahan Baku  (− stok)
Belanja / "Masuk lain" bahan B001 ──► item Persediaan ber-Kode Bahan B001 ("Bahan masuk" dapur, otomatis)
```
Pembagian peran: **Stok Bahan Baku & HPP Menu** = arus transaksi (bahan & uang).
**Kontrol Persediaan** = hanya memantau stok fisik di Dapur dan Depan.

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

## Menghubungkan item Kontrol Persediaan dengan bahan
- Persediaan → **Kelola item** → pilih **Kode bahan (Stok Bahan Baku)** dari daftar. Satu bahan hanya untuk satu item.
- Setelah terhubung, setiap belanja bahan itu di Pengeluaran dan setiap “Masuk lain” di Stok Bahan Baku **otomatis** tercatat
  sebagai *Bahan masuk* di dapur (bertanda “otomatis”). Mengubah/menghapus belanja langsung membetulkan catatan ini.
- Tidak ada lagi tombol **＋ Bahan masuk** manual. Masakan/menu masuk dapur lewat **Olah jadi menu**.
  Item bahan yang belum diberi kode bahan masih boleh mencatat bahan masuk manual dari form Catat.
- Satuan: samakan satuan item dengan satuan beli (mis. kg) atau satuan stok bahan (mis. g); jumlah dikonversi otomatis.
- Stok & nilai bahan selalu dihitung di Stok Bahan Baku (belanja + masuk − penjualan sesuai resep − pemakaian/rusak, opname).
  Catatan dipakai/naik/rusak di Persediaan hanya untuk pemantauan dan tidak memotong stok bahan (tidak dobel).

## Tips
- Satuan stok sebaiknya satuan terkecil yang dipakai di resep (g, ml, butir). *Isi per satuan beli* = berapa satuan stok dalam 1 satuan beli (1 kg = 1000 g).
- Mengganti kode bahan di Edit bahan ikut mengganti kode di resep, belanja, dan catatan stok.
- Unduh Excel untuk laporan bulanan atau mengedit massal, lalu impor kembali.
