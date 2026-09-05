package expo.modules.ytdlp

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// org.json.JSONObject is a stub on the plain JVM; Robolectric provides a working shadow.
@RunWith(RobolectricTestRunner::class)
class YtdlpUtilsTest {

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
    // The i.ytimg.com fallback thumbnail is YouTube-specific and tested in
    // platforms/YouTubeTest.kt; here, defaultThumbnail is a plain lambda so these tests exercise
    // toEntryMap()'s own logic in isolation.

    @Test
    fun `toEntryMap prefers webpage_url over the flat url field`() {
        val json = JSONObject()
            .put("id", "abc")
            .put("webpage_url", "https://youtu.be/abc")
            .put("url", "abc")
            .put("title", "A Video")
            .put("duration", 125.0)

        val map = toEntryMap(json) { null }

        assertEquals("abc", map["id"])
        assertEquals("https://youtu.be/abc", map["url"])
        assertEquals("A Video", map["title"])
        assertEquals(125.0, map["duration"])
    }

    @Test
    fun `toEntryMap falls back to the flat url field when webpage_url is blank`() {
        val json = JSONObject().put("id", "abc").put("url", "raw-url")
        assertEquals("raw-url", toEntryMap(json) { null }["url"])
    }

    @Test
    fun `toEntryMap falls back to the id as title when title is missing`() {
        val json = JSONObject().put("id", "abc")
        assertEquals("abc", toEntryMap(json) { null }["title"])
    }

    @Test
    fun `toEntryMap maps a missing duration to null`() {
        val json = JSONObject().put("id", "abc")
        assertNull(toEntryMap(json) { null }["duration"])
    }

    @Test
    fun `toEntryMap maps an explicit JSON null duration to null`() {
        val json = JSONObject().put("id", "abc").put("duration", JSONObject.NULL)
        assertNull(toEntryMap(json) { null }["duration"])
    }

    @Test
    fun `toEntryMap picks the last thumbnail when thumbnails are present`() {
        val thumbnails = org.json.JSONArray()
            .put(JSONObject().put("url", "https://example.com/small.jpg"))
            .put(JSONObject().put("url", "https://example.com/large.jpg"))
        val json = JSONObject().put("id", "abc").put("thumbnails", thumbnails)

        assertEquals("https://example.com/large.jpg", toEntryMap(json) { null }["thumbnail"])
    }

    @Test
    fun `toEntryMap calls defaultThumbnail with the entry id when no thumbnails are provided`() {
        val json = JSONObject().put("id", "abc")

        assertEquals("fallback-for-abc", toEntryMap(json) { id -> "fallback-for-$id" }["thumbnail"])
    }

    @Test
    fun `toEntryMap has no default thumbnail when both thumbnails and id are empty`() {
        val json = JSONObject().put("id", "")
        assertNull(toEntryMap(json) { "should never be called" }["thumbnail"])
    }

    @Test
    fun `toEntryMap treats an empty thumbnails array like no thumbnails at all`() {
        val json = JSONObject().put("id", "abc").put("thumbnails", org.json.JSONArray())
        assertEquals("fallback-for-abc", toEntryMap(json) { id -> "fallback-for-$id" }["thumbnail"])
    }
}
