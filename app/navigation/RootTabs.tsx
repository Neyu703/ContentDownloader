import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useTranslation } from "react-i18next";
import { HomeScreen } from "../screens/HomeScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { navigationStyles } from "../styles/navigation";
import type { RootTabParamList } from "./types";

const Tab = createBottomTabNavigator<RootTabParamList>();

/** The app's two-tab bottom navigator: the existing download screen, and the new Settings screen. */
export function RootTabs() {
  const { t } = useTranslation();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: navigationStyles.tabBar,
        tabBarActiveTintColor: navigationStyles.tabBarActiveColor.color,
        tabBarInactiveTintColor: navigationStyles.tabBarInactiveColor.color,
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: t("navigation.home") }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: t("navigation.settings") }} />
    </Tab.Navigator>
  );
}
