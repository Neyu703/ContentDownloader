package expo.modules.ytdlp.platforms

import android.net.Uri
import com.yausername.youtubedl_android.YoutubeDLRequest
import expo.modules.ytdlp.DownloadJob
import expo.modules.ytdlp.DownloadQueue
import expo.modules.ytdlp.JobMetadata
import expo.modules.ytdlp.isHttpOrHttps
import expo.modules.ytdlp.nonEmptyTrimmedLines
import expo.modules.ytdlp.toJsonObjectOrNull

/** Joins title/thumbnail in a single --print template so fetchMetadata() stays one lightweight yt-dlp call. */
private const val METADATA_FIELD_SEPARATOR = "|||"

/**
 * Generic yt-dlp behavior shared by every platform: metadata lookup, request building, and
 * generic error classification. Concrete platforms only override what actually differs (see
 * YouTube). Mirrors server/src/platforms/BasePlatform.ts.
 */
abstract class BasePlatform(protected val url: String) : Platform {
    override fun checkAvailability() {
        val uri = Uri.parse(url)
        if (!uri.isHttpOrHttps()) {
            throw IllegalArgumentException("Unsupported URL scheme: ${uri.scheme?.lowercase()}")
        }
    }

    /**
     * The --print option implies --simulate, so this only resolves title/thumbnail without a real
     * download. Much cheaper than dumping the full metadata JSON, and cancellable because it runs
     * under the process id of the job. Both fields come back on one line (yt-dlp's own template
     * syntax), so the same "last non-empty line wins over any leading noise" heuristic applies.
     */
    override fun fetchMetadata(job: DownloadJob): JobMetadata {
        val request = YoutubeDLRequest(job.url)
            .addOption("--no-playlist")
            .addOption("--no-warnings")
            .addOption("--print", "%(title)s$METADATA_FIELD_SEPARATOR%(thumbnail)s")
        val output = DownloadQueue.engine.execute(request, job.id, false, null).out
        val line = nonEmptyTrimmedLines(output).lastOrNull() ?: return JobMetadata(job.url, null)
        val parts = line.split(METADATA_FIELD_SEPARATOR, limit = 2)
        val fastTitle = parts.getOrNull(0)?.takeIf(String::isNotBlank) ?: job.url
        val thumbnail = parts.getOrNull(1)?.takeIf { it.isNotBlank() && it != "NA" }
        val title = if (isLowQualityTitle(fastTitle)) resolveBetterTitle(job, fastTitle) else fastTitle
        return JobMetadata(title, thumbnail)
    }

    /**
     * Only reached when the fast title lookup above returned a low-quality placeholder (Instagram's
     * "Video by X", a bare TikTok hashtag). Pays for one extra --dump-json call to pull the caption/
     * uploader/upload date needed for a better fallback — mirrors fetchInfo() in
     * server/src/platforms/BasePlatform.ts, but only for this minority case, keeping the common-case
     * metadata lookup as cheap as before.
     */
    private fun resolveBetterTitle(job: DownloadJob, fallbackTitle: String): String {
        val request = YoutubeDLRequest(job.url)
            .addOption("--dump-json")
            .addOption("--no-playlist")
            .addOption("--no-warnings")
        val output = DownloadQueue.engine.execute(request, job.id, false, null).out
        val json = nonEmptyTrimmedLines(output).lastOrNull()?.toJsonObjectOrNull()
            ?: return fallbackTitle
        return pickTitle(
            TitleSource(
                title = fallbackTitle,
                description = json.optString("description").takeIf(String::isNotBlank),
                uploader = json.optString("uploader").takeIf(String::isNotBlank),
                uploadDate = json.optString("upload_date").takeIf(String::isNotBlank),
                id = json.optString("id").takeIf(String::isNotBlank)
            )
        )
    }

    override fun buildRequest(job: DownloadJob, outputTemplate: String): YoutubeDLRequest =
        buildRequestFrom(job.url, requestOptions(job, outputTemplate))

    override fun requestOptions(job: DownloadJob, outputTemplate: String): List<Pair<String, String?>> {
        val options = mutableListOf<Pair<String, String?>>()
        if (job.format == "audio") {
            options += "-f" to "bestaudio/best"
            options += "-x" to null
            options += "--audio-format" to "mp3"
            options += "--audio-quality" to "${job.quality}K"
        } else {
            val heightFilter = if (job.quality == "best") "" else "[height<=${job.quality}]"
            options += "-f" to "bestvideo$heightFilter+bestaudio/best$heightFilter/best$heightFilter"
            options += "--merge-output-format" to "mp4"
        }
        options += "--no-playlist" to null
        options += "--no-warnings" to null
        options += "-o" to outputTemplate
        return options
    }

    override fun isRetryableError(error: Throwable): Boolean = true

    override fun describeError(error: Throwable): Pair<String, Map<String, Any?>?> =
        "errors.raw" to mapOf("raw" to describeErrorRaw(error))
}
