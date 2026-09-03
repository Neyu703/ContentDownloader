import { NavigationContainer } from "@react-navigation/native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { RootTabs } from "./RootTabs";
import { initI18n } from "../i18n";

initI18n("de");

// The Settings tab (SettingsScreen -> languagePreference.ts) touches AsyncStorage on mount.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// RootTabs mounts HomeScreen as its initial tab; stub the downloader the same way HomeScreen's own
// tests do so no real (native/web) downloader module runs during a navigation-focused test.
jest.mock("../downloader", () => ({
  downloader: {
    subscribe: jest.fn((listener: (jobs: unknown[], setup: { phase: string; message: string }) => void) => {
      listener([], { phase: "ready", message: "" });
      return jest.fn();
    }),
    enqueue: jest.fn(),
    cancel: jest.fn(),
    clearFinished: jest.fn(),
    getPlaylistInfo: jest.fn(),
  },
}));

describe("RootTabs", () => {
  it("shows the Home tab's content initially", async () => {
    await render(
      <NavigationContainer>
        <RootTabs />
      </NavigationContainer>
    );
    expect(screen.getByText("YouTube Downloader")).toBeTruthy();
  });

  it("labels the two tabs via i18n", async () => {
    await render(
      <NavigationContainer>
        <RootTabs />
      </NavigationContainer>
    );
    expect(screen.getByText("Start")).toBeTruthy();
    expect(screen.getByText("Einstellungen")).toBeTruthy();
  });

  it("switches to the Settings tab's content when pressed", async () => {
    await render(
      <NavigationContainer>
        <RootTabs />
      </NavigationContainer>
    );
    await fireEvent.press(screen.getByText("Einstellungen"));
    expect(await screen.findByText("Sprache")).toBeTruthy();
  });
});
