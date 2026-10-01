import { useCallback, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useNavigation, type NavigationProp } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { downloader } from "../downloader";
import { appendHistoryEntries, loadHistory, removeHistoryEntries, type HistoryEntry } from "../lib/downloadHistory";
import type { RootTabParamList } from "../navigation/types";
import { useStyles } from "../styles/useStyles";
import { withFeedback } from "../styles/interactive";

export function HistoryScreen() {
  const styles = useStyles();
  const { t: translate } = useTranslation();
  const navigation = useNavigation<NavigationProp<RootTabParamList>>();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  // The last removal (single entry or "clear all"), offered for undo instead of a confirm dialog.
  const [lastRemoved, setLastRemoved] = useState<HistoryEntry[] | null>(null);

  // Reversed once here (newest first) rather than on every render below.
  const reloadEntries = useCallback(async () => {
    const history = await loadHistory();
    setEntries([...history].reverse());
  }, []);

  // Reloads every time this tab gains focus, so a download finished while on Home shows up
  // immediately on switching here, without duplicating historyRecorder's own capture logic. A
  // pending undo from an earlier visit is dropped — it would no longer be next to its context.
  useFocusEffect(
    useCallback(() => {
      setLastRemoved(null);
      reloadEntries();
    }, [reloadEntries])
  );

  async function handleRemove(removedEntries: HistoryEntry[]) {
    setLastRemoved(removedEntries);
    await removeHistoryEntries(removedEntries.map((entry) => entry.id));
    await reloadEntries();
  }

  async function handleUndo() {
    // Only reachable while the undo bar (rendered for a non-null lastRemoved) is showing.
    const restoredEntries = lastRemoved!;
    setLastRemoved(null);
    await appendHistoryEntries(restoredEntries);
    await reloadEntries();
  }

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
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.title}>{translate("history.title")}</Text>
        {entries.length === 0 ? (
          <>
            <Text style={styles.searchMessage}>{translate("history.empty")}</Text>
            <Pressable
              style={withFeedback(styles, [styles.button, styles.emptyStateAction])}
              onPress={() => navigation.navigate("Home")}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>{translate("history.emptyAction")}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              style={withFeedback(styles, styles.linkButton)}
              onPress={() => handleRemove(entries)}
              accessibilityRole="button"
            >
              <Text style={styles.linkText}>{translate("history.clearAll")}</Text>
            </Pressable>
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
                    <Pressable
                      style={withFeedback(styles, styles.jobSecondaryButton)}
                      onPress={() => handleRemove([entry])}
                      accessibilityRole="button"
                      accessibilityLabel={translate("history.removeAccessibilityLabel", { title: entry.title ?? entry.url })}
                    >
                      <Text style={styles.jobSecondaryButtonText}>{translate("history.removeButton")}</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </ScrollView>
          </>
        )}
        {lastRemoved && (
          <View style={styles.undoBar}>
            <Text style={styles.undoBarText}>{translate("history.removed", { count: lastRemoved.length })}</Text>
            <Pressable style={withFeedback(styles, styles.undoBarButton)} onPress={handleUndo} accessibilityRole="button">
              <Text style={styles.undoBarButtonText}>{translate("history.undo")}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}
