package expo.modules.ytdlp

import android.content.ContentResolver
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
    /** Copies `sourcePath` into `uri`, deleting it via `cleanup` and rethrowing on any failure. */
    private fun writeAndCleanupOnFailure(uri: Uri, resolver: ContentResolver, sourcePath: String, cleanup: () -> Unit) {
        try {
            resolver.openOutputStream(uri)?.use { output ->
                File(sourcePath).inputStream().use { input -> input.copyTo(output) }
            } ?: throw IllegalStateException("errors.saveOpenFailed")
        } catch (error: Throwable) {
            cleanup()
            throw error
        }
    }

    fun saveToDownloads(context: Context, sourcePath: String, filename: String, mimeType: String): String {
        val appContext = context.applicationContext
        val customFolderUri = DownloadsFolderPreference.getUri(appContext)
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

        writeAndCleanupOnFailure(uri, resolver, sourcePath) { resolver.delete(uri, null, null) }
        return uri.toString()
    }

    /**
     * Writes into the SAF tree the user picked via the folder picker (see YtdlpModule's
     * pickDownloadsFolder). The tree permission can outlive the picked folder actually being
     * reachable (deleted, moved, or on removed external storage), hence the explicit
     * errors.saveFolderUnavailable rather than silently falling back to the public Downloads folder.
     */
    private fun saveToCustomFolder(context: Context, treeUri: Uri, sourcePath: String, filename: String, mimeType: String): String {
        val folder = DocumentFile.fromTreeUri(context, treeUri)
            ?.takeIf { it.canWrite() }
            ?: throw IllegalStateException("errors.saveFolderUnavailable")
        val file = folder.createFile(mimeType, filename)
            ?: throw IllegalStateException("errors.saveInsertFailed")

        writeAndCleanupOnFailure(file.uri, context.contentResolver, sourcePath) { file.delete() }
        return file.uri.toString()
    }
}
