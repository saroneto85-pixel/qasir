package id.kasmini.pos.sync;

import androidx.annotation.NonNull;
import androidx.room.Entity;
import androidx.room.PrimaryKey;

/** Pengaturan server: identitas toko, kode pairing, nomor perangkat berikutnya. */
@Entity(tableName = "sync_meta")
public class SyncMetaEntity {
    @PrimaryKey @NonNull public String k = "";
    public String v;
}
