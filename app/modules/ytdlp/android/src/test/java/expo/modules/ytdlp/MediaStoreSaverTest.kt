package expo.modules.ytdlp

import android.content.ContentResolver
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.provider.MediaStore
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File

@RunWith(RobolectricTestRunner::class)
class MediaStoreSaverTest {
    private lateinit var context: Context
    private lateinit var resolver: ContentResolver
    private lateinit var sourceFile: File

    @Before
    fun setUp() {
        context = mockk(relaxed = true)
        resolver = mockk(relaxed = true)
        every { context.applicationContext } returns context
        every { context.contentResolver } returns resolver

        sourceFile = File.createTempFile("mediastoresaver-test", ".mp3")
        sourceFile.writeBytes(byteArrayOf(1, 2, 3))
    }

    @After
    fun tearDown() {
        sourceFile.delete()
    }

    @Config(sdk = [28])
    @Test
    fun `throws on Android versions older than Q`() {
        val error = assertThrows(UnsupportedOperationException::class.java) {
            MediaStoreSaver.saveToDownloads(context, sourceFile.absolutePath, "song.mp3", "audio/mpeg")
        }
        assertEquals("Speichern erfordert Android 10 oder neuer.", error.message)
    }

    @Config(sdk = [29])
    @Test
    fun `throws when the resolver cannot create a Downloads entry`() {
        every { resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, any()) } returns null

        val error = assertThrows(IllegalStateException::class.java) {
            MediaStoreSaver.saveToDownloads(context, sourceFile.absolutePath, "song.mp3", "audio/mpeg")
        }
        assertEquals("Konnte keinen Downloads-Eintrag anlegen.", error.message)
    }

    @Config(sdk = [29])
    @Test
    fun `throws and deletes the entry when the resolver cannot open an output stream`() {
        val uri = mockk<Uri>()
        every { resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, any()) } returns uri
        every { resolver.openOutputStream(uri) } returns null

        val error = assertThrows(IllegalStateException::class.java) {
            MediaStoreSaver.saveToDownloads(context, sourceFile.absolutePath, "song.mp3", "audio/mpeg")
        }
        assertEquals("Konnte Downloads-Eintrag nicht öffnen.", error.message)
        verify { resolver.delete(uri, null, null) }
    }

    @Config(sdk = [29])
    @Test
    fun `deletes the entry and rethrows when copying the file throws`() {
        val uri = mockk<Uri>()
        every { resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, any()) } returns uri
        every { resolver.openOutputStream(uri) } throws java.io.IOException("disk full")

        val error = assertThrows(java.io.IOException::class.java) {
            MediaStoreSaver.saveToDownloads(context, sourceFile.absolutePath, "song.mp3", "audio/mpeg")
        }
        assertEquals("disk full", error.message)
        verify { resolver.delete(uri, null, null) }
    }

    @Config(sdk = [29])
    @Test
    fun `deletes the entry and preserves the write error when closing the output stream also fails`() {
        val uri = mockk<Uri>()
        val failingOutput = object : java.io.OutputStream() {
            override fun write(b: Int) = throw java.io.IOException("write failed")
            override fun close() = throw java.io.IOException("output close failed")
        }
        every { resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, any()) } returns uri
        every { resolver.openOutputStream(uri) } returns failingOutput

        val error = assertThrows(java.io.IOException::class.java) {
            MediaStoreSaver.saveToDownloads(context, sourceFile.absolutePath, "song.mp3", "audio/mpeg")
        }
        assertEquals("write failed", error.message)
        verify { resolver.delete(uri, null, null) }
    }

    @Config(sdk = [29])
    @Test
    fun `copies the source file into the resolved output stream and returns the uri`() {
        val uri = mockk<Uri>()
        val output = ByteArrayOutputStream()
        every { uri.toString() } returns "content://downloads/song"
        every { resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, any()) } returns uri
        every { resolver.openOutputStream(uri) } returns output

        val result = MediaStoreSaver.saveToDownloads(context, sourceFile.absolutePath, "song.mp3", "audio/mpeg")

        assertEquals("content://downloads/song", result)
        assertEquals(listOf<Byte>(1, 2, 3), output.toByteArray().toList())
        verify(exactly = 0) { resolver.delete(any(), any(), any()) }
    }

    @Config(sdk = [29])
    @Test
    fun `fills in the display name, mime type and Downloads relative path`() {
        val uri = mockk<Uri>()
        val values = slot<ContentValues>()
        every { resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, capture(values)) } returns uri
        every { resolver.openOutputStream(uri) } returns ByteArrayOutputStream()

        MediaStoreSaver.saveToDownloads(context, sourceFile.absolutePath, "song.mp3", "audio/mpeg")

        assertEquals("song.mp3", values.captured.getAsString(MediaStore.MediaColumns.DISPLAY_NAME))
        assertEquals("audio/mpeg", values.captured.getAsString(MediaStore.MediaColumns.MIME_TYPE))
    }
}
