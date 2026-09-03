import { useEffect, useRef, useState } from "react";
import { downloader } from "../downloader";
import type { VideoInfo } from "../downloader/types";

// Waits for typing to pause before asking the server for a preview, so every keystroke doesn't fire a request.
const PREVIEW_DEBOUNCE_MS = 600;

// A playlist link always carries a "list=" query param, whether it's a standalone playlist URL or
// a single video that happens to be playing within one.
const PLAYLIST_URL_PATTERN = /[?&]list=/;

/**
 * Debounces `url` into a video preview fetch (title/duration/thumbnail), skipping playlist links
 * since those are resolved through the playlist picker instead.
 */
export function usePreview(url: string) {
  const [preview, setPreview] = useState<{ url: string; info: VideoInfo } | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  // Tracks the in-flight/last preview fetch so a download that starts before the debounce timer
  // fires can still patch title/duration/thumbnail onto the job once it resolves.
  const previewRequestRef = useRef<{ url: string; promise: Promise<VideoInfo | null> } | null>(null);

  useEffect(() => {
    if (!downloader.getVideoInfo) return;
    const trimmed = url.trim();
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
      previewRequestRef.current = { url: trimmed, promise };
      promise.then((info) => {
        if (!cancelled && info) setPreview({ url: trimmed, info });
      }).finally(() => {
        if (!cancelled) setIsPreviewLoading(false);
      });
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [url]);

  /** Returns the in-flight/last preview fetch for `targetUrl`, or starts a fresh one if none matches. */
  function getPendingInfo(targetUrl: string): Promise<VideoInfo | null> {
    const pending = previewRequestRef.current;
    return pending?.url === targetUrl ? pending.promise : downloader.getVideoInfo!(targetUrl).catch(() => null);
  }

  return { preview, isPreviewLoading, getPendingInfo };
}
