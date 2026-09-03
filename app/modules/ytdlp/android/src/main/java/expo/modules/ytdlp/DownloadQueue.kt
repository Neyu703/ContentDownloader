package expo.modules.ytdlp

import android.content.Context
import android.util.Log
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID

private const val TAG = "YtdlpQueue"

/**
 * Downloads are network bound, the ffmpeg step is CPU bound. Two at a time keeps the device busy
 * without making every single download noticeably slower.
 */
private const val MAX_PARALLEL = 2

private const val OUTPUT_DIR_NAME = "ytdlp"

/** Total download attempts per job (including the first try) before a transient failure gives up. Mirrors MAX_ATTEMPTS in server/src/youtube.ts. */
private const val MAX_ATTEMPTS = 3
private const val RETRY_DELAY_MS = 2000L

/** How many playlist entries getPlaylistInfo() lists per call — mirrors PLAYLIST_PAGE_SIZE in server/src/youtube.ts. */
private const val PLAYLIST_PAGE_SIZE = 50

/** Characters not allowed in a filename on common filesystems. */
private val ILLEGAL_FILENAME_CHARS = Regex("[\\\\/:*?\"<>|]")

/** Joins title/thumbnail in a single --print template so fetchMetadata() stays one lightweight yt-dlp call. */
private const val METADATA_FIELD_SEPARATOR = "|||"

/** yt-dlp's phrasing for YouTube's "Sign in to confirm you're not a bot" gate. */
private val SIGN_IN_GATE_PATTERN = Regex("sign in to confirm you.{1,2}re not a bot", RegexOption.IGNORE_CASE)

/**
 * Owns every download, independent of whether any UI is attached. Lives in the application process,
 * kept alive by [DownloadService] while work is pending, so downloads survive leaving the app.
 */
object DownloadQueue {
    internal var engine: YtdlpEngine = RealYtdlpEngine()
    internal var ffmpeg: FfmpegEngine = RealFfmpegEngine()

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
                engine.init(appContext)
                ffmpeg.init(appContext)
                ytdlpVersion = engine.version(appContext)

                setSetup(SetupPhase.UPDATING, "Suche nach yt-dlp-Update…")
                try {
                    engine.updateYoutubeDL(appContext, YoutubeDL.UpdateChannel.NIGHTLY)
                    ytdlpVersion = engine.version(appContext)
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

    fun enqueue(
        context: Context,
        url: String,
        format: String,
        quality: String,
        groupId: String? = null,
        groupTitle: String? = null
    ): String {
        val appContext = context.applicationContext
        val job = DownloadJob(UUID.randomUUID().toString(), url, format, quality, groupId, groupTitle)
        synchronized(lock) { jobs.add(job) }
        touch()

        DownloadService.start(appContext)

        val coroutine = scope.launch {
            slots.withPermit { runJob(appContext, job) }
        }
        synchronized(lock) { coroutines[job.id] = coroutine }
        return job.id
    }

    private fun requireValidYoutubeUrl(url: String) {
        if (!isValidYoutubeUrl(url)) {
            throw IllegalArgumentException("Ungültiger Link – nur YouTube wird unterstützt.")
        }
    }

    /**
     * Lists one page of a playlist's entries (1-indexed, inclusive range), without downloading
     * anything. Mirrors getPlaylistInfo() in server/src/youtube.ts (same --flat-playlist
     * --dump-json flags, same bundled yt-dlp binary). Paged so the UI can virtualize/infinite-scroll
     * instead of enumerating an entire (potentially thousand-video) playlist upfront.
     */
    suspend fun getPlaylistInfo(
        context: Context,
        url: String,
        start: Int = 1,
        count: Int = PLAYLIST_PAGE_SIZE
    ): Map<String, Any?> = withContext(Dispatchers.IO) {
        requireValidYoutubeUrl(url)
        prepare(context.applicationContext)

        val request = YoutubeDLRequest(url)
            .addOption("--flat-playlist")
            .addOption("--dump-json")
            .addOption("--no-warnings")
            .addOption("--playlist-items", "$start-${start + count - 1}")
        val output = engine.execute(request, UUID.randomUUID().toString(), false, null).out
        val parsed = parsePlaylistJsonLines(output)

        val title = parsed.firstOrNull()?.playlistTitle() ?: "Playlist"
        val totalCount = parsed.firstOrNull()?.let { if (it.has("playlist_count")) it.optInt("playlist_count") else null }
        val entries = parsed.map { toEntryMap(it) }
        mapOf("title" to title, "entries" to entries, "totalCount" to totalCount)
    }

    fun cancel(id: String) {
        val job = synchronized(lock) { jobs.firstOrNull { it.id == id } } ?: return
        if (job.phase.isFinished) return

        val now = System.currentTimeMillis()
        job.phase = JobPhase.CANCELLED
        job.finishedAt = now
        job.updatedAt = now

        // Kills the running yt-dlp process; a queued job is stopped by cancelling its coroutine.
        scope.launch { runCatching { engine.destroyProcessById(id) } }
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

    internal suspend fun runJob(context: Context, job: DownloadJob) {
        if (job.phase == JobPhase.CANCELLED) return
        try {
            requireValidYoutubeUrl(job.url)
            prepare(context)
            if (job.phase == JobPhase.CANCELLED) return

            job.startedAt = System.currentTimeMillis()
            advance(job, JobPhase.FETCHING_INFO)
            val metadata = fetchMetadata(job)
            job.title = metadata.title
            job.thumbnail = metadata.thumbnail
            if (job.phase == JobPhase.CANCELLED) return

            val ext = if (job.format == "audio") "mp3" else "mp4"
            job.ext = ext
            val outputDir = File(context.cacheDir, OUTPUT_DIR_NAME).apply { mkdirs() }
            advance(job, JobPhase.DOWNLOADING)

            downloadWithRetry(job, outputDir, ext)
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
     * Runs the actual yt-dlp download, verifies a file was produced, renames it to the video title,
     * and records the resulting path on the job. Throws on failure — the caller (runJob) handles
     * cancellation/error routing.
     */
    internal fun downloadAndFinalize(job: DownloadJob, outputDir: File, ext: String) {
        val request = buildRequest(job, File(outputDir, "${job.id}.%(ext)s").absolutePath)
        engine.execute(request, job.id, false) { progress, eta, line ->
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
    }

    /**
     * Runs [downloadAndFinalize], retrying up to MAX_ATTEMPTS times on a transient failure (e.g.
     * HTTP 403 / PO-token issues) with a fixed delay in between. Mirrors downloadWithRetry() in
     * server/src/youtube.ts. Cancellation always propagates immediately, never retried.
     */
    private suspend fun downloadWithRetry(job: DownloadJob, outputDir: File, ext: String) {
        for (attempt in 1..MAX_ATTEMPTS) {
            if (attempt > 1) {
                job.lastLine = "Erneuter Versuch ($attempt/$MAX_ATTEMPTS)…"
                touch()
            }
            try {
                downloadAndFinalize(job, outputDir, ext)
                return
            } catch (cancelled: YoutubeDL.CanceledException) {
                throw cancelled
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Throwable) {
                if (attempt >= MAX_ATTEMPTS || !isRetryableError(error)) throw error
                DebugLog.add("job ${job.id} download attempt $attempt/$MAX_ATTEMPTS failed, retrying: ${describeErrorRaw(error)}")
                delay(RETRY_DELAY_MS)
            }
        }
    }

    /** The known-permanent sign-in gate is never worth retrying; every other failure is treated as transient. */
    internal fun isRetryableError(error: Throwable): Boolean = !isSignInGateError(describeErrorRaw(error))

    /**
     * The --print option implies --simulate, so this only resolves title/thumbnail without a real
     * download. Much cheaper than dumping the full metadata JSON, and cancellable because it runs
     * under the process id of the job. Both fields come back on one line (yt-dlp's own template
     * syntax), so the same "last non-empty line wins over any leading noise" heuristic still applies.
     */
    internal fun fetchMetadata(job: DownloadJob): JobMetadata {
        val request = YoutubeDLRequest(job.url)
            .addOption("--no-playlist")
            .addOption("--no-warnings")
            .addOption("--print", "%(title)s$METADATA_FIELD_SEPARATOR%(thumbnail)s")
        val output = engine.execute(request, job.id, false, null).out
        val line = nonEmptyTrimmedLines(output).lastOrNull() ?: return JobMetadata(job.url, null)
        val parts = line.split(METADATA_FIELD_SEPARATOR, limit = 2)
        val title = parts.getOrNull(0)?.takeIf(String::isNotBlank) ?: job.url
        val thumbnail = parts.getOrNull(1)?.takeIf { it.isNotBlank() && it != "NA" }
        return JobMetadata(title, thumbnail)
    }

    /** Mirrors sanitizeFilename() in server/src/index.ts and app/App.tsx. */
    internal fun sanitizeFilename(name: String): String {
        val cleaned = name.replace(ILLEGAL_FILENAME_CHARS, "").trim()
        return cleaned.ifEmpty { "download" }
    }

    /** Renames the yt-dlp output (named by job id) to a human filename, deduping on collision. */
    internal fun renameToTitledFile(source: File, title: String, ext: String): File {
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
    internal fun buildRequest(job: DownloadJob, outputTemplate: String): YoutubeDLRequest {
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

    internal fun onOutput(job: DownloadJob, progress: Float, eta: Long, line: String) {
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

    internal fun advance(job: DownloadJob, phase: JobPhase) {
        job.phase = phase
        job.updatedAt = System.currentTimeMillis()
        DebugLog.add("job ${job.id} -> ${phase.jsName}")
        touch()
    }

    internal fun setSetup(phase: SetupPhase, message: String) {
        setupPhase = phase
        setupMessage = message
        DebugLog.add("setup -> ${phase.jsName}: $message")
        touch()
    }

    internal fun touch() {
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
    internal fun describeError(error: Throwable): String {
        val raw = describeErrorRaw(error)
        return if (isSignInGateError(raw)) {
            "Dieses Video verlangt eine YouTube-Anmeldung und kann nicht heruntergeladen werden."
        } else {
            raw
        }
    }

    private fun isSignInGateError(message: String): Boolean = SIGN_IN_GATE_PATTERN.containsMatchIn(message)

    /** yt-dlp errors carry the whole stderr; the last real line is the part a user can act on. */
    internal fun describeErrorRaw(error: Throwable): String {
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
        // raw is already non-empty (checked above) and whole-string-trimmed, so it has at least
        // one non-whitespace character — nonEmptyTrimmedLines(raw) can never be empty here.
        return nonEmptyTrimmedLines(raw).last().removePrefix("ERROR: ")
    }
}
