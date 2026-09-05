package expo.modules.ytdlp

import org.junit.Assert.assertEquals
import org.junit.Test

class UrlTest {
    @Test
    fun `normalizeUrl prepends https to a schemeless link`() {
        assertEquals("https://youtube.com/watch?v=jNQXAC9IVRw", normalizeUrl("youtube.com/watch?v=jNQXAC9IVRw"))
    }

    @Test
    fun `normalizeUrl leaves an already-schemed link unchanged`() {
        assertEquals("http://youtube.com/watch?v=x", normalizeUrl("http://youtube.com/watch?v=x"))
    }

    @Test
    fun `normalizeUrl trims surrounding whitespace before checking for a scheme`() {
        assertEquals("https://youtu.be/x", normalizeUrl("  youtu.be/x  "))
    }

    @Test
    fun `normalizeUrl prepends https to a schemeless www link`() {
        assertEquals("https://www.youtube.com/watch?v=x", normalizeUrl("www.youtube.com/watch?v=x"))
    }
}
