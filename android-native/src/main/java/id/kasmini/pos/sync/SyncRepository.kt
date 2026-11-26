package id.kasmini.pos.sync

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull
import java.net.Inet4Address
import java.net.NetworkInterface
import java.util.UUID

/**
 * Titik pusat sinkronisasi di sisi native:
 *  - pengaturan perangkat (mode, token, alamat Perangkat Utama) di SharedPreferences;
 *  - SyncCore + Room untuk Perangkat Utama;
 *  - aliran nomor revisi terakhir untuk long-poll.
 */
object SyncRepository {
    const val MODE_STANDALONE = "standalone"
    const val MODE_SERVER = "server"
    const val MODE_CLIENT = "client"
    const val DEFAULT_PORT = 8686

    private const val PREFS = "kasir_lan_sync"

    @Volatile private var appContext: Context? = null
    private lateinit var prefs: SharedPreferences
    @Volatile private var coreRef: SyncCore? = null

    /** Revisi terakhir di Perangkat Utama; dipakai untuk membangunkan permintaan long-poll. */
    val latest = MutableStateFlow(0L)

    fun init(context: Context) {
        if (appContext != null) return
        synchronized(this) {
            if (appContext != null) return
            val app = context.applicationContext
            prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            appContext = app
        }
    }

    fun context(): Context = appContext ?: throw IllegalStateException("SyncRepository belum diinisialisasi")

    fun core(): SyncCore {
        coreRef?.let { return it }
        synchronized(this) {
            coreRef?.let { return it }
            val c = SyncCore(RoomSyncStore(SyncDatabase.get(context())))
            c.setListener { rev -> latest.value = rev }
            latest.value = c.latest()
            coreRef = c
            return c
        }
    }

    // ---------- pengaturan perangkat ----------

    private fun str(key: String, def: String = ""): String = prefs.getString(key, def) ?: def
    private fun set(key: String, value: String?) { prefs.edit().putString(key, value).apply() }

    var mode: String
        get() = str("mode", MODE_STANDALONE)
        set(v) = set("mode", v)

    val deviceId: String
        get() {
            var id = str("deviceId")
            if (id.isEmpty()) {
                id = UUID.randomUUID().toString().replace("-", "").substring(0, 16)
                prefs.edit().putString("deviceId", id).commit()
            }
            return id
        }

    var deviceName: String
        get() = str("deviceName")
        set(v) = set("deviceName", v)

    /** Kode perangkat tambahan (mis. K2) untuk nomor nota; kosong di Perangkat Utama. */
    var deviceCode: String
        get() = str("deviceCode")
        set(v) = set("deviceCode", v)

    var token: String
        get() = str("token")
        set(v) = set("token", v)

    /** storeId yang diikuti (perangkat tambahan). */
    var linkedStoreId: String
        get() = str("storeId")
        set(v) = set("storeId", v)

    var linkedStoreName: String
        get() = str("storeName")
        set(v) = set("storeName", v)

    var host: String
        get() = str("host")
        set(v) = set("host", v)

    var port: Int
        get() = prefs.getInt("port", DEFAULT_PORT)
        set(v) { prefs.edit().putInt("port", v).apply() }

    var serverAutoStart: Boolean
        get() = prefs.getBoolean("serverAutoStart", true)
        set(v) { prefs.edit().putBoolean("serverAutoStart", v).apply() }

    fun forgetLink() {
        prefs.edit().remove("token").remove("storeId").remove("storeName").remove("host").remove("deviceCode").apply()
    }

    // ---------- long-poll ----------

    suspend fun waitForChange(since: Long, timeoutMs: Long) {
        if (latest.value > since) return
        withTimeoutOrNull(timeoutMs) { latest.first { it > since } }
    }

    // ---------- jaringan ----------

    /** Alamat IPv4 perangkat ini di jaringan lokal (Wi-Fi / hotspot). */
    fun localIpv4(): List<String> {
        val out = ArrayList<String>()
        try {
            val ifaces = NetworkInterface.getNetworkInterfaces() ?: return out
            for (ni in ifaces.toList()) {
                if (!ni.isUp || ni.isLoopback) continue
                val name = ni.name ?: ""
                if (name.startsWith("rmnet") || name.startsWith("ccmni") || name.startsWith("dummy") || name.startsWith("tun")) continue
                for (addr in ni.inetAddresses.toList()) {
                    if (addr is Inet4Address && !addr.isLoopbackAddress) addr.hostAddress?.let { out.add(it) }
                }
            }
        } catch (_: Exception) {
        }
        return out
    }
}
