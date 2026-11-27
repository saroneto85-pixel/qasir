package id.kasmini.pos.sync

import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.coroutines.CancellationException

/**
 * Klien REST perangkat tambahan (Ktor Client + OkHttp). Bila Perangkat Utama tidak terjangkau
 * di alamat terakhir, perangkat mencari ulang lewat NSD lalu menyimpan alamat barunya.
 */
object LanClient {
    data class Resp(val status: Int, val body: String)

    private val http: HttpClient by lazy {
        HttpClient(OkHttp) {
            expectSuccess = false
            install(HttpTimeout) {
                connectTimeoutMillis = 4_000
                requestTimeoutMillis = 40_000
                socketTimeoutMillis = 40_000
            }
        }
    }

    @Volatile private var lastDiscovery = 0L

    private fun base(host: String, port: Int) = "http://$host:$port"

    private fun HttpRequestBuilder.auth() {
        header("X-Kasir-Token", SyncRepository.token)
        header("X-Kasir-Store", SyncRepository.linkedStoreId)
    }

    suspend fun info(host: String, port: Int): Resp {
        val r = http.get(base(host, port) + "/api/info")
        return Resp(r.status.value, r.bodyAsText())
    }

    suspend fun pair(host: String, port: Int, body: String): Resp {
        val r = http.post(base(host, port) + "/api/pair") {
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        return Resp(r.status.value, r.bodyAsText())
    }

    suspend fun push(body: String): Resp = withRediscovery { host, port ->
        val r = http.post(base(host, port) + "/api/push") {
            auth()
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        Resp(r.status.value, r.bodyAsText())
    }

    suspend fun pull(since: Long, waitSec: Long): Resp = withRediscovery { host, port ->
        val r = http.get(base(host, port) + "/api/changes?since=$since&wait=$waitSec") { auth() }
        Resp(r.status.value, r.bodyAsText())
    }

    /** Mencoba alamat tersimpan; bila gagal tersambung, cari ulang Perangkat Utama lewat NSD (maks. tiap 10 detik). */
    private suspend fun withRediscovery(block: suspend (String, Int) -> Resp): Resp {
        val host = SyncRepository.host
        val port = SyncRepository.port
        try {
            if (host.isEmpty()) throw java.net.ConnectException("Alamat Perangkat Utama belum diketahui")
            return block(host, port)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            val now = System.currentTimeMillis()
            if (now - lastDiscovery < 10_000) throw e
            lastDiscovery = now
            val want = SyncRepository.linkedStoreId
            val found = NsdHelper.discover(SyncRepository.context(), 6_000, want).firstOrNull { it.storeId == want }
                ?: throw e
            if (found.host == host && found.port == port) throw e
            SyncRepository.host = found.host
            SyncRepository.port = found.port
            return block(found.host, found.port)
        }
    }
}
