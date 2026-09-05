package expo.modules.ytdlp.platforms

import com.yausername.youtubedl_android.YoutubeDLRequest
import com.yausername.youtubedl_android.YoutubeDLResponse
import expo.modules.ytdlp.DownloadQueue
import expo.modules.ytdlp.RealYtdlpEngine
import expo.modules.ytdlp.YtdlpEngine
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * PlaylistCapableBasePlatform's playlist listing is generic across every platform that supports
 * it — exercised here through SoundCloud (no overrides) to prove that it really is generic. The
 * i.ytimg.com fallback thumbnail is YouTube-specific and tested separately in YouTubeTest.kt;
 * here, a missing thumbnail defaults to null (BasePlatform.defaultThumbnail()'s default). Mirrors
 * server/src/platforms/PlaylistCapableBasePlatform.test.ts.
 *
 * org.json.JSONObject is a stub on the plain JVM; Robolectric provides a working shadow.
 */
@RunWith(RobolectricTestRunner::class)
class PlaylistCapableBasePlatformTest {
    private lateinit var engine: YtdlpEngine

    @Before
    fun setUp() {
        engine = mockk(relaxed = true)
        DownloadQueue.engine = engine
    }

    @After
    fun tearDown() {
        DownloadQueue.engine = RealYtdlpEngine()
    }

    private fun response(out: String) = YoutubeDLResponse(emptyList(), 0, 0L, out, "")

    private fun soundcloud(url: String = "https://soundcloud.com/someartist/sometrack") = SoundCloud(url)

    @Test
    fun `parses title, entries and totalCount from the flat-playlist output`() = runTest {
        val output = """
            {"id":"a","title":"Track A","playlist_title":"My Mix","playlist_count":2}
            {"id":"b","title":"Track B"}
        """.trimIndent()
        every { engine.execute(any(), any(), any(), null) } returns response(output)

        val result = soundcloud().fetchPlaylistInfo()

        assertEquals("My Mix", result["title"])
        assertEquals(2, result["totalCount"])
        val entries = result["entries"] as List<*>
        assertEquals(2, entries.size)
        // second entry has no thumbnails at all: falls back to defaultThumbnail(), which is null generically.
        assertNull((entries[1] as Map<*, *>)["thumbnail"])
    }

    @Test
    fun `defaults to an untitled playlist with no known total when the output has no matches`() = runTest {
        every { engine.execute(any(), any(), any(), null) } returns response("")

        val result = soundcloud().fetchPlaylistInfo()

        assertEquals("Playlist", result["title"])
        assertNull(result["totalCount"])
        assertEquals(emptyList<Any?>(), result["entries"])
    }

    @Test
    fun `defaults title and totalCount when the first entry carries neither key`() = runTest {
        every { engine.execute(any(), any(), any(), null) } returns response("""{"id":"a","title":"Track A"}""")

        val result = soundcloud().fetchPlaylistInfo()

        assertEquals("Playlist", result["title"])
        assertNull(result["totalCount"])
    }

    @Test
    fun `requests the correct playlist-items range`() = runTest {
        val requestSlot = slot<YoutubeDLRequest>()
        every { engine.execute(capture(requestSlot), any(), any(), null) } returns response("")

        soundcloud().fetchPlaylistInfo(start = 51, count = 50)

        assertEquals("51-100", requestSlot.captured.getOption("--playlist-items"))
    }
}
