import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Image,
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
  Modal,
  useWindowDimensions,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import * as MailComposer from "expo-mail-composer";
import * as Sharing from "expo-sharing";
import { downloader } from "./downloader";
import { PHASE_LABELS, type JobState, type MediaFormat, type PreviewPatch, type SetupState, type VideoInfo } from "./downloader/types";

// Waits for typing to pause before asking the server for a preview, so every keystroke doesn't fire a request.
const PREVIEW_DEBOUNCE_MS = 600;

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

// No fresh line from yt-dlp for this long: the job is still alive, YouTube is just slow to answer.
const STALL_HINT_MS = 20_000;

function formatMB(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

// CBR MP3 at a fixed bitrate has a near-exact size, unlike video (VBR streams, size only known once downloaded).
function estimateAudioSizeMB(durationSeconds: number, bitrateKbps: number): number {
  return (durationSeconds * bitrateKbps * 1000) / 8 / (1024 * 1024);
}

function formatSecondsShort(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")} min`;
}

function formatDuration(seconds: number): string {
  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function formatElapsed(ms: number): string {
  return formatSecondsShort(Math.floor(ms / 1000));
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "").trim() || "download";
}

function Dropdown<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <>
      <Pressable style={styles.dropdownButton} onPress={() => setOpen(true)}>
        <Text style={styles.dropdownButtonText}>{selected?.label ?? ""}</Text>
        <Text style={styles.dropdownChevron}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.dropdownOverlay} onPress={() => setOpen(false)}>
          <View style={styles.dropdownMenu}>
            {options.map((option) => (
              <Pressable
                key={option.value}
                style={[styles.dropdownOption, option.value === value && styles.dropdownOptionSelected]}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <Text style={styles.dropdownOptionText}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
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

function JobCard({
  job,
  now,
  onCancel,
  onRetry,
  onShare,
  isSharing,
  onSave,
}: {
  job: JobState;
  now: number;
  onCancel: () => void;
  onRetry: () => void;
  onShare: () => void;
  isSharing: boolean;
  /** Native only — omitted entirely on web, where the single button already saves via the browser. */
  onSave?: () => Promise<void>;
}) {
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(true);
  const [debugBoxHeight, setDebugBoxHeight] = useState(0);
  const detailsAnim = useRef(new Animated.Value(1)).current;
  const isFinished = job.phase === "done" || job.phase === "error" || job.phase === "cancelled";
  const isStalled = !isFinished && now - job.updatedAt > STALL_HINT_MS;
  const progressPercent = job.progress ?? (job.phase === "converting" || job.phase === "merging" ? 90 : 10);
  const estimatedFinalMB =
    job.format === "audio" && job.duration != null && job.duration > 0
      ? estimateAudioSizeMB(job.duration, parseInt(job.quality, 10))
      : null;
  const etaLabel = job.etaSeconds != null && job.etaSeconds > 0 ? formatSecondsShort(job.etaSeconds) : null;

  useEffect(() => {
    Animated.timing(detailsAnim, {
      toValue: isDetailsExpanded ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // height/margin can't run on the native driver
    }).start();
  }, [isDetailsExpanded, detailsAnim]);

  async function doSave() {
    if (!onSave) return;
    setSaveState("saving");
    try {
      await onSave();
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  function handleSavePress() {
    if (!onSave || saveState === "saving") return;
    if (saveState === "saved") {
      // Prevents the case that prompted this: tapping "speichern" twice creates two files in
      // Downloads (MediaStore auto-dedupes the name instead of overwriting).
      Alert.alert(
        "Bereits gespeichert",
        "Diese Datei liegt schon in Downloads. Nochmal speichern legt eine weitere Kopie an.",
        [
          { text: "Abbrechen", style: "cancel" },
          { text: "Nochmal speichern", onPress: doSave },
        ]
      );
      return;
    }
    doSave();
  }

  return (
    <View style={styles.jobCard}>
      <View style={styles.jobHeader}>
        {job.thumbnail && <Image source={{ uri: job.thumbnail }} style={styles.jobThumbnail} />}
        <View style={styles.jobHeaderInfo}>
          <Text style={styles.jobTitle} numberOfLines={1}>
            {job.title ?? job.url}
          </Text>
          {job.duration != null && job.duration > 0 && (
            <Text style={styles.jobDuration}>{formatDuration(job.duration)}</Text>
          )}
        </View>
      </View>

      {job.phase === "error" ? (
        <Text style={styles.errorText}>{job.error}</Text>
      ) : job.phase === "cancelled" ? (
        <Text style={styles.statusText}>Abgebrochen</Text>
      ) : job.phase === "done" ? (
        <Text style={styles.statusText}>Fertig!</Text>
      ) : (
        <>
          <Pressable
            style={styles.statusRow}
            onPress={() => setIsDetailsExpanded((expanded) => !expanded)}
            accessibilityLabel={isDetailsExpanded ? "Details einklappen" : "Details ausklappen"}
          >
            <Text style={styles.statusText}>
              {PHASE_LABELS[job.phase]}
              {isStalled ? " · läuft weiter, YouTube antwortet gerade langsam" : ""}
            </Text>
            <View style={styles.collapseButton}>
              <Animated.Text
                style={[
                  styles.collapseChevron,
                  {
                    transform: [
                      { rotate: detailsAnim.interpolate({ inputRange: [0, 1], outputRange: ["-90deg", "0deg"] }) },
                    ],
                  },
                ]}
              >
                ▾
              </Animated.Text>
            </View>
          </Pressable>
          <View style={styles.progressWrapper}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
            </View>
            {etaLabel && (
              <Animated.View
                style={[
                  styles.progressEtaBadge,
                  { opacity: detailsAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
                ]}
              >
                <Text style={styles.progressEtaText}>{etaLabel}</Text>
              </Animated.View>
            )}
          </View>
          <Animated.View
            style={{
              height: detailsAnim.interpolate({ inputRange: [0, 1], outputRange: [0, debugBoxHeight] }),
              marginTop: detailsAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }),
              opacity: detailsAnim,
              overflow: "hidden",
            }}
          >
            <View onLayout={(e) => setDebugBoxHeight(e.nativeEvent.layout.height)} style={styles.debugBox}>
              {job.progress != null && <Text style={styles.debugLine}>Fortschritt: {job.progress.toFixed(1)}%</Text>}
              {job.totalMB != null && (
                <Text style={styles.debugLine}>
                  Heruntergeladen: {job.downloadedMB != null ? formatMB(job.downloadedMB) : "?"} / {formatMB(job.totalMB)}
                </Text>
              )}
              {estimatedFinalMB != null && (
                <Text style={styles.debugLine}>Geschätzte Endgröße: ~{formatMB(estimatedFinalMB)}</Text>
              )}
              {job.speedMBs != null && <Text style={styles.debugLine}>Geschwindigkeit: {job.speedMBs.toFixed(2)} MB/s</Text>}
              {etaLabel && <Text style={styles.debugLine}>ETA: {etaLabel}</Text>}
              <Text style={styles.debugLine}>Läuft seit: {formatElapsed(now - job.createdAt)}</Text>
              {job.lastLine !== "" && (
                <Text style={styles.debugLine} numberOfLines={1}>
                  {job.lastLine}
                </Text>
              )}
            </View>
          </Animated.View>
        </>
      )}

      <View style={styles.jobActions}>
        {!isFinished && (
          <Pressable style={styles.secondaryButton} onPress={onCancel}>
            <Text style={styles.buttonText}>Abbrechen</Text>
          </Pressable>
        )}
        {job.phase === "error" && (
          <Pressable style={styles.secondaryButton} onPress={onRetry}>
            <Text style={styles.buttonText}>Erneut versuchen</Text>
          </Pressable>
        )}
        {job.phase === "done" && onSave && (
          <>
            <Pressable
              style={[styles.downloadButton, saveState === "saving" && styles.buttonDisabled]}
              onPress={handleSavePress}
              disabled={saveState === "saving"}
            >
              <Text style={styles.downloadButtonText}>
                {saveState === "saving"
                  ? "Speichert…"
                  : saveState === "saved"
                    ? "In Downloads gespeichert ✓"
                    : `${(job.ext ?? "").toUpperCase()} speichern`}
              </Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={onShare} disabled={isSharing}>
              <Text style={styles.buttonText}>{isSharing ? "…" : "Teilen"}</Text>
            </Pressable>
          </>
        )}
        {job.phase === "done" && !onSave && (
          <Pressable style={[styles.downloadButton, isSharing && styles.buttonDisabled]} onPress={onShare} disabled={isSharing}>
            <Text style={styles.downloadButtonText}>
              {isSharing ? "Lädt herunter…" : `${(job.ext ?? "").toUpperCase()} herunterladen`}
            </Text>
          </Pressable>
        )}
      </View>
      {saveState === "error" && <Text style={styles.errorText}>Speichern fehlgeschlagen.</Text>}
    </View>
  );
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
  // Tracks the in-flight/last preview fetch so a download that starts before the debounce timer
  // fires can still patch title/duration/thumbnail onto the job once it resolves.
  const previewRequestRef = useRef<{ url: string; promise: Promise<VideoInfo | null> } | null>(null);

  const hasActiveJob = jobs.some((j) => j.phase !== "done" && j.phase !== "error" && j.phase !== "cancelled");
  const hasFinishedJob = jobs.some((j) => j.phase === "done" || j.phase === "error" || j.phase === "cancelled");
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
    if (!trimmed) {
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
    info: PreviewPatch | null = null
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
    if (!targetUrl || isSubmitting) return;
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

  async function handleSendLog() {
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

      {isPreviewLoading && !preview && <Text style={styles.searchMessage}>Suche Video…</Text>}
      {preview && (
        <View style={styles.previewCard}>
          {preview.info.thumbnail && (
            <Image source={{ uri: preview.info.thumbnail }} style={styles.previewThumbnail} />
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
        style={[styles.button, isSubmitting && styles.buttonDisabled]}
        onPress={handleConvert}
        disabled={isSubmitting}
      >
        <Text style={styles.buttonText}>{isSubmitting ? "Wird gestartet…" : "Herunterladen"}</Text>
      </Pressable>
      {submitError && <Text style={styles.errorText}>{submitError}</Text>}
    </>
  );

  const jobsSection = jobs.length > 0 && (
    <>
      {hasFinishedJob && (
        <Pressable style={styles.linkButton} onPress={() => downloader.clearFinished()}>
          <Text style={styles.linkText}>Fertige entfernen</Text>
        </Pressable>
      )}
      <ScrollView style={[styles.jobList, useTwoColumnLayout && styles.jobListWide]}>
        {jobs.map((job) => (
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
        ))}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#0d0d0d",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "90%",
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2c2c2c",
    padding: 28,
  },
  cardWide: {
    maxWidth: 920,
  },
  twoColumnRow: {
    flexDirection: "row",
    gap: 24,
    flex: 1,
    minHeight: 0,
  },
  twoColumnLeft: {
    flex: 1,
  },
  twoColumnRight: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#f0f0f0",
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: "#a0a0a0",
    textAlign: "center",
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    color: "#888",
    marginBottom: 4,
  },
  urlRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  urlInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#3a3a3a",
    backgroundColor: "#111",
    color: "#f0f0f0",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
  },
  pasteButton: {
    backgroundColor: "#3a3a3a",
    borderRadius: 8,
    width: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  pasteButtonIcon: {
    fontSize: 18,
  },
  previewCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#151515",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2c2c2c",
    padding: 10,
    marginBottom: 12,
  },
  previewThumbnail: {
    width: 80,
    height: 45,
    borderRadius: 6,
    backgroundColor: "#0d0d0d",
  },
  previewInfo: {
    flex: 1,
    gap: 4,
  },
  previewTitle: {
    color: "#f0f0f0",
    fontWeight: "600",
    fontSize: 13,
  },
  previewMeta: {
    color: "#888",
    fontSize: 12,
  },
  optionsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  optionsCol: {
    flex: 1,
  },
  dropdownButton: {
    borderWidth: 1,
    borderColor: "#3a3a3a",
    backgroundColor: "#111",
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownButtonText: {
    color: "#f0f0f0",
    fontSize: 14,
  },
  dropdownChevron: {
    color: "#888",
    fontSize: 12,
  },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  dropdownMenu: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#3a3a3a",
    overflow: "hidden",
  },
  dropdownOption: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#2c2c2c",
  },
  dropdownOptionSelected: {
    backgroundColor: "#2a2a3a",
  },
  dropdownOptionText: {
    color: "#f0f0f0",
    fontSize: 14,
  },
  button: {
    backgroundColor: "#646cff",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  buttonDisabled: {
    backgroundColor: "#3a3a4a",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
  secondaryButton: {
    backgroundColor: "#3a3a3a",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  searchMessage: {
    fontSize: 12,
    color: "#a0a0a0",
    textAlign: "center",
    marginBottom: 10,
  },
  linkButton: {
    alignSelf: "center",
    marginTop: 14,
  },
  jobList: {
    marginTop: 10,
  },
  jobListWide: {
    flex: 1,
  },
  jobCard: {
    backgroundColor: "#151515",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2c2c2c",
    padding: 14,
    marginBottom: 10,
    gap: 8,
  },
  jobHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  jobThumbnail: {
    width: 56,
    height: 32,
    borderRadius: 4,
    backgroundColor: "#0d0d0d",
  },
  jobHeaderInfo: {
    flex: 1,
    gap: 2,
  },
  jobTitle: {
    color: "#f0f0f0",
    fontWeight: "600",
    fontSize: 14,
  },
  jobDuration: {
    color: "#888",
    fontSize: 12,
  },
  jobActions: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  statusText: {
    flex: 1,
    color: "#a0a0a0",
    fontSize: 13,
  },
  collapseButton: {
    backgroundColor: "#2c2c2c",
    borderRadius: 6,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  collapseChevron: {
    color: "#ccc",
    fontSize: 16,
    fontWeight: "700",
  },
  progressWrapper: {
    width: "100%",
    position: "relative",
  },
  progressTrack: {
    width: "100%",
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2c2c2c",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#646cff",
    borderRadius: 4,
  },
  progressEtaBadge: {
    position: "absolute",
    right: 4,
    top: "50%",
    transform: [{ translateY: -8 }],
    backgroundColor: "rgba(13,13,13,0.75)",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  progressEtaText: {
    color: "#f0f0f0",
    fontSize: 10,
    fontWeight: "600",
  },
  debugBox: {
    width: "100%",
    backgroundColor: "#111",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2c2c2c",
    padding: 10,
    gap: 4,
  },
  debugLine: {
    color: "#888",
    fontSize: 12,
    fontFamily: Platform.OS === "web" ? "monospace" : undefined,
  },
  errorText: {
    color: "#ff6b6b",
    textAlign: "center",
    fontSize: 13,
  },
  downloadButton: {
    backgroundColor: "#2ecc71",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  downloadButtonText: {
    color: "#0a0a0a",
    fontWeight: "700",
    fontSize: 13,
  },
  linkText: {
    color: "#a0a0a0",
    textDecorationLine: "underline",
    fontSize: 13,
  },
});
