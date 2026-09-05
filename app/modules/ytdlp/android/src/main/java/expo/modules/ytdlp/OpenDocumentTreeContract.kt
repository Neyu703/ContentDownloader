package expo.modules.ytdlp

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import expo.modules.kotlin.activityresult.AppContextActivityResultContract

/**
 * Launches Android's Storage Access Framework folder picker (ACTION_OPEN_DOCUMENT_TREE) so the
 * user can choose a custom Downloads folder. The unused String input only exists because
 * AppContextActivityResultContract requires a Serializable input type.
 */
class OpenDocumentTreeContract : AppContextActivityResultContract<String, Uri?> {
    override fun createIntent(context: Context, input: String): Intent =
        Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)

    override fun parseResult(input: String, resultCode: Int, intent: Intent?): Uri? =
        if (resultCode == Activity.RESULT_OK) intent?.data else null
}
