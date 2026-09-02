/**
 * Types shared between the app's platform-agnostic Downloader layer (downloader/types.ts) and the
 * native ytdlp module's JS surface (modules/ytdlp/index.ts). Pure type declarations only, no
 * runtime imports — modules/ytdlp/index.ts calls requireNativeModule() at import time, which
 * throws on web, so nothing that pulls that file in transitively may live here.
 */

/** One-time setup before the first download can start. Native only unpacks/updates yt-dlp once. */
export type SetupPhase = "idle" | "preparing" | "updating" | "ready" | "failed";

/**
 * Every phase a download can be in, on both platforms. Web never produces "queued" (the server
 * starts jobs immediately) or "merging" (it only reports "converting"), but the union is shared so
 * the UI has one set of labels to maintain.
 */
export type JobPhase =
  | "queued"
  | "fetching_info"
  | "downloading"
  | "converting"
  | "merging"
  | "done"
  | "error"
  | "cancelled";

export interface PlaylistEntry {
  id: string;
  url: string;
  title: string;
  thumbnail: string | null;
  duration: number | null;
}

export interface PlaylistInfo {
  title: string;
  entries: PlaylistEntry[];
  /** Total number of videos in the playlist, so the UI knows whether more pages remain. */
  totalCount: number | null;
}
