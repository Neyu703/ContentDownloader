import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Image,
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  Platform,
  useWindowDimensions,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import * as MailComposer from "expo-mail-composer";
import * as Sharing from "expo-sharing";
import { downloader } from "./downloader";
import {
  type JobState,
  type MediaFormat,
  type PlaylistInfo,
  type PreviewPatch,
  type SetupState,
  type VideoInfo,
} from "./downloader/types";
import { Dropdown } from "./components/Dropdown";
import { JobCard } from "./components/JobCard";
import { PlaylistPickerModal } from "./components/PlaylistPickerModal";
import {
  formatDuration,
  generateGroupId,
  isAllPlaylistEntriesSelected,
  isFinishedPhase,
  sanitizeFilename,
} from "./lib/format";
import { styles } from "./styles";

// Waits for typing to pause before asking the server for a preview, so every keystroke doesn't fire a request.
const PREVIEW_DEBOUNCE_MS = 600;

// Above this window width (tablet landscape / desktop), form and job list switch from stacked to side-by-side.
const WIDE_LAYOUT_BREAKPOINT = 700;

// A playlist link always carries a "list=" query param, whether it's a standalone playlist URL or
// a single video that happens to be playing within one.
const PLAYLIST_URL_PATTERN = /[?&]list=/;

interface QualityOption {
  value: string;
  label: string;
}

/** State backing the playlist-selection picker; url is only needed to fetch further pages. */
interface PlaylistPickerState {
  url: string;
  info: PlaylistInfo;
  selected: Set<string>;
  isLoadingMore: boolean;
  /** Set once a page comes back empty — stops further paging even if totalCount is missing/never reached. */
  noMorePages: boolean;
}

const FORMAT_OPTIONS: { value: MediaFormat; label: string }[] = [
  { value: "audio", label: "Nur Audio (MP3)" },
  { value: "video", label: "Video (MP4)" },
];

const DEFAULT_QUALITY: Record<MediaFormat, string> = {
  audio: "320",
  video: "best",
};

const QUALITY_OPTIONS: Record<MediaFormat, QualityOption[]> = {
  audio: [
    { value: "128", label: "Standard (128 kbps)" },
    { value: "192", label: "Gut (192 kbps)" },
    { value: "320", label: "Beste (320 kbps)" },
  ],
  video: [
    { value: "360", label: "360p" },
    { value: "480", label: "480p" },
    { value: "720", label: "720p" },
    { value: "1080", label: "1080p" },
    { value: "best", label: "Beste verfügbare Qualität" },
  ],
};

/** Ticks every second while any job is active, purely to keep "vor Xs" / elapsed labels live. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

export default function App() {
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState<MediaFormat>("audio");
  const [quality, setQuality] = useState(DEFAULT_QUALITY.audio);
  const [jobs, setJobs] = useState<JobState[]>([]);
  const [setup, setSetup] = useState<SetupState>({ phase: "ready", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [isSendingLog, setIsSendingLog] = useState(false);
  const [preview, setPreview] = useState<{ url: string; info: VideoInfo } | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [playlistPicker, setPlaylistPicker] = useState<PlaylistPickerState | null>(null);
  const [isPlaylistLoading, setIsPlaylistLoading] = useState(false);
  // Tracks the in-flight/last preview fetch so a download that starts before the debounce timer
  // fires can still patch title/duration/thumbnail onto the job once it resolves.
  const previewRequestRef = useRef<{ url: string; promise: Promise<VideoInfo | null> } | null>(null);

  const hasActiveJob = jobs.some((j) => !isFinishedPhase(j.phase));
  const hasFinishedJob = jobs.some((j) => isFinishedPhase(j.phase));
  const now = useNow(hasActiveJob);
  const { width: windowWidth } = useWindowDimensions();
  // Two-column layout only pays off once there's actually a job list to put next to the form.
  const useTwoColumnLayout = windowWidth >= WIDE_LAYOUT_BREAKPOINT && jobs.length > 0;

  useEffect(() => {
    return downloader.subscribe((nextJobs, nextSetup) => {
      setJobs(nextJobs);
      setSetup(nextSetup);
    });
  }, []);

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

  function handleFormatChange(next: MediaFormat) {
    setFormat(next);
    setQuality(DEFAULT_QUALITY[next]);
  }

  async function handlePaste() {
    const text = await Clipboard.getStringAsync();
    if (text) setUrl(text.trim());
  }

  async function submit(
    targetUrl: string,
    targetFormat: MediaFormat,
    targetQuality: string,
    info: (PreviewPatch & { groupId?: string | null; groupTitle?: string | null }) | null
  ): Promise<string | null> {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      return await downloader.enqueue({
        url: targetUrl,
        format: targetFormat,
        quality: targetQuality,
        title: info?.title,
        durationSeconds: info?.duration,
        thumbnail: info?.thumbnail,
        groupId: info?.groupId,
        groupTitle: info?.groupTitle,
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Herunterladen fehlgeschlagen.");
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConvert() {
    const targetUrl = url.trim();
    if (!targetUrl || isSubmitting || isPlaylistLoading) return;

    if (PLAYLIST_URL_PATTERN.test(targetUrl)) {
      setSubmitError(null);
      setIsPlaylistLoading(true);
      try {
        const info = await downloader.getPlaylistInfo(targetUrl, 1);
        setPlaylistPicker({
          url: targetUrl,
          info,
          selected: new Set(info.entries.map((entry) => entry.id)),
          isLoadingMore: false,
          noMorePages: info.entries.length === 0,
        });
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "Playlist konnte nicht geladen werden.");
      } finally {
        setIsPlaylistLoading(false);
      }
      return;
    }

    setUrl("");

    // Starts the job right away with whatever preview info is already resolved; title/duration/
    // thumbnail are patched in afterwards if they weren't ready yet, so a slow yt-dlp lookup never
    // delays the actual download start.
    const immediateInfo = preview?.url === targetUrl ? preview.info : null;
    const jobId = await submit(targetUrl, format, quality, immediateInfo);

    if (!immediateInfo && jobId && downloader.getVideoInfo && downloader.updateJobPreview) {
      const pending = previewRequestRef.current;
      const infoPromise = pending?.url === targetUrl ? pending.promise : downloader.getVideoInfo(targetUrl).catch(() => null);
      infoPromise.then((info) => {
        if (info) downloader.updateJobPreview!(jobId, info);
      });
    }
  }

  // Applies `update` only while the picker is still open — it can fire after the user already
  // closed it (e.g. a slow loadMorePlaylistEntries() page arriving after Abbrechen).
  function updatePlaylistPicker(update: (current: PlaylistPickerState) => PlaylistPickerState) {
    setPlaylistPicker((current) => (current ? update(current) : current));
  }

  function togglePlaylistEntry(id: string) {
    updatePlaylistPicker((current) => {
      const selected = new Set(current.selected);
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      return { ...current, selected };
    });
  }

  function togglePlaylistSelectAll() {
    updatePlaylistPicker((current) => {
      const selected = isAllPlaylistEntriesSelected(current)
        ? new Set<string>()
        : new Set(current.info.entries.map((entry) => entry.id));
      return { ...current, selected };
    });
  }

  async function loadMorePlaylistEntries() {
    if (!playlistPicker || playlistPicker.isLoadingMore || playlistPicker.noMorePages) return;
    const { url: playlistUrl, info } = playlistPicker;
    if (info.totalCount != null && info.entries.length >= info.totalCount) return;

    updatePlaylistPicker((current) => ({ ...current, isLoadingMore: true }));
    try {
      const nextPage = await downloader.getPlaylistInfo(playlistUrl, info.entries.length + 1);
      updatePlaylistPicker((current) => {
        // New entries arrive pre-selected, matching the initial page's default.
        const selected = new Set(current.selected);
        for (const entry of nextPage.entries) selected.add(entry.id);
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
    }
  }

  async function confirmPlaylistDownload() {
    // Defensive only: onConfirm is wired from PlaylistPickerModal, which renders nothing (and thus
    // never calls onConfirm) while its `picker` prop — this same playlistPicker — is null.
    /* istanbul ignore next */
    if (!playlistPicker) return;
    const { info, selected } = playlistPicker;
    const entries = info.entries.filter((entry) => selected.has(entry.id));
    const groupId = generateGroupId();
    setPlaylistPicker(null);
    setUrl("");

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

  async function handleSendLog() {
    // Defensive only: the triggering button is never rendered without getDebugLogFileUri, and is
    // disabled while isSendingLog is true, so neither side of this guard is reachable via a real press.
    /* istanbul ignore next */
    if (!downloader.getDebugLogFileUri || isSendingLog) return;
    setIsSendingLog(true);
    try {
      const fileUri = await downloader.getDebugLogFileUri();
      if (!(await MailComposer.isAvailableAsync())) {
        setSubmitError("Keine Mail-App auf diesem Gerät eingerichtet.");
        return;
      }
      const recipient = Constants.expoConfig?.extra?.debugLogEmail as string | undefined;
      await MailComposer.composeAsync({
        recipients: recipient ? [recipient] : undefined,
        subject: "Content Downloader – Debug-Log",
        body: "Log im Anhang.",
        attachments: [fileUri],
      });
    } catch {
      setSubmitError("Log konnte nicht vorbereitet werden.");
    } finally {
      setIsSendingLog(false);
    }
  }

  async function handleShare(job: JobState) {
    if (!job.result) return;
    setSharingId(job.id);
    try {
      if (Platform.OS === "web") {
        window.location.href = job.result;
        return;
      }
      const fileUri = job.result.startsWith("file://") ? job.result : `file://${job.result}`;
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: job.ext === "mp4" ? "video/mp4" : "audio/mpeg",
          dialogTitle: sanitizeFilename(job.title ?? "download"),
        });
      }
    } finally {
      setSharingId(null);
    }
  }

  const formSection = (
    <>
      <View style={styles.urlRow}>
        <TextInput
          style={styles.urlInput}
          placeholder="https://www.youtube.com/watch?v=..."
          placeholderTextColor="#666"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={handleConvert}
        />
        <Pressable style={styles.pasteButton} onPress={handlePaste} accessibilityLabel="Einfügen">
          <Text style={styles.pasteButtonIcon}>📋</Text>
        </Pressable>
      </View>

      {isPlaylistLoading && <Text style={styles.searchMessage}>Lade Playlist…</Text>}
      {isPreviewLoading && !preview && <Text style={styles.searchMessage}>Suche Video…</Text>}
      {preview && (
        <View style={styles.previewCard}>
          {preview.info.thumbnail && (
            <Image testID="preview-thumbnail" source={{ uri: preview.info.thumbnail }} style={styles.previewThumbnail} />
          )}
          <View style={styles.previewInfo}>
            <Text style={styles.previewTitle} numberOfLines={2}>
              {preview.info.title}
            </Text>
            {preview.info.duration > 0 && <Text style={styles.previewMeta}>{formatDuration(preview.info.duration)}</Text>}
          </View>
        </View>
      )}

      <View style={styles.optionsRow}>
        <View style={styles.optionsCol}>
          <Text style={styles.label}>Format</Text>
          <Dropdown options={FORMAT_OPTIONS} value={format} onChange={handleFormatChange} />
        </View>
        <View style={styles.optionsCol}>
          <Text style={styles.label}>Qualität</Text>
          <Dropdown options={QUALITY_OPTIONS[format]} value={quality} onChange={setQuality} />
        </View>
      </View>

      <Pressable
        style={[styles.button, (isSubmitting || isPlaylistLoading) && styles.buttonDisabled]}
        onPress={handleConvert}
        disabled={isSubmitting || isPlaylistLoading}
      >
        <Text style={styles.buttonText}>
          {isPlaylistLoading ? "Lädt Playlist…" : isSubmitting ? "Wird gestartet…" : "Herunterladen"}
        </Text>
      </Pressable>
      {submitError && <Text style={styles.errorText}>{submitError}</Text>}
    </>
  );

  // Consecutive jobs sharing a groupId (a playlist download) get one summary header above their
  // cards instead of each card repeating the playlist title. One pass to tally each group's
  // done/total counts, then one render pass, instead of re-filtering the whole list per group.
  const groupStats = new Map<string, { total: number; done: number }>();
  for (const job of jobs) {
    if (!job.groupId) continue;
    const stats = groupStats.get(job.groupId) ?? { total: 0, done: 0 };
    stats.total += 1;
    if (isFinishedPhase(job.phase)) stats.done += 1;
    groupStats.set(job.groupId, stats);
  }

  const renderedJobs: ReactNode[] = [];
  const seenGroupIds = new Set<string>();
  for (const job of jobs) {
    if (job.groupId && !seenGroupIds.has(job.groupId)) {
      seenGroupIds.add(job.groupId);
      const stats = groupStats.get(job.groupId)!;
      renderedJobs.push(
        <Text key={`group-${job.groupId}`} style={styles.groupHeader}>
          {job.groupTitle ?? "Playlist"} — {stats.done}/{stats.total} fertig
        </Text>
      );
    }
    renderedJobs.push(
      <JobCard
        key={job.id}
        job={job}
        now={now}
        onCancel={() => downloader.cancel(job.id)}
        onRetry={() => submit(job.url, job.format, job.quality, job)}
        onShare={() => handleShare(job)}
        isSharing={sharingId === job.id}
        onSave={downloader.saveToDownloads ? () => downloader.saveToDownloads!(job) : undefined}
      />
    );
  }

  const jobsSection = jobs.length > 0 && (
    <>
      {hasFinishedJob && (
        <Pressable
          style={[styles.linkButton, useTwoColumnLayout && styles.flushTop]}
          onPress={() => downloader.clearFinished()}
        >
          <Text style={styles.linkText}>Fertige entfernen</Text>
        </Pressable>
      )}
      <ScrollView
        style={[styles.jobList, useTwoColumnLayout && !hasFinishedJob && styles.flushTop]}
      >
        {renderedJobs}
      </ScrollView>
    </>
  );

  return (
    <SafeAreaView style={styles.page}>
      <View style={[styles.card, useTwoColumnLayout && styles.cardWide]}>
        <Text style={styles.title}>YouTube Downloader</Text>
        <Text style={styles.subtitle}>Lädt YouTube-Videos als MP3 oder MP4 in der gewünschten Qualität herunter</Text>

        {(setup.phase === "preparing" || setup.phase === "updating" || setup.phase === "failed") && (
          <Text style={[styles.searchMessage, setup.phase === "failed" && styles.errorText]}>{setup.message}</Text>
        )}

        {downloader.getDebugLogFileUri && (
          <Pressable style={styles.linkButton} onPress={handleSendLog} disabled={isSendingLog}>
            <Text style={styles.linkText}>{isSendingLog ? "Bereite Log vor…" : "Debug-Log senden"}</Text>
          </Pressable>
        )}

        {useTwoColumnLayout ? (
          <View style={styles.twoColumnRow}>
            <View style={styles.twoColumnLeft}>{formSection}</View>
            <View style={styles.twoColumnRight}>{jobsSection}</View>
          </View>
        ) : (
          <>
            {formSection}
            {jobsSection}
          </>
        )}
      </View>
      <PlaylistPickerModal
        picker={playlistPicker}
        format={format}
        onToggleEntry={togglePlaylistEntry}
        onToggleAll={togglePlaylistSelectAll}
        onLoadMore={loadMorePlaylistEntries}
        onConfirm={confirmPlaylistDownload}
        onCancel={() => setPlaylistPicker(null)}
      />
    </SafeAreaView>
  );
}
