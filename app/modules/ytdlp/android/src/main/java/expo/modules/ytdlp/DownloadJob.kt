package expo.modules.ytdlp

/** Phases a single download passes through. Mirrored by `JobPhase` in app/downloader/types.ts. */
enum class JobPhase(val jsName: String) {
    QUEUED("queued"),
    FETCHING_INFO("fetching_info"),
    DOWNLOADING("downloading"),
    CONVERTING("converting"),
    MERGING("merging"),
    DONE("done"),
    ERROR("error"),
    CANCELLED("cancelled");

    val isFinished: Boolean
        get() = this == DONE || this == ERROR || this == CANCELLED
}

/** Result of DownloadQueue.fetchMetadata() — a job's resolved title and (if any) thumbnail URL. */
data class JobMetadata(val title: String, val thumbnail: String?)

/** One-time preparation of the bundled binaries. Mirrored by `SetupPhase` in app/downloader/types.ts. */
enum class SetupPhase(val jsName: String) {
    IDLE("idle"),
    PREPARING("preparing"),
    UPDATING("updating"),
    READY("ready"),
    FAILED("failed")
}

class DownloadJob(
    val id: String,
    val url: String,
    val format: String,
    val quality: String,
    val groupId: String? = null,
    val groupTitle: String? = null
) {
    @Volatile
    var phase: JobPhase = JobPhase.QUEUED

    @Volatile
    var title: String? = null

    @Volatile
    var thumbnail: String? = null

    /** Percent 0..100, or null while unknown. */
    @Volatile
    var progress: Double? = null

    @Volatile
    var etaSeconds: Long? = null

    /** Last raw yt-dlp output line, shown verbatim in the app so nothing looks frozen. */
    @Volatile
    var lastLine: String = ""

    /** Translation key for a higher-level status (e.g. a retry notice) that should override [lastLine] while set. */
    @Volatile
    var lastLineKey: String? = null

    @Volatile
    var lastLineParams: Map<String, Any?>? = null

    @Volatile
    var filePath: String? = null

    @Volatile
    var ext: String? = null

    /** Translation key describing the failure, e.g. "errors.signInRequired" or "errors.raw" (with `raw` in [errorParams]). */
    @Volatile
    var error: String? = null

    @Volatile
    var errorParams: Map<String, Any?>? = null

    val createdAt: Long = System.currentTimeMillis()

    @Volatile
    var startedAt: Long? = null

    @Volatile
    var finishedAt: Long? = null

    /** Timestamp of the last change of any kind — drives the "no response for Xs" hint. */
    @Volatile
    var updatedAt: Long = createdAt

    fun toMap(): Map<String, Any?> = mapOf(
        "id" to id,
        "url" to url,
        "format" to format,
        "quality" to quality,
        "groupId" to groupId,
        "groupTitle" to groupTitle,
        "phase" to phase.jsName,
        "title" to title,
        "thumbnail" to thumbnail,
        "progress" to progress,
        "etaSeconds" to etaSeconds?.toDouble(),
        "lastLine" to lastLine,
        "lastLineKey" to lastLineKey,
        "lastLineParams" to lastLineParams,
        "filePath" to filePath,
        "ext" to ext,
        "error" to error,
        "errorParams" to errorParams,
        "createdAt" to createdAt.toDouble(),
        "startedAt" to startedAt?.toDouble(),
        "finishedAt" to finishedAt?.toDouble(),
        "updatedAt" to updatedAt.toDouble()
    )
}
