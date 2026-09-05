import { useMemo } from "react";
import { useTheme } from "../theme/ThemeContext";
import { makeStyles } from "./index";

/** Builds the app's StyleSheet for the current theme, memoized so it only rebuilds when the theme changes. */
export function useStyles() {
  const { colors } = useTheme();
  return useMemo(() => makeStyles(colors), [colors]);
}
