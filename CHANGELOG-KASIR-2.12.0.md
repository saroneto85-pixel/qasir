# KASIR 2.12.0

## 1. Logo toko sebagai ikon di kiri atas
- Pengaturan → Profil toko → pilihan **“Pakai logo toko sebagai ikon di kiri atas aplikasi”** (aktif bawaan).
- Logo yang diunggah di Profil toko menggantikan ikon di header; ikon aplikasi di layar HP tetap.
- Logo langsung tampil saat aplikasi dibuka dan ikut tampil di perangkat terhubung (lewat sinkronisasi).

## 2. Laporan tanpa PIN
- Menu **Laporan** terbuka tanpa PIN di Perangkat Utama dan semua perangkat terhubung (tidak perlu izin akses).
- Angka **Laba bersih periode** tetap disamarkan dengan tombol “Tampilkan (PIN)” — sama seperti laba di beranda;
  di perangkat terhubung angka ini hanya tampil bila diberi izin Pembukuan.
- Ekspor Excel laporan (berisi HPP & laba kotor) tetap meminta PIN.

## 3. Tombol hijau Transaksi Baru di beranda
- Tombol bawah kini selalu tampil di halaman utama di semua perangkat (sebelumnya hilang setelah berpindah halaman,
  yang paling sering terjadi di perangkat terhubung). Tetap tersembunyi di halaman Transaksi Baru.

## 4. Persediaan terhubung ke Stok Bahan Baku lewat Kode Bahan
- Kelola item persediaan: dropdown **Kode bahan (Stok Bahan Baku)**. Memilih bahan mengisi nama & satuan item.
- Item terhubung otomatis menerima **Bahan masuk** dapur dari setiap belanja (Pengeluaran) dan “Masuk lain” (Stok Bahan Baku);
  catatan bertanda *otomatis* dan hanya bisa diubah di sumbernya.
- Tombol **＋ Bahan masuk** manual dihapus. Masakan masuk lewat **Olah jadi menu**; item bahan yang belum diberi kode bahan
  masih bisa mencatat bahan masuk manual dari form Catat.
- Peran dipisah tegas: Stok Bahan Baku & HPP Menu = arus bahan & uang; Kontrol Persediaan = pemantauan Dapur & Depan.
  Stok bahan selalu dihitung di Stok Bahan Baku; bahan menu ber-resep dipotong per penjualan (aturan “dipotong saat masak di
  Persediaan” dihapus agar tidak ada dua sumber).
- Data lama: item yang SKU-nya sama dengan kode bahan tetap dikenali sebagai terhubung; simpan ulang item untuk menetapkannya.
- Pemeriksaan data baru: item ber-kode bahan yang tidak ada, satu kode bahan untuk beberapa item.

## Teknis
- Uji: bahan 72, persediaan +4, izin 318, SyncCore 86, e2e sinkronisasi 78, uji tampilan 2.12 (20) & izin (21).
