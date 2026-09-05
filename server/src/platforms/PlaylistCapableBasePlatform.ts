import { runYtDlp } from "../ytdlpProcess.js";
import { PLAYLIST_PAGE_SIZE } from "../environment.js";
import { BasePlatform } from "./BasePlatform.js";
import type { PlaylistCapablePlatform, PlaylistEntry, PlaylistInfo } from "./Platform.js";

/**
 * Adds generic playlist listing to BasePlatform's generic single-item behavior. Only platforms
 * that yt-dlp can list via --flat-playlist extend this instead of BasePlatform directly.
 */
export abstract class PlaylistCapableBasePlatform extends BasePlatform implements PlaylistCapablePlatform {
  defaultThumbnail(entryId: string): string | null {
    return null;
  }

  /**
   * Lists one page of a playlist's entries (1-indexed, inclusive range), without downloading
   * anything. Paged so the UI can virtualize/infinite-scroll instead of enumerating an entire
   * (potentially thousand-video) playlist upfront.
   */
  async fetchPlaylistInfo(start = 1, count = PLAYLIST_PAGE_SIZE): Promise<PlaylistInfo> {
    // --flat-playlist skips per-video metadata fetches, so listing a page stays fast. Deliberately
    // no --no-playlist here — this is the one call that must resolve a playlist link into its
    // entries instead of rejecting it.
    const stdout = await runYtDlp([
      "--flat-playlist",
      "--dump-json",
      "--no-warnings",
      "--no-plugin-dirs",
      "--playlist-items",
      `${start}-${start + count - 1}`,
      this.url,
    ]);
    const entries: PlaylistEntry[] = [];
    let title = "Playlist";
    let totalCount: number | null = null;
    let sawFirstLine = false;

    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;
      const data = JSON.parse(line);
      if (!sawFirstLine) {
        sawFirstLine = true;
        title = data.playlist_title ?? data.playlist ?? "Playlist";
        totalCount = typeof data.playlist_count === "number" ? data.playlist_count : null;
      }
      const thumbnails = Array.isArray(data.thumbnails) ? data.thumbnails : [];
      entries.push({
        id: data.id,
        url: data.webpage_url ?? data.url,
        title: data.title ?? data.id,
        thumbnail: thumbnails.at(-1)?.url ?? (data.id ? this.defaultThumbnail(data.id) : null),
        duration: data.duration ?? null,
      });
    }

    return { title, entries, totalCount };
  }
}
