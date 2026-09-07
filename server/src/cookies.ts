import fs from "node:fs";
import path from "node:path";

export const COOKIES_FILE = path.join(process.cwd(), "data", "cookies.txt");

/**
 * Writes the Netscape-format cookies.txt content, replacing whatever was stored before. Locked to
 * owner-only read/write (0600) — this file holds real YouTube login-session cookies. The `mode`
 * option on writeFileSync only applies when the file doesn't already exist yet, so chmod
 * explicitly afterwards to also cover the overwrite case.
 */
export function saveCookies(text: string): void {
  fs.mkdirSync(path.dirname(COOKIES_FILE), { recursive: true });
  fs.writeFileSync(COOKIES_FILE, text, { encoding: "utf-8", mode: 0o600 });
  fs.chmodSync(COOKIES_FILE, 0o600);
}

/** Removes the stored cookies file, if any. */
export function deleteCookies(): void {
  if (fs.existsSync(COOKIES_FILE)) fs.unlinkSync(COOKIES_FILE);
}

export interface CookiesStatus {
  present: boolean;
  updatedAt: string | null;
}

/** Whether cookies are currently stored, and when they were last written. */
export function getCookiesStatus(): CookiesStatus {
  if (!fs.existsSync(COOKIES_FILE)) return { present: false, updatedAt: null };
  return { present: true, updatedAt: fs.statSync(COOKIES_FILE).mtime.toISOString() };
}

/** The `--cookies <file>` yt-dlp flag if cookies are stored, otherwise no flag at all. */
export function cookiesArgs(): string[] {
  return fs.existsSync(COOKIES_FILE) ? ["--cookies", COOKIES_FILE] : [];
}
