package id.kasmini.pos.sync;

import androidx.annotation.NonNull;
import androidx.room.Entity;
import androidx.room.Index;

/** Satu record data toko (produk, transaksi, dll.) di database utama Room. */
@Entity(tableName = "sync_records", primaryKeys = {"store", "id"}, indices = {@Index("rev")})
public class SyncRecordEntity {
    @NonNull public String store = "";
    @NonNull public String id = "";
    public String payload;
    public boolean deleted;
    public long rev;
    public long updatedAt;
    public String deviceId;
}
