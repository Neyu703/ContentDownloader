import { useEffect, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Constants from "expo-constants";
import i18n, { initI18n } from "./i18n";
import { loadLanguageSetting, resolveLanguage } from "./i18n/languagePreference";
import { checkForVersionUpdate } from "./changelog/lastSeenVersion";
import { ChangelogModal } from "./components/ChangelogModal";
import { RootTabs } from "./navigation/RootTabs";
import { ThemeProvider } from "./theme/ThemeContext";

export default function App() {
  const [isI18nReady, setIsI18nReady] = useState(false);
  const [changelogVisible, setChangelogVisible] = useState(false);

  useEffect(() => {
    // Both AsyncStorage reads are independent of each other, so run them together instead of
    // gating the changelog check behind i18n's own state update/re-render.
    Promise.all([loadLanguageSetting(), checkForVersionUpdate(Constants.expoConfig?.version ?? "")]).then(
      ([setting, shouldShowChangelog]) => {
        initI18n(resolveLanguage(setting));
        setIsI18nReady(true);
        if (shouldShowChangelog) setChangelogVisible(true);
      }
    );
  }, []);

  if (!isI18nReady) return null;

  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider>
        <SafeAreaProvider>
          <NavigationContainer>
            <RootTabs />
          </NavigationContainer>
          <ChangelogModal visible={changelogVisible} onClose={() => setChangelogVisible(false)} />
        </SafeAreaProvider>
      </ThemeProvider>
    </I18nextProvider>
  );
}
