import { Image, Pressable, Text, View } from "react-native";
import type { PlaylistEntry } from "../downloader/types";
import { formatDuration, hasPositiveDuration } from "../lib/format";
import { useStyles } from "../styles/useStyles";
import { withFeedback } from "../styles/interactive";

export function PlaylistEntryRow({
  entry,
  checked,
  onToggle,
}: {
  entry: PlaylistEntry;
  checked: boolean;
  onToggle: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      style={withFeedback(styles, styles.playlistEntryRow)}
      onPress={onToggle}
      accessibilityRole="checkbox"
      aria-checked={checked}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Text style={styles.checkboxMark}>✓</Text>}
      </View>
      {entry.thumbnail && (
        <Image testID="playlist-entry-thumbnail" source={{ uri: entry.thumbnail }} style={styles.playlistEntryThumbnail} />
      )}
      <View style={styles.playlistEntryInfo}>
        <Text style={styles.playlistEntryTitle} numberOfLines={2}>
          {entry.title}
        </Text>
        {hasPositiveDuration(entry.duration) && (
          <Text style={styles.previewMeta}>{formatDuration(entry.duration)}</Text>
        )}
      </View>
    </Pressable>
  );
}
