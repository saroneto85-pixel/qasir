# KASIR 2.9.1 — Perbaikan Menu Utama & nomor versi

- **Menu Utama beranda** kini memuat kotak **Stok Bahan Baku** dan **HPP Menu** (di 2.9.0 kedua menu hanya ada di navigasi samping yang tersembunyi di HP).
- Nomor versi satu sumber (`package.json` + `version.js`): beranda, Pengaturan, dan versi APK Android (versionName 2.9.1, versionCode 20901) selalu sama.
- Pengaman build:
  - `test-version.mjs`: versi konsisten dan setiap halaman di navigasi samping punya kotak di Menu Utama.
  - `check-build.mjs`: memeriksa **hasil build** (folder `dist` dan aset di dalam APK) — build dihentikan bila kotak Menu Utama atau versinya tidak sesuai, sehingga APK dari kode lama tidak bisa terbentuk.
