import { FlatList, Modal, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { MediaFormat, PlaylistInfo } from "../downloader/types";
import { isAllPlaylistEntriesSelected, playlistConfirmLabel } from "../lib/format";
import { useStyles } from "../styles/useStyles";
import { PlaylistEntryRow } from "./PlaylistEntryRow";

export interface PlaylistPickerViewState {
  info: PlaylistInfo;
  /** Keyed by entry index, not entry.id — see the comment on PlaylistPickerState in usePlaylistPicker.ts. */
  selected: Set<number>;
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
  onToggleEntry: (index: number) => void;
  onToggleAll: () => void;
  onLoadMore: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
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
            <Text style={styles.linkText}>{allSelected ? t("playlist.deselectAll") : t("playlist.selectAll")}</Text>
          </Pressable>
          {/* FlatList virtualizes rows (only mounts what's on screen) so playlists with thousands of
              entries stay smooth, and onEndReached drives infinite-scroll paging. */}
          <FlatList
            testID="playlist-entry-list"
            style={styles.playlistEntryList}
            data={picker.info.entries}
            // Index, not entry.id: the same video (and thus the same id) can legitimately appear
            // twice in one playlist (re-added), so entry.id would collide as both a list key and
            // the selection key below.
            keyExtractor={(_entry, index) => String(index)}
            renderItem={({ item, index }) => (
              <PlaylistEntryRow
                entry={item}
                checked={picker.selected.has(index)}
                onToggle={() => onToggleEntry(index)}
              />
            )}
            onEndReachedThreshold={0.5}
            onEndReached={onLoadMore}
            ListFooterComponent={
              picker.isLoadingMore ? <Text style={styles.searchMessage}>{t("playlist.loadingMore")}</Text> : null
            }
          />
          <View style={styles.jobActions}>
            <Pressable style={styles.secondaryButton} onPress={onCancel}>
              <Text style={styles.buttonText}>{t("playlist.cancel")}</Text>
            </Pressable>
            <Pressable
              style={[styles.button, picker.selected.size === 0 && styles.buttonDisabled]}
              onPress={onConfirm}
              disabled={picker.selected.size === 0}
            >
              <Text style={styles.buttonText}>{playlistConfirmLabel(t, format, picker.selected.size)}</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}
