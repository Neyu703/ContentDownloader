import { noSelect, RADIUS_MD } from "./layout";
import type { ThemeColors } from "../theme/colors";

export function makeHistoryStyles(colors: ThemeColors) {
  return {
    // "N entries removed · Undo" bar shown after a removal — stays until undone, replaced by the
    // next removal, or the tab is left (no timed auto-dismiss that could vanish before it's read).
    undoBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginTop: 12,
      paddingVertical: 8,
      paddingLeft: 14,
      paddingRight: 8,
      backgroundColor: colors.surfaceVariant,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: RADIUS_MD,
    },
    undoBarText: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 13,
    },
    undoBarButton: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: RADIUS_MD,
    },
    undoBarButtonText: {
      color: colors.accentText,
      fontWeight: "600",
      fontSize: 14,
      ...noSelect,
    },
  } as const;
}
