package expo.modules.ytdlp

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class CookiesStoreTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test
    fun `path returns null when no cookies were ever saved`() {
        assertNull(CookiesStore.path(context))
    }

    @Test
    fun `save persists the cookies file, path reads it back`() {
        CookiesStore.save(context, "# Netscape HTTP Cookie File\n")
        val path = CookiesStore.path(context)
        assertTrue(path != null && path.endsWith("cookies.txt"))
    }

    @Test
    fun `clear removes a previously saved cookies file`() {
        CookiesStore.save(context, "# Netscape HTTP Cookie File\n")
        CookiesStore.clear(context)
        assertNull(CookiesStore.path(context))
    }

    @Test
    fun `clear is a no-op when nothing was ever saved`() {
        CookiesStore.clear(context)
        assertNull(CookiesStore.path(context))
    }

    @Test
    fun `save overwrites the previous cookies content`() {
        CookiesStore.save(context, "first")
        CookiesStore.save(context, "second")
        val path = CookiesStore.path(context)!!
        assertEquals("second", java.io.File(path).readText())
    }
}
