package expo.modules.ytdlp.platforms

import io.mockk.every
import io.mockk.mockkConstructor
import io.mockk.unmockkConstructor
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PlatformRegistryTest {

    @Test
    fun `recognizes a standard youtube com watch URL`() {
        assertTrue(detectPlatform("https://www.youtube.com/watch?v=dQw4w9WgXcQ") is YouTube)
    }

    @Test
    fun `recognizes a youtu be short link`() {
        assertTrue(detectPlatform("https://youtu.be/dQw4w9WgXcQ") is YouTube)
    }

    @Test
    fun `accepts plain http, not just https`() {
        assertTrue(detectPlatform("http://youtube.com/watch?v=dQw4w9WgXcQ") is YouTube)
    }

    @Test
    fun `recognizes a TikTok URL`() {
        assertTrue(detectPlatform("https://www.tiktok.com/@someuser/video/123") is TikTok)
    }

    @Test
    fun `recognizes an Instagram URL`() {
        assertTrue(detectPlatform("https://www.instagram.com/reel/abc") is Instagram)
    }

    @Test
    fun `recognizes a Twitter or X URL`() {
        assertTrue(detectPlatform("https://x.com/someuser/status/123") is Twitter)
    }

    @Test
    fun `recognizes a SoundCloud URL`() {
        assertTrue(detectPlatform("https://soundcloud.com/someartist/sometrack") is SoundCloud)
    }

    @Test
    fun `recognizes a Vimeo URL`() {
        assertTrue(detectPlatform("https://vimeo.com/12345") is Vimeo)
    }

    @Test
    fun `recognizes a Twitch clip URL`() {
        assertTrue(detectPlatform("https://clips.twitch.tv/SomeClipSlug") is Twitch)
    }

    @Test
    fun `rejects a disallowed host`() {
        assertNull(detectPlatform("https://example.com/watch?v=x"))
    }

    @Test
    fun `rejects a malformed URL`() {
        assertNull(detectPlatform("not a url at all"))
    }

    @Test
    fun `rejects a non-http s scheme`() {
        assertNull(detectPlatform("ftp://youtube.com/watch?v=x"))
    }

    @Test
    fun `host matching is case-insensitive`() {
        assertTrue(detectPlatform("https://WWW.YOUTUBE.COM/watch?v=x") is YouTube)
    }

    @Test
    fun `accepts a schemeless link once normalized internally`() {
        assertTrue(detectPlatform("youtube.com/watch?v=x") is YouTube)
    }

    @Test
    fun `returns null when a matched platform's checkAvailability throws`() {
        mockkConstructor(YouTube::class)
        try {
            every { anyConstructed<YouTube>().checkAvailability() } throws IllegalStateException("unavailable")
            assertNull(detectPlatform("https://www.youtube.com/watch?v=dQw4w9WgXcQ"))
        } finally {
            unmockkConstructor(YouTube::class)
        }
    }
}
