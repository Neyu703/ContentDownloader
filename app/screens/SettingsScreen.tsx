import { useEffect, useMemo, useState } from "react";
import { SafeAreaView, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { downloader } from "../downloader";
import { Dropdown } from "../components/Dropdown";
import { ChangelogModal } from "../components/ChangelogModal";
import { CookieImportModal } from "../components/CookieImportModal";
import { BackgroundSettingsModal } from "../components/BackgroundSettingsModal";
import { backgroundRegistry } from "../backgrounds/registry";
import i18n, { type SupportedLanguage } from "../i18n";
import { loadLanguageSetting, resolveLanguage, saveLanguageSetting, type LanguageSetting } from "../i18n/languagePreference";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeSetting } from "../theme/themePreference";
import { useStyles } from "../styles/useStyles";
import { withActiveTint } from "../styles/interactive";

const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  de: "Deutsch",
  en: "English",
};

function SettingsActionButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const styles = useStyles();
  return (
    <Pressable
      style={withActiveTint(styles.settingsAction, styles.settingsActionPressed)}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
    >
      <Text style={styles.settingsActionText}>{label}</Text>
      <Text style={styles.settingsActionChevron}>›</Text>
    </Pressable>
  );
}

export function SettingsScreen() {
  const styles = useStyles();
  const { themeSetting, setThemeSetting } = useTheme();
  const { t: translate } = useTranslation();
  const [languageSetting, setLanguageSetting] = useState<LanguageSetting>("system");
  const [isChangelogVisible, setIsChangelogVisible] = useState(false);
  const [isCookieImportVisible, setIsCookieImportVisible] = useState(false);
  const [isBackgroundSettingsVisible, setIsBackgroundSettingsVisible] = useState(false);
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
      { value: "system", label: translate("settings.languageSystem") },
      { value: "de", label: LANGUAGE_NAMES.de },
      { value: "en", label: LANGUAGE_NAMES.en },
    ],
    [translate]
  );

  const themeOptions: { value: ThemeSetting; label: string }[] = useMemo(
    () => [
      { value: "system", label: translate("settings.themeSystem") },
      { value: "light", label: translate("settings.themeLight") },
      { value: "dark", label: translate("settings.themeDark") },
    ],
    [translate]
  );

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.title}>{translate("settings.title")}</Text>

        <Text style={styles.label}>{translate("settings.language")}</Text>
        <Dropdown options={languageOptions} value={languageSetting} onChange={handleLanguageChange} />

        <Text style={[styles.label, styles.fieldSpacing]}>{translate("settings.theme")}</Text>
        <Dropdown options={themeOptions} value={themeSetting} onChange={setThemeSetting} />

        {downloader.pickDownloadsFolder && (
          <>
            <Text style={[styles.label, styles.fieldSpacing]}>{translate("settings.downloadsFolder")}</Text>
            <Text style={styles.searchMessage}>{downloadsFolderName ?? translate("settings.downloadsFolderDefault")}</Text>
            <View style={styles.settingsActions}>
              <SettingsActionButton
                label={isPickingFolder ? translate("settings.choosingFolder") : translate("settings.chooseFolderButton")}
                onPress={handlePickDownloadsFolder}
                disabled={isPickingFolder}
              />
              {downloadsFolderName && (
                <SettingsActionButton label={translate("settings.resetFolderButton")} onPress={handleResetDownloadsFolder} />
              )}
            </View>
          </>
        )}

        <View style={[styles.settingsActions, styles.fieldSpacing]}>
          <SettingsActionButton label={translate("settings.showChangelog")} onPress={() => setIsChangelogVisible(true)} />
          <SettingsActionButton
            label={translate("settings.cookieImportButton")}
            onPress={() => setIsCookieImportVisible(true)}
          />
          {backgroundRegistry.length > 0 && (
            <SettingsActionButton
              label={translate("settings.backgroundButton")}
              onPress={() => setIsBackgroundSettingsVisible(true)}
            />
          )}
        </View>

        <Text style={styles.legalNotice}>{translate("settings.legalNotice")}</Text>
      </View>
      <ChangelogModal visible={isChangelogVisible} onClose={() => setIsChangelogVisible(false)} />
      <CookieImportModal visible={isCookieImportVisible} onClose={() => setIsCookieImportVisible(false)} />
      <BackgroundSettingsModal
        visible={isBackgroundSettingsVisible}
        onClose={() => setIsBackgroundSettingsVisible(false)}
      />
    </SafeAreaView>
  );
}
