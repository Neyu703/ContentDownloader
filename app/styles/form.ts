import { Platform } from "react-native";
import { noSelect, primaryButtonShape, primaryButtonTextShape, RADIUS_MD, secondaryButtonShape } from "./layout";
import type { ThemeColors } from "../theme/colors";

/**
 * `scale` (from the user's "Formular-Größe" display preference) only widens/enlarges the URL
 * field, paste button, and the two new `downloadForm*` keys below — `button`/`buttonText`/
 * `secondaryButton` stay unscaled (scale-independent callers: PlaylistPickerModal,
 * CookieImportModal, ChangelogModal) so their buttons never change size from this setting.
 */
export function makeFormStyles(colors: ThemeColors, scale = 1) {
  return {
    urlRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      marginBottom: 14,
    },
    // The URL field is Home's focal point now that the header is gone — a bit taller and more
    // rounded than the shared RADIUS_MD used elsewhere, so it reads as the card's centerpiece.
    urlInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.inputBackground,
      color: colors.textPrimary,
      borderRadius: RADIUS_MD + 2,
      padding: 14 * scale,
      fontSize: 15 * scale,
      minHeight: 50 * scale,
      maxHeight: 140 * scale,
      textAlignVertical: "top",
    },
    // Focus indicator in the app's accent on every platform (native TextInput shows none besides
    // the caret); on web it also replaces the browser's own off-palette outline, border + outline
    // together reading as one 2px accent ring.
    urlInputFocused: {
      borderColor: colors.accent,
      ...Platform.select({ web: { outlineStyle: "solid" as const, outlineWidth: 1, outlineColor: colors.accent }, default: {} }),
    },
    pasteButton: {
      backgroundColor: colors.borderStrong,
      borderRadius: RADIUS_MD + 2,
      width: 50 * scale,
      height: 50 * scale,
      alignItems: "center",
      justifyContent: "center",
    },
    pasteButtonIcon: {
      fontSize: 18 * scale,
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
    button: { ...primaryButtonShape(colors) },
    buttonDisabled: {
      backgroundColor: colors.buttonDisabled,
    },
    buttonText: { ...primaryButtonTextShape(colors) },
    secondaryButton: { ...secondaryButtonShape(colors) },
    // HomeScreen-only: the Download button, scaled by "Formular-Größe" (unlike the shared
    // button/buttonText above, which other screens/modals also render at their fixed size).
    downloadFormButton: { ...primaryButtonShape(colors, scale) },
    downloadFormButtonText: { ...primaryButtonTextShape(colors, scale) },
  } as const;
}
