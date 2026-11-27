# KASIR 2.10.0 — Dropdown kode bahan, Transaksi Baru di Menu Utama, audit alur data menyeluruh

## Permintaan
1. **Kode bahan di Tambah Pengeluaran kini dropdown** yang diambil langsung dari Stok Bahan Baku (`B038 · Daging Sapi (kg)`, urut kode; dikelompokkan bila bahan punya kategori). Memilih bahan mengisi Item, satuan, harga satuan, dan nominal; mengganti bahan ikut mengganti harga. Sebaliknya, memilih Item yang namanya sama dengan bahan berkode otomatis memilih kode bahannya. Kolom ini muncul untuk jenis berkelompok **Bahan dan Operasional** (keduanya dihitung sebagai pembelian HPP di Pembukuan; mis. gas, arang, kemasan).
2. **Kotak "Transaksi Baru"** di Menu Utama, tepat di sebelah Riwayat (15 kotak = 5 baris rapi di HP). Tombol melayang "Transaksi Baru" disembunyikan di beranda agar tidak menutupi menu; di halaman lain tetap ada.
3. Audit menyeluruh — lihat di bawah.

## Audit alur data (Neraca Awal → Pengeluaran → Stok Bahan → HPP Menu → Persediaan dapur/depan → Kasir → Laporan/Pembukuan → Evaluasi)

### Diperbaiki
- **Persediaan akhir di Pembukuan kini tersambung ke Stok Bahan Baku.** HPP aktual = persediaan awal + pembelian bahan & operasional − persediaan akhir. Sebelumnya usulan nilai persediaan akhir hanya "stok produk saat ini". Kini usulannya = **nilai bahan baku pada akhir bulan** (Stok Bahan Baku + bahan yang dipantau di Persediaan) **+ produk jadi** (stok × HPP), dengan tombol "Pakai".
- **Mencegah dobel hitung persediaan:** produk ber-resep yang bahannya dipotong per penjualan tidak ikut dinilai sebagai produk jadi (bahannya masih tercatat di Stok Bahan Baku sampai terjual). Produk yang bahannya dipotong saat produksi di Persediaan tetap dinilai.
- **Pemeriksaan data (Pengaturan) mencakup Stok Bahan & HPP Menu:** kode bahan ganda/kosong, satuan bahan belum lengkap, resep memakai kode bahan yang tidak ada, bahan resep tanpa harga, menu belum terhubung ke produk kasir, **harga modal produk berbeda >5% dari HPP resep** (memengaruhi laba kotor standar), belanja memakai kode bahan yang sudah dihapus, **belanja ber-kode bahan yang tercatat sebagai beban di luar HPP** (stok naik tetapi biaya tidak masuk HPP), stok bahan minus, catatan lama bahan yang kini dipantau di Persediaan, **"Bahan masuk" manual yang kembar dengan belanja otomatis** (stok dapur dobel), dan **persediaan Neraca Awal yang berbeda dengan nilai stok awal bahan**.
- Kategori produk hasil impor HPP ikut terdaftar di Kelola Kategori.
- Laporan: kartu "Laba bersih periode" menyebut rentangnya dan bahwa rumusnya sama dengan Pembukuan (sewa & penyusutan dihitung per hari, sehingga laporan s.d. hari ini memang berbeda dengan Pembukuan sebulan penuh).

### Diperiksa — sudah konsisten
- Laporan, Pembukuan, dan Evaluasi memakai satu fungsi laba rugi yang sama (`pnl`).
- Stok bahan dihitung ulang dari catatan (belanja, penjualan × resep, produksi, opname, rusak): edit/hapus pengeluaran atau transaksi langsung membetulkan stok; catatan "Bahan masuk" dari belanja ikut terhapus bila belanjanya dihapus.
- Bahan yang dipantau di Persediaan hanya dihitung di Persediaan (tidak ganda di Stok Bahan Baku).
- HPP standar memakai harga modal yang tersimpan di baris transaksi saat terjual; "Isi harga modal produk" di HPP Menu memperbaruinya untuk penjualan berikutnya.
- Produk hasil impor dibuat tanpa batas stok; kasir hanya memberi peringatan bila stok produk kurang.
- Nomor nota per perangkat (sinkronisasi) dan stok aditif tetap berlaku untuk data baru.

### Asumsi yang dipertahankan (sesuai label di aplikasi)
- Pajak = persentase × **penjualan bruto** (label isian "Pajak (% penjualan bruto)").
- Pembelian kelompok Bahan + Operasional = pembelian HPP; Gaji, Utilitas, Transportasi = beban di luar HPP (bisa diubah per jenis di Jenis & item).
- Nilai bahan memakai harga beli terakhir; produk jadi dinilai pada stok saat ini (aplikasi tidak menyimpan riwayat stok produk per tanggal).

## Tampilan
- Dropdown kode bahan juga di **resep HPP Menu**; baris resep tersusun bertumpuk di HP (bahan di atas, qty/porsi/biaya di bawah).
- **Kartu stok bahan** 4 kolom (Tanggal, Keterangan, Masuk/keluar bertanda +/− berwarna, Saldo) — tidak lagi terpotong di HP.
- **Kelola Produk** di HP berupa kartu berlabel (HPP, Harga jual, Stok) — kolom tidak lagi terpotong.
- Pencarian HPP Menu selebar layar.
- Waktu buka setiap halaman dengan 140 bahan, 28 menu, dan transaksi contoh: < 0,05 detik di luar animasi; tanpa galat JavaScript di 16 halaman.

## Pengujian
- Logika bahan & HPP: 65 (tambahan: nilai persediaan tanpa dobel, 10 pemeriksaan data).
- Skenario klik di aplikasi sebenarnya: 22/22 (Transaksi Baru di sebelah Riwayat, dropdown 140 bahan, belanja → stok, jual → stok turun, hapus → kembali, tautan Persediaan, usulan persediaan akhir Pembukuan).
- Semua uji lain tetap lulus: struk 29, audit 9, resto, persediaan, pembukuan 68, sinkronisasi 55 + 64, versi & Menu Utama.
- Versi APK 2.10.0 (versionCode 21000).
