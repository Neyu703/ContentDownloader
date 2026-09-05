import { useRef, useState } from "react";
import type { TFunction } from "i18next";
import { downloader } from "../downloader";
import type { MediaFormat, PlaylistInfo, PreviewPatch } from "../downloader/types";
import { generateGroupId, isAllPlaylistEntriesSelected } from "../lib/format";

/** State backing the playlist-selection picker; url is only needed to fetch further pages. */
export interface PlaylistPickerState {
  url: string;
  info: PlaylistInfo;
  /** Keyed by entry index, not entry.id — the same video (and thus the same id) can legitimately
   *  appear twice in one playlist (re-added), and an id-keyed Set would conflate the two. */
  selected: Set<number>;
  isLoadingMore: boolean;
  /** Set once a page comes back empty — stops further paging even if totalCount is missing/never reached. */
  noMorePages: boolean;
}

export type SubmitFn = (
  targetUrl: string,
  targetFormat: MediaFormat,
  targetQuality: string,
  info: (PreviewPatch & { groupId?: string | null; groupTitle?: string | null }) | null
) => Promise<string | null>;

/**
 * Owns the playlist-picker workflow: fetching a playlist's first page, paging in more entries,
 * toggling selection, and fanning the confirmed selection out into individual downloads via `submit`.
 */
export function usePlaylistPicker(params: {
  format: MediaFormat;
  quality: string;
  submit: SubmitFn;
  setSubmitError: (message: string | null) => void;
  onUrlConsumed: () => void;
  t: TFunction;
}) {
  const { format, quality, submit, setSubmitError, onUrlConsumed, t } = params;
  const [playlistPicker, setPlaylistPicker] = useState<PlaylistPickerState | null>(null);
  const [isPlaylistLoading, setIsPlaylistLoading] = useState(false);
  // Guards loadMorePlaylistEntries() re-entry synchronously — the isLoadingMore *state* flag can't,
  // since two onEndReached calls can both read it before React commits the update from the first.
  const isLoadingMoreRef = useRef(false);

  async function startPlaylistFetch(url: string) {
    setSubmitError(null);
    setIsPlaylistLoading(true);
    try {
      const info = await downloader.getPlaylistInfo(url, 1);
      setPlaylistPicker({
        url,
        info,
        selected: new Set(info.entries.map((_, index) => index)),
        isLoadingMore: false,
        noMorePages: info.entries.length === 0,
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t("errors.playlistInfoFailed"));
    } finally {
      setIsPlaylistLoading(false);
    }
  }

  // Applies `update` only while the picker is still open — it can fire after the user already
  // closed it (e.g. a slow loadMorePlaylistEntries() page arriving after Abbrechen).
  function updatePlaylistPicker(update: (current: PlaylistPickerState) => PlaylistPickerState) {
    setPlaylistPicker((current) => (current ? update(current) : current));
  }

  function togglePlaylistEntry(index: number) {
    updatePlaylistPicker((current) => {
      const selected = new Set(current.selected);
      if (selected.has(index)) selected.delete(index);
      else selected.add(index);
      return { ...current, selected };
    });
  }

  function togglePlaylistSelectAll() {
    updatePlaylistPicker((current) => {
      const selected = isAllPlaylistEntriesSelected(current)
        ? new Set<number>()
        : new Set(current.info.entries.map((_, index) => index));
      return { ...current, selected };
    });
  }

  async function loadMorePlaylistEntries() {
    if (!playlistPicker || isLoadingMoreRef.current || playlistPicker.noMorePages) return;
    const { url: playlistUrl, info } = playlistPicker;
    if (info.totalCount != null && info.entries.length >= info.totalCount) return;

    isLoadingMoreRef.current = true;
    updatePlaylistPicker((current) => ({ ...current, isLoadingMore: true }));
    try {
      const nextPage = await downloader.getPlaylistInfo(playlistUrl, info.entries.length + 1);
      updatePlaylistPicker((current) => {
        // New entries arrive pre-selected, matching the initial page's default.
        const selected = new Set(current.selected);
        const firstNewIndex = current.info.entries.length;
        nextPage.entries.forEach((_, offset) => selected.add(firstNewIndex + offset));
        return {
          ...current,
          info: { ...current.info, entries: [...current.info.entries, ...nextPage.entries] },
          selected,
          isLoadingMore: false,
          // Guards against endlessly re-fetching empty pages if totalCount is ever missing or the
          // loaded count never quite reaches it (e.g. entries removed from the playlist mid-scroll).
          noMorePages: nextPage.entries.length === 0,
        };
      });
    } catch {
      // Silently stop paging on error — the entries already loaded stay usable, and the user can
      // still confirm with whatever loaded so far.
      updatePlaylistPicker((current) => ({ ...current, isLoadingMore: false }));
    } finally {
      isLoadingMoreRef.current = false;
    }
  }

  async function confirmPlaylistDownload() {
    // Defensive only: onConfirm is wired from PlaylistPickerModal, which renders nothing (and thus
    // never calls onConfirm) while its `picker` prop — this same playlistPicker — is null.
    /* istanbul ignore next */
    if (!playlistPicker) return;
    const { info, selected } = playlistPicker;
    const entries = info.entries.filter((_, index) => selected.has(index));
    const groupId = generateGroupId();
    setPlaylistPicker(null);
    onUrlConsumed();

    // Sequential, not Promise.all: keeps job cards appearing in playlist order and avoids firing a
    // burst of simultaneous yt-dlp processes for large playlists (no server-side concurrency limit yet).
    for (const entry of entries) {
      await submit(entry.url, format, quality, {
        title: entry.title,
        duration: entry.duration,
        thumbnail: entry.thumbnail,
        groupId,
        groupTitle: info.title,
      });
    }
  }

  return {
    playlistPicker,
    isPlaylistLoading,
    startPlaylistFetch,
    togglePlaylistEntry,
    togglePlaylistSelectAll,
    loadMorePlaylistEntries,
    confirmPlaylistDownload,
    closePlaylistPicker: () => setPlaylistPicker(null),
  };
}
