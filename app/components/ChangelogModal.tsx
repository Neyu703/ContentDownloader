import { FlatList, Modal, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { CHANGELOG_ENTRIES, type ChangelogEntry } from "../changelog/entries";
import { styles } from "../styles";

export function ChangelogModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === "de" ? "de" : "en";

  // Conditionally rendering the Modal element itself (not just toggling `visible`) — same
  // react-native-web unmount discipline as PlaylistPickerModal.
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable testID="dropdown-overlay" style={styles.dropdownOverlay} onPress={onClose}>
        <Pressable style={styles.changelogModal} onPress={() => {}}>
          <Text style={styles.changelogTitle}>{t("changelog.title")}</Text>
          <FlatList
            testID="changelog-entry-list"
            style={styles.changelogList}
            data={CHANGELOG_ENTRIES}
            keyExtractor={(entry: ChangelogEntry) => entry.version}
            renderItem={({ item }) => (
              <View style={styles.changelogEntry}>
                <Text style={styles.changelogVersion}>
                  {item.version} — {item.date}
                </Text>
                {item.notes[language].map((line, index) => (
                  <Text key={index} style={styles.changelogLine}>
                    • {line}
                  </Text>
                ))}
              </View>
            )}
          />
          <Pressable style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>{t("changelog.close")}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
