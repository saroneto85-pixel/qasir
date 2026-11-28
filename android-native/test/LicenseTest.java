import id.kasmini.pos.license.LicenseCodec;
import java.nio.file.*;
import java.util.*;

/** Uji silang: kode aktivasi buatan alat (JS/WebCrypto) harus diterima LicenseCodec (Java), dan sebaliknya ditolak bila salah. */
public class LicenseTest {
    static int pass = 0, fail = 0;
    static void ok(boolean c, String m) { if (c) pass++; else { fail++; System.out.println("GAGAL: " + m); } }
    static String field(String json, String k) { int i = json.indexOf("\"" + k + "\":\""); int j = json.indexOf('"', i + k.length() + 4); return json.substring(i + k.length() + 4, j); }
    static String expectErr(Runnable r) { try { r.run(); return null; } catch (IllegalArgumentException e) { return e.getMessage(); } }

    public static void main(String[] a) throws Exception {
        String js = new String(Files.readAllBytes(Paths.get(a[0])));
        String pub = field(js, "pub"), dev = field(js, "deviceCode"), androidId = field(js, "androidId"), pkg = field(js, "pkg");
        byte[] h = LicenseCodec.deviceHash(pkg, androidId);
        ok(LicenseCodec.deviceCode(h).equals(dev), "kode perangkat Java = JS (" + LicenseCodec.deviceCode(h) + " vs " + dev + ")");
        ok(Arrays.equals(LicenseCodec.parseDeviceCode(dev.toLowerCase().replace("-", " ")), h), "kode perangkat dibaca toleran huruf kecil/spasi");
        ok(LicenseCodec.parseDeviceCode(dev.substring(0, 14) + (dev.charAt(14) == 'A' ? 'B' : 'A')) == null, "salah ketik kode perangkat terdeteksi");
        int[][] plans = { {1, 0}, {2, 2}, {3, 5}, {9, -1} };
        for (int[] p : plans) {
            String code = field(js, "code" + p[0]);
            LicenseCodec.Info i = LicenseCodec.verify(code, h, pub);
            ok(i.plan == p[0] && i.extraDevices() == p[1], "paket " + p[0] + " diterima, perangkat tambahan " + p[1]);
            ok(LicenseCodec.verify(code.replace("-", "").toLowerCase(), h, pub).plan == p[0], "kode tanpa strip/huruf kecil tetap diterima");
        }
        ok(LicenseCodec.verify(field(js, "code2"), h, pub).epochDay() == Long.parseLong(field(js, "epochDay")), "tanggal terbit terbaca");
        String other = field(js, "otherCode");
        String e1 = expectErr(() -> LicenseCodec.verify(other, h, pub));
        ok(e1 != null && e1.contains("perangkat lain"), "kode untuk HP lain ditolak: " + e1);
        String code1 = field(js, "code1");
        char[] t = code1.toCharArray(); int k = 40; t[k] = t[k] == 'A' ? 'B' : 'A';
        String e2 = expectErr(() -> LicenseCodec.verify(new String(t), h, pub));
        ok(e2 != null && e2.contains("tidak sah"), "satu huruf diubah -> tidak sah: " + e2);
        String e3 = expectErr(() -> LicenseCodec.verify(code1.substring(0, 60), h, pub));
        ok(e3 != null && e3.contains("Panjang"), "kode terpotong ditolak: " + e3);
        String e4 = expectErr(() -> LicenseCodec.verify(code1, h, field(js, "otherPub")));
        ok(e4 != null && e4.contains("tidak sah"), "kode dari kunci lain (pemalsu) ditolak");
        String e5 = expectErr(() -> LicenseCodec.verify(code1, h, ""));
        ok(e5 != null && e5.contains("Kunci publik"), "kunci publik belum dipasang -> pesan jelas");
        String e6 = expectErr(() -> LicenseCodec.verify(field(js, "badPlan"), h, pub));
        ok(e6 != null && e6.contains("Paket"), "paket tak dikenal ditolak");
        System.out.println("LicenseTest: " + pass + " lulus, " + fail + " gagal");
        if (fail > 0) System.exit(1);
    }
}
