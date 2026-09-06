package expo.modules.ytdlp

import java.io.File

/** Characters not allowed in a filename on common filesystems. */
private val ILLEGAL_FILENAME_CHARS = Regex("[\\\\/:*?\"<>|]")

/** Turns a yt-dlp job's raw output filename into a human, collision-safe title-based name. */
internal object FileNaming {
    private val lock = Any()

    /** Mirrors sanitizeFilename() in server/src/index.ts and app/App.tsx. */
    fun sanitizeFilename(name: String): String {
        val cleaned = name.replace(ILLEGAL_FILENAME_CHARS, "").trim()
        return cleaned.ifEmpty { "download" }
    }

    /**
     * Renames the yt-dlp output (named by job id) to a human filename, deduping on collision.
     * Serialized on [lock] — MAX_PARALLEL lets two jobs finish at once, and without a lock two
     * jobs picking the same title could both pass the exists() check before either renames,
     * causing the second rename to silently overwrite the first job's file.
     */
    fun renameToTitledFile(source: File, title: String, ext: String): File = synchronized(lock) {
        val base = sanitizeFilename(title)
        var candidate = File(source.parentFile, "$base.$ext")
        var suffix = 2
        while (candidate.exists() && candidate != source) {
            candidate = File(source.parentFile, "$base ($suffix).$ext")
            suffix++
        }
        return@synchronized if (candidate == source || source.renameTo(candidate)) candidate else source
    }
}
