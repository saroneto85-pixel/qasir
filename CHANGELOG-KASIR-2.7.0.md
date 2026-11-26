# KASIR 2.7.0 — Audit menyeluruh alur data

Diuji dengan skenario ujung-ke-ujung (Neraca Awal → produksi dapur → depan → kasir → edit/hapus → pengeluaran → hutang/piutang → Pembukuan → Evaluasi → cadangan/pulihkan): 45 pemeriksaan skenario, 68 rumus pembukuan, 29 struk, 9 audit data, serta uji ketahanan dengan data lama/janggal — semuanya lulus.

## Pertentangan / kerusakan yang ditemukan dan diperbaiki
1. **Stok produk vs stok depan tidak serempak** (produk terhubung banyak): Naik ke depan hanya menambah satu produk "utama", sehingga produk lain hanya bisa turun. Kini **Naik ke depan (+), Stok awal depan (+), Rusak depan (−)** menyesuaikan stok SEMUA produk terhubung sebesar qty ÷ pengali; penjualan mengurangi stok tiap produk. Invarian teruji: stok produk = awal + (naik+awal−rusak)/pengali − terjual. Mengedit/menghapus catatan mengembalikan stok dengan tepat.
2. **Nomor nota** memakai 8 digit milidetik (bisa kembar setelah ±28 jam) → kini berurutan per hari: `INV-20261126-001`.
3. **Tempo/Kasbon tanpa nama pelanggan** menghasilkan piutang anonim → nama pelanggan kini wajib (kasir & edit transaksi).
4. **Klik ganda "Selesai"** dapat membuat transaksi ganda → dicegah.
5. Pencocokan stok saat jual: **ID produk didahulukan**, SKU hanya cadangan (SKU yang dipindah ke produk lain tidak lagi salah sasaran).
6. **Laporan Per Item** menggabungkan produk bernama sama (mis. dua "Rendang" berbeda SKU) → kini dipisah per SKU.
7. **Pulihkan cadangan** sebelumnya menggabung dengan data yang ada (data lama bisa bercampur) → kini **mengganti** seluruh data, dengan konfirmasi.
8. **Hapus data usaha** kini juga membersihkan aset, hutang-piutang, neraca awal, dan persediaan.
9. Rentang **"Mingguan"** memakai UTC (salah hari pada 00.00–07.00 WIB) → memakai tanggal lokal.
10. **Sewa** dihitung sebelum bulan mulai sewa dan "sewa dibayar dimuka" bisa melebihi setahun → diperbaiki.
11. **Kas**: pembelian aset yang dibayar dari kas dan kasbon/pinjaman manual kini dapat tercatat di Buku Kas (kotak centang), agar saldo kas tidak lebih besar dari kenyataan.
12. Neraca Awal: validasi nilai negatif dan persentase di luar 0–100.
13. Hapus produk yang terhubung ke Persediaan kini memberi peringatan.
14. Kartu "Laba bersih periode" di Laporan menandai bahwa laba tidak terpengaruh filter tipe/metode.

## Fitur baru: Pemeriksaan data (Pengaturan)
Memeriksa kecocokan antar menu (Neraca Awal, produk/SKU, Persediaan, stok produk vs sisa depan, Terjual vs kasir, piutang/hutang otomatis, total transaksi, saldo minus, kas negatif, persediaan akhir) dan menawarkan perbaikan otomatis untuk sinkronisasi piutang-hutang, stok produk, dan catatan Terjual.

## Batasan yang disengaja
- Pembelian bahan di **Pengeluaran** dan bahan masuk di **Persediaan** dicatat terpisah (nilai Rupiah vs jumlah fisik); keduanya tidak otomatis saling mengisi.
- Selisih kas harian (setoran aktual) dari Excel belum ada karena aplikasi tidak menyimpan setoran.
