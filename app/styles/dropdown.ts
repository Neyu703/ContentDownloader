import { noSelect, RADIUS_MD } from "./layout";
import type { ThemeColors } from "../theme/colors";

// Scale-parameterized shape factories (mirroring layout.ts's primaryButtonShape/etc.) — exported
// so Dropdown.tsx can build its own optional `scale` prop (used by HomeScreen's Format/Quality
// dropdowns) by calling the same factory the static stylesheet below uses, instead of hand-
// multiplying duplicated magic numbers. Default scale=1 keeps every other Dropdown instance
// (e.g. Settings' language/theme pickers) exactly as before.
export function dropdownButtonShape(colors: ThemeColors, scale = 1) {
  return {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.inputBackground,
    borderRadius: RADIUS_MD,
    padding: 12 * scale,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  } as const;
}

export function dropdownButtonTextShape(colors: ThemeColors, scale = 1) {
  return {
    color: colors.textPrimary,
    fontSize: 14 * scale,
    ...noSelect,
  } as const;
}

export function makeDropdownStyles(colors: ThemeColors) {
  return {
    dropdownButton: dropdownButtonShape(colors),
    dropdownButtonText: dropdownButtonTextShape(colors),
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
