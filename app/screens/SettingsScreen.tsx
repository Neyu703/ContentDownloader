import { useEffect, useMemo, useState } from "react";
import { SafeAreaView, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { downloader } from "../downloader";
import { Dropdown } from "../components/Dropdown";
import { ChangelogModal } from "../components/ChangelogModal";
import i18n, { type SupportedLanguage } from "../i18n";
import { loadLanguageSetting, resolveLanguage, saveLanguageSetting, type LanguageSetting } from "../i18n/languagePreference";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeSetting } from "../theme/themePreference";
import { useStyles } from "../styles/useStyles";

const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  de: "Deutsch",
  en: "English",
};

export function SettingsScreen() {
  const styles = useStyles();
  const { themeSetting, setThemeSetting } = useTheme();
  const { t } = useTranslation();
  const [languageSetting, setLanguageSetting] = useState<LanguageSetting>("system");
  const [isChangelogVisible, setIsChangelogVisible] = useState(false);
  const [downloadsFolderName, setDownloadsFolderName] = useState<string | null>(null);
  const [isPickingFolder, setIsPickingFolder] = useState(false);

  useEffect(() => {
    loadLanguageSetting().then(setLanguageSetting);
  }, []);

  useEffect(() => {
    downloader.getDownloadsFolderName?.().then(setDownloadsFolderName);
  }, []);

  async function handlePickDownloadsFolder() {
    // Defensive only: the triggering button is never rendered without pickDownloadsFolder — see
    // the `downloader.pickDownloadsFolder && (...)` guard around it below.
    /* istanbul ignore next */
    if (!downloader.pickDownloadsFolder) return;
    setIsPickingFolder(true);
    try {
      const name = await downloader.pickDownloadsFolder();
      // A null result means the user cancelled the picker — keep showing whatever was picked before.
      if (name !== null) setDownloadsFolderName(name);
    } finally {
      setIsPickingFolder(false);
    }
  }

  async function handleResetDownloadsFolder() {
    /* istanbul ignore next */
    if (!downloader.resetDownloadsFolder) return;
    await downloader.resetDownloadsFolder();
    setDownloadsFolderName(null);
  }

  async function handleLanguageChange(next: LanguageSetting) {
    setLanguageSetting(next);
    await saveLanguageSetting(next);
    i18n.changeLanguage(resolveLanguage(next));
  }

  const languageOptions: { value: LanguageSetting; label: string }[] = useMemo(
    () => [
      { value: "system", label: t("settings.languageSystem") },
      { value: "de", label: LANGUAGE_NAMES.de },
      { value: "en", label: LANGUAGE_NAMES.en },
    ],
    [t]
  );

  const themeOptions: { value: ThemeSetting; label: string }[] = useMemo(
    () => [
      { value: "system", label: t("settings.themeSystem") },
      { value: "light", label: t("settings.themeLight") },
      { value: "dark", label: t("settings.themeDark") },
    ],
    [t]
  );

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.title}>{t("settings.title")}</Text>

        <Text style={styles.label}>{t("settings.language")}</Text>
        <Dropdown options={languageOptions} value={languageSetting} onChange={handleLanguageChange} />

        <Text style={[styles.label, styles.fieldSpacing]}>{t("settings.theme")}</Text>
        <Dropdown options={themeOptions} value={themeSetting} onChange={setThemeSetting} />

        {downloader.pickDownloadsFolder && (
          <>
            <Text style={[styles.label, styles.fieldSpacing]}>{t("settings.downloadsFolder")}</Text>
            <Text style={styles.searchMessage}>{downloadsFolderName ?? t("settings.downloadsFolderDefault")}</Text>
            <Pressable style={styles.linkButton} onPress={handlePickDownloadsFolder} disabled={isPickingFolder}>
              <Text style={styles.linkText}>
                {isPickingFolder ? t("settings.choosingFolder") : t("settings.chooseFolderButton")}
              </Text>
            </Pressable>
            {downloadsFolderName && (
              <Pressable style={[styles.linkButton, styles.flushTop]} onPress={handleResetDownloadsFolder}>
                <Text style={styles.linkText}>{t("settings.resetFolderButton")}</Text>
              </Pressable>
            )}
          </>
        )}

        <Pressable style={styles.linkButton} onPress={() => setIsChangelogVisible(true)}>
          <Text style={styles.linkText}>{t("settings.showChangelog")}</Text>
        </Pressable>

        <Text style={styles.legalNotice}>{t("settings.legalNotice")}</Text>
      </View>
      <ChangelogModal visible={isChangelogVisible} onClose={() => setIsChangelogVisible(false)} />
    </SafeAreaView>
  );
}
