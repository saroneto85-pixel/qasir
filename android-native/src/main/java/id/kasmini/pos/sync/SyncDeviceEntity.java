package id.kasmini.pos.sync;

import androidx.annotation.NonNull;
import androidx.room.Entity;
import androidx.room.Index;
import androidx.room.PrimaryKey;

/** Perangkat tambahan yang sudah dipasangkan (pairing) ke Perangkat Utama. */
@Entity(tableName = "sync_devices", indices = {@Index("deviceId")})
public class SyncDeviceEntity {
    @PrimaryKey @NonNull public String token = "";
    public String deviceId;
    public String name;
    public String code;
    public long createdAt;
    public long lastSeen;
    public boolean revoked;
}
