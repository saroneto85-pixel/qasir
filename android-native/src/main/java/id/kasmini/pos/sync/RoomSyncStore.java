package id.kasmini.pos.sync;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;

/** Implementasi SyncStore di atas Room. */
public final class RoomSyncStore implements SyncStore {
    private final SyncDatabase db;
    private final SyncDao dao;

    public RoomSyncStore(SyncDatabase db) {
        this.db = db;
        this.dao = db.dao();
    }

    private static Rec toRec(SyncRecordEntity e) {
        if (e == null) return null;
        Rec r = new Rec();
        r.store = e.store; r.id = e.id; r.payload = e.payload; r.deleted = e.deleted;
        r.rev = e.rev; r.updatedAt = e.updatedAt; r.deviceId = e.deviceId;
        return r;
    }

    private static Device toDevice(SyncDeviceEntity e) {
        if (e == null) return null;
        Device d = new Device();
        d.token = e.token; d.deviceId = e.deviceId; d.name = e.name; d.code = e.code;
        d.createdAt = e.createdAt; d.lastSeen = e.lastSeen; d.revoked = e.revoked;
        return d;
    }

    @Override public Rec get(String store, String id) { return toRec(dao.get(store, id)); }

    @Override public void put(Rec r) {
        SyncRecordEntity e = new SyncRecordEntity();
        e.store = r.store; e.id = r.id; e.payload = r.payload; e.deleted = r.deleted;
        e.rev = r.rev; e.updatedAt = r.updatedAt; e.deviceId = r.deviceId;
        dao.upsert(e);
    }

    @Override public List<Rec> since(long rev, int limit) {
        List<Rec> out = new ArrayList<>();
        for (SyncRecordEntity e : dao.since(rev, limit)) out.add(toRec(e));
        return out;
    }

    @Override public long maxRev() { return dao.maxRev(); }
    @Override public long countLive() { return dao.countLive(); }
    @Override public String history(String store, String id, long rev) { return dao.history(store, id, rev); }

    @Override public void putHistory(String store, String id, long rev, String slimPayload, long createdAt) {
        SyncHistoryEntity h = new SyncHistoryEntity();
        h.store = store; h.id = id; h.rev = rev; h.payload = slimPayload; h.createdAt = createdAt;
        dao.insertHistory(h);
    }

    @Override public int pruneHistory(long before) { return dao.pruneHistory(before); }

    @Override public void clearAll() { dao.clearRecords(); dao.clearHistory(); dao.clearDevices(); }

    @Override public String meta(String key) { return dao.meta(key); }

    @Override public void setMeta(String key, String value) {
        SyncMetaEntity m = new SyncMetaEntity();
        m.k = key; m.v = value;
        dao.setMeta(m);
    }

    @Override public Device deviceByToken(String token) { return toDevice(dao.deviceByToken(token)); }
    @Override public Device deviceById(String deviceId) { return toDevice(dao.deviceById(deviceId)); }

    @Override public void putDevice(Device d) {
        SyncDeviceEntity e = new SyncDeviceEntity();
        e.token = d.token; e.deviceId = d.deviceId; e.name = d.name; e.code = d.code;
        e.createdAt = d.createdAt; e.lastSeen = d.lastSeen; e.revoked = d.revoked;
        dao.putDevice(e);
    }

    @Override public void deleteDevice(String token) { dao.deleteDevice(token); }

    @Override public List<Device> devices() {
        List<Device> out = new ArrayList<>();
        for (SyncDeviceEntity e : dao.devices()) out.add(toDevice(e));
        return out;
    }

    private static final class Wrapped extends RuntimeException {
        final Exception inner;
        Wrapped(Exception inner) { super(inner); this.inner = inner; }
    }

    @Override public <T> T inTransaction(final Callable<T> fn) throws Exception {
        try {
            return db.runInTransaction(new Callable<T>() {
                @Override public T call() {
                    try { return fn.call(); }
                    catch (RuntimeException e) { throw e; }
                    catch (Exception e) { throw new Wrapped(e); }
                }
            });
        } catch (Wrapped w) {
            throw w.inner;
        }
    }
}
