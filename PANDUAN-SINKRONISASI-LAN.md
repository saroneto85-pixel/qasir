# Panduan Sinkronisasi Antar Perangkat — KASIR 2.11.0

## Gambaran
```
                Wi-Fi / hotspot toko (jaringan lokal yang sama)
   ┌─────────────────────────────┐        ┌──────────────────────────┐
   │ PERANGKAT UTAMA (Kasir Induk)│◄──────►│ Perangkat Tambahan K2     │
   │ • Room: database induk       │  REST  │ (pelayan / kasir kedua)   │
   │ • Ktor server :8686          │  HTTP  │ • SQLite lokal + antrean  │
   │   (Foreground Service)       │◄──────►│ Perangkat Tambahan K3     │
   │ • NSD: _kasirdbl._tcp        │        │ (dapur)                   │
   └─────────────────────────────┘        └──────────────────────────┘
        ▲ IP tetap lewat DHCP Reservation di router (disarankan)
```

## 1. Menyiapkan Perangkat Utama (Kasir Induk)
Pilih HP/tablet yang paling sering menyala dan biasanya dicas di meja kasir — sebaiknya perangkat yang sekarang sudah berisi data toko.

1. Pasang APK 2.8.0 (pembaruan dari versi lama: data tetap ada). **Cadangkan data JSON dulu.**
2. Buka **Pengaturan → Sinkronisasi antar perangkat → Jadikan Perangkat Utama** (butuh PIN).
3. Izinkan notifikasi bila diminta. Muncul notifikasi tetap "KASIR · Perangkat Utama — Server toko aktif · 192.168.x.x:8686".
4. Catat **kode pairing 6 digit** yang tampil.
5. Disarankan: **Setelan Android → Aplikasi → KASIR → Baterai → Tanpa batasan** (terutama Xiaomi/Oppo/Vivo/Realme), agar server tidak dimatikan sistem.

## 2. Menambahkan perangkat (pelayan, dapur, kasir kedua)
1. Sambungkan ke **Wi-Fi/hotspot yang sama** dengan Kasir Induk.
2. Pasang APK 2.8.0, buka **Pengaturan → Sinkronisasi antar perangkat → Gabung ke Perangkat Utama**.
3. Aplikasi mencari otomatis; ketuk nama toko yang muncul.
4. Masukkan **kode pairing** dan nama perangkat (mis. "Tablet Pelayan 1") → **Sambungkan**.
5. Data lama di perangkat ini dicadangkan otomatis ke folder *Documents* (atau penyimpanan aplikasi), lalu diganti data toko. Aplikasi dimuat ulang.

Perangkat mendapat kode **K2, K3, …** yang dipakai pada nomor nota (`INV-20261127-K2-001`).

## 2a. Mengatur akses perangkat tambahan (privasi owner) — sejak 2.11.0

Owner menentukan dari **Perangkat Utama** apa saja yang boleh dibuka tiap perangkat tambahan:
**Pengaturan → Sinkronisasi → Perangkat terhubung → tombol "Akses"** pada perangkat yang dimaksud.

- Pilihan cepat: **Kasir** (Transaksi Baru, Riwayat, Pelanggan), **Pelayan** (Transaksi Baru, Riwayat),
  **Dapur** (Kontrol Persediaan, Stok Bahan Baku), **Penuh (owner)**.
- Atau centang satu per satu: menu, lalu fitur sensitif — *Lihat HPP/modal & laba*, *Edit/hapus transaksi*,
  *Gaji karyawan*, *Backup, restore & ekspor data*.
- Perangkat baru otomatis mendapat akses **Kasir** sampai owner mengubahnya.
- Perubahan berlaku dalam beberapa detik, tanpa perlu pairing ulang.

Yang terjadi di balik layar:
1. Data menu yang tidak diizinkan (mis. Neraca Awal, Pembukuan/laba rugi, Pengeluaran, Aset, Hutang, Gaji)
   **tidak pernah dikirim** ke perangkat itu. Data yang terlanjur ada di perangkat dihapus saat akses dicabut.
2. Tanpa izin *HPP/modal*, harga modal produk dan modal per item nota dihapus sebelum dikirim.
3. Perubahan dari perangkat tambahan pada data yang tidak diizinkan **ditolak server**,
   walau aplikasinya dimodifikasi.
4. PIN owner tidak pernah dikirim ke perangkat tambahan; PIN di perangkat tambahan berlaku lokal.
5. Di perangkat tambahan, menu/kotak/tombol yang tidak diizinkan disembunyikan; Pengaturan hanya
   menampilkan sinkronisasi dan printer.

## 3. IP tetap untuk Kasir Induk (DHCP Reservation)
Pencarian otomatis (NSD) sudah cukup untuk kebanyakan toko. IP tetap membuat sambungan ulang lebih cepat dan menjadi cadangan bila router memblokir mDNS.

1. **Matikan MAC acak di Kasir Induk**: *Setelan → Wi-Fi → (Wi-Fi toko) → ikon gir/ⓘ → Privasi → Gunakan MAC perangkat*. Catat **Alamat MAC** di halaman yang sama.
2. Buka halaman admin router dari browser: biasanya `192.168.1.1` atau `192.168.0.1` (lihat stiker router; IndiHome/ZTE/Huawei umumnya `192.168.1.1`).
3. Cari menu (nama berbeda per merek):
   - TP-Link: *DHCP → Address Reservation*
   - ZTE (IndiHome): *Local Network → LAN → DHCP Binding / Static IP*
   - Huawei: *LAN → DHCP Server → Static IP*
   - Tenda / Mercusys: *DHCP Reservation / IP-MAC Binding*
   - MikroTik: *IP → DHCP Server → Leases → Make Static*
4. Tambahkan MAC Kasir Induk dengan IP tetap, mis. `192.168.1.200`. Simpan.
5. Matikan-nyalakan Wi-Fi di Kasir Induk; pastikan Pengaturan menampilkan IP yang sama.

Bila memakai **hotspot HP**: jadikan Kasir Induk sebagai pemancar hotspot (alamatnya biasanya selalu sama), atau sambungkan semua perangkat ke hotspot yang sama.

## 4. Bila perangkat tidak saling menemukan
| Gejala | Penyebab umum | Solusi |
|---|---|---|
| "Belum ditemukan" saat mencari | Beda jaringan (mis. Wi-Fi 2.4 GHz vs 5 GHz tamu) | Sambungkan ke SSID yang sama, bukan jaringan tamu |
| Tetap tidak ditemukan | Router mengaktifkan *AP/Client Isolation* atau memblokir multicast | Matikan isolasi klien di router, atau pakai **Masukkan alamat manual** (IP:8686 dari layar Kasir Induk) |
| Status "Server toko mati" | Server dihentikan atau aplikasi dimatikan sistem | Buka KASIR di Kasir Induk (server menyala otomatis), atur baterai "Tanpa batasan" |
| "Perlu disambungkan ulang" | Perangkat dicabut, atau Kasir Induk dijadikan Perangkat Utama baru | Gabung ulang dengan kode pairing terbaru |
| Offline · n menunggu | Wi-Fi putus | Tidak perlu tindakan; data terkirim otomatis saat tersambung |

## 5. Hal penting
- **Satu toko = satu Perangkat Utama.** Menjalankan "Jadikan Perangkat Utama" lagi membuat identitas data baru; semua perangkat tambahan harus bergabung ulang.
- **Pulihkan cadangan** dan **Hapus seluruh data** di perangkat mana pun berlaku untuk **semua** perangkat yang tersinkron.
- Usahakan semua perangkat tersambung minimal **sekali sehari** (riwayat penggabungan disimpan 3 hari).
- Gunakan Wi-Fi toko berpassword. Data dikirim lewat HTTP lokal yang dilindungi token pairing; cabut perangkat yang hilang dari daftar "Perangkat terhubung".
- Ganti kode pairing (**Kode baru**) setelah semua perangkat tersambung agar orang lain tidak bisa bergabung.

## 6. Uji coba yang disarankan sebelum dipakai penuh
1. Kasir Induk + 1 tablet: tambah produk di Kasir Induk → muncul di tablet dalam beberapa detik.
2. Jual produk yang sama di kedua perangkat hampir bersamaan → stok berkurang sesuai jumlah keduanya.
3. Matikan Wi-Fi tablet, lakukan 2 penjualan, nyalakan lagi → transaksi muncul di Kasir Induk.
4. Kunci layar Kasir Induk 10 menit, lalu jual dari tablet → tetap tersinkron.
5. Restart router → tablet tersambung kembali sendiri.

## Untuk pengembang
- Native: `android-native/src/main/java/id/kasmini/pos/sync/` — `SyncCore` (logika server, murni Java), `SyncMerge` (penggabungan 3-arah), Room (`SyncDatabase`, `SyncDao`, entitas), `LanServer` (Ktor CIO), `LanSyncService` (Foreground Service, `connectedDevice`), `NsdHelper`, `LanClient` (Ktor Client OkHttp), `LanSyncPlugin` (jembatan Capacitor).
- Web: `sync-engine.js` (antrean kirim, long-poll, penerapan perubahan), `sync.js` (penyambung Capacitor), `sync-ui.js` (panel Pengaturan). `db.js` meneruskan penulisan ke lapisan sinkronisasi hanya bila mode Perangkat Utama/Tambahan aktif; mode Mandiri tidak berubah.
- Build: workflow menjalankan `android-native/patch_lan_sync.py` (Kotlin 2.0.21, Ktor 2.3.13, Room 2.6.1, minSdk 26, izin & layanan di manifest).
- Uji: `sh android-native/test/run-tests.sh` dan `node test-sync-e2e.mjs` (butuh JDK & Node ≥ 22).
