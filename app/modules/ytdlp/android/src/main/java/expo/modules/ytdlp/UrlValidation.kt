package expo.modules.ytdlp

private val YOUTUBE_HOSTS = setOf(
    "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"
)

private val HAS_SCHEME = Regex("^[a-zA-Z][a-zA-Z\\d+.-]*://")

/** Mirrors normalizeYoutubeUrl() in server/src/validate.ts. Adds "https://" to a schemeless link like "youtube.com/watch?v=x". */
internal fun normalizeYoutubeUrl(url: String): String {
    val trimmed = url.trim()
    return if (HAS_SCHEME.containsMatchIn(trimmed)) trimmed else "https://$trimmed"
}

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
