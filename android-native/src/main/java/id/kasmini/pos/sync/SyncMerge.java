package id.kasmini.pos.sync;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Penggabungan 3-arah (base = versi yang dibaca perangkat, client = versi baru dari perangkat,
 * server = versi terkini di Perangkat Utama).
 *
 * Aturan per kolom:
 *  - kolom yang tidak diubah perangkat  -> nilai server dipertahankan;
 *  - kolom yang hanya diubah perangkat  -> nilai perangkat;
 *  - keduanya mengubah:
 *      * kolom aditif (mis. products.stock) -> server + (client - base), sehingga dua penjualan
 *        serentak dari dua kasir sama-sama mengurangi stok;
 *      * objek  -> digabung rekursif;
 *      * array berisi objek ber-id (mis. tiket, pembayaran ber-id) -> digabung per id;
 *      * array lain -> tambahan/penghapusan masing-masing pihak digabung (multiset);
 *      * selain itu -> perubahan terakhir (perangkat pengirim) menang.
 *
 * Base boleh berupa versi "ramping" (string panjang seperti foto base64 diganti sidik SHA-1),
 * karena base hanya dibandingkan dan tidak pernah dipakai sebagai nilai hasil.
 */
public final class SyncMerge {
    private SyncMerge() {}

    /** Penanda kolom/elemen yang tidak ada. */
    public static final Object ABSENT = new Object() { @Override public String toString() { return "<absent>"; } };

    static final int SLIM_LIMIT = 512;
    static final String SLIM_PREFIX = "\u0000#h:";

    // ---------- versi ramping untuk riwayat ----------

    @SuppressWarnings("unchecked")
    public static Object slim(Object v) {
        if (v instanceof String) {
            String s = (String) v;
            return (s.length() > SLIM_LIMIT && !s.startsWith(SLIM_PREFIX)) ? SLIM_PREFIX + digest(s) : s;
        }
        if (v instanceof Map) {
            Map<String, Object> out = new LinkedHashMap<>();
            for (Map.Entry<String, Object> e : ((Map<String, Object>) v).entrySet()) out.put(e.getKey(), slim(e.getValue()));
            return out;
        }
        if (v instanceof List) {
            List<Object> out = new ArrayList<>();
            for (Object o : (List<Object>) v) out.add(slim(o));
            return out;
        }
        return v;
    }

    static String digest(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] h = md.digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : h) sb.append(String.format("%02x", b));
            return sb.append(':').append(s.length()).toString();
        } catch (Exception e) {
            return Integer.toHexString(s.hashCode()) + ':' + s.length();
        }
    }

    // ---------- kesamaan ----------

    @SuppressWarnings("unchecked")
    public static boolean same(Object a, Object b) {
        if (a == b) return true;
        if (a == ABSENT || b == ABSENT || a == null || b == null) return false;
        if (a instanceof Number && b instanceof Number) {
            if (isIntegral(a) && isIntegral(b)) return ((Number) a).longValue() == ((Number) b).longValue();
            return ((Number) a).doubleValue() == ((Number) b).doubleValue();
        }
        if (a instanceof String && b instanceof String) {
            String x = (String) a, y = (String) b;
            boolean mx = x.startsWith(SLIM_PREFIX), my = y.startsWith(SLIM_PREFIX);
            if (mx == my) return x.equals(y);
            if (mx) return y.length() > SLIM_LIMIT && x.equals(SLIM_PREFIX + digest(y));
            return x.length() > SLIM_LIMIT && y.equals(SLIM_PREFIX + digest(x));
        }
        if (a instanceof Boolean && b instanceof Boolean) return a.equals(b);
        if (a instanceof Map && b instanceof Map) {
            Map<String, Object> x = (Map<String, Object>) a, y = (Map<String, Object>) b;
            if (x.size() != y.size()) return false;
            for (Map.Entry<String, Object> e : x.entrySet()) {
                if (!y.containsKey(e.getKey())) return false;
                if (!same(e.getValue(), y.get(e.getKey()))) return false;
            }
            return true;
        }
        if (a instanceof List && b instanceof List) {
            List<Object> x = (List<Object>) a, y = (List<Object>) b;
            if (x.size() != y.size()) return false;
            for (int i = 0; i < x.size(); i++) if (!same(x.get(i), y.get(i))) return false;
            return true;
        }
        return false;
    }

    private static boolean isIntegral(Object n) {
        return n instanceof Long || n instanceof Integer || n instanceof Short || n instanceof Byte;
    }

    // ---------- penggabungan ----------

    /**
     * @param base     versi dasar (boleh null bila perangkat tidak tahu versi dasarnya: diperlakukan sebagai objek kosong)
     * @param client   versi baru dari perangkat
     * @param server   versi terkini di server
     * @param additive nama kolom tingkat atas yang dijumlahkan bila berubah serentak (boleh null)
     */
    public static Object merge(Object base, Object client, Object server, Set<String> additive) {
        Object b = base == null ? new LinkedHashMap<String, Object>() : base;
        return value(b, client, server, additive, true, 0);
    }

    @SuppressWarnings("unchecked")
    private static Object value(Object b, Object c, Object s, Set<String> additive, boolean top, int depth) {
        if (same(c, b)) return s;
        if (same(s, b)) return c;
        // Kedua pihak sampai pada nilai yang sama -> pakai itu; kecuali objek tingkat atas yang punya
        // kolom aditif (dua penjualan identik tetap harus mengurangi stok dua kali).
        if (same(c, s) && !(top && additive != null && !additive.isEmpty())) return c;
        if (depth > 64) return c;
        if (c instanceof Map && s instanceof Map) {
            Map<String, Object> bm = b instanceof Map ? (Map<String, Object>) b : new LinkedHashMap<String, Object>();
            return object(bm, (Map<String, Object>) c, (Map<String, Object>) s, top ? additive : null, depth);
        }
        if (c instanceof List && s instanceof List) {
            List<Object> bl = b instanceof List ? (List<Object>) b : new ArrayList<Object>();
            return array(bl, (List<Object>) c, (List<Object>) s, depth);
        }
        return c;
    }

    private static Map<String, Object> object(Map<String, Object> b, Map<String, Object> c, Map<String, Object> s,
                                              Set<String> additive, int depth) {
        Set<String> keys = new LinkedHashSet<>(s.keySet());
        keys.addAll(c.keySet());
        Map<String, Object> out = new LinkedHashMap<>();
        for (String k : keys) {
            Object bv = b.containsKey(k) ? b.get(k) : ABSENT;
            Object cv = c.containsKey(k) ? c.get(k) : ABSENT;
            Object sv = s.containsKey(k) ? s.get(k) : ABSENT;
            Object r;
            if (additive != null && additive.contains(k) && bv instanceof Number && cv instanceof Number && sv instanceof Number
                    && !same(cv, bv) && !same(sv, bv)) {
                r = add(sv, cv, bv);
            } else {
                r = value(bv, cv, sv, null, false, depth + 1);
            }
            if (r != ABSENT) out.put(k, r);
        }
        return out;
    }

    private static Object add(Object s, Object c, Object b) {
        if (isIntegral(s) && isIntegral(c) && isIntegral(b))
            return ((Number) s).longValue() + (((Number) c).longValue() - ((Number) b).longValue());
        double r = ((Number) s).doubleValue() + (((Number) c).doubleValue() - ((Number) b).doubleValue());
        return Math.round(r * 1e9) / 1e9; // buang galat pembulatan biner
    }

    private static Object idOf(Object o) {
        if (!(o instanceof Map)) return null;
        Object id = ((Map<?, ?>) o).get("id");
        if (id instanceof String || id instanceof Number) return MiniJson.stringify(id);
        return null;
    }

    private static boolean allHaveId(List<Object> l) {
        Set<Object> seen = new java.util.HashSet<>();
        for (Object o : l) {
            Object id = idOf(o);
            if (id == null || !seen.add(id)) return false;
        }
        return true;
    }

    private static List<Object> array(List<Object> b, List<Object> c, List<Object> s, int depth) {
        if (allHaveId(b) && allHaveId(c) && allHaveId(s) && !(c.isEmpty() && s.isEmpty())) {
            Map<Object, Object> bm = new HashMap<>(), cm = new LinkedHashMap<>(), sm = new LinkedHashMap<>();
            for (Object o : b) bm.put(idOf(o), o);
            for (Object o : c) cm.put(idOf(o), o);
            for (Object o : s) sm.put(idOf(o), o);
            List<Object> out = new ArrayList<>();
            for (Map.Entry<Object, Object> e : sm.entrySet()) {
                Object id = e.getKey();
                Object r = value(bm.containsKey(id) ? bm.get(id) : ABSENT, cm.containsKey(id) ? cm.get(id) : ABSENT, e.getValue(), null, false, depth + 1);
                if (r != ABSENT) out.add(r);
            }
            for (Map.Entry<Object, Object> e : cm.entrySet()) {
                Object id = e.getKey();
                if (sm.containsKey(id)) continue;
                Object r = value(bm.containsKey(id) ? bm.get(id) : ABSENT, e.getValue(), ABSENT, null, false, depth + 1);
                if (r != ABSENT) out.add(r);
            }
            return out;
        }
        // Multiset: gabungkan penghapusan & penambahan dari perangkat ke daftar server.
        Map<String, Integer> bc = count(b), cc = count(c), sc = count(s);
        Map<String, Integer> remove = new HashMap<>();
        for (Map.Entry<String, Integer> e : bc.entrySet()) {
            int d = e.getValue() - get(cc, e.getKey());
            if (d > 0) remove.put(e.getKey(), d);
        }
        List<Object> out = new ArrayList<>();
        for (Object o : s) {
            String k = key(o);
            Integer r = remove.get(k);
            if (r != null && r > 0) { remove.put(k, r - 1); continue; }
            out.add(o);
        }
        Map<String, Integer> addLeft = new HashMap<>();
        for (Map.Entry<String, Integer> e : cc.entrySet()) {
            int base = get(bc, e.getKey());
            int need = e.getValue() - base;
            int serverExtra = Math.max(0, get(sc, e.getKey()) - base);
            if (need - serverExtra > 0) addLeft.put(e.getKey(), need - serverExtra);
        }
        for (Object o : c) {
            String k = key(o);
            Integer n = addLeft.get(k);
            if (n != null && n > 0) { out.add(o); addLeft.put(k, n - 1); }
        }
        return out;
    }

    private static int get(Map<String, Integer> m, String k) { Integer v = m.get(k); return v == null ? 0 : v; }

    private static String key(Object o) { return MiniJson.stringify(slim(o)); }

    private static Map<String, Integer> count(List<Object> l) {
        Map<String, Integer> m = new HashMap<>();
        for (Object o : l) { String k = key(o); m.put(k, get(m, k) + 1); }
        return m;
    }
}
