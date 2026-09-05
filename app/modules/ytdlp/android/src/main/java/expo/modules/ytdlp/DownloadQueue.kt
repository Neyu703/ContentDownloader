package expo.modules.ytdlp

import android.content.Context
import android.util.Log
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import expo.modules.ytdlp.platforms.PLAYLIST_PAGE_SIZE
import expo.modules.ytdlp.platforms.Platform
import expo.modules.ytdlp.platforms.PlaylistCapablePlatform
import expo.modules.ytdlp.platforms.describeErrorRaw
import expo.modules.ytdlp.platforms.detectPlatform
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

/** Total download attempts per job (including the first try) before a transient failure gives up. Mirrors MAX_ATTEMPTS in server/src/platforms/BasePlatform.ts. */
private const val MAX_ATTEMPTS = 3
private const val RETRY_DELAY_MS = 2000L

/** Characters not allowed in a filename on common filesystems. */
private val ILLEGAL_FILENAME_CHARS = Regex("[\\\\/:*?\"<>|]")

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

    @Volatile
    var setupMessageParams: Map<String, Any?>? = null
        private set

    fun snapshot(): Map<String, Any?> {
        val list = synchronized(lock) { jobs.map { it.toMap() } }
        return mapOf(
            "setup" to mapOf(
                "phase" to setupPhase.jsName,
                "message" to setupMessage,
                "messageParams" to setupMessageParams,
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
                setSetup(SetupPhase.PREPARING, "setup.preparing")
                engine.init(appContext)
                ffmpeg.init(appContext)
                ytdlpVersion = engine.version(appContext)

                setSetup(SetupPhase.UPDATING, "setup.updating")
                try {
                    engine.updateYoutubeDL(appContext, YoutubeDL.UpdateChannel.NIGHTLY)
                    ytdlpVersion = engine.version(appContext)
                } catch (updateError: Throwable) {
                    // Offline or GitHub unreachable: the bundled binary still works.
                    Log.w(TAG, "yt-dlp update skipped", updateError)
                    DebugLog.addError("yt-dlp update skipped (bundled binary still used)", updateError)
                }

                setSetup(SetupPhase.READY, "setup.ready", mapOf("version" to (ytdlpVersion ?: "?")))
            } catch (error: Throwable) {
                DebugLog.addError("setup failed", error)
                setSetup(SetupPhase.FAILED, "errors.raw", mapOf("raw" to describeErrorRaw(error)))
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
        val job = DownloadJob(UUID.randomUUID().toString(), normalizeUrl(url), format, quality, groupId, groupTitle)
        synchronized(lock) { jobs.add(job) }
        touch()

        DownloadService.start(appContext)

        val coroutine = scope.launch {
            slots.withPermit { runJob(appContext, job) }
        }
        synchronized(lock) { coroutines[job.id] = coroutine }
        return job.id
    }

    /**
     * Lists one page of a playlist's entries (1-indexed, inclusive range), without downloading
     * anything. Throws if the URL isn't a supported platform, or the platform doesn't support
     * playlists at all.
     */
    suspend fun getPlaylistInfo(
        context: Context,
        url: String,
        start: Int = 1,
        count: Int = PLAYLIST_PAGE_SIZE
    ): Map<String, Any?> = withContext(Dispatchers.IO) {
        val platform = detectPlatform(url) ?: throw IllegalArgumentException("errors.invalidUrl")
        if (platform !is PlaylistCapablePlatform) throw IllegalArgumentException("errors.playlistNotSupported")
        prepare(context.applicationContext)
        platform.fetchPlaylistInfo(start, count)
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
        var platform: Platform? = null
        try {
            platform = detectPlatform(job.url) ?: throw IllegalArgumentException("errors.invalidUrl")
            prepare(context)
            if (job.phase == JobPhase.CANCELLED) return

            job.startedAt = System.currentTimeMillis()
            advance(job, JobPhase.FETCHING_INFO)
            val metadata = platform.fetchMetadata(job)
            job.title = metadata.title
            job.thumbnail = metadata.thumbnail
            if (job.phase == JobPhase.CANCELLED) return

            val ext = if (job.format == "audio") "mp3" else "mp4"
            job.ext = ext
            val outputDir = File(context.cacheDir, OUTPUT_DIR_NAME).apply { mkdirs() }
            advance(job, JobPhase.DOWNLOADING)

            downloadWithRetry(platform, job, outputDir, ext)
            advance(job, JobPhase.DONE)
        } catch (cancelled: YoutubeDL.CanceledException) {
            advance(job, JobPhase.CANCELLED)
        } catch (cancelled: CancellationException) {
            advance(job, JobPhase.CANCELLED)
            throw cancelled
        } catch (error: Throwable) {
            Log.e(TAG, "job ${job.id} failed", error)
            DebugLog.addError("job ${job.id} (${job.url}) failed", error)
            val (key, params) = platform?.describeError(error)
                ?: ("errors.raw" to mapOf("raw" to describeErrorRaw(error)))
            job.error = key
            job.errorParams = params
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
    internal fun downloadAndFinalize(platform: Platform, job: DownloadJob, outputDir: File, ext: String) {
        val request = platform.buildRequest(job, File(outputDir, "${job.id}.%(ext)s").absolutePath)
        engine.execute(request, job.id, false) { progress, eta, line ->
            onOutput(job, progress, eta, line)
        }

        val produced = File(outputDir, "${job.id}.$ext")
        if (!produced.exists()) {
            throw IllegalStateException("errors.noFileProduced")
        }
        // yt-dlp names the file by job id (a UUID); rename to the video title so both the
        // share sheet and the save-to-Downloads flow offer a real, human filename.
        job.filePath = renameToTitledFile(produced, job.title ?: job.url, ext).absolutePath
        job.progress = 100.0
        job.etaSeconds = 0
    }

    /**
     * Runs [downloadAndFinalize], retrying up to MAX_ATTEMPTS times on a transient failure (e.g.
     * HTTP 403 / PO-token issues) with a fixed delay in between. Mirrors download()'s retry loop in
     * server/src/platforms/BasePlatform.ts. Cancellation always propagates immediately, never retried.
     */
    private suspend fun downloadWithRetry(platform: Platform, job: DownloadJob, outputDir: File, ext: String) {
        for (attempt in 1..MAX_ATTEMPTS) {
            if (attempt > 1) {
                job.lastLineKey = "job.retrying"
                job.lastLineParams = mapOf("attempt" to attempt, "maxAttempts" to MAX_ATTEMPTS)
                touch()
            }
            try {
                downloadAndFinalize(platform, job, outputDir, ext)
                return
            } catch (cancelled: YoutubeDL.CanceledException) {
                throw cancelled
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Throwable) {
                if (attempt >= MAX_ATTEMPTS || !platform.isRetryableError(error)) throw error
                DebugLog.add("job ${job.id} download attempt $attempt/$MAX_ATTEMPTS failed, retrying: ${describeErrorRaw(error)}")
                delay(RETRY_DELAY_MS)
            }
        }
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

    internal fun onOutput(job: DownloadJob, progress: Float, eta: Long, line: String) {
        if (job.phase.isFinished) return

        val trimmed = line.trim()
        if (trimmed.isNotEmpty()) {
            job.lastLine = trimmed
            // A fresh raw output line means the job is actively progressing again — clear any
            // leftover "job.retrying" status key from downloadWithRetry() so it doesn't keep
            // masking real progress after a retry succeeds.
            job.lastLineKey = null
            job.lastLineParams = null
        }
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

    internal fun setSetup(phase: SetupPhase, messageKey: String, messageParams: Map<String, Any?>? = null) {
        setupPhase = phase
        setupMessage = messageKey
        setupMessageParams = messageParams
        DebugLog.add("setup -> ${phase.jsName}: $messageKey")
        touch()
    }

    internal fun touch() {
        _revision.value = _revision.value + 1
    }
}
