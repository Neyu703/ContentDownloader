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

    /** Percent 0..100, or null while unknown. */
    @Volatile
    var progress: Double? = null

    @Volatile
    var etaSeconds: Long? = null

    /** Last raw yt-dlp output line, shown verbatim in the app so nothing looks frozen. */
    @Volatile
    var lastLine: String = ""

    @Volatile
    var filePath: String? = null

    @Volatile
    var ext: String? = null

    @Volatile
    var error: String? = null

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
        "progress" to progress,
        "etaSeconds" to etaSeconds?.toDouble(),
        "lastLine" to lastLine,
        "filePath" to filePath,
        "ext" to ext,
        "error" to error,
        "createdAt" to createdAt.toDouble(),
        "startedAt" to startedAt?.toDouble(),
        "finishedAt" to finishedAt?.toDouble(),
        "updatedAt" to updatedAt.toDouble()
    )
}
