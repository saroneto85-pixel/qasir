package id.kasmini.pos.sync;

import androidx.room.Dao;
import androidx.room.Insert;
import androidx.room.OnConflictStrategy;
import androidx.room.Query;

import java.util.List;

@Dao
public interface SyncDao {
    @Query("SELECT * FROM sync_records WHERE store = :store AND id = :id LIMIT 1")
    SyncRecordEntity get(String store, String id);

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    void upsert(SyncRecordEntity e);

    @Query("SELECT * FROM sync_records WHERE rev > :rev ORDER BY rev LIMIT :limit")
    List<SyncRecordEntity> since(long rev, int limit);

    @Query("SELECT IFNULL(MAX(rev), 0) FROM sync_records")
    long maxRev();

    @Query("SELECT COUNT(*) FROM sync_records WHERE deleted = 0")
    long countLive();

    @Query("SELECT payload FROM sync_history WHERE store = :store AND id = :id AND rev = :rev LIMIT 1")
    String history(String store, String id, long rev);

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    void insertHistory(SyncHistoryEntity h);

    @Query("DELETE FROM sync_history WHERE createdAt < :before")
    int pruneHistory(long before);

    @Query("DELETE FROM sync_records")
    void clearRecords();

    @Query("DELETE FROM sync_history")
    void clearHistory();

    @Query("DELETE FROM sync_devices")
    void clearDevices();

    @Query("SELECT v FROM sync_meta WHERE k = :k LIMIT 1")
    String meta(String k);

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    void setMeta(SyncMetaEntity m);

    @Query("SELECT * FROM sync_devices WHERE token = :token LIMIT 1")
    SyncDeviceEntity deviceByToken(String token);

    @Query("SELECT * FROM sync_devices WHERE deviceId = :deviceId LIMIT 1")
    SyncDeviceEntity deviceById(String deviceId);

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    void putDevice(SyncDeviceEntity d);

    @Query("DELETE FROM sync_devices WHERE token = :token")
    void deleteDevice(String token);

    @Query("SELECT * FROM sync_devices ORDER BY createdAt")
    List<SyncDeviceEntity> devices();
}
