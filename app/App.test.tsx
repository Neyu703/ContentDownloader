import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import Constants from "expo-constants";
import App from "./App";
import { loadLanguageSetting } from "./i18n/languagePreference";
import { checkForVersionUpdate } from "./changelog/lastSeenVersion";

// ThemeProvider (rendered inside App) imports AsyncStorage for the persisted theme setting.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// The real react-native-safe-area-context needs native-measured insets that never arrive in Jest,
// so SafeAreaProvider otherwise renders no children at all. Keep every other real export (the
// context objects react-navigation's bottom-tabs consumes directly) and only swap in immediate,
// fixed metrics — mirroring the package's own jest/mock.tsx approach.
jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context");
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  return {
    ...actual,
    SafeAreaProvider: ({ children }: { children: ReactNode }) => (
      <actual.SafeAreaFrameContext.Provider value={frame}>
        <actual.SafeAreaInsetsContext.Provider value={insets}>{children}</actual.SafeAreaInsetsContext.Provider>
      </actual.SafeAreaFrameContext.Provider>
    ),
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
  };
});

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: {}, version: "1.5.0" } },
}));

jest.mock("./i18n/languagePreference", () => ({
  loadLanguageSetting: jest.fn(),
  resolveLanguage: jest.fn().mockReturnValue("de"),
  saveLanguageSetting: jest.fn(),
}));

jest.mock("./changelog/lastSeenVersion", () => ({
  checkForVersionUpdate: jest.fn(),
}));

// App -> BackgroundLayer would otherwise pull in the platform-resolved registry (empty under
// Jest's default native resolution anyway, but mocked explicitly here to keep this test's
// dependency surface obvious and independent of that resolution detail).
jest.mock("./backgrounds/registry", () => ({ backgroundRegistry: [] }));

// App -> RootTabs -> HomeScreen would otherwise pull in the real (native/web) downloader module.
jest.mock("./downloader", () => ({
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

beforeEach(() => {
  jest.mocked(loadLanguageSetting).mockResolvedValue("system");
  jest.mocked(checkForVersionUpdate).mockResolvedValue(false);
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("App", () => {
  it("renders nothing until i18n initialization resolves", async () => {
    // Never resolves within this test, so isI18nReady stays false throughout.
    jest.mocked(loadLanguageSetting).mockReturnValue(new Promise(() => {}));
    const { toJSON } = await render(<App />);
    expect(toJSON()).toBeNull();
  });

  it("renders the Home tab once i18n initialization resolves", async () => {
    await render(<App />);
    await waitFor(() => expect(screen.getByText("ContentDownloader")).toBeTruthy());
    expect(screen.queryByText("Änderungsprotokoll")).toBeNull();
  });

  it("checks for a version update using the app's configured version", async () => {
    await render(<App />);
    await waitFor(() => expect(checkForVersionUpdate).toHaveBeenCalledWith("1.5.0"));
  });

  it("falls back to an empty string when expoConfig.version is unset", async () => {
    (Constants.expoConfig as { version?: string }).version = undefined;
    await render(<App />);
    await waitFor(() => expect(checkForVersionUpdate).toHaveBeenCalledWith(""));
    (Constants.expoConfig as { version?: string }).version = "1.5.0";
  });

  it("auto-shows the changelog modal when checkForVersionUpdate resolves true, and it can be closed", async () => {
    jest.mocked(checkForVersionUpdate).mockResolvedValue(true);
    await render(<App />);
    await waitFor(() => expect(screen.getByText("Änderungsprotokoll")).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByText("Schließen"));
    });
    expect(screen.queryByText("Änderungsprotokoll")).toBeNull();
  });
});
