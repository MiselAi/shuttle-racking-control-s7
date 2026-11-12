package expo.modules.isotcp

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.DataInputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

// Plain TCP for ISO-on-TCP (S7): one TPKT frame out, one complete TPKT frame back.
class IsoTcpModule : Module() {
  private val sockets = ConcurrentHashMap<Int, Socket>()
  private val nextId = AtomicInteger(1)

  private fun closeQuietly(s: Socket?) {
    try {
      s?.close()
    } catch (_: Exception) {
    }
  }

  override fun definition() = ModuleDefinition {
    Name("IsoTcp")

    AsyncFunction("connect") Coroutine { host: String, port: Int, timeoutMs: Int ->
      withContext(Dispatchers.IO) {
        val s = Socket()
        try {
          s.tcpNoDelay = true
          s.connect(InetSocketAddress(host, port), timeoutMs)
          s.soTimeout = timeoutMs
        } catch (e: Exception) {
          closeQuietly(s)
          throw CodedException("ERR_CONNECT", e.message ?: "Tidak bisa terhubung", e)
        }
        val id = nextId.getAndIncrement()
        sockets[id] = s
        id
      }
    }

    AsyncFunction("request") Coroutine { id: Int, frame: List<Int> ->
      withContext(Dispatchers.IO) {
        val s = sockets[id] ?: throw CodedException("ERR_CLOSED", "Koneksi sudah ditutup", null)
        try {
          val out = s.getOutputStream()
          out.write(ByteArray(frame.size) { frame[it].toByte() })
          out.flush()
          val input = DataInputStream(s.getInputStream())
          val header = ByteArray(4)
          input.readFully(header)
          val len = ((header[2].toInt() and 0xff) shl 8) or (header[3].toInt() and 0xff)
          if (header[0].toInt() != 3 || len < 7 || len > 4096) throw IllegalStateException("Frame ISO-TCP tidak valid")
          val rest = ByteArray(len - 4)
          input.readFully(rest)
          (header + rest).map { it.toInt() and 0xff }
        } catch (e: Exception) {
          sockets.remove(id)
          closeQuietly(s)
          throw CodedException("ERR_IO", e.message ?: "Koneksi terputus", e)
        }
      }
    }

    // Synchronous so it can break a read that is blocked on another thread.
    Function("close") { id: Int ->
      closeQuietly(sockets.remove(id))
    }

    OnDestroy {
      sockets.values.forEach { closeQuietly(it) }
      sockets.clear()
    }
  }
}
