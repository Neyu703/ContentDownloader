import { StyleSheet } from "react-native";
import type { ThemeColors } from "../theme/colors";
import { makeLayoutStyles } from "./layout";
import { makeFormStyles } from "./form";
import { makeDropdownStyles } from "./dropdown";
import { makeJobCardStyles } from "./jobCard";
import { makePlaylistStyles } from "./playlist";
import { makeChangelogStyles } from "./changelog";

export function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    ...makeLayoutStyles(colors),
    ...makeFormStyles(colors),
    ...makeDropdownStyles(colors),
    ...makeJobCardStyles(colors),
    ...makePlaylistStyles(colors),
    ...makeChangelogStyles(colors),
  });
}
