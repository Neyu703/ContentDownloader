package expo.modules.ytdlp

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File

@RunWith(RobolectricTestRunner::class)
class FileNamingTest {
    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
    }

    // --- sanitizeFilename() ---

    @Test
    fun `sanitizeFilename strips filesystem-illegal characters`() {
        assertEquals("My Video", FileNaming.sanitizeFilename("My/ Video:*?\"<>|"))
    }

    @Test
    fun `sanitizeFilename falls back to download when nothing legal remains`() {
        assertEquals("download", FileNaming.sanitizeFilename("///:::"))
    }

    // --- renameToTitledFile() ---

    @Test
    fun `renameToTitledFile renames the source to a sanitized title-based name`() {
        val dir = File(context.cacheDir, "rename-test-${System.nanoTime()}").apply { mkdirs() }
        val source = File(dir, "job-id.mp3").apply { writeText("x") }

        val result = FileNaming.renameToTitledFile(source, "My Video", "mp3")

        assertEquals("My Video.mp3", result.name)
        assertTrue(result.exists())
        assertFalse(source.exists())
    }

    @Test
    fun `renameToTitledFile appends a counter suffix when the target name already exists`() {
        val dir = File(context.cacheDir, "rename-test-${System.nanoTime()}").apply { mkdirs() }
        File(dir, "My Video.mp3").writeText("existing")
        val source = File(dir, "job-id.mp3").apply { writeText("new") }

        val result = FileNaming.renameToTitledFile(source, "My Video", "mp3")

        assertEquals("My Video (2).mp3", result.name)
    }

    @Test
    fun `renameToTitledFile leaves the file in place when the candidate already equals the source`() {
        val dir = File(context.cacheDir, "rename-test-${System.nanoTime()}").apply { mkdirs() }
        val source = File(dir, "My Video.mp3").apply { writeText("x") }

        val result = FileNaming.renameToTitledFile(source, "My Video", "mp3")

        assertEquals(source.absolutePath, result.absolutePath)
        assertTrue(result.exists())
    }

    @Test
    fun `renameToTitledFile returns the original source unchanged when the rename itself fails`() {
        val dir = File(context.cacheDir, "rename-test-${System.nanoTime()}").apply { mkdirs() }
        val source = File(dir, "job-id.mp3").apply { writeText("x") }
        // Windows refuses to rename a file that's still open elsewhere; holding a stream open on
        // it here is a reliable, portable-enough way to make source.renameTo(candidate) fail.
        source.inputStream().use {
            val result = FileNaming.renameToTitledFile(source, "My Video", "mp3")

            assertEquals(source.absolutePath, result.absolutePath)
            assertTrue(source.exists())
        }
    }
}
