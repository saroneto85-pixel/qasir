# Sinkronisasi Kontak Android

- Menggunakan plugin native Capacitor `PhoneContacts`.
- Meminta izin `READ_CONTACTS` saat pengguna menekan tombol Sinkronkan Kontak HP.
- Mengambil nama, nomor telepon, dan ID kontak melalui `ContactsContract`.
- Hasil dikirim sebagai `JSArray` berisi `JSObject` (bukan membungkus `JSONArray` menjadi `JSArray`).
- Data pelanggan di-upsert berdasarkan nomor telepon yang dinormalisasi.
- Tidak menghapus alamat/catatan pelanggan yang sudah tersimpan.
- Kontak tidak diunggah ke server; data disimpan di database lokal perangkat.
