package expo.modules.ytdlp

/** Characters that require quoting a shell argument for the reproducible command in the debug log. */
private val SHELL_SPECIAL_CHARS = Regex("[\\s\"'\$`\\\\]")

/** Characters that need a backslash escape inside a quoted shell argument. */
private val SHELL_ESCAPE_CHARS = Regex("[\"\\\\\$`]")

/** Formats a yt-dlp request into one copy-pasteable shell command line, for the debug log. */
internal object ShellCommandFormatter {
    /** Quotes one shell argument, only when it actually contains a character that needs it. */
    private fun quoteArg(arg: String): String =
        if (SHELL_SPECIAL_CHARS.containsMatchIn(arg)) "\"${SHELL_ESCAPE_CHARS.replace(arg) { "\\${it.value}" }}\"" else arg

    /** Quotes a yt-dlp request's options (plus the target URL) into one copy-pasteable shell command. */
    fun quoteCommand(options: List<Pair<String, String?>>, url: String): String {
        val tokens = options.flatMap { (flag, value) -> if (value != null) listOf(flag, value) else listOf(flag) } + url
        return tokens.joinToString(" ") { quoteArg(it) }
    }
}
