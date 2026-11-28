package id.kasmini.pos.license;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.Arrays;
import java.util.Base64;

/**
 * Format lisensi KASIR DBL (murni Java, tanpa Android, agar bisa diuji).
 *
 * Kode perangkat  = base32( hash8 + cek1 ) -> 15 karakter "XXXXX-XXXXX-XXXXX"
 *   hash8 = SHA-256("KASIRDBL-DEV1|" + packageName + "|" + ANDROID_ID)[0..8]
 *   cek1  = SHA-256(hash8)[0]  (menangkap salah ketik)
 * Kode aktivasi   = base32( payload12 + tandaTangan64 ) -> 122 karakter, dikelompokkan 5-5
 *   payload12 = [versi=1][paket][hariTerbit u16 BE][hash8]
 *   tanda tangan = ECDSA P-256 / SHA-256 atas ("KASIRDBL-LIC1" + payload12), format mentah r||s
 * Lisensi seumur hidup (tanpa tanggal kedaluwarsa).
 */
public final class LicenseCodec {
    private LicenseCodec() {}

    public static final String ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    static final byte[] SIGN_PREFIX = "KASIRDBL-LIC1".getBytes(StandardCharsets.US_ASCII);

    /** Paket: kode -> {nama, jumlah perangkat tambahan (-1 = tanpa batas)} */
    public static final int BASIC = 1, TOKO = 2, PRO = 3, PEMILIK = 9;

    public static String planName(int plan) {
        switch (plan) {
            case BASIC: return "Basic";
            case TOKO: return "Toko";
            case PRO: return "Pro";
            case PEMILIK: return "Pemilik";
            default: return "Tidak dikenal";
        }
    }

    public static int extraDevices(int plan) {
        switch (plan) {
            case BASIC: return 0;
            case TOKO: return 2;
            case PRO: return 5;
            case PEMILIK: return -1;
            default: return 0;
        }
    }

    public static final class Info {
        public final int plan;
        public final int issuedDay;
        public Info(int plan, int issuedDay) { this.plan = plan; this.issuedDay = issuedDay; }
        public String planName() { return LicenseCodec.planName(plan); }
        public int extraDevices() { return LicenseCodec.extraDevices(plan); }
        /** Tanggal terbit (hari sejak 1970-01-01). */
        public long epochDay() { return issuedDay + 19723L; } // 19723 = 2024-01-01
    }

    // ---------- perangkat ----------

    public static byte[] deviceHash(String packageName, String androidId) {
        byte[] h = sha256(("KASIRDBL-DEV1|" + packageName + "|" + (androidId == null ? "" : androidId)).getBytes(StandardCharsets.UTF_8));
        return Arrays.copyOf(h, 8);
    }

    public static String deviceCode(byte[] hash8) {
        byte[] b = Arrays.copyOf(hash8, 9);
        b[8] = sha256(hash8)[0];
        return group(base32(b), 5);
    }

    /** Membaca kode perangkat (toleran spasi/strip/huruf kecil); null bila salah ketik. */
    public static byte[] parseDeviceCode(String code) {
        byte[] b;
        try { b = unbase32(normalize(code)); } catch (IllegalArgumentException e) { return null; }
        if (b.length != 9) return null;
        byte[] h = Arrays.copyOf(b, 8);
        return sha256(h)[0] == b[8] ? h : null;
    }

    // ---------- aktivasi ----------

    /**
     * Memeriksa kode aktivasi untuk perangkat ini.
     * @throws IllegalArgumentException dengan pesan berbahasa Indonesia bila tidak sah.
     */
    public static Info verify(String activationCode, byte[] hash8, String publicKeyBase64) {
        if (publicKeyBase64 == null || publicKeyBase64.trim().isEmpty())
            throw new IllegalArgumentException("Kunci publik lisensi belum dipasang di aplikasi ini");
        byte[] raw;
        try { raw = unbase32(normalize(activationCode)); } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Kode aktivasi berisi huruf yang tidak dikenal. Salin ulang kodenya.");
        }
        if (raw.length != 76) throw new IllegalArgumentException("Panjang kode aktivasi tidak sesuai. Pastikan seluruh kode tersalin.");
        byte[] payload = Arrays.copyOf(raw, 12), sig = Arrays.copyOfRange(raw, 12, 76);
        if (payload[0] != 1) throw new IllegalArgumentException("Versi kode aktivasi tidak dikenal. Perbarui aplikasi.");
        try {
            PublicKey key = KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(publicKeyBase64.trim())));
            Signature s = Signature.getInstance("SHA256withECDSA");
            s.initVerify(key);
            s.update(SIGN_PREFIX);
            s.update(payload);
            if (!s.verify(rawToDer(sig))) throw new IllegalArgumentException("Kode aktivasi tidak sah.");
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("Kode aktivasi tidak sah.");
        }
        if (!Arrays.equals(Arrays.copyOfRange(payload, 4, 12), hash8))
            throw new IllegalArgumentException("Kode aktivasi ini dibuat untuk perangkat lain. Kirim kode perangkat HP ini untuk mendapat kode yang benar.");
        int plan = payload[1] & 0xff;
        if (extraDevices(plan) == 0 && plan != BASIC) throw new IllegalArgumentException("Paket pada kode aktivasi tidak dikenal.");
        int day = ((payload[2] & 0xff) << 8) | (payload[3] & 0xff);
        return new Info(plan, day);
    }

    // ---------- utilitas ----------

    static byte[] sha256(byte[] b) {
        try { return MessageDigest.getInstance("SHA-256").digest(b); } catch (Exception e) { throw new IllegalStateException(e); }
    }

    public static String sha256Hex(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (byte x : sha256(b)) sb.append(String.format("%02x", x));
        return sb.toString();
    }

    /** Huruf besar, buang pemisah; 0/1/8 yang sering tertukar diubah ke O/I/B. */
    public static String normalize(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder();
        for (char c : s.toUpperCase().toCharArray()) {
            if (c == '0') c = 'O'; else if (c == '1') c = 'I'; else if (c == '8') c = 'B';
            if ((c >= 'A' && c <= 'Z') || (c >= '2' && c <= '7')) sb.append(c);
            else if (Character.isLetterOrDigit(c)) throw new IllegalArgumentException("karakter tidak dikenal");
        }
        return sb.toString();
    }

    public static String base32(byte[] data) {
        StringBuilder sb = new StringBuilder();
        int buf = 0, bits = 0;
        for (byte b : data) {
            buf = (buf << 8) | (b & 0xff); bits += 8;
            while (bits >= 5) { sb.append(ALPHABET.charAt((buf >> (bits - 5)) & 31)); bits -= 5; }
        }
        if (bits > 0) sb.append(ALPHABET.charAt((buf << (5 - bits)) & 31));
        return sb.toString();
    }

    public static byte[] unbase32(String s) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        int buf = 0, bits = 0;
        for (char c : s.toCharArray()) {
            int v = ALPHABET.indexOf(c);
            if (v < 0) throw new IllegalArgumentException("karakter tidak dikenal");
            buf = (buf << 5) | v; bits += 5;
            if (bits >= 8) { out.write((buf >> (bits - 8)) & 0xff); bits -= 8; }
            buf &= 0xff;
        }
        return out.toByteArray();
    }

    public static String group(String s, int n) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.length(); i++) { if (i > 0 && i % n == 0) sb.append('-'); sb.append(s.charAt(i)); }
        return sb.toString();
    }

    /** r||s (masing-masing 32 byte) -> DER SEQUENCE{INTEGER r, INTEGER s} untuk java.security.Signature. */
    static byte[] rawToDer(byte[] rs) {
        byte[] r = new BigInteger(1, Arrays.copyOf(rs, 32)).toByteArray();
        byte[] s = new BigInteger(1, Arrays.copyOfRange(rs, 32, 64)).toByteArray();
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        o.write(0x30); o.write(4 + r.length + s.length);
        o.write(0x02); o.write(r.length); o.write(r, 0, r.length);
        o.write(0x02); o.write(s.length); o.write(s, 0, s.length);
        return o.toByteArray();
    }
}
