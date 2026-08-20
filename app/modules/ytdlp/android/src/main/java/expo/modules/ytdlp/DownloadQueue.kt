package expo.modules.ytdlp

import android.content.Context
import android.util.Log
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit
import java.io.File
import java.util.UUID

private const val TAG = "YtdlpQueue"

/**
 * Downloads are network bound, the ffmpeg step is CPU bound. Two at a time keeps the device busy
 * without making every single download noticeably slower.
 */
private const val MAX_PARALLEL = 2

private const val OUTPUT_DIR_NAME = "ytdlp"

private val YOUTUBE_HOSTS = setOf(
    "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"
)

/** Mirrors isValidYoutubeUrl() in server/src/validate.ts. */
private fun isValidYoutubeUrl(url: String): Boolean {
    val uri = try {
        android.net.Uri.parse(url)
    } catch (error: Throwable) {
        return false
    }
    val scheme = uri.scheme?.lowercase()
    if (scheme != "http" && scheme != "https") return false
    return YOUTUBE_HOSTS.contains(uri.host?.lowercase())
}

/**
 * Owns every download, independent of whether any UI is attached. Lives in the application process,
 * kept alive by [DownloadService] while work is pending, so downloads survive leaving the app.
 */
object DownloadQueue {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val slots = Semaphore(MAX_PARALLEL)
    private val setupMutex = Mutex()
    private val lock = Any()

    private val jobs = mutableListOf<DownloadJob>()
    private val coroutines = mutableMapOf<String, kotlinx.coroutines.Job>()

    @Volatile
    var setupPhase: SetupPhase = SetupPhase.IDLE
        private set

    @Volatile
    var setupMessage: String = ""
        private set

    @Volatile
    var ytdlpVersion: String? = null
        private set

    /** Bumped on every state change; collectors re-read [snapshot]. StateFlow conflates for us. */
    private val _revision = MutableStateFlow(0L)
    val revision: StateFlow<Long> = _revision.asStateFlow()

    fun snapshot(): Map<String, Any?> {
        val list = synchronized(lock) { jobs.map { it.toMap() } }
        return mapOf(
            "setup" to mapOf(
                "phase" to setupPhase.jsName,
                "message" to setupMessage,
                "ytdlpVersion" to ytdlpVersion
            ),
            "jobs" to list
        )
    }

    fun hasPendingWork(): Boolean {
        val busySetup = setupPhase == SetupPhase.PREPARING || setupPhase == SetupPhase.UPDATING
        val busyJobs = synchronized(lock) { jobs.any { !it.phase.isFinished } }
        return busySetup || busyJobs
    }

    fun activeJob(): DownloadJob? = synchronized(lock) {
        jobs.firstOrNull { it.phase != JobPhase.QUEUED && !it.phase.isFinished }
    }

    fun queuedCount(): Int = synchronized(lock) { jobs.count { it.phase == JobPhase.QUEUED } }

    /**
     * Unpacks Python/ffmpeg and pulls the newest yt-dlp from the nightly channel. Safe to call
     * repeatedly, the real work happens once per process.
     */
    suspend fun prepare(context: Context) {
        val appContext = context.applicationContext
        DebugLog.logDeviceInfoOnce(appContext)
        setupMutex.withLock {
            if (setupPhase == SetupPhase.READY) return
            try {
                setSetup(SetupPhase.PREPARING, "Bereite yt-dlp vor…")
                YoutubeDL.getInstance().init(appContext)
                FFmpeg.getInstance().init(appContext)
                ytdlpVersion = YoutubeDL.getInstance().version(appContext)

                setSetup(SetupPhase.UPDATING, "Suche nach yt-dlp-Update…")
                try {
                    YoutubeDL.getInstance()
                        .updateYoutubeDL(appContext, YoutubeDL.UpdateChannel.NIGHTLY)
                    ytdlpVersion = YoutubeDL.getInstance().version(appContext)
                } catch (updateError: Throwable) {
                    // Offline or GitHub unreachable: the bundled binary still works.
                    Log.w(TAG, "yt-dlp update skipped", updateError)
                    DebugLog.addError("yt-dlp update skipped (bundled binary still used)", updateError)
                }

                setSetup(SetupPhase.READY, "yt-dlp ${ytdlpVersion ?: "?"} bereit")
            } catch (error: Throwable) {
                DebugLog.addError("setup failed", error)
                setSetup(SetupPhase.FAILED, describeError(error))
                throw error
            }
        }
    }

    fun enqueue(context: Context, url: String, format: String, quality: String): String {
        val appContext = context.applicationContext
        val job = DownloadJob(UUID.randomUUID().toString(), url, format, quality)
        synchronized(lock) { jobs.add(job) }
        touch()

        DownloadService.start(appContext)

        val coroutine = scope.launch {
            slots.withPermit { runJob(appContext, job) }
        }
        synchronized(lock) { coroutines[job.id] = coroutine }
        return job.id
    }

    fun cancel(id: String) {
        val job = synchronized(lock) { jobs.firstOrNull { it.id == id } } ?: return
        if (job.phase.isFinished) return

        val now = System.currentTimeMillis()
        job.phase = JobPhase.CANCELLED
        job.finishedAt = now
        job.updatedAt = now

        // Kills the running yt-dlp process; a queued job is stopped by cancelling its coroutine.
        scope.launch { runCatching { YoutubeDL.getInstance().destroyProcessById(id) } }
        synchronized(lock) {
            coroutines.remove(id)?.cancel()
            // Removed immediately rather than left sitting in the list until "Fertige entfernen".
            jobs.remove(job)
        }
        touch()
    }

    fun cancelAll() {
        val ids = synchronized(lock) { jobs.filter { !it.phase.isFinished }.map { it.id } }
        ids.forEach { cancel(it) }
    }

    fun clearFinished() {
        val removed = synchronized(lock) {
            val finished = jobs.filter { it.phase.isFinished }
            jobs.removeAll(finished)
            finished
        }
        removed.forEach { job -> job.filePath?.let { runCatching { File(it).delete() } } }
        touch()
    }

    private suspend fun runJob(context: Context, job: DownloadJob) {
        if (job.phase == JobPhase.CANCELLED) return
        try {
            if (!isValidYoutubeUrl(job.url)) {
                throw IllegalArgumentException("Ungültiger Link – nur YouTube wird unterstützt.")
            }
            prepare(context)
            if (job.phase == JobPhase.CANCELLED) return

            job.startedAt = System.currentTimeMillis()
            advance(job, JobPhase.FETCHING_INFO)
            job.title = fetchTitle(job)
            if (job.phase == JobPhase.CANCELLED) return

            val ext = if (job.format == "audio") "mp3" else "mp4"
            job.ext = ext
            val outputDir = File(context.cacheDir, OUTPUT_DIR_NAME).apply { mkdirs() }
            advance(job, JobPhase.DOWNLOADING)

            val request = buildRequest(job, File(outputDir, "${job.id}.%(ext)s").absolutePath)
            YoutubeDL.getInstance().execute(request, job.id, false) { progress, eta, line ->
                onOutput(job, progress, eta, line)
            }

            val produced = File(outputDir, "${job.id}.$ext")
            if (!produced.exists()) {
                throw IllegalStateException("yt-dlp hat keine Datei erzeugt.")
            }
            // yt-dlp names the file by job id (a UUID); rename to the video title so both the
            // share sheet and the save-to-Downloads flow offer a real, human filename.
            job.filePath = renameToTitledFile(produced, job.title ?: job.url, ext).absolutePath
            job.progress = 100.0
            job.etaSeconds = 0
            advance(job, JobPhase.DONE)
        } catch (cancelled: YoutubeDL.CanceledException) {
            advance(job, JobPhase.CANCELLED)
        } catch (cancelled: CancellationException) {
            advance(job, JobPhase.CANCELLED)
            throw cancelled
        } catch (error: Throwable) {
            Log.e(TAG, "job ${job.id} failed", error)
            DebugLog.addError("job ${job.id} (${job.url}) failed", error)
            job.error = describeError(error)
            advance(job, JobPhase.ERROR)
        } finally {
            if (job.finishedAt == null) job.finishedAt = System.currentTimeMillis()
            synchronized(lock) { coroutines.remove(job.id) }
            touch()
        }
    }

    /**
     * The --print option implies --simulate, so this only resolves the name. Much cheaper than
     * dumping the full metadata JSON, and cancellable because it runs under the process id of the job.
     */
    private fun fetchTitle(job: DownloadJob): String {
        val request = YoutubeDLRequest(job.url)
            .addOption("--no-playlist")
            .addOption("--no-warnings")
            .addOption("--print", "title")
        val output = YoutubeDL.getInstance().execute(request, job.id, false, null).out
        return output.lines().map { it.trim() }.lastOrNull { it.isNotEmpty() } ?: job.url
    }

    /** Mirrors sanitizeFilename() in server/src/index.ts and app/App.tsx. */
    private fun sanitizeFilename(name: String): String {
        val cleaned = name.replace(Regex("[\\\\/:*?\"<>|]"), "").trim()
        return cleaned.ifEmpty { "download" }
    }

    /** Renames the yt-dlp output (named by job id) to a human filename, deduping on collision. */
    private fun renameToTitledFile(source: File, title: String, ext: String): File {
        val base = sanitizeFilename(title)
        var candidate = File(source.parentFile, "$base.$ext")
        var suffix = 2
        while (candidate.exists() && candidate != source) {
            candidate = File(source.parentFile, "$base ($suffix).$ext")
            suffix++
        }
        return if (candidate == source || source.renameTo(candidate)) candidate else source
    }

    /** Mirrors buildFormatArgs() in server/src/youtube.ts so app and web behave identically. */
    private fun buildRequest(job: DownloadJob, outputTemplate: String): YoutubeDLRequest {
        val request = YoutubeDLRequest(job.url)
        if (job.format == "audio") {
            request.addOption("-f", "bestaudio/best")
            request.addOption("-x")
            request.addOption("--audio-format", "mp3")
            request.addOption("--audio-quality", "${job.quality}K")
        } else {
            val heightFilter = if (job.quality == "best") "" else "[height<=${job.quality}]"
            request.addOption(
                "-f",
                "bestvideo$heightFilter+bestaudio/best$heightFilter/best$heightFilter"
            )
            request.addOption("--merge-output-format", "mp4")
        }
        request.addOption("--no-playlist")
        request.addOption("--no-warnings")
        request.addOption("-o", outputTemplate)
        return request
    }

    private fun onOutput(job: DownloadJob, progress: Float, eta: Long, line: String) {
        if (job.phase.isFinished) return

        val trimmed = line.trim()
        if (trimmed.isNotEmpty()) job.lastLine = trimmed
        if (progress >= 0f) job.progress = progress.toDouble()
        if (eta >= 0L) job.etaSeconds = eta

        // Video downloads emit two [download] passes before merging, so post-processing phases
        // must never fall back to DOWNLOADING.
        when {
            trimmed.contains("[Merger]") -> job.phase = JobPhase.MERGING
            trimmed.contains("[ExtractAudio]") || trimmed.contains("[ffmpeg]") ->
                job.phase = JobPhase.CONVERTING
        }

        job.updatedAt = System.currentTimeMillis()
        touch()
    }

    private fun advance(job: DownloadJob, phase: JobPhase) {
        job.phase = phase
        job.updatedAt = System.currentTimeMillis()
        DebugLog.add("job ${job.id} -> ${phase.jsName}")
        touch()
    }

    private fun setSetup(phase: SetupPhase, message: String) {
        setupPhase = phase
        setupMessage = message
        DebugLog.add("setup -> ${phase.jsName}: $message")
        touch()
    }

    private fun touch() {
        _revision.value = _revision.value + 1
    }

    /**
     * yt-dlp surfaces YouTube's own "Sign in to confirm you're not a bot" gate verbatim, including
     * a raw stack of wiki links — not actionable for a user, since it requires real logged-in
     * cookies to bypass, not anything this app can retry or work around on its own. Mirrors
     * userFacingErrorMessage() in server/src/utils.ts. The full technical error still reaches
     * DebugLog.addError() separately (called with the raw Throwable before this runs), so nothing
     * is lost for debugging.
     */
    private fun describeError(error: Throwable): String {
        val raw = describeErrorRaw(error)
        return if (Regex("sign in to confirm you.{1,2}re not a bot", RegexOption.IGNORE_CASE).containsMatchIn(raw)) {
            "Dieses Video verlangt eine YouTube-Anmeldung und kann nicht heruntergeladen werden."
        } else {
            raw
        }
    }

    /** yt-dlp errors carry the whole stderr; the last real line is the part a user can act on. */
    private fun describeErrorRaw(error: Throwable): String {
        val raw = error.message?.trim().orEmpty()
        if (raw.isEmpty()) {
            // Wrapper exceptions (ExceptionInInitializerError, InvocationTargetException, ...)
            // carry no message of their own — the actionable detail is in the innermost cause.
            var cause = error.cause
            while (cause != null) {
                val causeMessage = cause.message?.trim()
                if (!causeMessage.isNullOrEmpty()) {
                    return "${cause::class.java.simpleName}: $causeMessage"
                }
                cause = cause.cause
            }
            return error::class.java.simpleName
        }
        return raw.lines()
            .map { it.trim() }
            .lastOrNull { it.isNotEmpty() }
            ?.removePrefix("ERROR: ")
            ?: raw
    }
}
