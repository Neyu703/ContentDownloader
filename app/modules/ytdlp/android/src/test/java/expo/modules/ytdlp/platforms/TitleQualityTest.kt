package expo.modules.ytdlp.platforms

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mirrors server/src/platforms/titleQuality.test.ts. */
class TitleQualityTest {
    // --- isLowQualityTitle ---

    @Test
    fun `isLowQualityTitle flags Instagram's synthesized 'Video by X' placeholder`() {
        assertTrue(isLowQualityTitle("Video by dubisthalle"))
    }

    @Test
    fun `isLowQualityTitle flags Instagram's synthesized 'Photo by X' placeholder`() {
        assertTrue(isLowQualityTitle("Photo by someone"))
    }

    @Test
    fun `isLowQualityTitle flags a bare hashtag (TikTok)`() {
        assertTrue(isLowQualityTitle("#foryou"))
    }

    @Test
    fun `isLowQualityTitle flags an empty or whitespace-only title`() {
        assertTrue(isLowQualityTitle("   "))
    }

    @Test
    fun `isLowQualityTitle does not flag a real title`() {
        assertFalse(isLowQualityTitle("How to bake bread"))
    }

    // --- pickTitle ---

    @Test
    fun `pickTitle uses the title as-is when it's not low quality`() {
        assertEquals("How to bake bread", pickTitle(TitleSource(title = "How to bake bread")))
    }

    @Test
    fun `pickTitle falls back to the first non-empty caption line when the title is a placeholder`() {
        val result = pickTitle(TitleSource(title = "Video by dubisthalle", description = "\n\nMy trip to the mountains\nmore text"))
        assertEquals("My trip to the mountains", result)
    }

    @Test
    fun `pickTitle truncates a very long caption fallback to 100 characters with an ellipsis`() {
        val longCaption = "a".repeat(150)
        val result = pickTitle(TitleSource(title = "#foryou", description = longCaption))
        assertEquals("${"a".repeat(100)}…", result)
    }

    @Test
    fun `pickTitle skips a caption that is itself low quality`() {
        val result = pickTitle(TitleSource(title = "Video by dubisthalle", description = "#foryou", uploader = "dubisthalle"))
        assertEquals("dubisthalle", result)
    }

    @Test
    fun `pickTitle composes uploader and formatted upload date when there's no usable title or caption`() {
        val result = pickTitle(TitleSource(title = "Video by dubisthalle", uploader = "dubisthalle", uploadDate = "20260115"))
        assertEquals("dubisthalle - 2026-01-15", result)
    }

    @Test
    fun `pickTitle uses just the uploader when there's no upload date`() {
        assertEquals("someuser", pickTitle(TitleSource(title = "#foryou", uploader = "someuser")))
    }

    @Test
    fun `pickTitle ignores a malformed upload date`() {
        assertEquals("X", pickTitle(TitleSource(title = "Video by X", uploader = "X", uploadDate = "not-a-date")))
    }

    @Test
    fun `pickTitle treats a whitespace-only description as no caption at all`() {
        val result = pickTitle(
            TitleSource(title = "Video by dubisthalle", description = "   \n   ", uploader = "dubisthalle", uploadDate = "20260115")
        )
        assertEquals("dubisthalle - 2026-01-15", result)
    }

    @Test
    fun `pickTitle falls back to the placeholder title when nothing else is available`() {
        assertEquals("Video by dubisthalle", pickTitle(TitleSource(title = "Video by dubisthalle")))
    }

    @Test
    fun `pickTitle falls back to the id when there's no title at all`() {
        assertEquals("ABC123", pickTitle(TitleSource(id = "ABC123")))
    }

    @Test
    fun `pickTitle falls back to 'Unknown title' when nothing at all is available`() {
        assertEquals("Unknown title", pickTitle(TitleSource()))
    }
}
