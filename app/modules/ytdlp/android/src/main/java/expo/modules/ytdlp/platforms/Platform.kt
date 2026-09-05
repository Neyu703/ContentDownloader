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
    fun fetchMetadata(job: DownloadJob): JobMetadata
    fun buildRequest(job: DownloadJob, outputTemplate: String): YoutubeDLRequest
    /** Whether a failed download attempt is worth retrying, or is a known-permanent failure. */
    fun isRetryableError(error: Throwable): Boolean
    fun describeError(error: Throwable): Pair<String, Map<String, Any?>?>
}

/** How many playlist entries fetchPlaylistInfo() lists per call — mirrors PLAYLIST_PAGE_SIZE in server/src/environment.ts. */
const val PLAYLIST_PAGE_SIZE = 50

/** A platform that can also list a playlist's entries — not every platform has this concept. */
interface PlaylistCapablePlatform : Platform {
    suspend fun fetchPlaylistInfo(start: Int = 1, count: Int = PLAYLIST_PAGE_SIZE): Map<String, Any?>
    /** Thumbnail to use for a playlist entry that yt-dlp didn't return one for, or null if there is none. */
    fun defaultThumbnail(id: String): String?
}
