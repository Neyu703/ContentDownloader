package expo.modules.ytdlp

import android.content.Context
import android.net.Uri

private const val PREFS_NAME = "ytdlp_prefs"
private const val KEY_DOWNLOADS_FOLDER_URI = "downloadsFolderUri"

/**
 * Persists the user's chosen Downloads folder as a Storage Access Framework tree URI string, or
 * none for the default public Downloads collection (see MediaStoreSaver).
 */
object DownloadsFolderPreference {
    fun get(context: Context): String? =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(KEY_DOWNLOADS_FOLDER_URI, null)

    fun set(context: Context, treeUri: String?) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().apply {
            if (treeUri == null) remove(KEY_DOWNLOADS_FOLDER_URI) else putString(KEY_DOWNLOADS_FOLDER_URI, treeUri)
        }.apply()
    }
}

/** [DownloadsFolderPreference.get], parsed to a [Uri], or null the same way `get()` is. */
internal fun DownloadsFolderPreference.getUri(context: Context): Uri? = get(context)?.let { Uri.parse(it) }
