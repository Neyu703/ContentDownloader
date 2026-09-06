import { noSelect, modalCard } from "./layout";
import type { ThemeColors } from "../theme/colors";

export function makePlaylistStyles(colors: ThemeColors) {
  return {
    playlistModal: { ...modalCard(colors) },
    playlistModalTitle: {
      color: colors.textPrimary,
      fontWeight: "700",
      fontSize: 16,
    },
    playlistEntryList: {
      flex: 1,
    },
    playlistEntryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 8,
    },
    playlistEntryThumbnail: {
      width: 64,
      height: 36,
      borderRadius: 4,
      backgroundColor: colors.background,
    },
    playlistEntryInfo: {
      flex: 1,
      gap: 2,
    },
    playlistEntryTitle: {
      color: colors.textPrimary,
      fontSize: 13,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 5,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxChecked: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    checkboxMark: {
      color: colors.onAccent,
      fontSize: 14,
      fontWeight: "700",
      ...noSelect,
    },
  } as const;
}
