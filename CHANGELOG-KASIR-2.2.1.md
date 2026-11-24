# KASIR 2.2.1

1. **Ikon robot hijau** — pada 2.2.0 perbaikan ikon ada di langkah workflow yang bisa saja tidak ikut terunggah (folder `.github` tersembunyi). Kini pemasangan ikon juga dijalankan dari `android-native/patch_manifest.py` (selalu dipanggil workflow lama maupun baru) lewat `apply_branding.py`: menghapus SEMUA ikon bawaan Capacitor (ikon bulat, foreground adaptif, drawable-v24) lalu memasang ikon KASIR. Log build menampilkan daftar file ikon yang terpasang.
2. Tombol "Transaksi Baru" mengambang tidak lagi muncul di Dashboard (menu Transaksi tetap ada di kartu menu).
3. Hutang & Piutang dan Aset & Penyusutan: tombol aksi rata dua kolom, kartu ringkasan 3 kolom (Aset kini punya ringkasan), daftar tampil sebagai kartu di HP (tabel di layar lebar).
4. Laporan: Buku Kas pindah ke Pembukuan (tab baru, per bulan, bisa diunduh Excel). Tab Arus Kas, Laba Rugi, dan Penyusutan di Laporan dihapus (sudah ada di Pembukuan dan Aset).
5. Persediaan › Depan: tombol "+ Penjualan" dihapus. Penjualan kasir tersinkron OTOMATIS lewat SKU: saat transaksi disimpan, saat Persediaan dibuka, dan saat SKU berubah. Kolom Terjual dan Sisa langsung berubah, stok produk berkurang. Kotak status menampilkan item depan tanpa SKU dan produk terjual yang belum terhubung.
