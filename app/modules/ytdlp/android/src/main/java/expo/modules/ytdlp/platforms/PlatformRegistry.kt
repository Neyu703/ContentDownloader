package expo.modules.ytdlp.platforms

import android.net.Uri
import expo.modules.ytdlp.isHttpOrHttps
import expo.modules.ytdlp.normalizeUrl

/**
 * Normalizes [rawUrl] and instantiates the matching Platform, or returns null if no supported
 * platform's host list matches (or the URL doesn't parse as http/https at all). An explicit
 * `when` naming each class directly instead of looping over a class list — a stack trace or
 * "go to definition" then points straight at the concrete platform being constructed. Mirrors
 * server/src/platforms/registry.ts.
 */
fun detectPlatform(rawUrl: String): Platform? {
    val normalizedUrl = normalizeUrl(rawUrl)
    val uri = Uri.parse(normalizedUrl)
    if (!uri.isHttpOrHttps()) return null
    val host = uri.host?.lowercase() ?: return null

    val platform: Platform = when {
        YouTube.HOSTS.contains(host) -> YouTube(normalizedUrl)
        TikTok.HOSTS.contains(host) -> TikTok(normalizedUrl)
        Instagram.HOSTS.contains(host) -> Instagram(normalizedUrl)
        Twitter.HOSTS.contains(host) -> Twitter(normalizedUrl)
        SoundCloud.HOSTS.contains(host) -> SoundCloud(normalizedUrl)
        Vimeo.HOSTS.contains(host) -> Vimeo(normalizedUrl)
        Twitch.HOSTS.contains(host) -> Twitch(normalizedUrl)
        else -> return null
    }

    return if (runCatching { platform.checkAvailability() }.isSuccess) platform else null
}
