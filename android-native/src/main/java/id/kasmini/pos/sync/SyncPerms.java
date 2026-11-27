package id.kasmini.pos.sync;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * Izin akses perangkat tambahan, diatur di Perangkat Utama.
 *
 * Kunci menu  : transaction, history, products, customers, inventory, bahan, hpp, expenses,
 *               neraca, pembukuan, evaluasi, assets, debts, settings
 * Kunci fitur : cost (HPP/harga modal & laba), txEdit (edit/hapus transaksi tersimpan),
 *               salary (data gaji karyawan), data (cadangkan/pulihkan/hapus/ekspor)
 *
 * Penegakan di server: data dari tabel yang tidak diizinkan tidak pernah dikirim ke perangkat,
 * perubahan ke tabel itu ditolak, dan harga modal dihapus dari produk/transaksi bila "cost" tidak diizinkan.
 * Sumber aturan yang sama dipakai permissions.js di aplikasi.
 */
public final class SyncPerms {
    public static final List<String> PAGES = Collections.unmodifiableList(Arrays.asList(
            "transaction", "history", "products", "customers", "inventory", "bahan", "hpp", "expenses",
            "neraca", "pembukuan", "evaluasi", "assets", "debts", "settings"));
    public static final List<String> FEATURES = Collections.unmodifiableList(Arrays.asList("cost", "txEdit", "salary", "data"));

    /** Tabel yang selalu dibutuhkan kasir. */
    static final Set<String> ALWAYS = new TreeSet<>(Arrays.asList(
            "products", "categories", "settings", "customers", "transactions", "receivables",
            "cashiers", "tables", "orders", "stockMovements"));

    /** Tabel -> izin yang membuka akses baca (salah satu cukup). */
    static final Map<String, List<String>> READ = new HashMap<>();
    static {
        READ.put("openingBalance", Arrays.asList("neraca", "pembukuan", "evaluasi"));
        READ.put("assets", Arrays.asList("assets", "neraca", "pembukuan", "evaluasi"));
        READ.put("liabilities", Arrays.asList("debts", "pembukuan", "evaluasi"));
        for (String s : new String[]{"expenses", "expenseTypes", "expenseItems"})
            READ.put(s, Arrays.asList("expenses", "bahan", "pembukuan", "evaluasi"));
        READ.put("employees", Arrays.asList("salary"));
        READ.put("salaryPayments", Arrays.asList("salary"));
        READ.put("invItems", Arrays.asList("inventory", "bahan"));
        READ.put("invEntries", Arrays.asList("inventory", "bahan"));
        for (String s : new String[]{"materials", "hppMenus", "materialEntries"}) READ.put(s, Arrays.asList("bahan", "hpp"));
    }

    public static final Map<String, List<String>> PRESETS = new HashMap<>();
    static {
        PRESETS.put("kasir", Arrays.asList("transaction", "history", "customers"));
        PRESETS.put("pelayan", Arrays.asList("transaction", "history"));
        PRESETS.put("dapur", Arrays.asList("inventory", "bahan"));
        List<String> all = new ArrayList<>(PAGES);
        all.addAll(FEATURES);
        PRESETS.put("penuh", all);
    }
    public static final String DEFAULT_PRESET = "kasir";

    private final Set<String> allow;
    private final boolean full;

    private SyncPerms(Set<String> allow, boolean full) {
        this.allow = allow;
        this.full = full;
    }

    public static SyncPerms full() { return new SyncPerms(new TreeSet<String>(), true); }

    public static SyncPerms of(List<String> keys) {
        Set<String> s = new TreeSet<>();
        if (keys != null) for (String k : keys) if (PAGES.contains(k) || FEATURES.contains(k)) s.add(k);
        // Menu yang memperlihatkan laba/HPP otomatis membuka izin "cost".
        for (String k : new String[]{"hpp", "pembukuan", "evaluasi", "neraca"}) if (s.contains(k)) s.add("cost");
        return new SyncPerms(s, false);
    }

    public static SyncPerms preset(String name) { return of(PRESETS.containsKey(name) ? PRESETS.get(name) : PRESETS.get(DEFAULT_PRESET)); }

    /** JSON: ["transaction","history",...] */
    @SuppressWarnings("unchecked")
    public static SyncPerms parse(String json) {
        if (json == null || json.isEmpty()) return preset(DEFAULT_PRESET);
        try {
            Object v = MiniJson.parse(json);
            List<String> keys = new ArrayList<>();
            if (v instanceof List) for (Object o : (List<Object>) v) if (o instanceof String) keys.add((String) o);
            return of(keys);
        } catch (Exception e) {
            return preset(DEFAULT_PRESET);
        }
    }

    public boolean isFull() { return full; }
    public boolean has(String key) { return full || allow.contains(key); }
    public boolean cost() { return has("cost"); }

    public boolean canRead(String store) {
        if (full || ALWAYS.contains(store)) return true;
        List<String> need = READ.get(store);
        if (need == null) return false; // tabel baru/tak dikenal: tertutup secara bawaan
        for (String k : need) {
            if (k.endsWith("+cost")) { if (has(k.substring(0, k.length() - 5)) && cost()) return true; }
            else if (has(k)) return true;
        }
        return false;
    }

    public boolean canWrite(String store) {
        if (full) return true;
        if ("settings".equals(store)) return has("settings") || has("expenses"); // jenis pengeluaran tersimpan di pengaturan
        if ("employees".equals(store) || "salaryPayments".equals(store)) return has("salary");
        return canRead(store);
    }

    public List<String> keys() {
        if (full) { List<String> a = new ArrayList<>(PAGES); a.addAll(FEATURES); return a; }
        return new ArrayList<>(allow);
    }

    public String json() { return MiniJson.stringify(keys()); }
}
