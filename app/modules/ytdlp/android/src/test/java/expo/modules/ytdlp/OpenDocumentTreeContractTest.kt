package expo.modules.ytdlp

import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class OpenDocumentTreeContractTest {
    private val contract = OpenDocumentTreeContract()

    @Test
    fun `createIntent builds an ACTION_OPEN_DOCUMENT_TREE intent with read and write grant flags`() {
        val intent = contract.createIntent(ApplicationProvider.getApplicationContext(), "")

        assertEquals(Intent.ACTION_OPEN_DOCUMENT_TREE, intent.action)
        assertEquals(
            Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
            intent.flags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        )
    }

    @Test
    fun `parseResult returns the picked tree uri on RESULT_OK`() {
        val uri = Uri.parse("content://tree/downloads")
        val resultIntent = Intent().setData(uri)

        assertEquals(uri, contract.parseResult("", Activity.RESULT_OK, resultIntent))
    }

    @Test
    fun `parseResult returns null when the user cancelled`() {
        assertNull(contract.parseResult("", Activity.RESULT_CANCELED, Intent()))
    }

    @Test
    fun `parseResult returns null when RESULT_OK carries no intent`() {
        assertNull(contract.parseResult("", Activity.RESULT_OK, null))
    }
}
