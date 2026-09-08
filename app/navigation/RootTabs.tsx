import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useTranslation } from "react-i18next";
import { Text } from "react-native";
import { HomeScreen } from "../screens/HomeScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { makeNavigationStyles } from "../styles/navigation";
import { useTheme } from "../theme/ThemeContext";
import { useBackground } from "../backgrounds/BackgroundContext";
import type { RootTabParamList } from "./types";

const Tab = createBottomTabNavigator<RootTabParamList>();

/** Renders a tab-bar icon as emoji text sized/colored like react-navigation's built-in icons. */
function TabBarIcon({ symbol, color, size }: { symbol: string; color: string; size: number }) {
  return <Text style={{ color, fontSize: size }}>{symbol}</Text>;
}

/** The app's two-tab bottom navigator: the existing download screen, and the new Settings screen. */
export function RootTabs() {
  const { t: translate } = useTranslation();
  const { colors } = useTheme();
  const { isActive: isBackgroundActive } = useBackground();
  const navigationStyles = makeNavigationStyles(colors, isBackgroundActive);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: navigationStyles.tabBar,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        sceneStyle: navigationStyles.sceneContainer,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: translate("navigation.home"),
          tabBarIcon: ({ color, size }) => <TabBarIcon symbol="🏠" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: translate("navigation.settings"),
          tabBarIcon: ({ color, size }) => <TabBarIcon symbol="⚙️" color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
}
