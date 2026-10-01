import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { type JobState } from "../downloader/types";
import { useDisplayPreferences } from "../display/DisplayPreferencesContext";
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
import { withFeedback } from "../styles/interactive";

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
  const { t: translate } = useTranslation();
  const { preferences } = useDisplayPreferences();
  const debugFields = preferences.debugFields;
  // User-edited filename for a finished job, overriding the auto-picked title — null until touched.
  const [customName, setCustomName] = useState<string | null>(null);
  const { saveState, handleSavePress } = useJobSave(onSave, customName);
  // Collapsed by default — the always-visible core line below (speed/ETA, or the phase label as a
  // fallback) already gives a glance-worthy summary without the full metadata box.
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
  const [debugBoxHeight, setDebugBoxHeight] = useState(0);
  const detailsAnim = useRef(new Animated.Value(0)).current;
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
  const errorText = translate(job.errorKey ?? "errors.unknown", job.errorParams);
  const statusText = job.lastLineKey ? translate(job.lastLineKey, job.lastLineParams) : job.lastLine;
  // One entry per debug field — single source of truth for both "is there anything to show at
  // all" (hasDebugInfo below) and the actual rendered lines, instead of maintaining the same
  // per-field visibility conditions in two separate places.
  const debugLines: { id: string; visible: boolean; text: string; numberOfLines?: number }[] = [
    {
      id: "progress",
      visible: job.progress != null && debugFields.progress,
      text: translate("jobCard.progressLabel", { percent: job.progress?.toFixed(1) ?? "" }),
    },
    {
      id: "downloaded",
      visible: job.totalMB != null && debugFields.downloaded,
      text: translate("jobCard.downloadedLabel", {
        downloaded: job.downloadedMB != null ? formatMB(job.downloadedMB) : translate("jobCard.downloadedUnknown"),
        total: job.totalMB != null ? formatMB(job.totalMB) : "",
      }),
    },
    {
      id: "estimatedSize",
      visible: estimatedFinalMB != null && debugFields.estimatedSize,
      text: translate("jobCard.estimatedSizeLabel", { size: estimatedFinalMB != null ? formatMB(estimatedFinalMB) : "" }),
    },
    {
      id: "speed",
      visible: job.speedMBs != null && debugFields.speed,
      text: translate("jobCard.speedLabel", { speed: job.speedMBs?.toFixed(2) ?? "" }),
    },
    {
      id: "eta",
      visible: etaLabel != null && debugFields.eta,
      text: translate("jobCard.etaLabel", { eta: etaLabel ?? "" }),
    },
    {
      id: "runningSince",
      visible: debugFields.runningSince,
      text: translate("jobCard.runningSinceLabel", { elapsed: formatElapsed(now - job.createdAt) }),
    },
    { id: "rawStatus", visible: statusText !== "" && debugFields.rawStatus, text: statusText, numberOfLines: 1 },
  ];
  // "Running since" alone still isn't informative enough to justify showing the toggle (same
  // reasoning as before display preferences existed) — excluded here even when enabled, but its
  // own line above is still gated by the preference once the box is showing for another reason.
  const hasDebugInfo = debugLines.some((line) => line.id !== "runningSince" && line.visible);
  // Collapsed-view summary next to the progress bar: speed/ETA (whichever the user still has
  // visible), falling back to the translated phase label once neither applies.
  const coreSpeedValue = debugFields.speed && job.speedMBs != null ? job.speedMBs.toFixed(2) : null;
  const coreEtaValue = debugFields.eta ? etaLabel : null;
  const coreLineText =
    coreSpeedValue != null && coreEtaValue != null
      ? translate("jobCard.coreLineBoth", { speed: coreSpeedValue, eta: coreEtaValue })
      : coreSpeedValue != null
        ? translate("jobCard.coreLineSpeedOnly", { speed: coreSpeedValue })
        : coreEtaValue != null
          ? translate("jobCard.coreLineEtaOnly", { eta: coreEtaValue })
          : translate(`phase.${job.phase}`);
  const statusLabel = (
    <Text style={styles.statusText}>
      {translate(`phase.${job.phase}`)}
      {isStalled ? translate("jobCard.stalledSuffix") : ""}
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
              accessibilityLabel={translate("jobCard.renameAccessibilityLabel")}
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
        <Text style={styles.statusText}>{translate(`phase.${job.phase}`)}</Text>
      ) : (
        <>
          {hasDebugInfo ? (
            <Pressable
              style={withFeedback(styles, styles.statusRow)}
              onPress={() => setIsDetailsExpanded((expanded) => !expanded)}
              accessibilityLabel={isDetailsExpanded ? translate("jobCard.detailsCollapse") : translate("jobCard.detailsExpand")}
              accessibilityRole="button"
              aria-expanded={isDetailsExpanded}
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
            <Animated.View
              style={[
                styles.progressCoreBadge,
                { opacity: detailsAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
              ]}
            >
              <Text style={styles.progressCoreText} numberOfLines={1}>
                {coreLineText}
              </Text>
            </Animated.View>
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
                {debugLines
                  .filter((line) => line.visible)
                  .map((line) => (
                    <Text key={line.id} style={styles.debugLine} numberOfLines={line.numberOfLines}>
                      {line.text}
                    </Text>
                  ))}
              </View>
            </Animated.View>
          )}
        </>
      )}

      <View style={styles.jobActions}>
        {!isFinished && (
          <Pressable style={withFeedback(styles, styles.jobSecondaryButton)} onPress={onCancel} accessibilityRole="button">
            <Text style={styles.jobSecondaryButtonText}>{translate("jobCard.cancel")}</Text>
          </Pressable>
        )}
        {job.phase === "error" && (
          <Pressable style={withFeedback(styles, styles.jobSecondaryButton)} onPress={onRetry} accessibilityRole="button">
            <Text style={styles.jobSecondaryButtonText}>{translate("jobCard.tryAgain")}</Text>
          </Pressable>
        )}
        {job.phase === "done" && onSave && (
          <>
            <Pressable
              style={withFeedback(styles, [styles.downloadButton, saveState === "saving" && styles.buttonDisabled])}
              onPress={handleSavePress}
              disabled={saveState === "saving"}
              accessibilityRole="button"
            >
              <Text style={styles.downloadButtonText}>
                {saveState === "saving"
                  ? translate("jobCard.saving")
                  : saveState === "saved"
                    ? translate("jobCard.savedCheck")
                    : translate("jobCard.save", { ext: extLabel })}
              </Text>
            </Pressable>
            <Pressable
              style={withFeedback(styles, styles.jobSecondaryButton)}
              onPress={() => onShare(customName ?? undefined)}
              disabled={isSharing}
              accessibilityRole="button"
            >
              <Text style={styles.jobSecondaryButtonText}>{isSharing ? translate("jobCard.sharingEllipsis") : translate("jobCard.share")}</Text>
            </Pressable>
          </>
        )}
        {job.phase === "done" && !onSave && (
          <Pressable
            style={withFeedback(styles, [styles.downloadButton, isSharing && styles.buttonDisabled])}
            onPress={() => onShare(customName ?? undefined)}
            disabled={isSharing}
            accessibilityRole="button"
          >
            <Text style={styles.downloadButtonText}>
              {isSharing ? translate("jobCard.downloadingEllipsis") : translate("jobCard.downloadExt", { ext: extLabel })}
            </Text>
          </Pressable>
        )}
      </View>
      {saveState === "error" && <Text style={styles.errorText}>{translate("jobCard.saveFailed")}</Text>}
    </View>
  );
}
