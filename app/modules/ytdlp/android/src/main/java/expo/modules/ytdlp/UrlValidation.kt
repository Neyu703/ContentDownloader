package expo.modules.ytdlp

private val YOUTUBE_HOSTS = setOf(
    "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"
)

/**
 * Mirrors isValidYoutubeUrl() in server/src/validate.ts. Android's Uri.parse() never throws
 * for a String argument (it has no real validation, unlike java.net.URI) — there is no
 * malformed input to catch here.
 */
internal fun isValidYoutubeUrl(url: String): Boolean {
    val uri = android.net.Uri.parse(url)
    val scheme = uri.scheme?.lowercase()
    if (scheme != "http" && scheme != "https") return false
    return YOUTUBE_HOSTS.contains(uri.host?.lowercase())
}
