import { useCallback, useState } from "react";
import { Image, Pressable, SafeAreaView, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useNavigation, type NavigationProp } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { downloader } from "../downloader";
import { loadHistory, type HistoryEntry } from "../lib/downloadHistory";
import type { RootTabParamList } from "../navigation/types";
import { useStyles } from "../styles/useStyles";
import { withFeedback } from "../styles/interactive";

export function HistoryScreen() {
  const styles = useStyles();
  const { t: translate } = useTranslation();
  const navigation = useNavigation<NavigationProp<RootTabParamList>>();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  // Reloads every time this tab gains focus, so a download finished while on Home shows up
  // immediately on switching here, without duplicating historyRecorder's own capture logic.
  // Reversed once here (newest first) rather than on every render below.
  useFocusEffect(
    useCallback(() => {
      loadHistory().then((history) => setEntries([...history].reverse()));
    }, [])
  );

  function handleRedownload(entry: HistoryEntry) {
    downloader.enqueue({
      url: entry.url,
      format: entry.format,
      quality: entry.quality,
      title: entry.title,
      thumbnail: entry.thumbnail,
    });
    navigation.navigate("Home");
  }

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.title}>{translate("history.title")}</Text>
        {entries.length === 0 ? (
          <Text style={styles.searchMessage}>{translate("history.empty")}</Text>
        ) : (
          <ScrollView style={styles.jobList}>
            {entries.map((entry) => (
              <View key={entry.id} style={styles.jobCard}>
                <View style={styles.jobHeader}>
                  {entry.thumbnail && (
                    <Image testID="history-thumbnail" source={{ uri: entry.thumbnail }} style={styles.jobThumbnail} />
                  )}
                  <View style={styles.jobHeaderInfo}>
                    <Text style={styles.jobTitle} numberOfLines={1}>
                      {entry.title ?? entry.url}
                    </Text>
                    <Text style={styles.jobDuration}>
                      {new Date(entry.completedAt).toLocaleDateString()} · {(entry.ext ?? "").toUpperCase()}
                    </Text>
                  </View>
                </View>
                <View style={styles.jobActions}>
                  <Pressable
                    style={withFeedback(styles, styles.downloadButton)}
                    onPress={() => handleRedownload(entry)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.downloadButtonText}>{translate("history.reDownloadButton")}</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}
