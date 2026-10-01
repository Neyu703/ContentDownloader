import { StyleSheet } from "react-native";
import type { ThemeColors } from "../theme/colors";
import { makeLayoutStyles } from "./layout";
import { makeFormStyles } from "./form";
import { makeDropdownStyles } from "./dropdown";
import { makeJobCardStyles } from "./jobCard";
import { makePlaylistStyles } from "./playlist";
import { makeChangelogStyles } from "./changelog";
import { makeCookieImportStyles } from "./cookieImport";
import { makeBackgroundStyles } from "./background";
import { makeDisplaySettingsStyles } from "./displaySettings";
import { makeHistoryStyles } from "./history";

export function makeStyles(
  colors: ThemeColors,
  isBackgroundActive: boolean = false,
  jobCardScale: number = 1,
  formScale: number = 1
) {
  return StyleSheet.create({
    ...makeLayoutStyles(colors, isBackgroundActive),
    ...makeFormStyles(colors, formScale),
    ...makeDropdownStyles(colors),
    ...makeJobCardStyles(colors, jobCardScale),
    ...makePlaylistStyles(colors),
    ...makeChangelogStyles(colors),
    ...makeCookieImportStyles(colors),
    ...makeBackgroundStyles(colors),
    ...makeDisplaySettingsStyles(colors),
    ...makeHistoryStyles(colors),
  });
}
