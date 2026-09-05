import type { ThemeColors } from "../theme/colors";

export function makeNavigationStyles(colors: ThemeColors) {
  return {
    tabBar: {
      backgroundColor: colors.surface,
      borderTopColor: colors.border,
    },
    tabBarActiveColor: {
      color: colors.accent,
    },
    tabBarInactiveColor: {
      color: colors.textMuted,
    },
  } as const;
}
