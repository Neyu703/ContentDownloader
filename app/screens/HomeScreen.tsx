import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import * as Sharing from "expo-sharing";
import { useTranslation } from "react-i18next";
import { downloader } from "../downloader";
import { loadFormatPreference, saveFormatPreference } from "../downloader/formatPreference";
import {
  type JobState,
  type MediaFormat,
  type PreviewPatch,
  type SetupState,
} from "../downloader/types";
import { Dropdown } from "../components/Dropdown";
import { JobCard } from "../components/JobCard";
import { PlaylistPickerModal } from "../components/PlaylistPickerModal";
import { useDebugLog } from "../hooks/useDebugLog";
import { usePreview } from "../hooks/usePreview";
import { usePlaylistPicker, type SubmitFn } from "../hooks/usePlaylistPicker";
import {
  formatDuration,
  hasPositiveDuration,
  isFinishedPhase,
  isSetupMessagePhase,
  mimeTypeForExt,
  parseUrlLines,
  PLAYLIST_URL_PATTERN,
  sanitizeFilename,
  toFileUri,
} from "../lib/format";
import { useStyles } from "../styles/useStyles";
import { useTheme } from "../theme/ThemeContext";

// Above this window width (tablet landscape / desktop), form and job list switch from stacked to side-by-side.
const WIDE_LAYOUT_BREAKPOINT = 700;

interface QualityOption {
  value: string;
  label: string;
}

const DEFAULT_QUALITY: Record<MediaFormat, string> = {
  audio: "320",
  video: "best",
};

/**
 * Tallies each playlist group's done/total counts in one pass, so consecutive jobs sharing a
 * groupId get one summary header above their cards instead of each card repeating the playlist title.
 */
function computeGroupStats(jobs: JobState[]): Map<string, { total: number; done: number }> {
  const groupStats = new Map<string, { total: number; done: number }>();
  for (const job of jobs) {
    if (!job.groupId) continue;
    const stats = groupStats.get(job.groupId) ?? { total: 0, done: 0 };
    stats.total += 1;
    if (job.phase === "done") stats.done += 1;
    groupStats.set(job.groupId, stats);
  }
  return groupStats;
}

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

export function HomeScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t: translate } = useTranslation();
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState<MediaFormat>("audio");
  const [quality, setQuality] = useState(DEFAULT_QUALITY.audio);
  const [jobs, setJobs] = useState<JobState[]>([]);
  const [setup, setSetup] = useState<SetupState>({ phase: "ready", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const { isSendingLog, sendLog } = useDebugLog(setSubmitError);
  const { preview, isPreviewLoading, getPendingInfo } = usePreview(url);

  // Re-render on every keystroke and every 1s progress tick (via useNow below) — memoized so
  // these option lists only rebuild when the language actually changes.
  const formatOptions: { value: MediaFormat; label: string }[] = useMemo(
    () => [
      { value: "audio", label: translate("home.formatAudio") },
      { value: "video", label: translate("home.formatVideo") },
    ],
    [translate]
  );
  const qualityOptions: Record<MediaFormat, QualityOption[]> = useMemo(
    () => ({
      audio: [
        { value: "128", label: translate("home.audioQuality128") },
        { value: "192", label: translate("home.audioQuality192") },
        { value: "320", label: translate("home.audioQuality320") },
      ],
      video: [
        { value: "360", label: translate("home.videoQuality360") },
        { value: "480", label: translate("home.videoQuality480") },
        { value: "720", label: translate("home.videoQuality720") },
        { value: "1080", label: translate("home.videoQuality1080") },
        { value: "best", label: translate("home.videoQualityBest") },
      ],
    }),
    [translate]
  );

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
    translate,
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

  // Starts the form with whatever format/quality the user picked last time, instead of always
  // resetting to the hardcoded "Audio/320" default on every launch.
  useEffect(() => {
    loadFormatPreference().then((preference) => {
      if (!preference) return;
      setFormat(preference.format);
      setQuality(preference.quality);
    });
  }, []);

  function handleFormatChange(next: MediaFormat) {
    const nextQuality = DEFAULT_QUALITY[next];
    setFormat(next);
    setQuality(nextQuality);
    saveFormatPreference({ format: next, quality: nextQuality });
  }

  function handleQualityChange(next: string) {
    setQuality(next);
    saveFormatPreference({ format, quality: next });
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
      setSubmitError(err instanceof Error ? err.message : translate("home.downloadFailed"));
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConvert() {
    const lines = parseUrlLines(url);
    if (lines.length === 0 || isSubmitting || isPlaylistLoading) return;

    if (lines.length === 1) {
      await handleSingleConvert(lines[0]);
      return;
    }
    await handleBatchConvert(lines);
  }

  async function handleSingleConvert(targetUrl: string) {
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

  /** Multiple lines pasted at once — one job per non-playlist line, no per-job preview lookup. */
  async function handleBatchConvert(lines: string[]) {
    setUrl("");
    const playlistLines = lines.filter((line) => PLAYLIST_URL_PATTERN.test(line));
    const videoLines = lines.filter((line) => !PLAYLIST_URL_PATTERN.test(line));

    if (videoLines.length === 0) {
      setSubmitError(translate("home.noValidLinksFound"));
      return;
    }

    // Sequential, not Promise.all: keeps job cards appearing in input order and avoids firing a
    // burst of simultaneous yt-dlp processes (same reasoning as confirmPlaylistDownload()).
    let hadSubmitError = false;
    for (const targetUrl of videoLines) {
      const jobId = await submit(targetUrl, format, quality, null);
      if (!jobId) hadSubmitError = true;
    }

    // Set after the loop: each submit() call clears submitError at its start, so setting this
    // beforehand would just get wiped out by the first job. Skipped if a real submit failure
    // already left its own message — that's the more important thing to surface.
    if (playlistLines.length > 0 && !hadSubmitError) {
      setSubmitError(translate("home.playlistLinksSkipped", { count: playlistLines.length }));
    }
  }

  async function handleShare(job: JobState, filenameOverride?: string) {
    if (!job.result) return;
    setSharingId(job.id);
    try {
      if (Platform.OS === "web") {
        const name = sanitizeFilename(filenameOverride ?? job.title ?? "download");
        const [downloadUrl] = job.result.split("?");
        window.location.href = `${downloadUrl}?name=${encodeURIComponent(name)}`;
        return;
      }
      const fileUri = toFileUri(job.result);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: mimeTypeForExt(job.ext),
          dialogTitle: sanitizeFilename(filenameOverride ?? job.title ?? "download"),
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
          placeholder={translate("home.urlPlaceholder")}
          placeholderTextColor={colors.textFaint}
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
        />
        <Pressable style={styles.pasteButton} onPress={handlePaste} accessibilityLabel={translate("home.pasteAccessibilityLabel")}>
          <Text style={styles.pasteButtonIcon}>📋</Text>
        </Pressable>
      </View>

      {isPlaylistLoading && <Text style={styles.searchMessage}>{translate("home.loadingPlaylist")}</Text>}
      {isPreviewLoading && !preview && <Text style={styles.searchMessage}>{translate("home.searchingVideo")}</Text>}
      {preview && (
        <View style={styles.previewCard}>
          {preview.info.thumbnail && (
            <Image testID="preview-thumbnail" source={{ uri: preview.info.thumbnail }} style={styles.previewThumbnail} />
          )}
          <View style={styles.previewInfo}>
            <Text style={styles.previewTitle} numberOfLines={2}>
              {preview.info.title}
            </Text>
            {hasPositiveDuration(preview.info.duration) && (
              <Text style={styles.previewMeta}>{formatDuration(preview.info.duration)}</Text>
            )}
          </View>
        </View>
      )}

      <View style={styles.optionsRow}>
        <View style={styles.optionsCol}>
          <Text style={styles.label}>{translate("home.formatLabel")}</Text>
          <Dropdown options={formatOptions} value={format} onChange={handleFormatChange} />
        </View>
        <View style={styles.optionsCol}>
          <Text style={styles.label}>{translate("home.qualityLabel")}</Text>
          <Dropdown options={qualityOptions[format]} value={quality} onChange={handleQualityChange} />
        </View>
      </View>

      <Pressable
        style={[styles.button, isFormBusy && styles.buttonDisabled]}
        onPress={handleConvert}
        disabled={isFormBusy}
      >
        <Text style={styles.buttonText}>
          {isPlaylistLoading
            ? translate("home.downloadButtonPlaylistLoading")
            : isSubmitting
              ? translate("home.downloadButtonSubmitting")
              : translate("home.downloadButton")}
        </Text>
      </Pressable>
      {submitError && <Text style={styles.errorText}>{submitError}</Text>}
    </>
  );

  const groupStats = computeGroupStats(jobs);

  const renderedJobs: ReactNode[] = [];
  const seenGroupIds = new Set<string>();
  for (const job of jobs) {
    if (job.groupId && !seenGroupIds.has(job.groupId)) {
      seenGroupIds.add(job.groupId);
      const stats = groupStats.get(job.groupId)!;
      renderedJobs.push(
        <Text key={`group-${job.groupId}`} style={styles.groupHeader}>
          {translate("home.groupProgress", {
            title: job.groupTitle ?? translate("home.defaultPlaylistTitle"),
            done: stats.done,
            total: stats.total,
          })}
        </Text>
      );
    }
    renderedJobs.push(
      <JobCard
        key={job.id}
        job={job}
        now={now}
        onCancel={() => downloader.cancel(job.id)}
        onRetry={() => {
          downloader.removeJob(job.id);
          submit(job.url, job.format, job.quality, job);
        }}
        onShare={(filenameOverride) => handleShare(job, filenameOverride)}
        isSharing={sharingId === job.id}
        onSave={
          downloader.saveToDownloads
            ? (filenameOverride) => downloader.saveToDownloads!(job, filenameOverride)
            : undefined
        }
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
          <Text style={styles.linkText}>{translate("home.clearFinished")}</Text>
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
        <Text style={styles.title}>{translate("home.title")}</Text>
        <Text style={styles.subtitle}>{translate("home.subtitle")}</Text>

        {isSetupMessagePhase(setup.phase) && (
          <Text style={[styles.searchMessage, setup.phase === "failed" && styles.errorText]}>
            {translate(setup.message, setup.messageParams)}
          </Text>
        )}

        {downloader.getDebugLogFileUri && (
          <Pressable style={styles.linkButton} onPress={sendLog} disabled={isSendingLog}>
            <Text style={styles.linkText}>{isSendingLog ? translate("home.debugLogPreparing") : translate("home.debugLogSend")}</Text>
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
