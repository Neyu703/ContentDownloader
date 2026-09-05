package expo.modules.ytdlp.platforms

/** yt-dlp's Instagram extractor raises this (wording may vary slightly across versions) when a post
 * is an image-only slideshow/carousel with no video stream to extract. */
private val NO_VIDEO_IN_POST_PATTERN = Regex("no video", RegexOption.IGNORE_CASE)

class Instagram(url: String) : BasePlatform(url) {
    companion object {
        val HOSTS = setOf("instagram.com", "www.instagram.com")
    }

    private fun isSlideshowError(error: Throwable): Boolean = NO_VIDEO_IN_POST_PATTERN.containsMatchIn(describeErrorRaw(error))

    /** A slideshow post will never gain a video format on retry — every other failure is treated as transient. */
    override fun isRetryableError(error: Throwable): Boolean = !isSlideshowError(error)

    override fun describeError(error: Throwable): Pair<String, Map<String, Any?>?> =
        if (isSlideshowError(error)) "errors.instagramSlideshowNotSupported" to null else super.describeError(error)
}
