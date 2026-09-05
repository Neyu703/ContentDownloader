package expo.modules.ytdlp.platforms

import expo.modules.ytdlp.nonEmptyTrimmedLines

/** yt-dlp's own synthesized placeholders when a post has no real title (Instagram) or a bare hashtag caption (TikTok). */
private val LOW_QUALITY_TITLE_PATTERNS = listOf(
    Regex("^(?:Video|Photo|Reel) by\\s", RegexOption.IGNORE_CASE),
    Regex("^#\\S+$")
)

private const val MAX_CAPTION_LENGTH = 100

internal fun isLowQualityTitle(title: String): Boolean {
    val trimmed = title.trim()
    return trimmed.isEmpty() || LOW_QUALITY_TITLE_PATTERNS.any { it.containsMatchIn(trimmed) }
}

private fun firstNonEmptyLine(text: String?): String? =
    text?.let { nonEmptyTrimmedLines(it).firstOrNull() }

private fun truncate(text: String, maxLength: Int): String =
    if (text.length > maxLength) "${text.take(maxLength).trimEnd()}…" else text

/** yt-dlp's upload_date is an unseparated YYYYMMDD string. */
private fun formatUploadDate(uploadDate: String?): String? {
    if (uploadDate == null || !Regex("^\\d{8}$").matches(uploadDate)) return null
    return "${uploadDate.substring(0, 4)}-${uploadDate.substring(4, 6)}-${uploadDate.substring(6, 8)}"
}

/** Everything from yt-dlp's info-dict that pickTitle() can draw on. */
internal data class TitleSource(
    val title: String? = null,
    val description: String? = null,
    val uploader: String? = null,
    val uploadDate: String? = null,
    val id: String? = null
)

/**
 * Picks the best available title out of everything yt-dlp's info-dict offers, for platforms
 * (Instagram, TikTok) whose own title field is often a low-effort placeholder rather than a real
 * title. Falls through: real title -> caption (description) -> composed uploader/date -> raw
 * title/id. Mirrors pickTitle() in server/src/platforms/titleQuality.ts.
 */
internal fun pickTitle(source: TitleSource): String {
    val title = source.title?.trim()
    if (!title.isNullOrEmpty() && !isLowQualityTitle(title)) return title

    val caption = firstNonEmptyLine(source.description)
    if (caption != null && !isLowQualityTitle(caption)) return truncate(caption, MAX_CAPTION_LENGTH)

    val uploader = source.uploader?.trim()
    val date = formatUploadDate(source.uploadDate)
    if (!uploader.isNullOrEmpty() && date != null) return "$uploader - $date"
    if (!uploader.isNullOrEmpty()) return uploader

    return title.takeUnless { it.isNullOrEmpty() } ?: source.id ?: "Unknown title"
}
