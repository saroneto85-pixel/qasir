package id.kasmini.pos.sync;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Logika Perangkat Utama (server): menerima perubahan dari perangkat (push), membagikan
 * perubahan berurutan menurut nomor revisi (pull), pairing perangkat, dan pengisian awal (seed).
 * Tidak bergantung pada Android, sehingga bisa diuji di JVM biasa.
 */
public final class SyncCore {
    public static final int PROTO = 1;
    /** Kolom yang dijumlahkan saat diubah serentak oleh dua perangkat. */
    public static final Map<String, Set<String>> ADDITIVE = new HashMap<>();
    static {
        Set<String> products = new HashSet<>();
        products.add("stock");
        ADDITIVE.put("products", Collections.unmodifiableSet(products));
    }
    /** Riwayat versi disimpan 3 hari; cukup untuk perangkat yang sempat offline. */
    public static final long HISTORY_MS = 3L * 24 * 60 * 60 * 1000;

    private static final Pattern STORE_RE = Pattern.compile("[A-Za-z0-9_]{1,40}");
    private static final SecureRandom RNG = new SecureRandom();

    public interface Listener { void onRevision(long rev); }

    public static final class HttpError extends Exception {
        public final int status;
        public HttpError(int status, String message) { super(message); this.status = status; }
        public String json() { return "{\"error\":" + MiniJson.quote(getMessage()) + "}"; }
    }

    private final SyncStore st;
    private final Object lock = new Object();
    private volatile long lastRev;
    private volatile Listener listener;
    private final Map<String, Long> seen = Collections.synchronizedMap(new HashMap<String, Long>());
    private final List<Long> pairFailures = new ArrayList<>();

    public SyncCore(SyncStore store) {
        this.st = store;
        this.lastRev = store.maxRev();
    }

    public void setListener(Listener l) { this.listener = l; }
    public long latest() { return lastRev; }
    public String storeId() { String s = st.meta("storeId"); return s == null ? "" : s; }
    public String storeName() { String s = st.meta("storeName"); return s == null ? "" : s; }
    public void setStoreName(String name) { if (name != null && !name.equals(storeName())) st.setMeta("storeName", name.trim()); }

    public String pairCode() {
        String c = st.meta("pairCode");
        if (c == null || c.length() != 6) c = newPairCode();
        return c;
    }

    public String newPairCode() {
        String c = String.format("%06d", RNG.nextInt(1_000_000));
        st.setMeta("pairCode", c);
        return c;
    }

    public String infoJson() {
        return "{\"app\":\"kasir-dbl\",\"proto\":" + PROTO + ",\"storeId\":" + MiniJson.quote(storeId())
                + ",\"storeName\":" + MiniJson.quote(storeName()) + ",\"latest\":" + lastRev + "}";
    }

    private void fire(long rev) {
        Listener l = listener;
        if (l != null) l.onRevision(rev);
    }

    // ---------------- push ----------------

    /** Menerapkan perubahan dari perangkat. Mengembalikan JSON {latest, results:[...]} */
    @SuppressWarnings("unchecked")
    public String push(final String deviceId, String body) throws Exception {
        final Map<String, Object> req;
        try { req = MiniJson.parseObject(body); } catch (IllegalArgumentException e) { throw new HttpError(400, "Data kiriman rusak: " + e.getMessage()); }
        Object ch = req.get("changes");
        if (!(ch instanceof List)) throw new HttpError(400, "Daftar perubahan tidak ada");
        final List<Object> changes = (List<Object>) ch;
        final StringBuilder out = new StringBuilder("{\"results\":[");
        long rev;
        synchronized (lock) {
            rev = st.inTransaction(() -> {
                long r = lastRev;
                long now = System.currentTimeMillis();
                boolean first = true;
                for (Object o : changes) {
                    if (!(o instanceof Map)) throw new HttpError(400, "Perubahan tidak valid");
                    Map<String, Object> c = (Map<String, Object>) o;
                    String store = str(c.get("s")), id = str(c.get("id")), op = str(c.get("op"));
                    if (store == null || !STORE_RE.matcher(store).matches()) throw new HttpError(400, "Nama data tidak valid");
                    if (id == null || id.isEmpty() || id.length() > 200) throw new HttpError(400, "ID data tidak valid");
                    if (!"put".equals(op) && !"del".equals(op)) throw new HttpError(400, "Operasi tidak valid");
                    Long baseRev = c.get("b") instanceof Number ? ((Number) c.get("b")).longValue() : null;
                    SyncStore.Rec cur = st.get(store, id);
                    boolean eq = false;
                    SyncStore.Rec res;
                    if ("del".equals(op)) {
                        if (cur != null && cur.deleted) res = cur;
                        else res = write(store, id, null, true, ++r, now, deviceId);
                    } else {
                        Object p = c.get("p");
                        if (!(p instanceof Map)) throw new HttpError(400, "Isi data harus objek");
                        String clientRaw = MiniJson.stringify(p);
                        if (cur == null || (cur.deleted && baseRev == null && !c.containsKey("bp"))) {
                            res = write(store, id, clientRaw, false, ++r, now, deviceId);
                            eq = true;
                        } else if (cur.deleted) {
                            res = cur; // diubah dari versi lama, tetapi sudah dihapus perangkat lain: penghapusan menang
                        } else if (baseRev != null && baseRev == cur.rev && !c.containsKey("bp")) {
                            if (clientRaw.equals(cur.payload)) res = cur;
                            else res = write(store, id, clientRaw, false, ++r, now, deviceId);
                            eq = true;
                        } else {
                            Object base = null;
                            if (c.get("bp") instanceof Map) base = c.get("bp");
                            else if (baseRev != null) {
                                String h = baseRev == cur.rev ? cur.payload : st.history(store, id, baseRev);
                                if (h != null) base = MiniJson.parse(h);
                            }
                            Object server = MiniJson.parse(cur.payload);
                            Object merged = SyncMerge.merge(base, p, server, ADDITIVE.get(store));
                            if (SyncMerge.same(merged, server)) res = cur;
                            else {
                                String mergedRaw = MiniJson.stringify(merged);
                                eq = mergedRaw.equals(clientRaw);
                                res = write(store, id, mergedRaw, false, ++r, now, deviceId);
                            }
                            if (res == cur) eq = clientRaw.equals(cur.payload);
                        }
                    }
                    if (!first) out.append(',');
                    first = false;
                    out.append("{\"s\":").append(MiniJson.quote(store)).append(",\"id\":").append(MiniJson.quote(id))
                       .append(",\"r\":").append(res.rev).append(",\"d\":").append(res.deleted);
                    if (!res.deleted) {
                        if (eq) out.append(",\"eq\":true");
                        else out.append(",\"p\":").append(res.payload);
                    }
                    out.append('}');
                }
                return r;
            });
            lastRev = rev;
        }
        out.append("],\"latest\":").append(rev).append('}');
        fire(rev);
        return out.toString();
    }

    private SyncStore.Rec write(String store, String id, String payload, boolean deleted, long rev, long now, String deviceId) {
        SyncStore.Rec n = new SyncStore.Rec();
        n.store = store; n.id = id; n.payload = deleted ? null : payload; n.deleted = deleted;
        n.rev = rev; n.updatedAt = now; n.deviceId = deviceId;
        st.put(n);
        if (!deleted) st.putHistory(store, id, rev, MiniJson.stringify(SyncMerge.slim(MiniJson.parse(payload))), now);
        return n;
    }

    private static String str(Object o) { return o instanceof String ? (String) o : null; }

    // ---------------- pull ----------------

    /** Perubahan dengan rev > since, maksimal kira-kira maxBytes. */
    public String pull(long since, int maxBytes) {
        StringBuilder sb = new StringBuilder();
        sb.append("{\"storeId\":").append(MiniJson.quote(storeId())).append(",\"changes\":[");
        long cursor = since, latest = lastRev;
        boolean more = false, first = true;
        int bytes = 0;
        outer:
        while (true) {
            List<SyncStore.Rec> rows = st.since(cursor, 100);
            if (rows.isEmpty()) break;
            for (SyncStore.Rec r : rows) {
                if (!first && bytes + (r.payload == null ? 0 : r.payload.length()) > maxBytes) { more = true; break outer; }
                if (!first) sb.append(',');
                first = false;
                sb.append("{\"s\":").append(MiniJson.quote(r.store)).append(",\"id\":").append(MiniJson.quote(r.id))
                  .append(",\"r\":").append(r.rev).append(",\"d\":").append(r.deleted);
                if (!r.deleted) sb.append(",\"p\":").append(r.payload);
                sb.append('}');
                bytes += 64 + (r.payload == null ? 0 : r.payload.length());
                cursor = r.rev;
            }
            if (rows.size() < 100) break;
        }
        if (cursor > latest) latest = cursor;
        sb.append("],\"cursor\":").append(cursor).append(",\"latest\":").append(latest).append(",\"more\":").append(more).append('}');
        return sb.toString();
    }

    // ---------------- seed ----------------

    /**
     * Mengisi database server dari data perangkat ini. reset=true memulai identitas toko baru
     * (semua perangkat tambahan harus dipasangkan ulang).
     */
    @SuppressWarnings("unchecked")
    public long seed(String body, boolean reset) throws Exception {
        final Map<String, Object> req = MiniJson.parseObject(body);
        final List<Object> recs = req.get("records") instanceof List ? (List<Object>) req.get("records") : new ArrayList<Object>();
        final boolean doReset = reset;
        long rev;
        synchronized (lock) {
            rev = st.inTransaction(() -> {
                if (doReset) {
                    st.clearAll();
                    st.setMeta("storeId", randomHex(8));
                    st.setMeta("nextCode", "2");
                    newPairCode();
                }
                long r = doReset ? 0 : lastRev;
                long now = System.currentTimeMillis();
                for (Object o : recs) {
                    if (!(o instanceof Map)) continue;
                    Map<String, Object> c = (Map<String, Object>) o;
                    String store = str(c.get("s")), id = str(c.get("id"));
                    if (store == null || !STORE_RE.matcher(store).matches() || id == null || id.isEmpty()) continue;
                    if (!(c.get("p") instanceof Map)) continue;
                    write(store, id, MiniJson.stringify(c.get("p")), false, ++r, now, "seed");
                }
                return r;
            });
            lastRev = rev;
        }
        fire(rev);
        return rev;
    }

    // ---------------- pairing & perangkat ----------------

    /** Mengembalikan JSON {token, storeId, storeName, deviceCode}. */
    @SuppressWarnings("unchecked")
    public String pair(String body) throws Exception {
        Map<String, Object> req;
        try { req = MiniJson.parseObject(body); } catch (IllegalArgumentException e) { throw new HttpError(400, "Data pairing rusak"); }
        String code = str(req.get("code")), name = str(req.get("name")), deviceId = str(req.get("deviceId"));
        if (deviceId == null || deviceId.isEmpty() || deviceId.length() > 80) throw new HttpError(400, "ID perangkat tidak valid");
        long now = System.currentTimeMillis();
        synchronized (pairFailures) {
            while (!pairFailures.isEmpty() && now - pairFailures.get(0) > 60_000) pairFailures.remove(0);
            if (pairFailures.size() >= 5) throw new HttpError(429, "Terlalu banyak percobaan kode salah. Tunggu 1 menit.");
            if (code == null || !code.trim().equals(pairCode())) {
                pairFailures.add(now);
                throw new HttpError(403, "Kode pairing salah");
            }
        }
        synchronized (lock) {
            SyncStore.Device d = st.deviceById(deviceId);
            if (d != null) st.deleteDevice(d.token);
            else {
                d = new SyncStore.Device();
                d.deviceId = deviceId;
                d.createdAt = now;
                int n = 2;
                try { n = Integer.parseInt(st.meta("nextCode")); } catch (Exception ignored) {}
                d.code = "K" + n;
                st.setMeta("nextCode", String.valueOf(n + 1));
            }
            d.token = randomHex(24);
            d.name = name == null || name.trim().isEmpty() ? "Perangkat " + d.code : name.trim();
            if (d.name.length() > 40) d.name = d.name.substring(0, 40);
            d.lastSeen = now;
            d.revoked = false;
            st.putDevice(d);
            seen.put(d.token, now);
            return "{\"token\":" + MiniJson.quote(d.token) + ",\"storeId\":" + MiniJson.quote(storeId())
                    + ",\"storeName\":" + MiniJson.quote(storeName()) + ",\"deviceCode\":" + MiniJson.quote(d.code) + "}";
        }
    }

    /** Memeriksa token perangkat dan identitas toko. */
    public SyncStore.Device auth(String token, String storeId) throws HttpError {
        if (storeId != null && !storeId.isEmpty() && !storeId.equals(storeId()))
            throw new HttpError(410, "Perangkat Utama sudah berganti data. Sambungkan ulang perangkat ini.");
        if (token == null || token.isEmpty()) throw new HttpError(401, "Perangkat belum dipasangkan");
        SyncStore.Device d = st.deviceByToken(token);
        if (d == null || d.revoked) throw new HttpError(401, "Perangkat ini sudah dicabut dari Perangkat Utama. Sambungkan ulang.");
        seen.put(token, System.currentTimeMillis());
        return d;
    }

    public String devicesJson() {
        long now = System.currentTimeMillis();
        StringBuilder sb = new StringBuilder("[");
        boolean first = true;
        for (SyncStore.Device d : st.devices()) {
            if (d.revoked) continue;
            Long s = seen.get(d.token);
            long last = Math.max(d.lastSeen, s == null ? 0 : s);
            if (!first) sb.append(',');
            first = false;
            sb.append("{\"token\":").append(MiniJson.quote(d.token)).append(",\"name\":").append(MiniJson.quote(d.name))
              .append(",\"code\":").append(MiniJson.quote(d.code)).append(",\"lastSeen\":").append(last)
              .append(",\"online\":").append(now - last < 45_000).append('}');
        }
        return sb.append(']').toString();
    }

    public void revoke(String token) {
        synchronized (lock) {
            SyncStore.Device d = st.deviceByToken(token);
            if (d != null) { d.revoked = true; st.putDevice(d); }
            seen.remove(token);
        }
    }

    public int pruneHistory() { return st.pruneHistory(System.currentTimeMillis() - HISTORY_MS); }

    public long countLive() { return st.countLive(); }

    static String randomHex(int bytes) {
        byte[] b = new byte[bytes];
        RNG.nextBytes(b);
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x));
        return sb.toString();
    }
}
