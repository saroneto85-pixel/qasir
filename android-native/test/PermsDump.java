import id.kasmini.pos.sync.SyncPerms;
import java.util.*;

/** Mencetak matriks izin (preset × tabel) sebagai JSON untuk dibandingkan dengan permissions.js. */
public class PermsDump {
    public static void main(String[] a) {
        String[] stores = a[0].split(",");
        String[][] cases = {{"kasir"}, {"pelayan"}, {"dapur"}, {"penuh"}, {"reports"}, {"reports", "cost"}, {"pembukuan"}, {"expenses"}, {"salary"}, {"hpp"}, {"inventory", "txEdit"}, {}};
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < cases.length; i++) {
            SyncPerms p = cases[i].length == 1 && SyncPerms.PRESETS.containsKey(cases[i][0]) ? SyncPerms.preset(cases[i][0]) : SyncPerms.of(Arrays.asList(cases[i]));
            if (i > 0) sb.append(',');
            sb.append("{\"keys\":").append(p.json()).append(",\"read\":[");
            for (int j = 0; j < stores.length; j++) sb.append(j > 0 ? "," : "").append(p.canRead(stores[j]));
            sb.append("],\"write\":[");
            for (int j = 0; j < stores.length; j++) sb.append(j > 0 ? "," : "").append(p.canWrite(stores[j]));
            sb.append("],\"cost\":").append(p.cost()).append('}');
        }
        System.out.println(sb.append(']'));
    }
}
