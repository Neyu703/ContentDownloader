package expo.modules.ytdlp.platforms

import com.yausername.youtubedl_android.YoutubeDLResponse
import expo.modules.ytdlp.DownloadJob
import expo.modules.ytdlp.DownloadQueue
import expo.modules.ytdlp.RealYtdlpEngine
import expo.modules.ytdlp.YtdlpEngine
import io.mockk.every
import io.mockk.mockk
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * BasePlatform's behavior is generic across every non-playlist platform — exercised here through
 * TikTok (a plain BasePlatform subclass with no overrides) to prove that it really is generic and
 * not accidentally YouTube-specific. Mirrors server/src/platforms/BasePlatform.test.ts.
 */
class BasePlatformTest {
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

    private fun tiktok(url: String = "https://www.tiktok.com/@someuser/video/123") = TikTok(url)

    // --- fetchMetadata ---

    @Test
    fun `fetchMetadata parses title and thumbnail from the last non-empty combined output line`() {
        val job = DownloadJob("id-1", "https://www.tiktok.com/@someuser/video/123", "audio", "320")
        every { engine.execute(any(), any(), any(), null) } returns response("A Title|||https://example.com/thumb.jpg\n\n")

        val metadata = tiktok().fetchMetadata(job)

        assertEquals("A Title", metadata.title)
        assertEquals("https://example.com/thumb.jpg", metadata.thumbnail)
    }

    @Test
    fun `fetchMetadata falls back to the job url and a null thumbnail when the output is blank`() {
        val job = DownloadJob("id-1", "https://www.tiktok.com/@someuser/video/123", "audio", "320")
        every { engine.execute(any(), any(), any(), null) } returns response("   ")

        val metadata = tiktok().fetchMetadata(job)

        assertEquals(job.url, metadata.title)
        assertNull(metadata.thumbnail)
    }

    @Test
    fun `fetchMetadata treats yt-dlp's NA placeholder as no thumbnail`() {
        val job = DownloadJob("id-1", "https://www.tiktok.com/@someuser/video/123", "audio", "320")
        every { engine.execute(any(), any(), any(), null) } returns response("A Title|||NA")

        assertNull(tiktok().fetchMetadata(job).thumbnail)
    }

    @Test
    fun `fetchMetadata falls back to the job url when the title half is blank`() {
        val job = DownloadJob("id-1", "https://www.tiktok.com/@someuser/video/123", "audio", "320")
        every { engine.execute(any(), any(), any(), null) } returns response("|||https://example.com/thumb.jpg")

        assertEquals(job.url, tiktok().fetchMetadata(job).title)
    }

    // --- buildRequest ---

    @Test
    fun `buildRequest builds the audio extraction options`() {
        val job = DownloadJob("id-1", "https://www.tiktok.com/@someuser/video/123", "audio", "192")

        val request = tiktok().buildRequest(job, "/out/%(ext)s")

        assertEquals("bestaudio/best", request.getOption("-f"))
        assertTrue(request.hasOption("-x"))
        assertEquals("mp3", request.getOption("--audio-format"))
        assertEquals("192K", request.getOption("--audio-quality"))
    }

    @Test
    fun `buildRequest applies a height filter for a specific video quality`() {
        val job = DownloadJob("id-1", "https://www.tiktok.com/@someuser/video/123", "video", "720")

        val request = tiktok().buildRequest(job, "/out/%(ext)s")

        assertEquals(
            "bestvideo[height<=720]+bestaudio/best[height<=720]/best[height<=720]",
            request.getOption("-f")
        )
        assertEquals("mp4", request.getOption("--merge-output-format"))
    }

    @Test
    fun `buildRequest omits the height filter for the best video quality`() {
        val job = DownloadJob("id-1", "https://www.tiktok.com/@someuser/video/123", "video", "best")

        val request = tiktok().buildRequest(job, "/out/%(ext)s")

        assertEquals("bestvideo+bestaudio/best/best", request.getOption("-f"))
    }

    // --- isRetryableError / describeError ---

    @Test
    fun `isRetryableError is true for any error, since there's no known-permanent failure generically`() {
        assertTrue(tiktok().isRetryableError(RuntimeException("HTTP Error 403: Forbidden")))
    }

    @Test
    fun `describeError wraps any message as errors raw with the raw text as a param`() {
        assertEquals("errors.raw" to mapOf("raw" to "boom"), tiktok().describeError(RuntimeException("boom")))
    }
}
