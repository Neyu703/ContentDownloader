import { modalCard } from "./layout";
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
  } as const;
}
