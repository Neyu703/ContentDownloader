package expo.modules.ytdlp

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.documentfile.provider.DocumentFile
import java.io.File

/**
 * Saves a file from the app's private cache into either a user-chosen folder (Storage Access
 * Framework, if one was picked in Settings — see DownloadsFolderPreference) or the public
 * Downloads collection, so it shows up in the device's own Files app instead of only being
 * reachable through the share sheet.
 */
object MediaStoreSaver {
    fun saveToDownloads(context: Context, sourcePath: String, filename: String, mimeType: String): String {
        val appContext = context.applicationContext
        val customFolderUri = DownloadsFolderPreference.get(appContext)
        return if (customFolderUri != null) {
            saveToCustomFolder(appContext, customFolderUri, sourcePath, filename, mimeType)
        } else {
            saveToPublicDownloads(appContext, sourcePath, filename, mimeType)
        }
    }

    /** Android dedupes a colliding display name on its own (appends " (1)", " (2)", ...), so no manual uniqueness handling is needed here. */
    private fun saveToPublicDownloads(context: Context, sourcePath: String, filename: String, mimeType: String): String {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            throw UnsupportedOperationException("errors.saveRequiresAndroid10")
        }

        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
            put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
        }
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            ?: throw IllegalStateException("errors.saveInsertFailed")

        try {
            resolver.openOutputStream(uri)?.use { output ->
                File(sourcePath).inputStream().use { input -> input.copyTo(output) }
            } ?: throw IllegalStateException("errors.saveOpenFailed")
        } catch (error: Throwable) {
            resolver.delete(uri, null, null)
            throw error
        }

        return uri.toString()
    }

    /**
     * Writes into the SAF tree the user picked via the folder picker (see YtdlpModule's
     * pickDownloadsFolder). The tree permission can outlive the picked folder actually being
     * reachable (deleted, moved, or on removed external storage), hence the explicit
     * errors.saveFolderUnavailable rather than silently falling back to the public Downloads folder.
     */
    private fun saveToCustomFolder(context: Context, treeUriString: String, sourcePath: String, filename: String, mimeType: String): String {
        val folder = DocumentFile.fromTreeUri(context, Uri.parse(treeUriString))
            ?.takeIf { it.canWrite() }
            ?: throw IllegalStateException("errors.saveFolderUnavailable")
        val file = folder.createFile(mimeType, filename)
            ?: throw IllegalStateException("errors.saveInsertFailed")

        try {
            context.contentResolver.openOutputStream(file.uri)?.use { output ->
                File(sourcePath).inputStream().use { input -> input.copyTo(output) }
            } ?: throw IllegalStateException("errors.saveOpenFailed")
        } catch (error: Throwable) {
            file.delete()
            throw error
        }

        return file.uri.toString()
    }
}
