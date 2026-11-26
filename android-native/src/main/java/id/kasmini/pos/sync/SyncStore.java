package id.kasmini.pos.sync;

import java.util.List;
import java.util.concurrent.Callable;

/** Penyimpanan untuk SyncCore. Di Android diisi Room (RoomSyncStore); di pengujian memakai memori. */
public interface SyncStore {
    final class Rec {
        public String store;
        public String id;
        public String payload;   // JSON lengkap; null bila terhapus
        public boolean deleted;
        public long rev;
        public long updatedAt;
        public String deviceId;
    }

    final class Device {
        public String token;
        public String deviceId;
        public String name;
        public String code;
        public long createdAt;
        public long lastSeen;
        public boolean revoked;
    }

    Rec get(String store, String id);
    void put(Rec r);
    List<Rec> since(long rev, int limit);
    long maxRev();
    long countLive();

    String history(String store, String id, long rev);
    void putHistory(String store, String id, long rev, String slimPayload, long createdAt);
    int pruneHistory(long before);

    /** Menghapus semua record, riwayat, dan perangkat (dipakai saat menjadikan perangkat ini sumber data baru). */
    void clearAll();

    String meta(String key);
    void setMeta(String key, String value);

    Device deviceByToken(String token);
    Device deviceById(String deviceId);
    void putDevice(Device d);
    void deleteDevice(String token);
    List<Device> devices();

    <T> T inTransaction(Callable<T> fn) throws Exception;
}
