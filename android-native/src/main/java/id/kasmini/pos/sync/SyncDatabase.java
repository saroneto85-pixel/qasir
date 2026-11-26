package id.kasmini.pos.sync;

import android.content.Context;

import androidx.room.Database;
import androidx.room.Room;
import androidx.room.RoomDatabase;

/** Database utama toko (Room) di Perangkat Utama / Kasir Induk. */
@Database(entities = {SyncRecordEntity.class, SyncHistoryEntity.class, SyncDeviceEntity.class, SyncMetaEntity.class},
        version = 1, exportSchema = false)
public abstract class SyncDatabase extends RoomDatabase {
    public abstract SyncDao dao();

    private static volatile SyncDatabase instance;

    public static SyncDatabase get(Context context) {
        if (instance == null) {
            synchronized (SyncDatabase.class) {
                if (instance == null) {
                    instance = Room.databaseBuilder(context.getApplicationContext(), SyncDatabase.class, "kasir_sync.db")
                            // Kueri kecil; pengaman agar tidak crash bila terpanggil dari thread utama.
                            .allowMainThreadQueries()
                            .build();
                }
            }
        }
        return instance;
    }
}
