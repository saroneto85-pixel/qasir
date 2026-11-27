package id.kasmini.pos.sync;

import androidx.annotation.NonNull;
import androidx.room.Entity;
import androidx.room.Index;

/** Versi lama (ramping) sebuah record, dipakai sebagai dasar penggabungan 3-arah. */
@Entity(tableName = "sync_history", primaryKeys = {"store", "id", "rev"}, indices = {@Index("createdAt")})
public class SyncHistoryEntity {
    @NonNull public String store = "";
    @NonNull public String id = "";
    public long rev;
    public String payload;
    public long createdAt;
}
