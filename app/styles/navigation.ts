import type { ThemeColors } from "../theme/colors";

export function makeNavigationStyles(colors: ThemeColors) {
  return {
    tabBar: {
      backgroundColor: colors.surface,
      borderTopColor: colors.border,
    },
  } as const;
}
