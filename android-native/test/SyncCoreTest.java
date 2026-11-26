import id.kasmini.pos.sync.MiniJson;
import id.kasmini.pos.sync.SyncCore;
import id.kasmini.pos.sync.SyncMerge;

import java.util.*;

/** Uji unit inti sinkronisasi. Jalankan: lihat android-native/test/run-tests.sh */
public class SyncCoreTest {
    static int pass = 0, fail = 0;

    static void ok(boolean c, String name) {
        if (c) pass++; else { fail++; System.out.println("GAGAL: " + name); }
    }
    static void eq(Object a, Object b, String name) {
        boolean c = Objects.equals(a, b);
        if (!c) System.out.println("  diperoleh: " + a + "\n  diharapkan: " + b);
        ok(c, name);
    }
    static Object J(String s) { return MiniJson.parse(s.replace('\'', '"')); }
    static String S(Object o) { return MiniJson.stringify(o); }
    static Map<String, Object> M(String s) { return MiniJson.parseObject(s); }
    static Object merge(String b, String c, String s, String store) {
        return SyncMerge.merge(b == null ? null : J(b), J(c), J(s), SyncCore.ADDITIVE.get(store));
    }

    public static void main(String[] args) throws Exception {
        json();
        mergeRules();
        core();
        System.out.println("SyncCoreTest: " + pass + " lulus, " + fail + " gagal");
        if (fail > 0) System.exit(1);
    }

    static void json() {
        String src = "{\"a\":1,\"b\":-0.5,\"c\":\"x\\\"y\\\\z\\n\\u00e9\\u2028\",\"d\":[true,false,null,{}],\"e\":1e3,\"f\":12345678901234,\"g\":\"Rendang 🍛\"}";
        Map<String, Object> m = M(src);
        eq(m.get("a"), 1L, "json: bilangan bulat -> Long");
        eq(m.get("b"), -0.5, "json: pecahan -> Double");
        eq(m.get("c"), "x\"y\\z\né ", "json: escape");
        eq(S(m.get("e")), "1000", "json: 1e3 ditulis 1000");
        eq(m.get("f"), 12345678901234L, "json: angka besar");
        ok(SyncMerge.same(MiniJson.parse(S(m)), m), "json: pulang-pergi");
        eq(S(J("{'x':0.1,'y':150000,'z':2.5}")), "{\"x\":0.1,\"y\":150000,\"z\":2.5}", "json: format angka seperti JS");
        StringBuilder big = new StringBuilder("data:image/png;base64,");
        for (int i = 0; i < 300000; i++) big.append((char) ('A' + i % 26));
        Map<String, Object> pm = new LinkedHashMap<>();
        pm.put("photo", big.toString());
        eq(MiniJson.parse(S(pm)), pm, "json: string besar (foto)");
        boolean threw = false;
        try { MiniJson.parse("{\"a\":1"); } catch (IllegalArgumentException e) { threw = true; }
        ok(threw, "json: JSON terpotong ditolak");
    }

    static void mergeRules() {
        eq(S(merge("{'id':'p1','stock':10}", "{'id':'p1','stock':9}", "{'id':'p1','stock':9}", "products")),
           "{\"id\":\"p1\",\"stock\":8}", "merge: dua penjualan serentak mengurangi stok dua kali");
        eq(S(merge("{'id':'p1','stock':10}", "{'id':'p1','stock':7}", "{'id':'p1','stock':12}", "products")),
           "{\"id\":\"p1\",\"stock\":9}", "merge: stok naik di server + terjual di perangkat");
        eq(S(merge("{'id':'p1','stock':10}", "{'id':'p1','stock':9}", "{'id':'p1','stock':9}", "invItems")),
           "{\"id\":\"p1\",\"stock\":9}", "merge: kolom stock di store lain tidak aditif");
        eq(S(merge("{'id':'p','name':'A','price':1,'stock':5}", "{'id':'p','name':'B','price':1,'stock':5}", "{'id':'p','name':'A','price':2,'stock':4}", "products")),
           "{\"id\":\"p\",\"name\":\"B\",\"price\":2,\"stock\":4}", "merge: kolom berbeda digabung");
        eq(S(merge("{'id':'p','name':'A','note':'x'}", "{'id':'p','name':'A'}", "{'id':'p','name':'A','note':'x'}", "products")),
           "{\"id\":\"p\",\"name\":\"A\"}", "merge: kolom yang dihapus perangkat ikut terhapus");
        eq(S(merge("{'id':'p','name':'A'}", "{'id':'p','name':'C'}", "{'id':'p','name':'B'}", "products")),
           "{\"id\":\"p\",\"name\":\"C\"}", "merge: bentrok kolom biasa -> perubahan terakhir menang");
        eq(S(merge(null, "{'id':'p','a':5,'c':3}", "{'id':'p','a':1,'b':2}", "x")),
           "{\"id\":\"p\",\"a\":5,\"b\":2,\"c\":3}", "merge: tanpa base -> gabungan, perangkat menang");
        // tiket dapur ber-id: pelayan menambah tiket, dapur mengubah status tiket lama
        String base = "{'id':'o','items':[{'productId':'a','qty':1,'sentQty':1,'note':''}],'tickets':[{'id':'t1','status':'baru','items':[]}]}";
        String cli = "{'id':'o','items':[{'productId':'a','qty':2,'sentQty':2,'note':''}],'tickets':[{'id':'t1','status':'baru','items':[]},{'id':'t2','status':'baru','items':[]}]}";
        String srv = "{'id':'o','items':[{'productId':'a','qty':1,'sentQty':1,'note':''}],'tickets':[{'id':'t1','status':'proses','items':[]}]}";
        Map<?, ?> r = (Map<?, ?>) merge(base, cli, srv, "orders");
        eq(S(r.get("tickets")), "[{\"id\":\"t1\",\"status\":\"proses\",\"items\":[]},{\"id\":\"t2\",\"status\":\"baru\",\"items\":[]}]", "merge: array ber-id digabung per elemen");
        eq(S(r.get("items")), "[{\"productId\":\"a\",\"qty\":2,\"sentQty\":2,\"note\":\"\"}]", "merge: item pesanan dari perangkat");
        // pembayaran tanpa id: dua pembayaran serentak dari dua kasir sama-sama tersimpan
        eq(S(((Map<?, ?>) merge("{'id':'r','payments':[{'d':'1','n':5}]}", "{'id':'r','payments':[{'d':'1','n':5},{'d':'2','n':7}]}", "{'id':'r','payments':[{'d':'1','n':5},{'d':'3','n':9}]}", "receivables")).get("payments")),
           "[{\"d\":\"1\",\"n\":5},{\"d\":\"3\",\"n\":9},{\"d\":\"2\",\"n\":7}]", "merge: array tanpa id digabung (multiset)");
        eq(S(((Map<?, ?>) merge("{'id':'s','t':['A']}", "{'id':'s','t':['A','Gas']}", "{'id':'s','t':['A','B','Gas']}", "settings")).get("t")),
           "[\"A\",\"B\",\"Gas\"]", "merge: tambahan yang sama tidak digandakan");
        eq(S(((Map<?, ?>) merge("{'id':'s','t':['A','B']}", "{'id':'s','t':['B']}", "{'id':'s','t':['A','B','C']}", "settings")).get("t")),
           "[\"B\",\"C\"]", "merge: penghapusan elemen dari perangkat diterapkan");
        // base ramping (foto diganti sidik) tetap dikenali sama
        StringBuilder photo = new StringBuilder();
        for (int i = 0; i < 5000; i++) photo.append((char) ('a' + i % 26));
        Map<String, Object> b = M("{\"id\":\"p\",\"name\":\"A\",\"stock\":5}"); b.put("photo", photo.toString());
        Map<String, Object> c = M("{\"id\":\"p\",\"name\":\"A\",\"stock\":4}"); c.put("photo", photo.toString());
        Map<String, Object> s = M("{\"id\":\"p\",\"name\":\"Z\",\"stock\":5}"); s.put("photo", photo.toString());
        Map<?, ?> rm = (Map<?, ?>) SyncMerge.merge(SyncMerge.slim(b), c, s, SyncCore.ADDITIVE.get("products"));
        ok(photo.toString().equals(rm.get("photo")) && "Z".equals(rm.get("name")) && Long.valueOf(4).equals(rm.get("stock")), "merge: base ramping (foto) tetap benar");
        ok(!S(SyncMerge.slim(b)).contains("abcdefghij"), "slim: string panjang diganti sidik");
        eq(SyncMerge.same(1L, 1.0), true, "same: 1 == 1.0");
    }

    static String push(SyncCore core, String dev, String changes) throws Exception {
        return core.push(dev, "{\"deviceId\":\"" + dev + "\",\"changes\":" + changes.replace('\'', '"') + "}");
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> rec(SyncCore core, String store, String id) {
        Map<String, Object> pull = M(core.pull(0, 50_000_000));
        Map<String, Object> last = null;
        for (Object o : (List<Object>) pull.get("changes")) {
            Map<String, Object> m = (Map<String, Object>) o;
            if (store.equals(m.get("s")) && id.equals(m.get("id"))) last = m;
        }
        return last;
    }

    @SuppressWarnings("unchecked")
    static void core() throws Exception {
        MemorySyncStore st = new MemorySyncStore();
        SyncCore core = new SyncCore(st);
        final long[] fired = {0};
        core.setListener(rev -> fired[0] = rev);
        long rev = core.seed("{\"records\":[{\"s\":\"products\",\"id\":\"p1\",\"p\":{\"id\":\"p1\",\"name\":\"Rendang\",\"stock\":10}},{\"s\":\"settings\",\"id\":\"main\",\"p\":{\"id\":\"main\",\"name\":\"DBL\"}}]}", true);
        eq(rev, 2L, "seed: dua record");
        eq(fired[0], 2L, "seed: pendengar revisi dipanggil");
        String sid = core.storeId();
        ok(sid.length() == 16, "seed: storeId dibuat");
        Map<String, Object> pull = M(core.pull(0, 1_000_000));
        eq(((List<?>) pull.get("changes")).size(), 2, "pull: semua record");
        eq(pull.get("cursor"), 2L, "pull: kursor");
        eq(((List<?>) M(core.pull(2, 1_000_000)).get("changes")).size(), 0, "pull: tidak ada perubahan baru");

        // pairing
        int status = 0;
        try { core.pair("{\"code\":\"000000x\",\"deviceId\":\"devB\"}"); } catch (SyncCore.HttpError e) { status = e.status; }
        eq(status, 403, "pair: kode salah ditolak");
        Map<String, Object> pr = M(core.pair("{\"code\":\"" + core.pairCode() + "\",\"name\":\"Tablet Pelayan\",\"deviceId\":\"devB\"}"));
        eq(pr.get("deviceCode"), "K2", "pair: kode perangkat K2");
        eq(pr.get("storeId"), sid, "pair: storeId dikirim");
        String tokB = (String) pr.get("token");
        Map<String, Object> pr2 = M(core.pair("{\"code\":\"" + core.pairCode() + "\",\"name\":\"Tablet Pelayan\",\"deviceId\":\"devB\"}"));
        eq(pr2.get("deviceCode"), "K2", "pair: perangkat yang sama tetap K2");
        status = 0;
        try { core.auth(tokB, sid); } catch (SyncCore.HttpError e) { status = e.status; }
        eq(status, 401, "auth: token lama tidak berlaku setelah pairing ulang");
        tokB = (String) pr2.get("token");
        core.auth(tokB, sid);
        Map<String, Object> pc = M(core.pair("{\"code\":\"" + core.pairCode() + "\",\"name\":\"HP Dapur\",\"deviceId\":\"devC\"}"));
        eq(pc.get("deviceCode"), "K3", "pair: perangkat kedua K3");
        status = 0;
        try { core.auth(tokB, "lain"); } catch (SyncCore.HttpError e) { status = e.status; }
        eq(status, 410, "auth: storeId berbeda -> 410");
        ok(((List<?>) MiniJson.parse(core.devicesJson())).size() == 2, "perangkat: 2 terdaftar");

        // penjualan serentak dari dua kasir, keduanya membaca rev 1 (stok 10)
        Map<String, Object> r1 = M(push(core, "devB", "[{'s':'products','id':'p1','op':'put','b':1,'p':{'id':'p1','name':'Rendang','stock':9}}]"));
        Map<String, Object> x1 = (Map<String, Object>) ((List<?>) r1.get("results")).get(0);
        eq(x1.get("eq"), true, "push: jalur cepat (tidak ada perubahan lain) -> eq");
        Map<String, Object> r2 = M(push(core, "devC", "[{'s':'products','id':'p1','op':'put','b':1,'p':{'id':'p1','name':'Rendang','stock':9}}]"));
        Map<String, Object> x2 = (Map<String, Object>) ((List<?>) r2.get("results")).get(0);
        eq(((Map<?, ?>) x2.get("p")).get("stock"), 8L, "push: penjualan kedua digabung -> stok 8");
        eq(x2.get("r"), 4L, "push: revisi bertambah");

        // edit nama dari versi lama + penghapusan menang
        push(core, "devB", "[{'s':'customers','id':'c1','op':'put','p':{'id':'c1','name':'Budi'}}]");
        long crev = ((Number) rec(core, "customers", "c1").get("r")).longValue();
        push(core, "devC", "[{'s':'customers','id':'c1','op':'del','b':" + crev + "}]");
        Map<String, Object> r3 = M(push(core, "devB", "[{'s':'customers','id':'c1','op':'put','b':" + crev + ",'p':{'id':'c1','name':'Budi S'}}]"));
        eq(((Map<?, ?>) ((List<?>) r3.get("results")).get(0)).get("d"), true, "push: mengubah data yang sudah dihapus -> tetap terhapus");
        Map<String, Object> r4 = M(push(core, "devB", "[{'s':'customers','id':'c1','op':'put','p':{'id':'c1','name':'Budi Baru'}}]"));
        eq(((Map<?, ?>) ((List<?>) r4.get("results")).get(0)).get("d"), false, "push: membuat ulang dengan id sama (tanpa base) -> hidup lagi");

        // base eksplisit (bp) untuk edit yang terjadi saat pengiriman sebelumnya berlangsung
        Map<String, Object> r5 = M(push(core, "devB", "[{'s':'products','id':'p1','op':'put','bp':{'id':'p1','name':'Rendang','stock':9},'p':{'id':'p1','name':'Rendang','stock':7}}]"));
        eq(((Map<?, ?>) ((Map<?, ?>) ((List<?>) r5.get("results")).get(0)).get("p")).get("stock"), 6L, "push: base eksplisit -> 8 + (7-9) = 6");

        // riwayat sudah dibersihkan -> perubahan terakhir menang (tanpa base)
        st.hist.clear();
        Map<String, Object> r6 = M(push(core, "devC", "[{'s':'products','id':'p1','op':'put','b':1,'p':{'id':'p1','name':'Rendang Padang','stock':6}}]"));
        Map<?, ?> p6 = (Map<?, ?>) ((Map<?, ?>) ((List<?>) r6.get("results")).get(0)).get("p");
        ok(p6 == null || "Rendang Padang".equals(p6.get("name")), "push: tanpa riwayat -> data perangkat dipakai");

        // kiriman tidak valid ditolak tanpa mengubah apa pun (transaksi dibatalkan)
        long before = core.latest();
        status = 0;
        try { push(core, "devB", "[{'s':'products','id':'p9','op':'put','p':{'id':'p9'}},{'s':'bad name!','id':'x','op':'put','p':{}}]"); }
        catch (SyncCore.HttpError e) { status = e.status; }
        eq(status, 400, "push: nama store tidak valid -> 400");
        eq(core.latest(), before, "push: transaksi dibatalkan, revisi tetap");
        ok(rec(core, "products", "p9") == null, "push: record pertama ikut dibatalkan");

        // pull bertahap dengan batas ukuran
        StringBuilder many = new StringBuilder("[");
        for (int i = 0; i < 250; i++) many.append(i == 0 ? "" : ",").append("{'s':'transactions','id':'t").append(i).append("','op':'put','p':{'id':'t").append(i).append("','total':").append(i).append("}}");
        push(core, "devB", many.append("]").toString());
        long cur = 0; int pages = 0, total = 0;
        while (true) {
            Map<String, Object> pg = M(core.pull(cur, 4000));
            total += ((List<?>) pg.get("changes")).size();
            cur = ((Number) pg.get("cursor")).longValue();
            pages++;
            if (!Boolean.TRUE.equals(pg.get("more"))) break;
        }
        eq(cur, core.latest(), "pull bertahap: kursor sampai revisi terakhir");
        ok(pages > 3, "pull bertahap: lebih dari satu halaman");
        eq((long) total, core.latest() - 0 - countDupes(core), "pull bertahap: setiap record dikirim sekali (versi terakhir)");

        // pembatasan percobaan pairing
        status = 0;
        for (int i = 0; i < 6; i++) {
            try { core.pair("{\"code\":\"x\",\"deviceId\":\"devZ\"}"); } catch (SyncCore.HttpError e) { status = e.status; }
        }
        eq(status, 429, "pair: percobaan berlebih dibatasi");

        // reset seed -> identitas baru, perangkat lama ditolak
        core.seed("{\"records\":[]}", true);
        ok(!core.storeId().equals(sid), "seed reset: storeId baru");
        status = 0;
        try { core.auth(tokB, core.storeId()); } catch (SyncCore.HttpError e) { status = e.status; }
        eq(status, 401, "seed reset: token perangkat lama dicabut");
        eq(core.latest(), 0L, "seed reset: revisi mulai dari 0");
    }

    // pull hanya mengirim versi terakhir tiap record; hitung revisi yang tertimpa
    static long countDupes(SyncCore core) {
        Map<String, Object> pg = M(core.pull(0, Integer.MAX_VALUE));
        return core.latest() - ((List<?>) pg.get("changes")).size();
    }
}
