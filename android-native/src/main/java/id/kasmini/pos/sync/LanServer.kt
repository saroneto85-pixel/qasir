package id.kasmini.pos.sync

import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.cio.CIO
import io.ktor.server.engine.ApplicationEngine
import io.ktor.server.engine.embeddedServer
import io.ktor.server.request.receiveText
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.routing
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * REST API lokal Perangkat Utama (Ktor, engine CIO).
 *
 *  GET  /api/info                         identitas toko (tanpa token; dipakai saat pencarian)
 *  POST /api/pair      {code,name,deviceId}  pairing dengan kode 6 digit -> token
 *  POST /api/push      {changes:[...]}       kirim perubahan dari perangkat tambahan
 *  GET  /api/changes?since=N&wait=25         ambil perubahan (long-poll hingga 25 detik)
 *
 * Header untuk push/changes: X-Kasir-Token (token pairing), X-Kasir-Store (storeId).
 */
class LanServer(private val port: Int) {
    private var engine: ApplicationEngine? = null

    fun start() {
        // watchPaths kosong: tanpa pemantau berkas (tidak relevan di Android).
        val e = embeddedServer(CIO, port = port, host = "0.0.0.0", watchPaths = emptyList()) { module() }
        e.start(wait = false)
        engine = e
    }

    fun stop() {
        try { engine?.stop(300, 1500) } catch (_: Exception) {}
        engine = null
    }

    private fun Application.module() {
        routing {
            get("/api/info") {
                call.respondText(SyncRepository.core().infoJson(), ContentType.Application.Json)
            }
            post("/api/pair") {
                call.json {
                    val body = call.receiveText()
                    withContext(Dispatchers.IO) { SyncRepository.core().pair(body) }
                }
            }
            post("/api/push") {
                call.json {
                    val device = call.authorize()
                    val body = call.receiveText()
                    withContext(Dispatchers.IO) { SyncRepository.core().push(device.deviceId, body) }
                }
            }
            get("/api/changes") {
                call.json {
                    call.authorize()
                    val since = call.request.queryParameters["since"]?.toLongOrNull() ?: 0L
                    val wait = (call.request.queryParameters["wait"]?.toLongOrNull() ?: 0L).coerceIn(0L, 25L)
                    if (wait > 0) SyncRepository.waitForChange(since, wait * 1000)
                    withContext(Dispatchers.IO) { SyncRepository.core().pull(since, MAX_PULL_BYTES) }
                }
            }
        }
    }

    private fun ApplicationCall.authorize(): SyncStore.Device =
        SyncRepository.core().auth(request.headers["X-Kasir-Token"], request.headers["X-Kasir-Store"])

    private suspend fun ApplicationCall.json(block: suspend () -> String) {
        try {
            respondText(block(), ContentType.Application.Json)
        } catch (e: SyncCore.HttpError) {
            respondText(e.json(), ContentType.Application.Json, HttpStatusCode.fromValue(e.status))
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            val msg = MiniJson.quote(e.message ?: e.toString())
            respondText("{\"error\":$msg}", ContentType.Application.Json, HttpStatusCode.InternalServerError)
        }
    }

    companion object {
        const val MAX_PULL_BYTES = 1_500_000
    }
}
