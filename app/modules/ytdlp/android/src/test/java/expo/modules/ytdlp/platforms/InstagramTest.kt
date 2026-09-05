package expo.modules.ytdlp.platforms

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mirrors server/src/platforms/Instagram.test.ts. */
class InstagramTest {
    private fun instagram(url: String = "https://www.instagram.com/p/abc123/") = Instagram(url)

    // --- isRetryableError ---

    @Test
    fun `isRetryableError is false for a slideshow-carousel post with no video`() {
        assertFalse(instagram().isRetryableError(RuntimeException("ERROR: There is no video in this post")))
    }

    @Test
    fun `isRetryableError is true for any other error`() {
        assertTrue(instagram().isRetryableError(RuntimeException("HTTP Error 403: Forbidden")))
    }

    // --- describeError ---

    @Test
    fun `describeError rewrites a no-video error to the slideshow-not-supported key`() {
        val error = RuntimeException("There is no video in this post")
        assertEquals("errors.instagramSlideshowNotSupported" to null, instagram().describeError(error))
    }

    @Test
    fun `describeError matches the no-video pattern case-insensitively`() {
        val error = RuntimeException("NO VIDEO FORMATS FOUND")
        assertEquals("errors.instagramSlideshowNotSupported" to null, instagram().describeError(error))
    }

    @Test
    fun `describeError wraps an unrelated message as errors raw with the raw text as a param`() {
        assertEquals("errors.raw" to mapOf("raw" to "boom"), instagram().describeError(RuntimeException("boom")))
    }
}
