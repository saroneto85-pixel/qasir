import id.kasmini.pos.sync.SyncStore;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;

/** Implementasi SyncStore di memori untuk pengujian JVM (meniru perilaku tabel Room). */
public class MemorySyncStore implements SyncStore {
    final Map<String, Rec> recs = new LinkedHashMap<>();
    final Map<String, String[]> hist = new HashMap<>(); // key -> [payload, createdAt]
    final Map<String, String> meta = new HashMap<>();
    final Map<String, Device> devs = new LinkedHashMap<>();

    static String k(String s, String id) { return s + "\u0001" + id; }

    static Rec copy(Rec r) {
        if (r == null) return null;
        Rec n = new Rec();
        n.store = r.store; n.id = r.id; n.payload = r.payload; n.deleted = r.deleted; n.rev = r.rev; n.updatedAt = r.updatedAt; n.deviceId = r.deviceId;
        return n;
    }

    public synchronized Rec get(String store, String id) { return copy(recs.get(k(store, id))); }
    public synchronized void put(Rec r) { recs.put(k(r.store, r.id), copy(r)); }
    public synchronized List<Rec> since(long rev, int limit) {
        List<Rec> l = new ArrayList<>();
        for (Rec r : recs.values()) if (r.rev > rev) l.add(copy(r));
        l.sort((a, b) -> Long.compare(a.rev, b.rev));
        return l.size() > limit ? new ArrayList<>(l.subList(0, limit)) : l;
    }
    public synchronized long maxRev() { long m = 0; for (Rec r : recs.values()) m = Math.max(m, r.rev); return m; }
    public synchronized long countLive() { long c = 0; for (Rec r : recs.values()) if (!r.deleted) c++; return c; }
    public synchronized String history(String store, String id, long rev) { String[] h = hist.get(k(store, id) + "#" + rev); return h == null ? null : h[0]; }
    public synchronized void putHistory(String store, String id, long rev, String p, long t) { hist.put(k(store, id) + "#" + rev, new String[]{p, String.valueOf(t)}); }
    public synchronized int pruneHistory(long before) {
        int n = 0;
        for (java.util.Iterator<Map.Entry<String, String[]>> it = hist.entrySet().iterator(); it.hasNext();) {
            if (Long.parseLong(it.next().getValue()[1]) < before) { it.remove(); n++; }
        }
        return n;
    }
    public synchronized void clearAll() { recs.clear(); hist.clear(); devs.clear(); }
    public synchronized String meta(String key) { return meta.get(key); }
    public synchronized void setMeta(String key, String value) { meta.put(key, value); }
    public synchronized Device deviceByToken(String token) { return devs.get(token); }
    public synchronized Device deviceById(String id) { for (Device d : devs.values()) if (id.equals(d.deviceId)) return d; return null; }
    public synchronized void putDevice(Device d) { devs.put(d.token, d); }
    public synchronized void deleteDevice(String token) { devs.remove(token); }
    public synchronized List<Device> devices() { return new ArrayList<>(devs.values()); }

    @SuppressWarnings("unchecked")
    public synchronized <T> T inTransaction(Callable<T> fn) throws Exception {
        Map<String, Rec> r0 = new LinkedHashMap<>(recs);
        Map<String, String[]> h0 = new HashMap<>(hist);
        Map<String, String> m0 = new HashMap<>(meta);
        Map<String, Device> d0 = new LinkedHashMap<>(devs);
        try { return fn.call(); }
        catch (Exception e) { recs.clear(); recs.putAll(r0); hist.clear(); hist.putAll(h0); meta.clear(); meta.putAll(m0); devs.clear(); devs.putAll(d0); throw e; }
    }
}
