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

export function makeStyles(colors: ThemeColors, isBackgroundActive: boolean = false) {
  return StyleSheet.create({
    ...makeLayoutStyles(colors, isBackgroundActive),
    ...makeFormStyles(colors),
    ...makeDropdownStyles(colors),
    ...makeJobCardStyles(colors),
    ...makePlaylistStyles(colors),
    ...makeChangelogStyles(colors),
    ...makeCookieImportStyles(colors),
    ...makeBackgroundStyles(colors),
  });
}
