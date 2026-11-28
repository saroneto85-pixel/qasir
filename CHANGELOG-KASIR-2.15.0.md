# KASIR 2.15.0 — Tampilkan QRIS / rekening untuk dipindai pembeli

- Pengaturan → **QRIS & rekening pembayaran**: tambah beberapa akun (QRIS, rekening bank, e-wallet) dengan gambar
  QRIS/barcode, nama pemilik, nomor, catatan, dan metode pembayaran yang memakainya. Tersinkron ke semua perangkat;
  hanya perangkat dengan izin Pengaturan yang bisa mengubah.
- Keranjang: untuk metode QRIS / Transfer Bank / E-Wallet / Kartu Debit yang punya akun, **Simpan transaksi** menampilkan
  layar penuh untuk pembeli: total besar, gambar QRIS atau nomor rekening (bisa disalin), instruksi, tab bila ada
  beberapa akun. **Pembayaran diterima — simpan** menyimpan transaksi; **Kembali** membatalkan.
- Tombol **Tampilkan QRIS untuk pembeli** di keranjang; pilihan tampil otomatis bisa dimatikan.
- Dialog **Catat pembayaran** (piutang/kasbon): tombol tampilkan QRIS/rekening dengan nominal pembayaran.
- Transaksi menyimpan nama akun pembayaran yang dipakai (`payAccount`).
- Tata letak menyesuaikan HP (tegak) dan tablet (mendatar).
- Workflow tidak berubah dari 2.14.3 — cukup unggah zip.
- Uji tampilan: 18 skenario QRIS + dialog piutang; uji lama tetap lulus.
