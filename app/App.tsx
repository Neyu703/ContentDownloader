import { useEffect, useState, type ReactNode } from "react";
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
  type PreviewPatch,
  type SetupState,
} from "./downloader/types";
import { Dropdown } from "./components/Dropdown";
import { JobCard } from "./components/JobCard";
import { PlaylistPickerModal } from "./components/PlaylistPickerModal";
import { usePreview } from "./hooks/usePreview";
import { usePlaylistPicker, type SubmitFn } from "./hooks/usePlaylistPicker";
import {
  formatDuration,
  isFinishedPhase,
  isSetupMessagePhase,
  mimeTypeForExt,
  PLAYLIST_URL_PATTERN,
  sanitizeFilename,
  toFileUri,
} from "./lib/format";
import { styles } from "./styles";

// Above this window width (tablet landscape / desktop), form and job list switch from stacked to side-by-side.
const WIDE_LAYOUT_BREAKPOINT = 700;

interface QualityOption {
  value: string;
  label: string;
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
  const { preview, isPreviewLoading, getPendingInfo } = usePreview(url);
  const {
    playlistPicker,
    isPlaylistLoading,
    startPlaylistFetch,
    togglePlaylistEntry,
    togglePlaylistSelectAll,
    loadMorePlaylistEntries,
    confirmPlaylistDownload,
    closePlaylistPicker,
  } = usePlaylistPicker({
    format,
    quality,
    submit,
    setSubmitError,
    onUrlConsumed: () => setUrl(""),
  });

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
      await startPlaylistFetch(targetUrl);
      return;
    }

    setUrl("");

    // Starts the job right away with whatever preview info is already resolved; title/duration/
    // thumbnail are patched in afterwards if they weren't ready yet, so a slow yt-dlp lookup never
    // delays the actual download start.
    const immediateInfo = preview?.url === targetUrl ? preview.info : null;
    const jobId = await submit(targetUrl, format, quality, immediateInfo);

    if (!immediateInfo && jobId && downloader.getVideoInfo && downloader.updateJobPreview) {
      getPendingInfo(targetUrl).then((info) => {
        if (info) downloader.updateJobPreview!(jobId, info);
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
      const fileUri = toFileUri(job.result);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: mimeTypeForExt(job.ext),
          dialogTitle: sanitizeFilename(job.title ?? "download"),
        });
      }
    } finally {
      setSharingId(null);
    }
  }

  const isFormBusy = isSubmitting || isPlaylistLoading;

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
        style={[styles.button, isFormBusy && styles.buttonDisabled]}
        onPress={handleConvert}
        disabled={isFormBusy}
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

        {isSetupMessagePhase(setup.phase) && (
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
        onCancel={closePlaylistPicker}
      />
    </SafeAreaView>
  );
}
