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

private const val MAX_LINES = 500

@RunWith(RobolectricTestRunner::class)
class DebugLogTest {
    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        resetDebugLogSingletonState()
    }

    /** [DebugLog] is a process-wide singleton; each test needs a clean slate. */
    private fun resetDebugLogSingletonState() {
        val linesField = DebugLog::class.java.getDeclaredField("lines").apply { isAccessible = true }
        (linesField.get(DebugLog) as ArrayDeque<*>).clear()
        val deviceInfoLoggedField = DebugLog::class.java.getDeclaredField("deviceInfoLogged").apply { isAccessible = true }
        deviceInfoLoggedField.setBoolean(DebugLog, false)
    }

    @Test
    fun `add appends a timestamped line to the snapshot`() {
        DebugLog.add("hello")

        assertTrue(DebugLog.snapshot().endsWith("] hello"))
    }

    @Test
    fun `snapshot joins multiple lines with newlines, in insertion order`() {
        DebugLog.add("first")
        DebugLog.add("second")

        val lines = DebugLog.snapshot().split("\n")

        assertEquals(2, lines.size)
        assertTrue(lines[0].endsWith("] first"))
        assertTrue(lines[1].endsWith("] second"))
    }

    @Test
    fun `add evicts the oldest line once the ring buffer exceeds MAX_LINES`() {
        repeat(MAX_LINES + 1) { DebugLog.add("line-$it") }

        val lines = DebugLog.snapshot().split("\n")

        assertEquals(MAX_LINES, lines.size)
        assertTrue(lines.first().endsWith("] line-1"))
        assertTrue(lines.last().endsWith("] line-$MAX_LINES"))
    }

    @Test
    fun `addError appends the context plus the full stack trace`() {
        val error = IllegalStateException("boom")

        DebugLog.addError("job x failed", error)

        val snapshot = DebugLog.snapshot()
        assertTrue(snapshot.contains("job x failed"))
        assertTrue(snapshot.contains("IllegalStateException"))
        assertTrue(snapshot.contains("boom"))
    }

    @Test
    fun `logDeviceInfoOnce adds a device line the first time`() {
        DebugLog.logDeviceInfoOnce(context)

        assertTrue(DebugLog.snapshot().contains("device:"))
    }

    @Test
    fun `logDeviceInfoOnce still adds a device line when the package info lookup fails`() {
        // A real (unmocked) PackageManager.NameNotFoundException, thrown naturally for a package
        // name that doesn't exist, rather than one injected via a mock.
        val bogusPackageContext = object : android.content.ContextWrapper(context) {
            override fun getPackageName() = "this.package.does.not.exist"
            override fun getApplicationContext(): Context = this
        }

        DebugLog.logDeviceInfoOnce(bogusPackageContext)

        assertTrue(DebugLog.snapshot().contains("app null"))
    }

    @Test
    fun `logDeviceInfoOnce is a no-op on subsequent calls`() {
        DebugLog.logDeviceInfoOnce(context)
        DebugLog.logDeviceInfoOnce(context)

        val deviceLineCount = DebugLog.snapshot().split("\n").count { it.contains("device:") }
        assertEquals(1, deviceLineCount)
    }

    @Test
    fun `writeToFile writes the current snapshot to a fixed cache file and returns its path`() {
        DebugLog.add("a line")

        val path = DebugLog.writeToFile(context)

        val file = File(path)
        assertTrue(file.exists())
        assertEquals(File(context.cacheDir, "ytdlp-debug-log.txt").absolutePath, path)
        assertTrue(file.readText().endsWith("] a line"))
    }

    @Test
    fun `writeToFile overwrites rather than accumulating a new file per call`() {
        DebugLog.add("first snapshot")
        DebugLog.writeToFile(context)
        resetDebugLogSingletonState()
        DebugLog.add("second snapshot")

        val path = DebugLog.writeToFile(context)

        val content = File(path).readText()
        assertFalse(content.contains("first snapshot"))
        assertTrue(content.contains("second snapshot"))
    }
}
