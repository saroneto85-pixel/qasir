# Panduan QRIS & Rekening Pembayaran — KASIR 2.15.0

## Menyiapkan (sekali, di Perangkat Utama)
1. Siapkan gambar **QRIS statis** toko: foto stiker QRIS atau screenshot dari aplikasi bank / penyedia QRIS.
   Potong rapi supaya kodenya besar dan jelas.
2. **Pengaturan → QRIS & rekening pembayaran → ＋ Tambah akun**
   - Jenis **QRIS** → beri nama (mis. *QRIS Bumbu Lengkep*) → pilih gambar → nama pemilik → **Simpan**.
   - (Opsional) Jenis **Rekening bank** → mis. *BRI a.n. Budi* → nomor rekening → **Simpan**.
   - (Opsional) Jenis **E-wallet** → nomor HP DANA/OVO/GoPay atau gambar QR-nya.
3. Tekan **Lihat** pada akun untuk mengecek tampilannya. Coba pindai dengan HP lain.
4. Akun ikut tersinkron otomatis ke semua perangkat toko. Perangkat tambahan tidak bisa mengubahnya.

## Saat transaksi
1. Pilih produk → metode pembayaran **QRIS** (atau Transfer Bank / E-Wallet) → **Simpan transaksi**.
2. Layar penuh berisi **total bayar** dan **QRIS / nomor rekening** muncul. Hadapkan layar ke pembeli.
3. Pembeli memindai dan memasukkan nominal sesuai total.
4. Setelah dana **benar-benar masuk** (cek notifikasi / mutasi), tekan **Pembayaran diterima — simpan**.
   Tekan **Kembali** bila batal; transaksi belum tersimpan.
- Tombol **Tampilkan QRIS untuk pembeli** di keranjang bisa dipakai kapan saja.
- Tidak ingin layar muncul otomatis? Matikan *Tampilkan otomatis saat menekan Simpan transaksi*.
- Bayar piutang / kasbon: di dialog **Catat pembayaran**, pilih metode QRIS / Transfer → **Tampilkan … untuk pembeli**.
- Bila ada beberapa akun untuk satu metode, pembeli bisa memilih lewat tab di atas kode.

## Catatan
- QRIS statis tidak memuat nominal; pembeli mengetik nominal sendiri. Selalu cocokkan nominal yang masuk.
- Akun yang dipakai tercatat di data transaksi (kolom akun pembayaran).
