import { Image, Pressable, Text, View } from "react-native";
import type { PlaylistEntry } from "../downloader/types";
import { formatDuration, hasPositiveDuration } from "../lib/format";
import { styles } from "../styles";

export function PlaylistEntryRow({
  entry,
  checked,
  onToggle,
}: {
  entry: PlaylistEntry;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable style={styles.playlistEntryRow} onPress={onToggle}>
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
