# KASIR 2.8.0 — Sinkronisasi antar perangkat di toko (Wi-Fi / hotspot)

Beberapa HP/tablet di toko kini bisa memakai data yang sama secara langsung lewat Wi-Fi atau hotspot yang sama, tanpa internet dan tanpa mengetik alamat IP.

## Cara kerja
- **Perangkat Utama (Kasir Induk)** menyimpan database induk di **Room** dan menjalankan server lokal **Ktor (CIO)** di **Foreground Service**. Server tetap berjalan saat layar mati atau aplikasi di latar belakang (ada notifikasi "KASIR · Perangkat Utama").
- Server mengiklankan diri lewat **NSD/mDNS** (`_kasirdbl._tcp`, port 8686). **Perangkat Tambahan** (pelayan, dapur, kasir kedua) menemukannya otomatis, lalu kirim/ambil data lewat **Ktor Client (OkHttp)**.
- REST API lokal: `GET /api/info`, `POST /api/pair`, `POST /api/push`, `GET /api/changes?since=N&wait=25` (long-poll, perubahan tiba dalam hitungan detik).
- Setiap perangkat tetap menyimpan salinan lengkap di SQLite. **Aplikasi tetap bisa dipakai saat Wi-Fi putus**; perubahan mengantre dan terkirim otomatis begitu tersambung lagi. Bila alamat Perangkat Utama berubah, perangkat tambahan mencarinya ulang lewat NSD.
- Pairing memakai **kode 6 digit** yang tampil di Perangkat Utama; tiap perangkat mendapat token sendiri dan bisa **dicabut** kapan saja. Percobaan kode salah dibatasi (5 kali per menit).

## Penggabungan data serentak (tidak ada penjualan yang hilang)
Perangkat Utama menggabungkan perubahan per kolom (3-arah) berdasarkan versi yang dibaca tiap perangkat:
- **Stok produk dijumlahkan**: dua kasir menjual produk yang sama pada saat bersamaan → stok berkurang dua kali (bukan saling menimpa).
- Kolom berbeda yang diubah dua perangkat sama-sama tersimpan (mis. nama produk diubah di kasir induk, stok berkurang di tablet).
- Daftar (jenis pengeluaran, pembayaran piutang, tiket dapur ber-id) digabung, bukan ditimpa.
- Data yang dihapus satu perangkat tetap terhapus walau perangkat lain sempat mengubahnya.
- Kasir aktif (`lastCashier`) tetap milik masing-masing perangkat.

## Perubahan lain
- **Nomor nota per perangkat**: perangkat tambahan memakai kode perangkat, mis. `INV-20261127-K2-001`, agar tidak bentrok dengan nota Kasir Induk (`INV-20261127-001`).
- Menu **Pengaturan → Sinkronisasi antar perangkat**: jadikan Perangkat Utama, gabung, kode pairing, daftar perangkat online, cabut perangkat, panduan IP tetap (DHCP Reservation) di router.
- Indikator status di kepala aplikasi: *Server toko · n perangkat*, *Online toko*, *Offline · n menunggu*.
- Saat bergabung, data lama perangkat tambahan **dicadangkan otomatis** (JSON, format sama dengan menu Cadangkan data) sebelum diganti data toko.
- Cadangan JSON tidak memuat penanda versi sinkronisasi; pemulihan & "Hapus seluruh data" memberi peringatan bila perangkat tersinkron (berlaku untuk semua perangkat).
- Tampilan dimuat ulang otomatis saat perangkat lain mengubah data (ditunda bila Anda sedang mengetik).

## Pengujian
- Inti sinkronisasi (JSON, penggabungan 3-arah, server push/pull/pairing/seed): **55 uji JVM** — `sh android-native/test/run-tests.sh`.
- Uji ujung-ke-ujung 1 Kasir Induk + 2 perangkat tambahan memakai SyncCore & mesin JS yang asli: **64 pemeriksaan** — `node test-sync-e2e.mjs` (penjualan serentak, perangkat offline lalu online, hapus vs ubah, ubah saat pengiriman berlangsung, balasan terlambat, 600 transaksi, pemulihan cadangan, pencabutan perangkat).
- Semua uji lama tetap lulus (29 struk, 9 audit, logika resto, persediaan, 68 pembukuan).
- Kode Kotlin/Java native diperiksa kompilasinya terhadap API tiruan; **APK belum dibangun dan belum diuji di perangkat fisik** — lakukan uji coba di toko sebelum dipakai penuh (lihat PANDUAN-SINKRONISASI-LAN.md).

## Batasan
- **Minimal Android 8.0** (minSdk naik dari 23 ke 26) karena server Ktor.
- Lalu lintas LAN memakai HTTP biasa (tidak terenkripsi) yang dilindungi token pairing; gunakan Wi-Fi toko yang berpassword, bukan Wi-Fi publik.
- Riwayat versi disimpan 3 hari. Perangkat yang offline lebih dari 3 hari lalu mengubah record yang sama dengan perangkat lain: perubahan terakhir yang menang (penjumlahan stok tidak berlaku). Usahakan semua perangkat tersambung minimal sekali sehari.
- Perangkat tambahan hanya bisa sinkron saat Perangkat Utama menyala dan servernya aktif.
- Modul meja/dapur (`resto.js`) belum ditampilkan di menu versi ini; datanya (pesanan & tiket) sudah didukung penggabungan per tiket bila modul itu diaktifkan.
