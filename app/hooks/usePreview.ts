import { useEffect, useRef, useState } from "react";
import { downloader } from "../downloader";
import type { VideoInfo } from "../downloader/types";
import { parseUrlLines, PLAYLIST_URL_PATTERN } from "../lib/format";

// Waits for typing to pause before asking the server for a preview, so every keystroke doesn't fire a request.
const PREVIEW_DEBOUNCE_MS = 600;

/**
 * Debounces `url` into a video preview fetch (title/duration/thumbnail), skipping playlist links
 * (resolved through the playlist picker instead) and multi-line batch-queue input (no single video
 * to preview).
 */
export function usePreview(url: string) {
  const [preview, setPreview] = useState<{ url: string; info: VideoInfo } | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  // Tracks the in-flight/last preview fetch so a download that starts before the debounce timer
  // fires can still patch title/duration/thumbnail onto the job once it resolves. `claimed` is set
  // by getPendingInfo() when a caller intends to reuse this fetch, so the cleanup below doesn't
  // abort a request someone is still waiting on.
  const previewRequestRef = useRef<{ url: string; promise: Promise<VideoInfo | null>; claimed: boolean } | null>(
    null
  );

  useEffect(() => {
    if (!downloader.getVideoInfo) return;
    const lines = parseUrlLines(url);
    const trimmed = lines.length === 1 ? lines[0] : "";
    if (!trimmed || PLAYLIST_URL_PATTERN.test(trimmed)) {
      setPreview(null);
      setIsPreviewLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setIsPreviewLoading(true);
    const timer = setTimeout(() => {
      const promise = downloader.getVideoInfo!(trimmed, controller.signal).catch(() => null);
      previewRequestRef.current = { url: trimmed, promise, claimed: false };
      promise.then((info) => {
        if (cancelled) return;
        // A failed fetch (unsupported url, network error, ...) must clear any stale preview from
        // a previous url — otherwise the last successful preview keeps showing under a url that
        // no longer matches it, with no indication anything went wrong.
        setPreview(info ? { url: trimmed, info } : null);
      }).finally(() => {
        if (!cancelled) setIsPreviewLoading(false);
      });
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      // Don't abort a fetch that getPendingInfo() has handed out for reuse elsewhere (e.g. a
      // download starting immediately after typing stops) — aborting it would make that caller's
      // await resolve to null right when it's about to use the result.
      if (!previewRequestRef.current?.claimed) controller.abort();
    };
  }, [url]);

  /** Returns the in-flight/last preview fetch for `targetUrl`, or starts a fresh one if none matches. */
  function getPendingInfo(targetUrl: string): Promise<VideoInfo | null> {
    const pending = previewRequestRef.current;
    if (pending?.url !== targetUrl) return downloader.getVideoInfo!(targetUrl).catch(() => null);
    pending.claimed = true;
    return pending.promise;
  }

  return { preview, isPreviewLoading, getPendingInfo };
}
