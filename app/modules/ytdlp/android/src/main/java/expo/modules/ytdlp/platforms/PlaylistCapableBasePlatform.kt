package expo.modules.ytdlp.platforms

import com.yausername.youtubedl_android.YoutubeDLRequest
import expo.modules.ytdlp.DownloadQueue
import expo.modules.ytdlp.parsePlaylistJsonLines
import expo.modules.ytdlp.playlistTitle
import expo.modules.ytdlp.toEntryMap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.UUID

/**
 * Adds generic playlist listing to BasePlatform's generic single-item behavior. Only platforms
 * that yt-dlp can list via --flat-playlist implement PlaylistCapablePlatform. Mirrors
 * server/src/platforms/PlaylistCapableBasePlatform.ts.
 */
abstract class PlaylistCapableBasePlatform(url: String) : BasePlatform(url), PlaylistCapablePlatform {
    override fun defaultThumbnail(id: String): String? = null

    /**
     * Lists one page of a playlist's entries (1-indexed, inclusive range), without downloading
     * anything. Mirrors fetchPlaylistInfo() in server/src/platforms/PlaylistCapableBasePlatform.ts
     * (same --flat-playlist --dump-json flags, same bundled yt-dlp binary). Paged so the UI can
     * virtualize/infinite-scroll instead of enumerating an entire (potentially thousand-video)
     * playlist upfront.
     */
    override suspend fun fetchPlaylistInfo(start: Int, count: Int): Map<String, Any?> = withContext(Dispatchers.IO) {
        val request = YoutubeDLRequest(url)
            .addOption("--flat-playlist")
            .addOption("--dump-json")
            .addOption("--no-warnings")
            .addOption("--playlist-items", "$start-${start + count - 1}")
        val output = DownloadQueue.engine.execute(request, UUID.randomUUID().toString(), false, null).out
        val parsed = parsePlaylistJsonLines(output)

        val title = parsed.firstOrNull()?.playlistTitle() ?: "Playlist"
        val totalCount = parsed.firstOrNull()?.let { if (it.has("playlist_count")) it.optInt("playlist_count") else null }
        val entries = parsed.map { toEntryMap(it, ::defaultThumbnail) }
        mapOf("title" to title, "entries" to entries, "totalCount" to totalCount)
    }
}
