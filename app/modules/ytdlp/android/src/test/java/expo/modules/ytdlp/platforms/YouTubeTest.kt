package expo.modules.ytdlp.platforms

import com.yausername.youtubedl_android.YoutubeDLResponse
import expo.modules.ytdlp.DownloadQueue
import expo.modules.ytdlp.RealYtdlpEngine
import expo.modules.ytdlp.YtdlpEngine
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// org.json.JSONObject (used inside fetchPlaylistInfo) is a stub on the plain JVM; Robolectric
// provides a working shadow.
@RunWith(RobolectricTestRunner::class)
class YouTubeTest {
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

    private fun youtube(url: String = "https://www.youtube.com/watch?v=x") = YouTube(url)

    // --- defaultThumbnail ---

    @Test
    fun `defaultThumbnail builds the i ytimg com hqdefault URL for a video id`() {
        assertEquals("https://i.ytimg.com/vi/abc/hqdefault.jpg", youtube().defaultThumbnail("abc"))
    }

    @Test
    fun `defaultThumbnail is used by fetchPlaylistInfo when an entry has no thumbnails`() = runTest {
        every { engine.execute(any(), any(), any(), null) } returns response("""{"id":"def","title":"Video B"}""")

        val result = youtube().fetchPlaylistInfo()

        val entries = result["entries"] as List<*>
        assertEquals("https://i.ytimg.com/vi/def/hqdefault.jpg", (entries[0] as Map<*, *>)["thumbnail"])
    }

    // --- isRetryableError ---

    @Test
    fun `isRetryableError is false for the known-permanent sign-in gate`() {
        assertFalse(youtube().isRetryableError(RuntimeException("ERROR: Sign in to confirm you're not a bot")))
    }

    @Test
    fun `isRetryableError is true for any other error`() {
        assertTrue(youtube().isRetryableError(RuntimeException("HTTP Error 403: Forbidden")))
    }

    // --- describeError ---

    @Test
    fun `describeError returns the sign-in-required key with no params when the sign-in gate matches`() {
        val error = RuntimeException("ERROR: Sign in to confirm you're not a bot")
        assertEquals("errors.signInRequired" to null, youtube().describeError(error))
    }

    @Test
    fun `describeError wraps an unrelated message as errors raw with the raw text as a param`() {
        assertEquals("errors.raw" to mapOf("raw" to "boom"), youtube().describeError(RuntimeException("boom")))
    }
}
