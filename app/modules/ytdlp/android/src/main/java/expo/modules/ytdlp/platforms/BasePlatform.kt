package expo.modules.ytdlp.platforms

import android.net.Uri
import com.yausername.youtubedl_android.YoutubeDLRequest
import expo.modules.ytdlp.DownloadJob
import expo.modules.ytdlp.DownloadQueue
import expo.modules.ytdlp.JobMetadata
import expo.modules.ytdlp.nonEmptyTrimmedLines

/** Joins title/thumbnail in a single --print template so fetchMetadata() stays one lightweight yt-dlp call. */
private const val METADATA_FIELD_SEPARATOR = "|||"

/**
 * Generic yt-dlp behavior shared by every platform: metadata lookup, request building, and
 * generic error classification. Concrete platforms only override what actually differs (see
 * YouTube). Mirrors server/src/platforms/BasePlatform.ts.
 */
abstract class BasePlatform(protected val url: String) : Platform {
    override fun checkAvailability() {
        val scheme = Uri.parse(url).scheme?.lowercase()
        if (scheme != "http" && scheme != "https") {
            throw IllegalArgumentException("Unsupported URL scheme: $scheme")
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
        val title = parts.getOrNull(0)?.takeIf(String::isNotBlank) ?: job.url
        val thumbnail = parts.getOrNull(1)?.takeIf { it.isNotBlank() && it != "NA" }
        return JobMetadata(title, thumbnail)
    }

    override fun buildRequest(job: DownloadJob, outputTemplate: String): YoutubeDLRequest {
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

    override fun isRetryableError(error: Throwable): Boolean = true

    override fun describeError(error: Throwable): Pair<String, Map<String, Any?>?> =
        "errors.raw" to mapOf("raw" to describeErrorRaw(error))
}
