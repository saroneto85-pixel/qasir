package id.kasmini.pos.sync

import android.Manifest
import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Jembatan Capacitor untuk sinkronisasi LAN. Dipakai sync.js.
 * Di Perangkat Utama, push/pull langsung ke Room (tanpa HTTP); di perangkat tambahan lewat Ktor Client.
 */
@CapacitorPlugin(
    name = "LanSync",
    permissions = [Permission(alias = "notifications", strings = [Manifest.permission.POST_NOTIFICATIONS])]
)
class LanSyncPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun load() {
        SyncRepository.init(context)
    }

    override fun handleOnDestroy() {
        scope.cancel()
        super.handleOnDestroy()
    }

    private fun exec(call: PluginCall, block: suspend () -> JSObject) {
        scope.launch {
            try {
                call.resolve(block())
            } catch (e: CancellationException) {
                call.reject("Dibatalkan")
            } catch (e: Exception) {
                call.reject(e.message ?: e.toString(), e)
            }
        }
    }

    private fun state(): JSObject {
        val r = SyncRepository
        val o = JSObject()
        o.put("mode", r.mode)
        o.put("deviceId", r.deviceId)
        o.put("deviceName", r.deviceName)
        o.put("deviceCode", r.deviceCode)
        o.put("ips", MiniJson.stringify(r.localIpv4()))
        o.put("serverRunning", LanSyncService.running)
        o.put("serverPort", if (LanSyncService.running) LanSyncService.port else 0)
        o.put("serverError", LanSyncService.lastError ?: "")
        o.put("serverAutoStart", r.serverAutoStart)
        if (r.mode == SyncRepository.MODE_SERVER) {
            val core = r.core()
            o.put("storeId", core.storeId())
            o.put("storeName", core.storeName())
            o.put("pairCode", core.pairCode())
            o.put("latest", core.latest())
            o.put("records", core.countLive())
            o.put("devices", core.devicesJson())
        } else {
            o.put("storeId", r.linkedStoreId)
            o.put("storeName", r.linkedStoreName)
            o.put("host", r.host)
            o.put("port", r.port)
            o.put("paired", r.token.isNotEmpty())
        }
        return o
    }

    @PluginMethod
    fun getState(call: PluginCall) = exec(call) { state() }

    @PluginMethod
    fun setDeviceName(call: PluginCall) = exec(call) {
        SyncRepository.deviceName = (call.getString("name") ?: "").trim().take(40)
        state()
    }

    /** Perangkat Utama: nama toko untuk iklan NSD & layar pencarian. */
    @PluginMethod
    fun setStoreName(call: PluginCall) = exec(call) {
        if (SyncRepository.mode == SyncRepository.MODE_SERVER) SyncRepository.core().setStoreName(call.getString("name") ?: "")
        JSObject()
    }

    // ---------------- Perangkat Utama ----------------

    /** Mengisi database Room dari data perangkat ini (bertahap). reset=true pada potongan pertama. */
    @PluginMethod
    fun seed(call: PluginCall) = exec(call) {
        val body = call.getString("body") ?: "{\"records\":[]}"
        val reset = call.getBoolean("reset", false) ?: false
        val core = SyncRepository.core()
        val latest = core.seed(body, reset)
        call.getString("storeName")?.let { core.setStoreName(it) }
        JSObject().put("latest", latest)
    }

    @PluginMethod
    fun setMode(call: PluginCall) = exec(call) {
        val mode = call.getString("mode") ?: SyncRepository.MODE_STANDALONE
        if (mode !in listOf(SyncRepository.MODE_STANDALONE, SyncRepository.MODE_SERVER, SyncRepository.MODE_CLIENT))
            throw IllegalArgumentException("Mode tidak dikenal")
        if (mode != SyncRepository.MODE_SERVER && LanSyncService.running) LanSyncService.stop(context)
        if (mode == SyncRepository.MODE_STANDALONE) SyncRepository.forgetLink()
        if (mode == SyncRepository.MODE_SERVER) SyncRepository.deviceCode = ""
        SyncRepository.mode = mode
        state()
    }

    @PluginMethod
    fun startServer(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationsCallback")
            return
        }
        doStartServer(call)
    }

    @PermissionCallback
    private fun notificationsCallback(call: PluginCall) {
        // Tetap dijalankan walau izin notifikasi ditolak (notifikasi hanya tidak tampil).
        doStartServer(call)
    }

    private fun doStartServer(call: PluginCall) = exec(call) {
        if (SyncRepository.mode != SyncRepository.MODE_SERVER) throw IllegalStateException("Perangkat ini belum dijadikan Perangkat Utama")
        SyncRepository.serverAutoStart = true
        if (!LanSyncService.running) {
            LanSyncService.start(context)
            withTimeoutOrNull(8_000) {
                while (!LanSyncService.running && LanSyncService.lastError == null) delay(150)
            }
        }
        LanSyncService.lastError?.let { throw IllegalStateException("Server gagal berjalan: $it") }
        state()
    }

    @PluginMethod
    fun stopServer(call: PluginCall) = exec(call) {
        SyncRepository.serverAutoStart = call.getBoolean("keepAutoStart", false) ?: false
        LanSyncService.stop(context)
        withTimeoutOrNull(3_000) { while (LanSyncService.running) delay(100) }
        state()
    }

    @PluginMethod
    fun newPairCode(call: PluginCall) = exec(call) {
        SyncRepository.core().newPairCode()
        state()
    }

    @PluginMethod
    fun revokeDevice(call: PluginCall) = exec(call) {
        SyncRepository.core().revoke(call.getString("token") ?: "")
        state()
    }

    // ---------------- Perangkat tambahan ----------------

    /** Mencari Perangkat Utama lewat NSD, lalu memastikan identitasnya lewat GET /api/info. */
    @PluginMethod
    fun discover(call: PluginCall) = exec(call) {
        val timeout = (call.getInt("timeoutMs") ?: 5000).toLong().coerceIn(1500L, 15000L)
        val found = NsdHelper.discover(context, timeout)
        val checked = found.map { f ->
            scope.async {
                try {
                    val r = LanClient.info(f.host, f.port)
                    if (r.status != 200) return@async null
                    val info = MiniJson.parseObject(r.body)
                    if (info["app"] != "kasir-dbl") return@async null
                    "{\"host\":${MiniJson.quote(f.host)},\"port\":${f.port},\"serviceName\":${MiniJson.quote(f.serviceName)}," +
                        "\"storeId\":${MiniJson.quote(info["storeId"]?.toString() ?: f.storeId)}," +
                        "\"storeName\":${MiniJson.quote(info["storeName"]?.toString() ?: "")}}"
                } catch (e: Exception) {
                    null
                }
            }
        }.awaitAll().filterNotNull()
        JSObject().put("servers", "[" + checked.joinToString(",") + "]")
    }

    /** Memeriksa alamat manual (cadangan bila jaringan memblokir mDNS). */
    @PluginMethod
    fun probe(call: PluginCall) = exec(call) {
        val host = (call.getString("host") ?: "").trim()
        val port = call.getInt("port") ?: SyncRepository.DEFAULT_PORT
        val r = LanClient.info(host, port)
        if (r.status != 200) throw IllegalStateException("Perangkat Utama tidak menjawab (${r.status})")
        JSObject().put("info", r.body).put("host", host).put("port", port)
    }

    @PluginMethod
    fun pair(call: PluginCall) = exec(call) {
        val host = (call.getString("host") ?: "").trim()
        val port = call.getInt("port") ?: SyncRepository.DEFAULT_PORT
        val code = (call.getString("code") ?: "").trim()
        val name = (call.getString("name") ?: "").trim().take(40)
        if (host.isEmpty()) throw IllegalArgumentException("Alamat Perangkat Utama kosong")
        val body = "{\"code\":${MiniJson.quote(code)},\"name\":${MiniJson.quote(name)},\"deviceId\":${MiniJson.quote(SyncRepository.deviceId)}}"
        val r = LanClient.pair(host, port, body)
        val res = try { MiniJson.parseObject(r.body) } catch (e: Exception) { emptyMap<String, Any?>() }
        if (r.status != 200) throw IllegalStateException(res["error"]?.toString() ?: "Pairing gagal (${r.status})")
        SyncRepository.host = host
        SyncRepository.port = port
        SyncRepository.token = res["token"]?.toString() ?: ""
        SyncRepository.linkedStoreId = res["storeId"]?.toString() ?: ""
        SyncRepository.linkedStoreName = res["storeName"]?.toString() ?: ""
        SyncRepository.deviceCode = res["deviceCode"]?.toString() ?: ""
        SyncRepository.deviceName = name
        SyncRepository.mode = SyncRepository.MODE_CLIENT
        if (LanSyncService.running) LanSyncService.stop(context)
        state()
    }

    // ---------------- Pertukaran data (dipakai semua mode) ----------------

    @PluginMethod
    fun push(call: PluginCall) = exec(call) {
        val body = call.getString("body") ?: "{\"changes\":[]}"
        when (SyncRepository.mode) {
            SyncRepository.MODE_SERVER -> {
                try {
                    JSObject().put("status", 200).put("body", SyncRepository.core().push(SyncRepository.deviceId, body))
                } catch (e: SyncCore.HttpError) {
                    JSObject().put("status", e.status).put("body", e.json())
                }
            }
            SyncRepository.MODE_CLIENT -> {
                val r = LanClient.push(body)
                JSObject().put("status", r.status).put("body", r.body)
            }
            else -> throw IllegalStateException("Sinkronisasi tidak aktif")
        }
    }

    @PluginMethod
    fun pull(call: PluginCall) = exec(call) {
        val since = call.getString("since")?.toLongOrNull() ?: (call.getDouble("since") ?: 0.0).toLong()
        val wait = (call.getInt("wait") ?: 0).toLong().coerceIn(0L, 25L)
        when (SyncRepository.mode) {
            SyncRepository.MODE_SERVER -> {
                if (wait > 0) SyncRepository.waitForChange(since, wait * 1000)
                JSObject().put("status", 200).put("body", SyncRepository.core().pull(since, LanServer.MAX_PULL_BYTES))
            }
            SyncRepository.MODE_CLIENT -> {
                val r = LanClient.pull(since, wait)
                JSObject().put("status", r.status).put("body", r.body)
            }
            else -> throw IllegalStateException("Sinkronisasi tidak aktif")
        }
    }
}
