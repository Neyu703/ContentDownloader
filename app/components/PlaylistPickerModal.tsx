import { FlatList, Modal, Pressable, Text, View } from "react-native";
import type { MediaFormat, PlaylistInfo } from "../downloader/types";
import { isAllPlaylistEntriesSelected, playlistConfirmLabel } from "../lib/format";
import { styles } from "../styles";
import { PlaylistEntryRow } from "./PlaylistEntryRow";

export interface PlaylistPickerViewState {
  info: PlaylistInfo;
  selected: Set<string>;
  isLoadingMore: boolean;
}

export function PlaylistPickerModal({
  picker,
  format,
  onToggleEntry,
  onToggleAll,
  onLoadMore,
  onConfirm,
  onCancel,
}: {
  picker: PlaylistPickerViewState | null;
  format: MediaFormat;
  onToggleEntry: (id: string) => void;
  onToggleAll: () => void;
  onLoadMore: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Conditionally rendering the Modal element itself (instead of always rendering it with a
  // toggled `visible` prop) so closing it fully unmounts the portal — react-native-web's Modal was
  // observed staying visible with stale/empty content after `visible` flipped to false shortly
  // after an async state update (the infinite-scroll page load), even though the underlying
  // `picker` state had already gone back to null.
  if (!picker) return null;

  const allSelected = isAllPlaylistEntriesSelected(picker);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable testID="dropdown-overlay" style={styles.dropdownOverlay} onPress={onCancel}>
        <View style={styles.playlistModal}>
          <Text style={styles.playlistModalTitle} numberOfLines={2}>
            {picker.info.title}
            {picker.info.totalCount != null ? ` (${picker.info.totalCount})` : ""}
          </Text>
          <Pressable style={styles.linkButton} onPress={onToggleAll}>
            <Text style={styles.linkText}>{allSelected ? "Alle abwählen" : "Alle auswählen"}</Text>
          </Pressable>
          {/* FlatList virtualizes rows (only mounts what's on screen) so playlists with thousands of
              entries stay smooth, and onEndReached drives infinite-scroll paging. */}
          <FlatList
            testID="playlist-entry-list"
            style={styles.playlistEntryList}
            data={picker.info.entries}
            keyExtractor={(entry) => entry.id}
            renderItem={({ item }) => (
              <PlaylistEntryRow
                entry={item}
                checked={picker.selected.has(item.id)}
                onToggle={() => onToggleEntry(item.id)}
              />
            )}
            onEndReachedThreshold={0.5}
            onEndReached={onLoadMore}
            ListFooterComponent={
              picker.isLoadingMore ? <Text style={styles.searchMessage}>Lädt weitere Videos…</Text> : null
            }
          />
          <View style={styles.jobActions}>
            <Pressable style={styles.secondaryButton} onPress={onCancel}>
              <Text style={styles.buttonText}>Abbrechen</Text>
            </Pressable>
            <Pressable
              style={[styles.button, picker.selected.size === 0 && styles.buttonDisabled]}
              onPress={onConfirm}
              disabled={picker.selected.size === 0}
            >
              <Text style={styles.buttonText}>{playlistConfirmLabel(format, picker.selected.size)}</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}
