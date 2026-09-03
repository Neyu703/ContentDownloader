import { useEffect, useMemo, useState } from "react";
import { SafeAreaView, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Dropdown } from "../components/Dropdown";
import { ChangelogModal } from "../components/ChangelogModal";
import i18n, { type SupportedLanguage } from "../i18n";
import { loadLanguageSetting, resolveLanguage, saveLanguageSetting, type LanguageSetting } from "../i18n/languagePreference";
import { styles } from "../styles";

const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  de: "Deutsch",
  en: "English",
};

export function SettingsScreen() {
  const { t } = useTranslation();
  const [languageSetting, setLanguageSetting] = useState<LanguageSetting>("system");
  const [isChangelogVisible, setIsChangelogVisible] = useState(false);

  useEffect(() => {
    loadLanguageSetting().then(setLanguageSetting);
  }, []);

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

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.title}>{t("settings.title")}</Text>

        <Text style={styles.label}>{t("settings.language")}</Text>
        <Dropdown options={languageOptions} value={languageSetting} onChange={handleLanguageChange} />

        <Pressable style={styles.linkButton} onPress={() => setIsChangelogVisible(true)}>
          <Text style={styles.linkText}>{t("settings.showChangelog")}</Text>
        </Pressable>
      </View>
      <ChangelogModal visible={isChangelogVisible} onClose={() => setIsChangelogVisible(false)} />
    </SafeAreaView>
  );
}
