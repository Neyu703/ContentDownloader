package expo.modules.ytdlp.platforms

import com.yausername.youtubedl_android.YoutubeDLRequest
import expo.modules.ytdlp.DownloadJob
import expo.modules.ytdlp.JobMetadata

/**
 * One supported content source (YouTube, TikTok, ...). Mirrors server/src/platforms/Platform.ts —
 * each method here used to be a function directly on DownloadQueue, keyed off the job's URL.
 */
interface Platform {
    /** Throws if this URL isn't actually usable by this platform. */
    fun checkAvailability()
    /** [cookiesPath] is the imported cookies.txt's absolute path (see CookiesStore), or null if none is stored. */
    fun fetchMetadata(job: DownloadJob, cookiesPath: String? = null): JobMetadata
    fun buildRequest(job: DownloadJob, outputTemplate: String, cookiesPath: String? = null): YoutubeDLRequest
    /**
     * The same options buildRequest() applies, as (flag, value) pairs — value is null for a bare
     * flag. The single source both buildRequest() and DownloadQueue's reproducible command log
     * draw from, so the two can never drift apart.
     */
    fun requestOptions(job: DownloadJob, outputTemplate: String, cookiesPath: String? = null): List<Pair<String, String?>>
    /** Whether a failed download attempt is worth retrying, or is a known-permanent failure. */
    fun isRetryableError(error: Throwable): Boolean
    fun describeError(error: Throwable): Pair<String, Map<String, Any?>?>
}

/** Applies a requestOptions()-style flag list to a YoutubeDLRequest for [url]. */
fun buildRequestFrom(url: String, options: List<Pair<String, String?>>): YoutubeDLRequest {
    val request = YoutubeDLRequest(url)
    options.forEach { (flag, value) -> if (value != null) request.addOption(flag, value) else request.addOption(flag) }
    return request
}

/** Appends --cookies <path> when a cookies file is stored; a no-op otherwise. Mirrors cookiesArgs() in server/src/cookies.ts. */
fun YoutubeDLRequest.withCookies(cookiesPath: String?): YoutubeDLRequest =
    if (cookiesPath != null) addOption("--cookies", cookiesPath) else this

/** How many playlist entries fetchPlaylistInfo() lists per call — mirrors PLAYLIST_PAGE_SIZE in server/src/environment.ts. */
const val PLAYLIST_PAGE_SIZE = 50

/** A platform that can also list a playlist's entries — not every platform has this concept. */
interface PlaylistCapablePlatform : Platform {
    suspend fun fetchPlaylistInfo(start: Int = 1, count: Int = PLAYLIST_PAGE_SIZE, cookiesPath: String? = null): Map<String, Any?>
    /** Thumbnail to use for a playlist entry that yt-dlp didn't return one for, or null if there is none. */
    fun defaultThumbnail(id: String): String?
}
