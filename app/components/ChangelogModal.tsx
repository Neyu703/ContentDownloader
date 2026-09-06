import { FlatList, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { CHANGELOG_ENTRIES, type ChangelogEntry } from "../changelog/entries";
import { useStyles } from "../styles/useStyles";
import { OverlayModal } from "./OverlayModal";

export function ChangelogModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const language = i18n.language === "de" ? "de" : "en";

  return (
    <OverlayModal visible={visible} onClose={onClose}>
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
    </OverlayModal>
  );
}
