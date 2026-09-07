const NETSCAPE_COOKIE_LINE_FIELD_COUNT = 7;

/**
 * Whether `content` looks like a Netscape-format cookies.txt: every non-comment, non-blank line
 * has the 7 tab-separated fields yt-dlp's cookiejar parser expects. Catches a wrong file or
 * accidentally pasted content before it ever reaches the server.
 */
export function looksLikeNetscapeCookiesFile(content: string): boolean {
  const dataLines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  if (dataLines.length === 0) return false;
  return dataLines.every((line) => line.split("\t").length === NETSCAPE_COOKIE_LINE_FIELD_COUNT);
}
