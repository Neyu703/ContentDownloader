import type { ThemeColors } from "../theme/colors";

export function makeNavigationStyles(colors: ThemeColors, isBackgroundActive: boolean) {
  return {
    tabBar: {
      backgroundColor: colors.surface,
      borderTopColor: colors.border,
    },
    // React Navigation gives each screen's own content container an opaque default background —
    // without overriding it here, BackgroundLayer (behind the whole navigator) never shows through.
    sceneContainer: {
      backgroundColor: isBackgroundActive ? "transparent" : colors.background,
    },
  } as const;
}
