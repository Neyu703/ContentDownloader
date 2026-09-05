package expo.modules.ytdlp

private val HAS_SCHEME = Regex("^[a-zA-Z][a-zA-Z\\d+.-]*://")

/**
 * Mirrors normalizeUrl() in server/src/url.ts. Adds "https://" to a schemeless link like
 * "youtube.com/watch?v=x".
 */
internal fun normalizeUrl(url: String): String {
    val trimmed = url.trim()
    return if (HAS_SCHEME.containsMatchIn(trimmed)) trimmed else "https://$trimmed"
}
