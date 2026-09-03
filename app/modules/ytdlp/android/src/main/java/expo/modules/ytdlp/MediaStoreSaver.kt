package expo.modules.ytdlp

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.io.File

/**
 * Saves a file from the app's private cache into the public Downloads collection, so it shows up
 * in the device's own Files app instead of only being reachable through the share sheet. Android
 * dedupes a colliding display name on its own (appends " (1)", " (2)", ...), so no manual
 * uniqueness handling is needed here.
 */
object MediaStoreSaver {
    fun saveToDownloads(context: Context, sourcePath: String, filename: String, mimeType: String): String {
        val appContext = context.applicationContext
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            throw UnsupportedOperationException("errors.saveRequiresAndroid10")
        }

        val resolver = appContext.contentResolver
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
}
