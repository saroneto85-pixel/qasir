# KASIR 2.2.2
- Dashboard: kartu menu "Transaksi" (yang dilingkari merah) dihapus dari Menu Utama.
- Tombol hijau "Transaksi Baru" di tengah bagian bawah dikembalikan di Dashboard (muncul di semua halaman kecuali halaman Transaksi).
- Build APK: galat "429 Too Many Requests" dari repo.maven.apache.org (pembatasan sementara untuk server GitHub Actions) diatasi dengan mirror Maven resmi Google (`android-native/mirror.init.gradle`, dipasang otomatis oleh `patch_manifest.py`) dan pengulangan otomatis hingga 3 kali pada langkah Build APK.
