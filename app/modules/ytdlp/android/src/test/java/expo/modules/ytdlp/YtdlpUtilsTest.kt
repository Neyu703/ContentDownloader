package expo.modules.ytdlp

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class YtdlpUtilsTest {

    // --- isValidYoutubeUrl (needs Robolectric for android.net.Uri.parse) ---

    @Test
    fun `accepts every known YouTube host over https`() {
        listOf(
            "https://youtube.com/watch?v=x",
            "https://www.youtube.com/watch?v=x",
            "https://m.youtube.com/watch?v=x",
            "https://music.youtube.com/watch?v=x",
            "https://youtu.be/x"
        ).forEach { url -> assertTrue(url, isValidYoutubeUrl(url)) }
    }

    @Test
    fun `accepts a YouTube host over plain http`() {
        assertTrue(isValidYoutubeUrl("http://youtube.com/watch?v=x"))
    }

    @Test
    fun `rejects a non-YouTube host`() {
        assertFalse(isValidYoutubeUrl("https://vimeo.com/12345"))
    }

    @Test
    fun `rejects a non-http(s) scheme`() {
        assertFalse(isValidYoutubeUrl("ftp://youtube.com/watch?v=x"))
    }

    @Test
    fun `rejects a malformed url instead of throwing`() {
        assertFalse(isValidYoutubeUrl("not a url at all"))
    }

    @Test
    fun `rejects a url with a valid scheme but no host`() {
        assertFalse(isValidYoutubeUrl("https:opaque"))
    }

    @Test
    fun `host matching is case-insensitive`() {
        assertTrue(isValidYoutubeUrl("https://WWW.YOUTUBE.COM/watch?v=x"))
    }

    // --- normalizeYoutubeUrl ---

    @Test
    fun `normalizeYoutubeUrl prepends https to a schemeless link`() {
        assertEquals("https://youtube.com/watch?v=jNQXAC9IVRw", normalizeYoutubeUrl("youtube.com/watch?v=jNQXAC9IVRw"))
    }

    @Test
    fun `normalizeYoutubeUrl leaves an already-schemed link unchanged`() {
        assertEquals("http://youtube.com/watch?v=x", normalizeYoutubeUrl("http://youtube.com/watch?v=x"))
    }

    @Test
    fun `normalizeYoutubeUrl trims surrounding whitespace before checking for a scheme`() {
        assertEquals("https://youtu.be/x", normalizeYoutubeUrl("  youtu.be/x  "))
    }

    @Test
    fun `a normalized schemeless link passes isValidYoutubeUrl`() {
        assertTrue(isValidYoutubeUrl(normalizeYoutubeUrl("youtube.com/watch?v=x")))
    }

    @Test
    fun `normalizeYoutubeUrl prepends https to a schemeless www link`() {
        assertEquals("https://www.youtube.com/watch?v=x", normalizeYoutubeUrl("www.youtube.com/watch?v=x"))
    }

    // --- nonEmptyTrimmedLines ---

    @Test
    fun `nonEmptyTrimmedLines trims and drops blank lines`() {
        val result = nonEmptyTrimmedLines("  first  \n\n   \nsecond\n")
        assertEquals(listOf("first", "second"), result)
    }

    @Test
    fun `nonEmptyTrimmedLines returns an empty list for blank input`() {
        assertEquals(emptyList<String>(), nonEmptyTrimmedLines("   \n  \n"))
    }

    // --- JSONObject.playlistTitle() ---

    @Test
    fun `playlistTitle prefers playlist_title over the legacy playlist key`() {
        val json = JSONObject().put("playlist_title", "New Name").put("playlist", "Old Name")
        assertEquals("New Name", json.playlistTitle())
    }

    @Test
    fun `playlistTitle falls back to the legacy playlist key when playlist_title is blank`() {
        val json = JSONObject().put("playlist_title", "  ").put("playlist", "Old Name")
        assertEquals("Old Name", json.playlistTitle())
    }

    @Test
    fun `playlistTitle is null when neither key is present`() {
        assertNull(JSONObject().playlistTitle())
    }

    // --- parsePlaylistJsonLines ---

    @Test
    fun `parsePlaylistJsonLines parses one object per line and skips invalid ones`() {
        val output = """
            {"id":"a"}
            not json
            {"id":"b"}

        """.trimIndent()

        val parsed = parsePlaylistJsonLines(output)

        assertEquals(2, parsed.size)
        assertEquals("a", parsed[0].optString("id"))
        assertEquals("b", parsed[1].optString("id"))
    }

    // --- toEntryMap ---

    @Test
    fun `toEntryMap prefers webpage_url over the flat url field`() {
        val json = JSONObject()
            .put("id", "abc")
            .put("webpage_url", "https://youtu.be/abc")
            .put("url", "abc")
            .put("title", "A Video")
            .put("duration", 125.0)

        val map = toEntryMap(json)

        assertEquals("abc", map["id"])
        assertEquals("https://youtu.be/abc", map["url"])
        assertEquals("A Video", map["title"])
        assertEquals(125.0, map["duration"])
    }

    @Test
    fun `toEntryMap falls back to the flat url field when webpage_url is blank`() {
        val json = JSONObject().put("id", "abc").put("url", "raw-url")
        assertEquals("raw-url", toEntryMap(json)["url"])
    }

    @Test
    fun `toEntryMap falls back to the id as title when title is missing`() {
        val json = JSONObject().put("id", "abc")
        assertEquals("abc", toEntryMap(json)["title"])
    }

    @Test
    fun `toEntryMap maps a missing duration to null`() {
        val json = JSONObject().put("id", "abc")
        assertNull(toEntryMap(json)["duration"])
    }

    @Test
    fun `toEntryMap maps an explicit JSON null duration to null`() {
        val json = JSONObject().put("id", "abc").put("duration", JSONObject.NULL)
        assertNull(toEntryMap(json)["duration"])
    }

    @Test
    fun `toEntryMap picks the last thumbnail when thumbnails are present`() {
        val thumbnails = org.json.JSONArray()
            .put(JSONObject().put("url", "https://example.com/small.jpg"))
            .put(JSONObject().put("url", "https://example.com/large.jpg"))
        val json = JSONObject().put("id", "abc").put("thumbnails", thumbnails)

        assertEquals("https://example.com/large.jpg", toEntryMap(json)["thumbnail"])
    }

    @Test
    fun `toEntryMap derives a default thumbnail from the id when none is provided`() {
        val json = JSONObject().put("id", "abc")
        assertEquals("https://i.ytimg.com/vi/abc/hqdefault.jpg", toEntryMap(json)["thumbnail"])
    }

    @Test
    fun `toEntryMap has no default thumbnail when both thumbnails and id are empty`() {
        val json = JSONObject().put("id", "")
        assertNull(toEntryMap(json)["thumbnail"])
    }

    @Test
    fun `toEntryMap treats an empty thumbnails array like no thumbnails at all`() {
        val json = JSONObject().put("id", "abc").put("thumbnails", org.json.JSONArray())
        assertEquals("https://i.ytimg.com/vi/abc/hqdefault.jpg", toEntryMap(json)["thumbnail"])
    }
}
