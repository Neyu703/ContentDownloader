import { noSelect } from "./layout";
import type { ThemeColors } from "../theme/colors";

export function makeFormStyles(colors: ThemeColors) {
  return {
    urlRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      marginBottom: 10,
    },
    urlInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.inputBackground,
      color: colors.textPrimary,
      borderRadius: 8,
      padding: 12,
      fontSize: 15,
      minHeight: 46,
      maxHeight: 140,
      textAlignVertical: "top",
    },
    pasteButton: {
      backgroundColor: colors.borderStrong,
      borderRadius: 8,
      width: 46,
      height: 46,
      alignItems: "center",
      justifyContent: "center",
    },
    pasteButtonIcon: {
      fontSize: 18,
      ...noSelect,
    },
    previewCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.surfaceVariant,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 10,
      marginBottom: 12,
    },
    previewThumbnail: {
      width: 80,
      height: 45,
      borderRadius: 6,
      backgroundColor: colors.background,
    },
    previewInfo: {
      flex: 1,
      gap: 4,
    },
    previewTitle: {
      color: colors.textPrimary,
      fontWeight: "600",
      fontSize: 13,
    },
    previewMeta: {
      color: colors.textMuted,
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
    button: {
      backgroundColor: colors.accent,
      borderRadius: 8,
      padding: 12,
      alignItems: "center",
    },
    buttonDisabled: {
      backgroundColor: colors.buttonDisabled,
    },
    buttonText: {
      color: colors.onAccent,
      fontWeight: "600",
      fontSize: 15,
      ...noSelect,
    },
    secondaryButton: {
      backgroundColor: colors.borderStrong,
      borderRadius: 8,
      paddingVertical: 10,
      paddingHorizontal: 14,
      alignItems: "center",
    },
  } as const;
}
