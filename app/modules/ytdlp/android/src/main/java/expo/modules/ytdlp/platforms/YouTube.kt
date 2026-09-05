package expo.modules.ytdlp.platforms

/** yt-dlp's phrasing for YouTube's "Sign in to confirm you're not a bot" gate. */
private val SIGN_IN_GATE_PATTERN = Regex("sign in to confirm you.{1,2}re not a bot", RegexOption.IGNORE_CASE)

private fun isSignInGateError(message: String): Boolean = SIGN_IN_GATE_PATTERN.containsMatchIn(message)

class YouTube(url: String) : PlaylistCapableBasePlatform(url) {
    companion object {
        val HOSTS = setOf("youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be")
    }

    override fun defaultThumbnail(id: String): String = "https://i.ytimg.com/vi/$id/hqdefault.jpg"

    /** The known-permanent sign-in gate is never worth retrying; every other failure is treated as transient. */
    override fun isRetryableError(error: Throwable): Boolean = !isSignInGateError(describeErrorRaw(error))

    /**
     * yt-dlp surfaces YouTube's own "Sign in to confirm you're not a bot" gate verbatim, including
     * a raw stack of wiki links — not actionable for a user, since it requires real logged-in
     * cookies to bypass, not anything this app can retry or work around on its own.
     */
    override fun describeError(error: Throwable): Pair<String, Map<String, Any?>?> {
        val raw = describeErrorRaw(error)
        return if (isSignInGateError(raw)) "errors.signInRequired" to null else "errors.raw" to mapOf("raw" to raw)
    }
}
