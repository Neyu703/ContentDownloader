package expo.modules.ytdlp

import android.content.Context
import java.io.File

private const val COOKIES_FILE_NAME = "cookies.txt"

/**
 * Persists a user-imported Netscape-format cookies.txt in app-private storage, read by every
 * yt-dlp invocation via --cookies once present. Mirrors server/src/cookies.ts.
 */
object CookiesStore {
    private fun file(context: Context): File = File(context.filesDir, COOKIES_FILE_NAME)

    /** Writes the cookies file, replacing whatever was stored before. */
    fun save(context: Context, cookiesText: String) {
        file(context).writeText(cookiesText)
    }

    /** Removes the stored cookies file, if any. */
    fun clear(context: Context) {
        file(context).delete()
    }

    /** The stored cookies file's absolute path, or null if none is stored. */
    fun path(context: Context): String? = file(context).takeIf { it.exists() }?.absolutePath
}
