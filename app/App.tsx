import { useEffect, useState } from "react";
import {
  Alert,
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
  Modal,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import * as MailComposer from "expo-mail-composer";
import * as Sharing from "expo-sharing";
import { downloader } from "./downloader";
import { PHASE_LABELS, type JobState, type MediaFormat, type SetupState } from "./downloader/types";

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

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")} min`;
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")} min`;
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
  const isFinished = job.phase === "done" || job.phase === "error" || job.phase === "cancelled";
  const isStalled = !isFinished && now - job.updatedAt > STALL_HINT_MS;
  const progressPercent = job.progress ?? (job.phase === "converting" || job.phase === "merging" ? 90 : 10);

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
      <Text style={styles.jobTitle} numberOfLines={1}>
        {job.title ?? job.url}
      </Text>

      {job.phase === "error" ? (
        <Text style={styles.errorText}>{job.error}</Text>
      ) : job.phase === "cancelled" ? (
        <Text style={styles.statusText}>Abgebrochen</Text>
      ) : job.phase === "done" ? (
        <Text style={styles.statusText}>Fertig!</Text>
      ) : (
        <>
          <Text style={styles.statusText}>
            {PHASE_LABELS[job.phase]}
            {isStalled ? " · läuft weiter, YouTube antwortet gerade langsam" : ""}
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
          <View style={styles.debugBox}>
            {job.progress != null && <Text style={styles.debugLine}>Fortschritt: {job.progress.toFixed(1)}%</Text>}
            {job.totalMB != null && (
              <Text style={styles.debugLine}>
                Größe: {job.downloadedMB != null ? formatMB(job.downloadedMB) : "?"} / {formatMB(job.totalMB)}
              </Text>
            )}
            {job.speedMBs != null && <Text style={styles.debugLine}>Geschwindigkeit: {job.speedMBs.toFixed(2)} MB/s</Text>}
            {job.etaSeconds != null && job.etaSeconds > 0 && (
              <Text style={styles.debugLine}>ETA: {formatEta(job.etaSeconds)}</Text>
            )}
            <Text style={styles.debugLine}>Läuft seit: {formatElapsed(now - job.createdAt)}</Text>
            {job.lastLine !== "" && (
              <Text style={styles.debugLine} numberOfLines={1}>
                {job.lastLine}
              </Text>
            )}
          </View>
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

  const hasActiveJob = jobs.some((j) => j.phase !== "done" && j.phase !== "error" && j.phase !== "cancelled");
  const hasFinishedJob = jobs.some((j) => j.phase === "done" || j.phase === "error" || j.phase === "cancelled");
  const now = useNow(hasActiveJob);

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

  async function submit(targetUrl: string, targetFormat: MediaFormat, targetQuality: string) {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await downloader.enqueue({ url: targetUrl, format: targetFormat, quality: targetQuality });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Herunterladen fehlgeschlagen.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConvert() {
    if (!url.trim() || isSubmitting) return;
    const targetUrl = url.trim();
    setUrl("");
    await submit(targetUrl, format, quality);
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

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.card}>
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

        <View style={styles.urlRow}>
          <TextInput
            style={styles.urlInput}
            placeholder="https://www.youtube.com/watch?v=..."
            placeholderTextColor="#666"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable style={styles.pasteButton} onPress={handlePaste} accessibilityLabel="Einfügen">
            <Text style={styles.pasteButtonIcon}>📋</Text>
          </Pressable>
        </View>

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

        {jobs.length > 0 && (
          <>
            {hasFinishedJob && (
              <Pressable style={styles.linkButton} onPress={() => downloader.clearFinished()}>
                <Text style={styles.linkText}>Fertige entfernen</Text>
              </Pressable>
            )}
            <ScrollView style={styles.jobList}>
              {jobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  now={now}
                  onCancel={() => downloader.cancel(job.id)}
                  onRetry={() => submit(job.url, job.format, job.quality)}
                  onShare={() => handleShare(job)}
                  isSharing={sharingId === job.id}
                  onSave={downloader.saveToDownloads ? () => downloader.saveToDownloads!(job) : undefined}
                />
              ))}
            </ScrollView>
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
  jobCard: {
    backgroundColor: "#151515",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2c2c2c",
    padding: 14,
    marginBottom: 10,
    gap: 8,
  },
  jobTitle: {
    color: "#f0f0f0",
    fontWeight: "600",
    fontSize: 14,
  },
  jobActions: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  statusText: {
    color: "#a0a0a0",
    fontSize: 13,
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
