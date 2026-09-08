import { modalCard } from "./layout";
import type { ThemeColors } from "../theme/colors";

export function makeBackgroundStyles(colors: ThemeColors) {
  return {
    // Fills the screen behind the nav stack — see App.tsx for where this is mounted. Pre-filled
    // with the theme's own background color so the page never goes blank/white while the chosen
    // background is still loading, or if it fails to initialize (e.g. WebGPU unsupported) — the
    // animated background then paints over this once ready.
    backgroundLayerContainer: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.background,
      // Never intercepts touches/clicks meant for the real UI on top of it.
      pointerEvents: "none",
    },
    backgroundSettingsModal: { ...modalCard(colors), height: undefined, maxHeight: "85%" },
    backgroundSettingsTitle: {
      color: colors.textPrimary,
      fontWeight: "700",
      fontSize: 18,
      marginBottom: 4,
    },
    backgroundSettingsSliderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    backgroundSettingsSliderValue: {
      color: colors.textSecondary,
      fontSize: 12,
      width: 32,
      textAlign: "right",
    },
  } as const;
}
