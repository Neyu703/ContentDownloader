import { StyleSheet } from "react-native";
import { layoutStyles } from "./layout";
import { formStyles } from "./form";
import { dropdownStyles } from "./dropdown";
import { jobCardStyles } from "./jobCard";
import { playlistStyles } from "./playlist";

export const styles = StyleSheet.create({
  ...layoutStyles,
  ...formStyles,
  ...dropdownStyles,
  ...jobCardStyles,
  ...playlistStyles,
});
