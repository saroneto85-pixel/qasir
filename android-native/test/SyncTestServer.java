import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import id.kasmini.pos.sync.SyncCore;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.Executors;

/**
 * Server uji untuk test-sync-e2e.mjs: SyncCore yang sama dengan aplikasi, rute HTTP sama dengan LanServer (Ktor).
 * Rute /local/* meniru panggilan langsung plugin di Perangkat Utama (tanpa token).
 */
public class SyncTestServer {
    static final Object MON = new Object();

    public static void main(String[] args) throws Exception {
        final SyncCore core = new SyncCore(new MemorySyncStore());
        core.setListener(rev -> { synchronized (MON) { MON.notifyAll(); } });
        HttpServer srv = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        srv.setExecutor(Executors.newCachedThreadPool());
        srv.createContext("/", ex -> {
            int status = 200;
            String out;
            try {
                String path = ex.getRequestURI().getPath();
                Map<String, String> q = query(ex.getRequestURI().getRawQuery());
                String body = "POST".equals(ex.getRequestMethod()) ? read(ex.getRequestBody()) : "";
                long since = q.containsKey("since") ? Long.parseLong(q.get("since")) : 0;
                long wait = q.containsKey("wait") ? Math.min(25, Long.parseLong(q.get("wait"))) : 0;
                switch (path) {
                    case "/api/info": out = core.infoJson(); break;
                    case "/api/pair": out = core.pair(body); break;
                    case "/api/push": {
                        SyncTestServerAuth a = auth(core, ex);
                        out = core.push(a.deviceId, body);
                        break;
                    }
                    case "/api/changes": auth(core, ex); waitFor(core, since, wait); out = core.pull(since, 1_500_000); break;
                    case "/local/seed": out = "{\"latest\":" + core.seed(body, "1".equals(q.get("reset"))) + "}"; if (q.containsKey("name")) core.setStoreName(q.get("name")); break;
                    case "/local/push": out = core.push("server-device", body); break;
                    case "/local/pull": waitFor(core, since, wait); out = core.pull(since, 1_500_000); break;
                    case "/local/state": out = "{\"storeId\":\"" + core.storeId() + "\",\"pairCode\":\"" + core.pairCode() + "\",\"latest\":" + core.latest()
                            + ",\"records\":" + core.countLive() + ",\"devices\":" + com_quote(core.devicesJson()) + "}"; break;
                    case "/local/revoke": core.revoke(q.get("token")); out = "{}"; break;
                    case "/local/dump": out = core.pull(0, Integer.MAX_VALUE); break;
                    default: status = 404; out = "{\"error\":\"not found\"}";
                }
            } catch (SyncCore.HttpError e) {
                status = e.status; out = e.json();
            } catch (Exception e) {
                status = 500; out = "{\"error\":\"" + e + "\"}";
            }
            byte[] b = out.getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().set("Content-Type", "application/json");
            ex.sendResponseHeaders(status, b.length);
            try (OutputStream os = ex.getResponseBody()) { os.write(b); }
        });
        srv.start();
        System.out.println("READY " + srv.getAddress().getPort());
        System.out.flush();
    }

    static String com_quote(String s) { return id.kasmini.pos.sync.MiniJson.quote(s); }

    static final class SyncTestServerAuth { String deviceId; }

    static SyncTestServerAuth auth(SyncCore core, HttpExchange ex) throws SyncCore.HttpError {
        SyncTestServerAuth a = new SyncTestServerAuth();
        a.deviceId = core.auth(ex.getRequestHeaders().getFirst("X-Kasir-Token"), ex.getRequestHeaders().getFirst("X-Kasir-Store")).deviceId;
        return a;
    }

    static void waitFor(SyncCore core, long since, long waitSec) throws InterruptedException {
        long end = System.currentTimeMillis() + waitSec * 1000;
        synchronized (MON) {
            while (core.latest() <= since) {
                long left = end - System.currentTimeMillis();
                if (left <= 0) break;
                MON.wait(left);
            }
        }
    }

    static String read(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
        return bo.toString("UTF-8");
    }

    static Map<String, String> query(String raw) throws Exception {
        Map<String, String> m = new HashMap<>();
        if (raw == null) return m;
        for (String p : raw.split("&")) {
            int i = p.indexOf('=');
            if (i > 0) m.put(p.substring(0, i), java.net.URLDecoder.decode(p.substring(i + 1), "UTF-8"));
        }
        return m;
    }
}
