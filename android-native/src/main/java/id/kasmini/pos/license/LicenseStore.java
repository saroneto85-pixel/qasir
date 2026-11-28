package id.kasmini.pos.license;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;
import android.provider.Settings;

/**
 * Status lisensi perangkat ini (Perangkat Utama / perangkat mandiri).
 * Perangkat tambahan yang tersambung ke Perangkat Utama tidak memerlukan lisensi sendiri;
 * jumlahnya dibatasi oleh paket lisensi Perangkat Utama (lihat SyncCore.pair).
 */
public final class LicenseStore {
    private LicenseStore() {}

    private static final String PREFS = "kasir_license";
    private static final String KEY_CODE = "activationCode";

    private static volatile LicenseCodec.Info cached;
    private static volatile boolean cacheReady;
    private static volatile Boolean signatureOk;

    private static SharedPreferences prefs(Context c) { return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    @SuppressLint("HardwareIds")
    public static byte[] deviceHash(Context c) {
        // ANDROID_ID: unik per perangkat + kunci penanda tangan aplikasi; berubah saat reset pabrik.
        String id = Settings.Secure.getString(c.getContentResolver(), Settings.Secure.ANDROID_ID);
        return LicenseCodec.deviceHash(c.getPackageName(), id);
    }

    public static String deviceCode(Context c) { return LicenseCodec.deviceCode(deviceHash(c)); }

    /** Sidik jari SHA-256 sertifikat penanda tangan APK yang sedang berjalan (hex huruf kecil). */
    @SuppressWarnings("deprecation")
    public static String certSha256(Context c) {
        try {
            PackageManager pm = c.getPackageManager();
            Signature[] sigs;
            if (Build.VERSION.SDK_INT >= 28) {
                PackageInfo pi = pm.getPackageInfo(c.getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
                sigs = pi.signingInfo == null ? null
                        : (pi.signingInfo.hasMultipleSigners() ? pi.signingInfo.getApkContentsSigners() : pi.signingInfo.getSigningCertificateHistory());
            } else {
                PackageInfo pi = pm.getPackageInfo(c.getPackageName(), PackageManager.GET_SIGNATURES);
                sigs = pi.signatures;
            }
            if (sigs == null || sigs.length == 0) return "";
            // Sertifikat terkini = elemen terakhir riwayat rotasi.
            return LicenseCodec.sha256Hex(sigs[sigs.length - 1].toByteArray());
        } catch (Exception e) {
            return "";
        }
    }

    /** APK asli? (selalu true bila build tidak memuat sidik jari yang diharapkan, mis. build debug). */
    public static boolean signatureOk(Context c) {
        Boolean v = signatureOk;
        if (v != null) return v;
        String want = LicenseConfig.EXPECTED_CERT_SHA256.trim().toLowerCase();
        boolean ok = want.isEmpty() || want.replace(":", "").equals(certSha256(c));
        signatureOk = ok;
        return ok;
    }

    public static boolean configured() { return !LicenseConfig.PUBLIC_KEY.trim().isEmpty(); }

    /** Lisensi sah untuk perangkat ini, atau null. */
    public static LicenseCodec.Info info(Context c) {
        if (cacheReady) return cached;
        LicenseCodec.Info i = null;
        String code = prefs(c).getString(KEY_CODE, null);
        if (code != null && configured() && signatureOk(c)) {
            try { i = LicenseCodec.verify(code, deviceHash(c), LicenseConfig.PUBLIC_KEY); } catch (IllegalArgumentException ignored) {}
        }
        cached = i;
        cacheReady = true;
        return i;
    }

    public static boolean valid(Context c) { return info(c) != null; }

    /** Jumlah perangkat tambahan yang boleh dipasangkan (-1 = tanpa batas, 0 bila belum aktif). */
    public static int extraDevices(Context c) {
        LicenseCodec.Info i = info(c);
        return i == null ? 0 : i.extraDevices();
    }

    public static String planName(Context c) {
        LicenseCodec.Info i = info(c);
        return i == null ? "" : i.planName();
    }

    /** Menyimpan kode aktivasi bila sah. @throws IllegalArgumentException dengan alasan penolakan. */
    public static LicenseCodec.Info activate(Context c, String code) {
        if (!signatureOk(c)) throw new IllegalArgumentException("Aplikasi ini bukan APK resmi (tanda tangan berbeda). Pasang APK asli dari penjual.");
        LicenseCodec.Info i = LicenseCodec.verify(code, deviceHash(c), LicenseConfig.PUBLIC_KEY);
        prefs(c).edit().putString(KEY_CODE, LicenseCodec.normalize(code)).apply();
        cached = i;
        cacheReady = true;
        return i;
    }
}
