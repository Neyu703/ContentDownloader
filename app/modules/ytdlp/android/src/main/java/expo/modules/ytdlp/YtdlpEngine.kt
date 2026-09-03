package expo.modules.ytdlp

import android.content.Context
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import com.yausername.youtubedl_android.YoutubeDLResponse

/**
 * Seam over [YoutubeDL]'s singleton so [DownloadQueue] can be tested against a fake instead of the
 * real native binary. [RealYtdlpEngine] delegates 1:1 to the SDK and carries no logic of its own.
 */
interface YtdlpEngine {
    fun init(context: Context)
    fun version(context: Context): String?
    fun updateYoutubeDL(context: Context, channel: YoutubeDL.UpdateChannel)
    fun execute(
        request: YoutubeDLRequest,
        processId: String,
        redirectStderr: Boolean,
        callback: ((progress: Float, etaInSeconds: Long, line: String) -> Unit)?
    ): YoutubeDLResponse
    fun destroyProcessById(id: String)
}

class RealYtdlpEngine : YtdlpEngine {
    override fun init(context: Context) = YoutubeDL.getInstance().init(context)
    override fun version(context: Context): String? = YoutubeDL.getInstance().version(context)
    override fun updateYoutubeDL(context: Context, channel: YoutubeDL.UpdateChannel) {
        YoutubeDL.getInstance().updateYoutubeDL(context, channel)
    }
    override fun execute(
        request: YoutubeDLRequest,
        processId: String,
        redirectStderr: Boolean,
        callback: ((progress: Float, etaInSeconds: Long, line: String) -> Unit)?
    ): YoutubeDLResponse = YoutubeDL.getInstance().execute(request, processId, redirectStderr, callback)
    override fun destroyProcessById(id: String) {
        YoutubeDL.getInstance().destroyProcessById(id)
    }
}

/** Same seam as [YtdlpEngine], for [FFmpeg]'s singleton. */
interface FfmpegEngine {
    fun init(context: Context)
}

class RealFfmpegEngine : FfmpegEngine {
    override fun init(context: Context) = FFmpeg.getInstance().init(context)
}
