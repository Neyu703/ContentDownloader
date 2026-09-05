package expo.modules.ytdlp.platforms

import org.junit.Assert.assertEquals
import org.junit.Test

class ErrorDescriptionTest {
    @Test
    fun `strips the ERROR prefix from the last non-empty line`() {
        val error = RuntimeException("WARNING: ignored\n\nERROR: the real reason")
        assertEquals("the real reason", describeErrorRaw(error))
    }

    @Test
    fun `walks the cause chain when the top message is blank`() {
        val cause = IllegalStateException("root cause")
        val wrapper = RuntimeException(null, cause)

        assertEquals("IllegalStateException: root cause", describeErrorRaw(wrapper))
    }

    @Test
    fun `skips a cause with a blank message and keeps walking`() {
        val root = IllegalStateException("real reason")
        val blankCause = RuntimeException("   ", root)
        val wrapper = RuntimeException(null, blankCause)

        assertEquals("IllegalStateException: real reason", describeErrorRaw(wrapper))
    }

    @Test
    fun `falls back to the class name when no message exists anywhere`() {
        val wrapper = RuntimeException(null, RuntimeException())
        assertEquals("RuntimeException", describeErrorRaw(wrapper))
    }
}
