import { Platform } from "react-native";
import { noSelect, RADIUS_MD } from "./layout";
import type { ThemeColors } from "../theme/colors";

// Deliberately theme-invariant: this badge sits on top of the job's own video thumbnail, not app
// chrome, so it stays a dark translucent badge with light text in both themes for legibility
// against unpredictable thumbnail brightness.
const BADGE_OVERLAY_BG = "rgba(13,13,13,0.75)";
const BADGE_OVERLAY_TEXT = "#f0f0f0";

export function makeJobCardStyles(colors: ThemeColors) {
  return {
    jobList: {
      marginTop: 10,
      // web-only: flex:1 + minHeight:0 lets the ScrollView shrink to the remaining space within
      // card's maxHeight instead of growing to its full content height. NOT on native — a flex:1
      // child of a content-sized (maxHeight-only) parent collapses on React Native's real Yoga
      // engine (confirmed on-device 2026-08-20, see layout.ts's twoColumnRow for the full story).
      flex: Platform.select({ web: 1, default: undefined }),
      minHeight: Platform.select({ web: 0, default: undefined }),
    },
    jobCard: {
      backgroundColor: colors.surfaceVariant,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
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
      backgroundColor: colors.background,
    },
    jobHeaderInfo: {
      flex: 1,
      gap: 2,
    },
    jobTitle: {
      color: colors.textPrimary,
      fontWeight: "600",
      fontSize: 14,
    },
    // Shown instead of jobTitle once a download is done, so a bad auto-picked title (e.g. an
    // Instagram/TikTok placeholder) can be fixed before saving. Combine with jobTitle via a style
    // array to inherit its text styling.
    jobTitleInputExtra: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingVertical: 2,
    },
    jobDuration: {
      color: colors.textMuted,
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
      color: colors.textSecondary,
      fontSize: 13,
    },
    collapseButton: {
      backgroundColor: colors.border,
      borderRadius: 6,
      width: 28,
      height: 28,
      alignItems: "center",
      justifyContent: "center",
    },
    collapseChevron: {
      color: colors.textSecondary,
      fontSize: 16,
      fontWeight: "700",
      ...noSelect,
    },
    progressWrapper: {
      width: "100%",
      position: "relative",
    },
    progressTrack: {
      width: "100%",
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.border,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      backgroundColor: colors.accent,
      borderRadius: 4,
    },
    progressEtaBadge: {
      position: "absolute",
      right: 4,
      top: "50%",
      transform: [{ translateY: -8 }],
      backgroundColor: BADGE_OVERLAY_BG,
      borderRadius: RADIUS_MD,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    progressEtaText: {
      color: BADGE_OVERLAY_TEXT,
      fontSize: 10,
      fontWeight: "600",
    },
    debugBox: {
      width: "100%",
      backgroundColor: colors.inputBackground,
      borderRadius: RADIUS_MD,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 10,
      gap: 4,
    },
    debugLine: {
      color: colors.textMuted,
      fontSize: 12,
      fontFamily: Platform.OS === "web" ? "monospace" : undefined,
    },
    downloadButton: {
      backgroundColor: colors.success,
      borderRadius: RADIUS_MD,
      paddingVertical: 10,
      paddingHorizontal: 18,
    },
    downloadButtonText: {
      color: colors.onSuccess,
      fontWeight: "700",
      fontSize: 13,
      ...noSelect,
    },
    groupHeader: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: "600",
      marginBottom: 6,
      marginTop: 4,
    },
  } as const;
}
