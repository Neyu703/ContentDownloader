import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { type JobState } from "../downloader/types";
import { useJobSave } from "../hooks/useJobSave";
import {
  estimateAudioSizeMB,
  formatDuration,
  formatElapsed,
  formatMB,
  formatSecondsShort,
  hasPositiveDuration,
  isFinishedPhase,
} from "../lib/format";
import { useStyles } from "../styles/useStyles";

// No fresh line from yt-dlp for this long: the job is still alive, YouTube is just slow to answer.
const STALL_HINT_MS = 20_000;
// Progress bar fallback while yt-dlp hasn't reported a real percentage yet.
const FALLBACK_PROGRESS_MERGING = 90;
const FALLBACK_PROGRESS_ACTIVE = 10;
const DETAILS_COLLAPSE_DURATION_MS = 220;

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
  /** `filenameOverride` is set once the user edits the title field below, before it's finished (see `customName`). */
  onShare: (filenameOverride?: string) => void;
  isSharing: boolean;
  /** Native only — omitted entirely on web, where the single button already saves via the browser. */
  onSave?: (filenameOverride?: string) => Promise<void>;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  // User-edited filename for a finished job, overriding the auto-picked title — null until touched.
  const [customName, setCustomName] = useState<string | null>(null);
  const { saveState, handleSavePress } = useJobSave(onSave, customName);
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
  const errorText = t(job.errorKey ?? "errors.unknown", job.errorParams);
  const statusText = job.lastLineKey ? t(job.lastLineKey, job.lastLineParams) : job.lastLine;
  // "Läuft seit" alone isn't informative enough to justify showing the details toggle — only count
  // it once there's at least one real data point (progress, size, speed, ETA, or a raw yt-dlp line).
  const hasDebugInfo =
    job.progress != null ||
    job.totalMB != null ||
    estimatedFinalMB != null ||
    job.speedMBs != null ||
    etaLabel != null ||
    statusText !== "";
  const statusLabel = (
    <Text style={styles.statusText}>
      {t(`phase.${job.phase}`)}
      {isStalled ? t("jobCard.stalledSuffix") : ""}
    </Text>
  );

  useEffect(() => {
    Animated.timing(detailsAnim, {
      toValue: isDetailsExpanded ? 1 : 0,
      duration: DETAILS_COLLAPSE_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // height/margin can't run on the native driver
    }).start();
  }, [isDetailsExpanded, detailsAnim]);

  return (
    <View style={styles.jobCard}>
      <View style={styles.jobHeader}>
        {job.thumbnail && <Image testID="job-thumbnail" source={{ uri: job.thumbnail }} style={styles.jobThumbnail} />}
        <View style={styles.jobHeaderInfo}>
          {job.phase === "done" ? (
            <TextInput
              style={[styles.jobTitle, styles.jobTitleInputExtra]}
              value={customName ?? job.title ?? job.url}
              onChangeText={setCustomName}
              accessibilityLabel={t("jobCard.renameAccessibilityLabel")}
            />
          ) : (
            <Text style={styles.jobTitle} numberOfLines={1}>
              {job.title ?? job.url}
            </Text>
          )}
          {hasPositiveDuration(job.duration) && (
            <Text style={styles.jobDuration}>{formatDuration(job.duration)}</Text>
          )}
        </View>
      </View>

      {job.phase === "error" ? (
        <Text style={styles.errorText}>{errorText}</Text>
      ) : job.phase === "done" || job.phase === "cancelled" ? (
        <Text style={styles.statusText}>{t(`phase.${job.phase}`)}</Text>
      ) : (
        <>
          {hasDebugInfo ? (
            <Pressable
              style={styles.statusRow}
              onPress={() => setIsDetailsExpanded((expanded) => !expanded)}
              accessibilityLabel={isDetailsExpanded ? t("jobCard.detailsCollapse") : t("jobCard.detailsExpand")}
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
                {job.progress != null && (
                  <Text style={styles.debugLine}>{t("jobCard.progressLabel", { percent: job.progress.toFixed(1) })}</Text>
                )}
                {job.totalMB != null && (
                  <Text style={styles.debugLine}>
                    {t("jobCard.downloadedLabel", {
                      downloaded: job.downloadedMB != null ? formatMB(job.downloadedMB) : t("jobCard.downloadedUnknown"),
                      total: formatMB(job.totalMB),
                    })}
                  </Text>
                )}
                {estimatedFinalMB != null && (
                  <Text style={styles.debugLine}>{t("jobCard.estimatedSizeLabel", { size: formatMB(estimatedFinalMB) })}</Text>
                )}
                {job.speedMBs != null && (
                  <Text style={styles.debugLine}>{t("jobCard.speedLabel", { speed: job.speedMBs.toFixed(2) })}</Text>
                )}
                {etaLabel && <Text style={styles.debugLine}>{t("jobCard.etaLabel", { eta: etaLabel })}</Text>}
                <Text style={styles.debugLine}>{t("jobCard.runningSinceLabel", { elapsed: formatElapsed(now - job.createdAt) })}</Text>
                {statusText !== "" && (
                  <Text style={styles.debugLine} numberOfLines={1}>
                    {statusText}
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
            <Text style={styles.buttonText}>{t("jobCard.cancel")}</Text>
          </Pressable>
        )}
        {job.phase === "error" && (
          <Pressable style={styles.secondaryButton} onPress={onRetry}>
            <Text style={styles.buttonText}>{t("jobCard.tryAgain")}</Text>
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
                  ? t("jobCard.saving")
                  : saveState === "saved"
                    ? t("jobCard.savedCheck")
                    : t("jobCard.save", { ext: extLabel })}
              </Text>
            </Pressable>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => onShare(customName ?? undefined)}
              disabled={isSharing}
            >
              <Text style={styles.buttonText}>{isSharing ? t("jobCard.sharingEllipsis") : t("jobCard.share")}</Text>
            </Pressable>
          </>
        )}
        {job.phase === "done" && !onSave && (
          <Pressable
            style={[styles.downloadButton, isSharing && styles.buttonDisabled]}
            onPress={() => onShare(customName ?? undefined)}
            disabled={isSharing}
          >
            <Text style={styles.downloadButtonText}>
              {isSharing ? t("jobCard.downloadingEllipsis") : t("jobCard.downloadExt", { ext: extLabel })}
            </Text>
          </Pressable>
        )}
      </View>
      {saveState === "error" && <Text style={styles.errorText}>{t("jobCard.saveFailed")}</Text>}
    </View>
  );
}
