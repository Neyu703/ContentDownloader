import { noSelect } from "./layout";
import type { ThemeColors } from "../theme/colors";

export function makeDropdownStyles(colors: ThemeColors) {
  return {
    dropdownButton: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.inputBackground,
      borderRadius: 8,
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    dropdownButtonText: {
      color: colors.textPrimary,
      fontSize: 14,
      ...noSelect,
    },
    dropdownChevron: {
      color: colors.textMuted,
      fontSize: 12,
      ...noSelect,
    },
    dropdownOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    dropdownMenu: {
      width: "100%",
      maxWidth: 320,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      overflow: "hidden",
    },
    dropdownOption: {
      padding: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    dropdownOptionSelected: {
      backgroundColor: colors.accentSelected,
    },
    dropdownOptionText: {
      color: colors.textPrimary,
      fontSize: 14,
      ...noSelect,
    },
  } as const;
}
