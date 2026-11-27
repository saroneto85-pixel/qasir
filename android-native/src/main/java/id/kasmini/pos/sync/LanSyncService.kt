package id.kasmini.pos.sync

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.net.ServerSocket

/**
 * Foreground Service Perangkat Utama: menjalankan server Ktor dan iklan NSD di latar belakang,
 * sehingga perangkat tambahan tetap bisa sinkron walau layar kasir induk mati / aplikasi di belakang.
 */
class LanSyncService : Service() {
    companion object {
        private const val TAG = "KasirLanService"
        private const val CHANNEL_ID = "kasir_lan_sync"
        private const val NOTIF_ID = 8686

        @Volatile var running = false
            private set
        @Volatile var port = 0
            private set
        @Volatile var lastError: String? = null
            private set

        fun start(context: Context) {
            lastError = null
            ContextCompat.startForegroundService(context, Intent(context, LanSyncService::class.java))
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, LanSyncService::class.java))
        }
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var server: LanServer? = null
    private var registration: NsdHelper.Registration? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null
    @Volatile private var starting = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        SyncRepository.init(this)
        createChannel()
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE else 0
        ServiceCompat.startForeground(this, NOTIF_ID, notification("Menyiapkan server toko…"), type)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (SyncRepository.mode != SyncRepository.MODE_SERVER) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (server == null && !starting) {
            starting = true
            scope.launch { startServer() }
        }
        return START_STICKY
    }

    private fun startServer() {
        try {
            val core = SyncRepository.core()
            core.pruneHistory()
            val p = pickPort()
            val s = LanServer(p)
            s.start()
            server = s
            port = p
            val name = ("KASIR " + core.storeName().ifBlank { "Toko" }).take(40)
            registration = NsdHelper.register(this, name, p, core.storeId())
            acquireLocks()
            running = true
            lastError = null
            val ip = SyncRepository.localIpv4().firstOrNull() ?: "-"
            updateNotification("Server toko aktif · $ip:$p")
            Log.i(TAG, "Server aktif di port $p")
        } catch (e: Exception) {
            Log.e(TAG, "Server gagal dijalankan", e)
            lastError = e.message ?: e.toString()
            running = false
            stopSelf()
        } finally {
            starting = false
        }
    }

    /** Port tetap 8686 (cocok dengan IP statis); bila terpakai, coba 8687–8690. */
    private fun pickPort(): Int {
        for (p in SyncRepository.DEFAULT_PORT..SyncRepository.DEFAULT_PORT + 4) {
            try {
                ServerSocket(p).use { }
                return p
            } catch (_: Exception) {
            }
        }
        throw IllegalStateException("Port 8686–8690 sedang dipakai aplikasi lain")
    }

    private fun acquireLocks() {
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "kasir:lan-server").apply {
                setReferenceCounted(false)
                acquire()
            }
            val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            @Suppress("DEPRECATION")
            wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "kasir:lan-server").apply {
                setReferenceCounted(false)
                acquire()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Kunci daya/Wi-Fi gagal", e)
        }
    }

    override fun onDestroy() {
        running = false
        port = 0
        registration?.unregister()
        registration = null
        server?.stop()
        server = null
        try { wakeLock?.release() } catch (_: Exception) {}
        try { wifiLock?.release() } catch (_: Exception) {}
        scope.cancel()
        super.onDestroy()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val ch = NotificationChannel(CHANNEL_ID, "Server toko (Wi-Fi)", NotificationManager.IMPORTANCE_LOW)
            ch.setDescription("Menjaga sinkronisasi data antar perangkat di toko")
            nm.createNotificationChannel(ch)
        }
    }

    private fun notification(text: String): Notification {
        val launch = packageManager.getLaunchIntentForPackage(packageName)
        val pi = if (launch != null) PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT) else null
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("KASIR · Perangkat Utama")
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pi)
            .build()
    }

    private fun updateNotification(text: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIF_ID, notification(text))
    }
}
