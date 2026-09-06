package expo.modules.ytdlp

import org.json.JSONObject

internal fun nonEmptyTrimmedLines(text: String): List<String> = text.lines().map { it.trim() }.filter { it.isNotEmpty() }

/** yt-dlp's key for a flat-playlist entry's playlist title (falls back to the older "playlist" key). */
internal fun JSONObject.playlistTitle(): String? =
    optString("playlist_title").takeIf(String::isNotBlank) ?: optString("playlist").takeIf(String::isNotBlank)

/** Parses this string as a JSON object, or null if it isn't valid JSON. */
internal fun String.toJsonObjectOrNull(): JSONObject? = runCatching { JSONObject(this) }.getOrNull()

/** Parses one JSON object per non-blank output line, skipping any line that isn't valid JSON. */
internal fun parsePlaylistJsonLines(output: String): List<JSONObject> =
    nonEmptyTrimmedLines(output).mapNotNull { it.toJsonObjectOrNull() }

/**
 * Shapes one --flat-playlist JSON entry into the Map the JS bridge expects. [defaultThumbnail] is
 * the platform-specific fallback used when yt-dlp didn't return a thumbnail for this entry (e.g.
 * YouTube's i.ytimg.com convention) — most platforms have none, so they pass `{ null }`.
 */
internal fun toEntryMap(entry: JSONObject, defaultThumbnail: (id: String) -> String?): Map<String, Any?> {
    val id = entry.optString("id", "")
    val thumbnails = entry.optJSONArray("thumbnails")
    // getJSONObject() throws (never returns null) on a bad index, and optString(String) always
    // returns a non-null string (defaulting to "") — no further null-checks are needed on either
    // once thumbnails is confirmed non-empty.
    val thumbnail = thumbnails?.takeIf { it.length() > 0 }?.let { it.getJSONObject(it.length() - 1).optString("url")!! }
        ?: id.takeIf(String::isNotEmpty)?.let(defaultThumbnail)
    return mapOf(
        "id" to id,
        "url" to (entry.optString("webpage_url").takeIf(String::isNotBlank) ?: entry.optString("url")),
        "title" to entry.optString("title", id),
        "thumbnail" to thumbnail,
        "duration" to if (entry.has("duration") && !entry.isNull("duration")) entry.optDouble("duration") else null
    )
}
