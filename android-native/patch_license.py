"""
Tanda tangan rilis + konfigurasi lisensi KASIR DBL (dijalankan workflow setelah file native disalin).

1) android/app/build.gradle  -> signingConfig rilis dari variabel lingkungan (GitHub Secrets):
     KASIR_KEYSTORE_FILE, KASIR_KEYSTORE_PASSWORD  (alias kunci: kasir, format PKCS12)
2) LicenseConfig.java        -> PUBLIC_KEY dari lisensi/kunci-publik.txt
                                EXPECTED_CERT_SHA256 dari KASIR_CERT_SHA256 (sidik jari keystore rilis)
Aman dijalankan berulang.
"""
import base64
import os
import re
import sys
from pathlib import Path

app = Path("android/app/build.gradle")
if not app.exists():
    sys.exit("android/app/build.gradle tidak ditemukan. Jalankan `npx cap add android` lebih dulu.")

SIGN_BLOCK = """

// ---- Tanda tangan rilis KASIR (kunci tetap dari GitHub Secrets) ----
android {
    signingConfigs {
        kasirRelease {
            def ks = System.getenv("KASIR_KEYSTORE_FILE")
            if (ks) {
                storeFile file(ks)
                storePassword System.getenv("KASIR_KEYSTORE_PASSWORD")
                keyAlias "kasir"
                keyPassword System.getenv("KASIR_KEYSTORE_PASSWORD")
                storeType "pkcs12"
            }
        }
    }
    buildTypes {
        release {
            if (System.getenv("KASIR_KEYSTORE_FILE")) signingConfig signingConfigs.kasirRelease
        }
    }
    // Pemeriksaan lint rilis tidak boleh menggagalkan build (peringatan dari plugin pihak ketiga).
    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}
"""
s = app.read_text()
if "Tanda tangan rilis KASIR" not in s:
    app.write_text(s.rstrip("\n") + SIGN_BLOCK)
    print("Diperbarui:", app)
else:
    print("Sudah sesuai:", app)

# ---- kunci publik lisensi ----
kp = Path("lisensi/kunci-publik.txt")
pub = ""
if kp.exists():
    pub = "".join(l.strip() for l in kp.read_text(encoding="utf-8").splitlines() if l.strip() and not l.strip().startswith("#"))
if not pub:
    sys.exit(
        "::error::Kunci publik lisensi belum diisi.\n"
        "Buka lisensi/pembuat-kode-aktivasi.html di laptop, buat kunci lisensi, lalu tempel KUNCI PUBLIK-nya\n"
        "ke file lisensi/kunci-publik.txt (baris di bawah komentar), commit dan push. Lihat PANDUAN-KUNCI-RILIS-DAN-LISENSI.md.")
try:
    der = base64.b64decode(pub, validate=True)
except Exception:
    sys.exit("::error::lisensi/kunci-publik.txt bukan teks base64 yang sah. Salin ulang dari alat pembuat kode.")
# SPKI P-256 = 91 byte dan memuat OID prime256v1 (2A 86 48 CE 3D 03 01 07)
if len(der) != 91 or bytes.fromhex("2a8648ce3d030107") not in der:
    sys.exit("::error::lisensi/kunci-publik.txt bukan kunci publik ECDSA P-256 dari alat pembuat kode.")

cert = os.environ.get("KASIR_CERT_SHA256", "").strip().lower().replace(":", "")
if cert and not re.fullmatch(r"[0-9a-f]{64}", cert):
    sys.exit("::error::KASIR_CERT_SHA256 tidak valid")

cfg = Path("android/app/src/main/java/id/kasmini/pos/license/LicenseConfig.java")
cfg.parent.mkdir(parents=True, exist_ok=True)
cfg.write_text(f'''package id.kasmini.pos.license;

/** Dibuat otomatis oleh android-native/patch_license.py saat build. Jangan diubah manual. */
public final class LicenseConfig {{
    private LicenseConfig() {{}}
    public static final String PUBLIC_KEY = "{pub}";
    public static final String EXPECTED_CERT_SHA256 = "{cert}";
}}
''')
print("Lisensi: kunci publik terpasang;", "cek tanda tangan APK AKTIF" if cert else "cek tanda tangan APK nonaktif (build debug)")
