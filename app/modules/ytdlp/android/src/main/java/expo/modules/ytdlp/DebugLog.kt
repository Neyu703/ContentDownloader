package expo.modules.ytdlp

import android.content.Context
import android.os.Build
import java.io.File
import java.text.SimpleDateFormat
import java.util.Locale

// Large enough to hold several full jobs' raw yt-dlp transcripts (every output line, not just
// phase transitions) at once — a single job's output is typically well under 1000 lines.
private const val MAX_LINES = 5000

/**
 * In-memory ring buffer capturing setup/job phase transitions, every raw yt-dlp output line, and
 * full stack traces, so a crash or a stuck download can be sent back as one complete, traceable
 * report instead of debugged blind — there is no way to pull logcat from a device that only
 * Herbert (not this laptop) has physical access to.
 */
object DebugLog {
    private val lines = ArrayDeque<String>()
    private val lock = Any()
    private val timeFormat = SimpleDateFormat("HH:mm:ss.SSS", Locale.US)
    private var deviceInfoLogged = false

    fun logDeviceInfoOnce(context: Context) {
        if (deviceInfoLogged) return
        deviceInfoLogged = true
        val appContext = context.applicationContext
        val versionName = try {
            appContext.packageManager.getPackageInfo(appContext.packageName, 0).versionName
        } catch (error: Throwable) {
            null
        }
        add(
            "device: ${Build.MANUFACTURER} ${Build.MODEL}, Android ${Build.VERSION.RELEASE} " +
                "(API ${Build.VERSION.SDK_INT}), ABI ${Build.SUPPORTED_ABIS.firstOrNull()}, app $versionName"
        )
    }

    fun add(message: String) {
        val timestamp = timeFormat.format(java.util.Date())
        synchronized(lock) {
            lines.addLast("[$timestamp] $message")
            while (lines.size > MAX_LINES) lines.removeFirst()
        }
    }

    fun addError(context: String, error: Throwable) {
        add("$context\n${error.stackTraceToString()}")
    }

    fun snapshot(): String = synchronized(lock) { lines.joinToString("\n") }

    /**
     * Writes the current log to a fixed-name file in the app cache and returns its absolute path.
     * A fixed name (not one per call) keeps the cache from accumulating a new file on every send.
     */
    fun writeToFile(context: Context): String {
        val file = File(context.applicationContext.cacheDir, "ytdlp-debug-log.txt")
        file.writeText(snapshot())
        return file.absolutePath
    }
}
