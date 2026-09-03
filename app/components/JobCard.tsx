import { useEffect, useRef, useState } from "react";
import { Alert, Animated, Easing, Image, Pressable, Text, View } from "react-native";
import { PHASE_LABELS, type JobState } from "../downloader/types";
import {
  estimateAudioSizeMB,
  formatDuration,
  formatElapsed,
  formatMB,
  formatSecondsShort,
  hasPositiveDuration,
  isFinishedPhase,
} from "../lib/format";
import { styles } from "../styles";

// No fresh line from yt-dlp for this long: the job is still alive, YouTube is just slow to answer.
const STALL_HINT_MS = 20_000;
// Progress bar fallback while yt-dlp hasn't reported a real percentage yet.
const FALLBACK_PROGRESS_MERGING = 90;
const FALLBACK_PROGRESS_ACTIVE = 10;

export function JobCard({
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
  const isFinished = isFinishedPhase(job.phase);
  const isStalled = !isFinished && now - job.updatedAt > STALL_HINT_MS;
  const progressPercent =
    job.progress ??
    (job.phase === "converting" || job.phase === "merging" ? FALLBACK_PROGRESS_MERGING : FALLBACK_PROGRESS_ACTIVE);
  const estimatedFinalMB =
    job.format === "audio" && hasPositiveDuration(job.duration)
      ? estimateAudioSizeMB(job.duration, parseInt(job.quality, 10))
      : null;
  const etaLabel = job.etaSeconds != null && job.etaSeconds > 0 ? formatSecondsShort(job.etaSeconds) : null;
  const extLabel = (job.ext ?? "").toUpperCase();
  // "Läuft seit" alone isn't informative enough to justify showing the details toggle — only count
  // it once there's at least one real data point (progress, size, speed, ETA, or a raw yt-dlp line).
  const hasDebugInfo =
    job.progress != null ||
    job.totalMB != null ||
    estimatedFinalMB != null ||
    job.speedMBs != null ||
    etaLabel != null ||
    job.lastLine !== "";
  const statusLabel = (
    <Text style={styles.statusText}>
      {PHASE_LABELS[job.phase]}
      {isStalled ? " · läuft weiter, YouTube antwortet gerade langsam" : ""}
    </Text>
  );

  useEffect(() => {
    Animated.timing(detailsAnim, {
      toValue: isDetailsExpanded ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // height/margin can't run on the native driver
    }).start();
  }, [isDetailsExpanded, detailsAnim]);

  // Only ever called while the save button is mounted, which itself requires `onSave` — see the
  // `job.phase === "done" && onSave && (...)` guard around that button below.
  async function doSave() {
    setSaveState("saving");
    try {
      await onSave!();
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  function handleSavePress() {
    // The save button is `disabled` while saving, so normal touch input can't reach this; kept as
    // a defensive guard against non-standard triggers (e.g. an accessibility action bypassing the
    // disabled state) — not reachable via fireEvent.press in tests, hence the coverage exclusion.
    /* istanbul ignore next */
    if (saveState === "saving") return;
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
        {job.thumbnail && <Image testID="job-thumbnail" source={{ uri: job.thumbnail }} style={styles.jobThumbnail} />}
        <View style={styles.jobHeaderInfo}>
          <Text style={styles.jobTitle} numberOfLines={1}>
            {job.title ?? job.url}
          </Text>
          {hasPositiveDuration(job.duration) && (
            <Text style={styles.jobDuration}>{formatDuration(job.duration)}</Text>
          )}
        </View>
      </View>

      {job.phase === "error" ? (
        <Text style={styles.errorText}>{job.error}</Text>
      ) : job.phase === "done" || job.phase === "cancelled" ? (
        <Text style={styles.statusText}>{PHASE_LABELS[job.phase]}</Text>
      ) : (
        <>
          {hasDebugInfo ? (
            <Pressable
              style={styles.statusRow}
              onPress={() => setIsDetailsExpanded((expanded) => !expanded)}
              accessibilityLabel={isDetailsExpanded ? "Details einklappen" : "Details ausklappen"}
            >
              {statusLabel}
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
          ) : (
            <View style={styles.statusRow}>{statusLabel}</View>
          )}
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
          {hasDebugInfo && (
            <Animated.View
              style={{
                height: detailsAnim.interpolate({ inputRange: [0, 1], outputRange: [0, debugBoxHeight] }),
                marginTop: detailsAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }),
                opacity: detailsAnim,
                overflow: "hidden",
              }}
            >
              <View
                testID="job-debug-box"
                onLayout={(e) => setDebugBoxHeight(e.nativeEvent.layout.height)}
                style={styles.debugBox}
              >
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
          )}
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
                    : `${extLabel} speichern`}
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
              {isSharing ? "Lädt herunter…" : `${extLabel} herunterladen`}
            </Text>
          </Pressable>
        )}
      </View>
      {saveState === "error" && <Text style={styles.errorText}>Speichern fehlgeschlagen.</Text>}
    </View>
  );
}
