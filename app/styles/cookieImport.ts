import { modalCard } from "./layout";
import type { ThemeColors } from "../theme/colors";

export function makeCookieImportStyles(colors: ThemeColors) {
  return {
    // Sized to its content (unlike changelog's fixed 85% height for a long, scrollable list) —
    // a fixed height here would leave a large empty gap below this modal's few short lines.
    cookieImportModal: { ...modalCard(colors), height: undefined, maxHeight: "85%" },
    cookieImportTitle: {
      color: colors.textPrimary,
      fontWeight: "700",
      fontSize: 18,
      marginBottom: 4,
    },
    cookieImportStep: {
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    cookieImportLinksRow: {
      flexDirection: "row",
      gap: 12,
      marginTop: 2,
      marginBottom: 4,
    },
    cookieImportSuccessText: {
      color: colors.success,
      textAlign: "center",
      fontSize: 13,
    },
    cookieImportDropZone: {
      alignItems: "center",
      gap: 4,
      borderWidth: 1.5,
      borderStyle: "dashed",
      borderColor: colors.borderStrong,
      borderRadius: 14,
      backgroundColor: colors.surfaceVariant,
      paddingVertical: 22,
      paddingHorizontal: 16,
    },
    // Only ever applied on web (native has no dragOver event to trigger it) — a visual cue that
    // the drop zone is armed while a dragged file is over it.
    cookieImportDropZoneActive: {
      borderColor: colors.accent,
      backgroundColor: colors.accentSelected,
    },
    cookieImportDropIcon: {
      fontSize: 26,
      marginBottom: 2,
    },
    cookieImportDropHint: {
      color: colors.textSecondary,
      fontWeight: "600",
      fontSize: 14,
    },
    cookieImportDropOr: {
      color: colors.textMuted,
      fontSize: 12,
      marginVertical: 4,
    },
    cookieImportManualPasteLabel: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 6,
    },
  } as const;
}
