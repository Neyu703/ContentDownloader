import { modalCard } from "./layout";
import type { ThemeColors } from "../theme/colors";

export function makeChangelogStyles(colors: ThemeColors) {
  return {
    changelogModal: { ...modalCard(colors) },
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
