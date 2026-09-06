package expo.modules.ytdlp

import android.net.Uri

private val HAS_SCHEME = Regex("^[a-zA-Z][a-zA-Z\\d+.-]*://")

/**
 * Mirrors normalizeUrl() in server/src/url.ts. Adds "https://" to a schemeless link like
 * "youtube.com/watch?v=x".
 */
internal fun normalizeUrl(url: String): String {
    val trimmed = url.trim()
    return if (HAS_SCHEME.containsMatchIn(trimmed)) trimmed else "https://$trimmed"
}

/** Whether this URI uses a scheme yt-dlp/the app actually supports (as opposed to e.g. ftp:, file:). */
internal fun Uri.isHttpOrHttps(): Boolean {
    val normalizedScheme = scheme?.lowercase()
    return normalizedScheme == "http" || normalizedScheme == "https"
}
