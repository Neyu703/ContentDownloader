import * as ReactNative from "react-native";
import { Text } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ThemeProvider, useTheme } from "../../theme/ThemeContext";
import { darkColors, lightColors } from "../../theme/colors";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

/** Renders the theme's current setting/background color as text, and exposes buttons to change it. */
function ThemeProbe() {
  const { colors, themeSetting, setThemeSetting } = useTheme();
  return (
    <>
      <Text testID="setting">{themeSetting}</Text>
      <Text testID="background">{colors.background}</Text>
      <Text testID="set-light" onPress={() => setThemeSetting("light")}>
        set-light
      </Text>
    </>
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("ThemeProvider", () => {
  it("defaults to 'system' and falls back to the dark palette when the system scheme is unspecified", async () => {
    jest.spyOn(ReactNative, "useColorScheme").mockReturnValue("unspecified");
    await render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );
    await waitFor(() => expect(screen.getByTestId("setting")).toHaveTextContent("system"));
    expect(screen.getByTestId("background")).toHaveTextContent(darkColors.background);
  });

  it("uses the light palette when the system scheme is 'light' and the setting is 'system'", async () => {
    jest.spyOn(ReactNative, "useColorScheme").mockReturnValue("light");
    await render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );
    await waitFor(() => expect(screen.getByTestId("background")).toHaveTextContent(lightColors.background));
  });

  it("loads a previously saved explicit setting, overriding the system scheme", async () => {
    jest.spyOn(ReactNative, "useColorScheme").mockReturnValue("light");
    await AsyncStorage.setItem("contentdownloader.themeSetting", "dark");
    await render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );
    await waitFor(() => expect(screen.getByTestId("setting")).toHaveTextContent("dark"));
    expect(screen.getByTestId("background")).toHaveTextContent(darkColors.background);
  });

  it("persists a theme change and updates the resolved colors immediately", async () => {
    jest.spyOn(ReactNative, "useColorScheme").mockReturnValue("dark");
    await render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );
    await waitFor(() => expect(screen.getByTestId("setting")).toHaveTextContent("system"));

    await fireEvent.press(screen.getByTestId("set-light"));

    expect(screen.getByTestId("background")).toHaveTextContent(lightColors.background);
    await waitFor(async () => expect(await AsyncStorage.getItem("contentdownloader.themeSetting")).toBe("light"));
  });
});

describe("useTheme outside a ThemeProvider", () => {
  it("returns the default dark palette with a no-op setter, instead of throwing", async () => {
    await render(<ThemeProbe />);
    expect(screen.getByTestId("setting")).toHaveTextContent("system");
    expect(screen.getByTestId("background")).toHaveTextContent(darkColors.background);

    // The default context's setter is a genuine no-op — pressing it must not throw or change anything.
    await fireEvent.press(screen.getByTestId("set-light"));
    expect(screen.getByTestId("setting")).toHaveTextContent("system");
    expect(screen.getByTestId("background")).toHaveTextContent(darkColors.background);
  });
});
