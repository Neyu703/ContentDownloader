import { createBottomTabNavigator, type BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { PlatformPressable } from "@react-navigation/elements";
import { useTranslation } from "react-i18next";
import { Text } from "react-native";
import { HistoryScreen } from "../screens/HistoryScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { makeNavigationStyles } from "../styles/navigation";
import { useTheme } from "../theme/ThemeContext";
import { useBackground } from "../backgrounds/BackgroundContext";
import type { RootTabParamList } from "./types";

const Tab = createBottomTabNavigator<RootTabParamList>();

// react-navigation's stock tab item fits a 28px icon box plus a 10px-tall label slot into its 49px
// bar — on web the label's "normal" line height (~14px) overflows that slot and gets clipped at
// phone width. Shrinking the icon box to 24 (emoji scaled to match) gives the label room to fit.
const TAB_ICON_BOX_HEIGHT = 24;
const TAB_ICON_FONT_SIZE = 20;

/** Renders a tab-bar icon as emoji text, colored like react-navigation's built-in icons. */
function TabBarIcon({ symbol, color }: { symbol: string; color: string }) {
  return <Text style={{ color, fontSize: TAB_ICON_FONT_SIZE, lineHeight: TAB_ICON_BOX_HEIGHT }}>{symbol}</Text>;
}

/** The app's bottom navigator: the download screen, the download history, and Settings. */
export function RootTabs() {
  const { t: translate } = useTranslation();
  const { colors } = useTheme();
  const { isActive: isBackgroundActive } = useBackground();
  const navigationStyles = makeNavigationStyles(colors, isBackgroundActive);

  // React Navigation's default (non-Material) tab bar button renders with pressOpacity=1 and no
  // hoverEffect (see @react-navigation/bottom-tabs's BottomTabItem), so it has zero visual feedback
  // on press or hover — this restores both without switching the whole tab bar to the Material variant.
  function renderTabBarButton(props: BottomTabBarButtonProps) {
    return <PlatformPressable {...props} pressOpacity={0.6} hoverEffect={{ color: colors.accent }} />;
  }

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        // Without an animation, react-navigation leaves the inactive tab's screen fully painted
        // behind the active one (just z-index'd below) instead of hiding it — with the scene
        // background made transparent above for BackgroundLayer, that left the previous screen's
        // content visibly bleeding through wherever the new screen's content didn't fully cover it.
        animation: "fade",
        tabBarStyle: navigationStyles.tabBar,
        tabBarActiveTintColor: colors.accentText,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarButton: renderTabBarButton,
        tabBarIconStyle: { height: TAB_ICON_BOX_HEIGHT },
        sceneStyle: navigationStyles.sceneContainer,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: translate("navigation.home"),
          tabBarIcon: ({ color }) => <TabBarIcon symbol="🏠" color={color} />,
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          title: translate("navigation.history"),
          tabBarIcon: ({ color }) => <TabBarIcon symbol="🕓" color={color} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: translate("navigation.settings"),
          tabBarIcon: ({ color }) => <TabBarIcon symbol="⚙️" color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}
