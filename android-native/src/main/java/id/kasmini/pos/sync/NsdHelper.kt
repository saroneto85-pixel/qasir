package id.kasmini.pos.sync

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.util.Log
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeoutOrNull
import java.net.Inet4Address
import java.util.concurrent.ConcurrentHashMap

/**
 * Network Service Discovery (mDNS / DNS-SD): Perangkat Utama mengiklankan layanan
 * "_kasirdbl._tcp" di Wi-Fi toko; perangkat tambahan menemukannya tanpa mengetik IP.
 */
object NsdHelper {
    const val SERVICE_TYPE = "_kasirdbl._tcp"
    private const val TAG = "KasirNsd"

    data class Found(val serviceName: String, val host: String, val port: Int, val storeId: String)

    class Registration internal constructor(
        private val nsd: NsdManager,
        private val listener: NsdManager.RegistrationListener
    ) {
        @Volatile var registeredName: String? = null
        fun unregister() {
            try { nsd.unregisterService(listener) } catch (e: Exception) { Log.w(TAG, "unregister", e) }
        }
    }

    fun register(context: Context, name: String, port: Int, storeId: String): Registration {
        val nsd = context.getSystemService(Context.NSD_SERVICE) as NsdManager
        val info = NsdServiceInfo()
        info.serviceName = name
        info.serviceType = SERVICE_TYPE
        info.port = port
        info.setAttribute("sid", storeId)
        info.setAttribute("v", SyncCore.PROTO.toString())
        lateinit var reg: Registration
        val listener = object : NsdManager.RegistrationListener {
            override fun onServiceRegistered(serviceInfo: NsdServiceInfo) {
                reg.registeredName = serviceInfo.serviceName
                Log.i(TAG, "Terdaftar sebagai ${serviceInfo.serviceName}")
            }
            override fun onRegistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                Log.w(TAG, "Pendaftaran NSD gagal: $errorCode")
            }
            override fun onServiceUnregistered(serviceInfo: NsdServiceInfo) {}
            override fun onUnregistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {}
        }
        reg = Registration(nsd, listener)
        nsd.registerService(info, NsdManager.PROTOCOL_DNS_SD, listener)
        return reg
    }

    /**
     * Mencari Perangkat Utama di jaringan. Bila [wantStoreId] diisi, pencarian selesai lebih cepat
     * begitu toko tersebut ditemukan.
     */
    suspend fun discover(context: Context, timeoutMs: Long, wantStoreId: String? = null): List<Found> {
        val nsd = context.getSystemService(Context.NSD_SERVICE) as NsdManager
        val found = ConcurrentHashMap<String, Found>()
        val done = CompletableDeferred<Unit>()
        val queue = ArrayDeque<NsdServiceInfo>()
        val lock = Any()
        var resolving = false

        fun next() {
            val target: NsdServiceInfo
            synchronized(lock) {
                if (resolving || queue.isEmpty()) return
                resolving = true
                target = queue.removeFirst()
            }
            try {
                @Suppress("DEPRECATION")
                nsd.resolveService(target, object : NsdManager.ResolveListener {
                    override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                        synchronized(lock) { resolving = false }
                        next()
                    }

                    override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                        @Suppress("DEPRECATION")
                        val addr = serviceInfo.host
                        val sid = serviceInfo.attributes["sid"]?.let { String(it, Charsets.UTF_8) } ?: ""
                        if (addr is Inet4Address) {
                            val host = addr.hostAddress ?: ""
                            if (host.isNotEmpty()) {
                                found[serviceInfo.serviceName] = Found(serviceInfo.serviceName, host, serviceInfo.port, sid)
                                if (wantStoreId != null && wantStoreId == sid) done.complete(Unit)
                            }
                        }
                        synchronized(lock) { resolving = false }
                        next()
                    }
                })
            } catch (e: Exception) {
                Log.w(TAG, "resolve", e)
                synchronized(lock) { resolving = false }
            }
        }

        val listener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) {}
            override fun onDiscoveryStopped(serviceType: String) {}
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                Log.w(TAG, "Pencarian gagal dimulai: $errorCode")
                done.complete(Unit)
            }
            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
            override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                if (!serviceInfo.serviceType.contains("_kasirdbl")) return
                synchronized(lock) { queue.addLast(serviceInfo) }
                next()
            }
            override fun onServiceLost(serviceInfo: NsdServiceInfo) {}
        }

        try {
            nsd.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
        } catch (e: Exception) {
            Log.w(TAG, "discoverServices", e)
            return emptyList()
        }
        try {
            withTimeoutOrNull(timeoutMs) { done.await() }
        } finally {
            try { nsd.stopServiceDiscovery(listener) } catch (_: Exception) {}
        }
        return found.values.toList()
    }
}
