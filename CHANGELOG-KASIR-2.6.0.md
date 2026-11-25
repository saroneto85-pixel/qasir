# KASIR 2.6.0 — Pengaturan struk profesional

**Satu pengaturan, tiga keluaran** (PDF WhatsApp, cetak, printer Bluetooth) lewat modul baru `receipt.js`; Pengaturan › kartu "Pengaturan struk" dengan **pratinjau langsung**.

- **Footer bebas diubah**: beberapa baris (maks. 8), placeholder `{nama_toko} {telepon} {kasir} {tanggal} {nota}`, dan tombol cepat (Terima kasih, Selamat menikmati, Barang tidak dapat dikembalikan, Kritik & saran, Bukti pembayaran).
- **Logo proporsional**: rasio asli selalu dipertahankan (sebelumnya PDF memaksa kotak 30×16 mm sehingga gepeng). Ukuran Kecil/Sedang/Besar/Lebar penuh, posisi Kiri/Tengah/Kanan, tinggi maksimum 40 mm. Gambar PNG/JPG/WebP otomatis dikecilkan (maks. 600 px).
- **Lebar kertas 58 mm / 80 mm** (PDF, HTML, dan jumlah kolom printer menyesuaikan).
- **Kepala struk**: slogan di bawah nama toko; tampilkan/sembunyikan alamat dan telepon.
- **Isi struk**: nomor nota, tanggal & jam, kasir, pelanggan, tipe transaksi, metode bayar, SKU per item, catatan, diskon selalu tampil.
- **Gambar bawah** (QR pembayaran / media sosial) dengan ukuran dan keterangan.
- **Pencetakan**: jarak bawah, potong kertas otomatis, jumlah salinan (Bluetooth), tombol **Uji cetak**, tombol **Bawaan**.
- Nama item panjang kini dibungkus (tidak dipotong); transaksi **Tempo/Kasbon** menampilkan "BELUM LUNAS" tanpa baris Bayar/Kembali; PDF setinggi isi struk; karakter non-ASCII aman untuk printer termal.
- Uji: `node test-receipt.mjs` (29 pemeriksaan).
