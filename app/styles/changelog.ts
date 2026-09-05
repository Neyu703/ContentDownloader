import type { ThemeColors } from "../theme/colors";

export function makeChangelogStyles(colors: ThemeColors) {
  return {
    changelogModal: {
      width: "100%",
      maxWidth: 480,
      height: "85%",
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      padding: 20,
      gap: 10,
    },
    changelogTitle: {
      color: colors.textPrimary,
      fontWeight: "700",
      fontSize: 18,
      marginBottom: 4,
    },
    changelogList: {
      flex: 1,
    },
    changelogEntry: {
      marginBottom: 16,
      gap: 4,
    },
    changelogVersion: {
      color: colors.textPrimary,
      fontWeight: "700",
      fontSize: 14,
    },
    changelogLine: {
      color: colors.textSecondary,
      fontSize: 13,
    },
  } as const;
}
