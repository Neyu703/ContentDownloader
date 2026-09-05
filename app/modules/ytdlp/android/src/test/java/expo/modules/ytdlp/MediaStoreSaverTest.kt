package expo.modules.ytdlp

import android.content.ContentResolver
import android.content.ContentValues
import android.content.Context
import android.content.SharedPreferences
import android.net.Uri
import android.provider.MediaStore
import androidx.documentfile.provider.DocumentFile
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.slot
import io.mockk.unmockkStatic
import io.mockk.verify
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.ByteArrayOutputStream
import java.io.File

@RunWith(RobolectricTestRunner::class)
class MediaStoreSaverTest {
    private lateinit var context: Context
    private lateinit var resolver: ContentResolver
    private lateinit var prefs: SharedPreferences
    private lateinit var sourceFile: File

    @Before
    fun setUp() {
        context = mockk(relaxed = true)
        resolver = mockk(relaxed = true)
        // No custom folder saved by default, so every existing test below keeps exercising the
        // public-Downloads (MediaStore) path exactly as before.
        prefs = mockk(relaxed = true)
        every { prefs.getString(any(), any()) } returns null
        every { context.applicationContext } returns context
        every { context.contentResolver } returns resolver
        every { context.getSharedPreferences(any(), any()) } returns prefs

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
        assertEquals("errors.saveRequiresAndroid10", error.message)
    }

    @Config(sdk = [29])
    @Test
    fun `throws when the resolver cannot create a Downloads entry`() {
        every { resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, any()) } returns null

        val error = assertThrows(IllegalStateException::class.java) {
            MediaStoreSaver.saveToDownloads(context, sourceFile.absolutePath, "song.mp3", "audio/mpeg")
        }
        assertEquals("errors.saveInsertFailed", error.message)
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
        assertEquals("errors.saveOpenFailed", error.message)
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

    // --- custom folder (Storage Access Framework) ---
    // Uri.parse() is left un-mocked throughout — Robolectric's real shadow of android.net.Uri
    // handles it correctly, only DocumentFile (an AndroidX library class) needs mockkStatic.

    private val treeUriString = "content://tree/downloads"
    private val treeUri: Uri get() = Uri.parse(treeUriString)

    @Before
    fun setUpCustomFolder() {
        mockkStatic(DocumentFile::class)
    }

    @After
    fun tearDownCustomFolder() {
        unmockkStatic(DocumentFile::class)
    }

    private fun useCustomFolder() {
        every { prefs.getString(any(), any()) } returns treeUriString
    }

    @Test
    fun `writes into the custom folder instead of MediaStore when one is saved`() {
        useCustomFolder()
        val folder = mockk<DocumentFile>()
        every { DocumentFile.fromTreeUri(context, treeUri) } returns folder
        every { folder.canWrite() } returns true
        val fileUri = Uri.parse("content://tree/downloads/document/song.mp3")
        val file = mockk<DocumentFile>()
        every { file.uri } returns fileUri
        every { folder.createFile("audio/mpeg", "song.mp3") } returns file
        val output = ByteArrayOutputStream()
        every { resolver.openOutputStream(fileUri) } returns output

        val result = MediaStoreSaver.saveToDownloads(context, sourceFile.absolutePath, "song.mp3", "audio/mpeg")

        assertEquals("content://tree/downloads/document/song.mp3", result)
        assertEquals(listOf<Byte>(1, 2, 3), output.toByteArray().toList())
        verify(exactly = 0) { resolver.insert(any(), any()) }
    }

    @Test
    fun `throws when the saved tree is no longer reachable`() {
        useCustomFolder()
        every { DocumentFile.fromTreeUri(context, treeUri) } returns null

        val error = assertThrows(IllegalStateException::class.java) {
            MediaStoreSaver.saveToDownloads(context, sourceFile.absolutePath, "song.mp3", "audio/mpeg")
        }
        assertEquals("errors.saveFolderUnavailable", error.message)
    }

    @Test
    fun `throws when the saved tree is no longer writable`() {
        useCustomFolder()
        val folder = mockk<DocumentFile>()
        every { DocumentFile.fromTreeUri(context, treeUri) } returns folder
        every { folder.canWrite() } returns false

        val error = assertThrows(IllegalStateException::class.java) {
            MediaStoreSaver.saveToDownloads(context, sourceFile.absolutePath, "song.mp3", "audio/mpeg")
        }
        assertEquals("errors.saveFolderUnavailable", error.message)
    }

    @Test
    fun `throws when the folder cannot create the file`() {
        useCustomFolder()
        val folder = mockk<DocumentFile>()
        every { DocumentFile.fromTreeUri(context, treeUri) } returns folder
        every { folder.canWrite() } returns true
        every { folder.createFile("audio/mpeg", "song.mp3") } returns null

        val error = assertThrows(IllegalStateException::class.java) {
            MediaStoreSaver.saveToDownloads(context, sourceFile.absolutePath, "song.mp3", "audio/mpeg")
        }
        assertEquals("errors.saveInsertFailed", error.message)
    }

    @Test
    fun `throws and deletes the created document when the output stream cannot be opened`() {
        useCustomFolder()
        val folder = mockk<DocumentFile>()
        every { DocumentFile.fromTreeUri(context, treeUri) } returns folder
        every { folder.canWrite() } returns true
        val fileUri = Uri.parse("content://tree/downloads/document/song.mp3")
        val file = mockk<DocumentFile>(relaxed = true)
        every { file.uri } returns fileUri
        every { folder.createFile("audio/mpeg", "song.mp3") } returns file
        every { resolver.openOutputStream(fileUri) } returns null

        val error = assertThrows(IllegalStateException::class.java) {
            MediaStoreSaver.saveToDownloads(context, sourceFile.absolutePath, "song.mp3", "audio/mpeg")
        }
        assertEquals("errors.saveOpenFailed", error.message)
        verify { file.delete() }
    }

    @Test
    fun `throws and deletes the created document when copying the file fails`() {
        useCustomFolder()
        val folder = mockk<DocumentFile>()
        every { DocumentFile.fromTreeUri(context, treeUri) } returns folder
        every { folder.canWrite() } returns true
        val fileUri = Uri.parse("content://tree/downloads/document/song.mp3")
        val file = mockk<DocumentFile>(relaxed = true)
        every { file.uri } returns fileUri
        every { folder.createFile("audio/mpeg", "song.mp3") } returns file
        every { resolver.openOutputStream(fileUri) } throws java.io.IOException("disk full")

        val error = assertThrows(java.io.IOException::class.java) {
            MediaStoreSaver.saveToDownloads(context, sourceFile.absolutePath, "song.mp3", "audio/mpeg")
        }
        assertEquals("disk full", error.message)
        verify { file.delete() }
    }
}
