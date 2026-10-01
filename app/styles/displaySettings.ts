import { modalCard } from "./layout";
import type { ThemeColors } from "../theme/colors";

export function makeDisplaySettingsStyles(colors: ThemeColors) {
  return {
    displaySettingsModal: { ...modalCard(colors), height: undefined, maxHeight: "85%" },
    displaySettingsTitle: {
      color: colors.textPrimary,
      fontWeight: "700",
      fontSize: 18,
      marginBottom: 4,
    },
    displaySettingsPreview: {
      marginBottom: 8,
    },
    displaySettingsFieldRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 8,
    },
    displaySettingsFieldLabel: {
      color: colors.textPrimary,
      fontSize: 14,
    },
  } as const;
}
