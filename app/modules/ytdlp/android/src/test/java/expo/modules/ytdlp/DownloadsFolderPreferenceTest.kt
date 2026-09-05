package expo.modules.ytdlp

import androidx.test.core.app.ApplicationProvider
import android.content.Context
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class DownloadsFolderPreferenceTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test
    fun `get returns null when nothing was ever saved`() {
        assertNull(DownloadsFolderPreference.get(context))
    }

    @Test
    fun `set persists the tree uri, get reads it back`() {
        DownloadsFolderPreference.set(context, "content://tree/downloads")
        assertEquals("content://tree/downloads", DownloadsFolderPreference.get(context))
    }

    @Test
    fun `set with null clears a previously saved tree uri`() {
        DownloadsFolderPreference.set(context, "content://tree/downloads")
        DownloadsFolderPreference.set(context, null)
        assertNull(DownloadsFolderPreference.get(context))
    }
}
