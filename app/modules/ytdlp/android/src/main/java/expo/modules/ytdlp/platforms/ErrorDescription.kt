package expo.modules.ytdlp.platforms

import expo.modules.ytdlp.nonEmptyTrimmedLines

/**
 * Extracts the actionable part of a yt-dlp failure: the last non-empty line of the top-level
 * message, or (if that's blank) the innermost non-blank cause message. Shared by every
 * BasePlatform.describeError() so the raw-text extraction lives in exactly one place.
 */
internal fun describeErrorRaw(error: Throwable): String {
    val raw = error.message?.trim().orEmpty()
    if (raw.isEmpty()) {
        // Wrapper exceptions (ExceptionInInitializerError, InvocationTargetException, ...)
        // carry no message of their own — the actionable detail is in the innermost cause.
        var cause = error.cause
        while (cause != null) {
            val causeMessage = cause.message?.trim()
            if (!causeMessage.isNullOrEmpty()) {
                return "${cause::class.java.simpleName}: $causeMessage"
            }
            cause = cause.cause
        }
        return error::class.java.simpleName
    }
    // raw is already non-empty (checked above) and whole-string-trimmed, so it has at least
    // one non-whitespace character — nonEmptyTrimmedLines(raw) can never be empty here.
    return nonEmptyTrimmedLines(raw).last().removePrefix("ERROR: ")
}
