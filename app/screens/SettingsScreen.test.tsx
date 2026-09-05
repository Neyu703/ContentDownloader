import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SettingsScreen } from "./SettingsScreen";
import i18n, { initI18n } from "../i18n";
import { ThemeProvider } from "../theme/ThemeContext";

initI18n("de");

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// Downloads-folder methods are native-only (see the `downloader.pickDownloadsFolder && (...)`
// guard in SettingsScreen) — default to none present, so most tests render without that section,
// matching the web build. Individual tests below opt in by reassigning mockDownloader.
let mockDownloader: {
  getDownloadsFolderName?: jest.Mock;
  pickDownloadsFolder?: jest.Mock;
  resetDownloadsFolder?: jest.Mock;
};
jest.mock("../downloader", () => ({
  get downloader() {
    return mockDownloader;
  },
}));

function makeDownloaderWithFolderPicker(overrides: Record<string, jest.Mock> = {}) {
  return {
    getDownloadsFolderName: jest.fn().mockResolvedValue(null),
    pickDownloadsFolder: jest.fn().mockResolvedValue(null),
    resetDownloadsFolder: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Renders SettingsScreen under a real ThemeProvider, so theme selection actually persists (not the no-op default context). */
function renderSettings() {
  return render(
    <ThemeProvider>
      <SettingsScreen />
    </ThemeProvider>
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockDownloader = {};
});

afterEach(async () => {
  await i18n.changeLanguage("de");
});

describe("SettingsScreen", () => {
  it("renders the title and the language dropdown defaulted to 'System language'", async () => {
    await renderSettings();
    expect(screen.getByText("Einstellungen")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Systemsprache")).toBeTruthy());
  });

  it("loads a previously saved language setting on mount", async () => {
    await AsyncStorage.setItem("contentdownloader.languageSetting", "en");
    await renderSettings();
    await waitFor(() => expect(screen.getByText("English")).toBeTruthy());
  });

  it("saves the choice and switches i18next's active language when the user picks German", async () => {
    await renderSettings();
    await waitFor(() => expect(screen.getByText("Systemsprache")).toBeTruthy());
    await fireEvent.press(screen.getByText("Systemsprache"));
    await fireEvent.press(await screen.findByText("Deutsch"));

    await waitFor(async () => expect(await AsyncStorage.getItem("contentdownloader.languageSetting")).toBe("de"));
    expect(i18n.language).toBe("de");
  });

  it("resolves the system language when the user picks English then back to 'system'", async () => {
    await renderSettings();
    await waitFor(() => expect(screen.getByText("Systemsprache")).toBeTruthy());
    await fireEvent.press(screen.getByText("Systemsprache"));
    await fireEvent.press(await screen.findByText("English"));
    expect(i18n.language).toBe("en");
  });

  it("renders the theme dropdown defaulted to the system setting", async () => {
    await renderSettings();
    await waitFor(() => expect(screen.getByText("Systemeinstellung")).toBeTruthy());
  });

  it("loads a previously saved theme setting on mount", async () => {
    await AsyncStorage.setItem("contentdownloader.themeSetting", "light");
    await renderSettings();
    await waitFor(() => expect(screen.getByText("Hell")).toBeTruthy());
  });

  it("persists the choice when the user picks a theme", async () => {
    await renderSettings();
    await waitFor(() => expect(screen.getByText("Systemeinstellung")).toBeTruthy());
    await fireEvent.press(screen.getByText("Systemeinstellung"));
    await fireEvent.press(await screen.findByText("Dunkel"));

    await waitFor(async () => expect(await AsyncStorage.getItem("contentdownloader.themeSetting")).toBe("dark"));
    await waitFor(() => expect(screen.getByText("Dunkel")).toBeTruthy());
  });

  it("hides the downloads-folder section when the downloader doesn't support it (web)", async () => {
    await renderSettings();
    expect(screen.queryByText("Downloads-Ordner")).toBeNull();
  });

  it("shows the default folder text on mount when the downloader supports folder picking", async () => {
    mockDownloader = makeDownloaderWithFolderPicker();
    await renderSettings();
    expect(screen.getByText("Downloads-Ordner")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Standard (öffentlicher Downloads-Ordner)")).toBeTruthy());
  });

  it("shows a previously picked folder's name on mount", async () => {
    mockDownloader = makeDownloaderWithFolderPicker({
      getDownloadsFolderName: jest.fn().mockResolvedValue("MyDownloads"),
    });
    await renderSettings();
    await waitFor(() => expect(screen.getByText("MyDownloads")).toBeTruthy());
  });

  it("updates the shown folder name after picking one", async () => {
    mockDownloader = makeDownloaderWithFolderPicker({
      pickDownloadsFolder: jest.fn().mockResolvedValue("NewFolder"),
    });
    await renderSettings();
    await waitFor(() => expect(screen.getByText("Standard (öffentlicher Downloads-Ordner)")).toBeTruthy());

    await fireEvent.press(screen.getByText("Ordner wählen"));

    await waitFor(() => expect(screen.getByText("NewFolder")).toBeTruthy());
    expect(mockDownloader.pickDownloadsFolder).toHaveBeenCalled();
  });

  it("shows a busy label on the button while the picker is open", async () => {
    let resolvePick!: (name: string | null) => void;
    mockDownloader = makeDownloaderWithFolderPicker({
      pickDownloadsFolder: jest.fn(() => new Promise((resolve) => { resolvePick = resolve; })),
    });
    await renderSettings();
    await waitFor(() => expect(screen.getByText("Standard (öffentlicher Downloads-Ordner)")).toBeTruthy());

    fireEvent.press(screen.getByText("Ordner wählen"));

    await waitFor(() => expect(screen.getByText("Ordner wird gewählt…")).toBeTruthy());
    resolvePick("MyDownloads");
    await waitFor(() => expect(screen.getByText("Ordner wählen")).toBeTruthy());
  });

  it("keeps the previous folder name when the user cancels the picker", async () => {
    mockDownloader = makeDownloaderWithFolderPicker({
      getDownloadsFolderName: jest.fn().mockResolvedValue("MyDownloads"),
      pickDownloadsFolder: jest.fn().mockResolvedValue(null),
    });
    await renderSettings();
    await waitFor(() => expect(screen.getByText("MyDownloads")).toBeTruthy());

    await fireEvent.press(screen.getByText("Ordner wählen"));

    expect(screen.getByText("MyDownloads")).toBeTruthy();
  });

  it("only shows the reset button once a custom folder is picked", async () => {
    mockDownloader = makeDownloaderWithFolderPicker();
    await renderSettings();
    await waitFor(() => expect(screen.getByText("Standard (öffentlicher Downloads-Ordner)")).toBeTruthy());
    expect(screen.queryByText("Zurücksetzen")).toBeNull();

    mockDownloader.pickDownloadsFolder!.mockResolvedValueOnce("MyDownloads");
    await fireEvent.press(screen.getByText("Ordner wählen"));
    await waitFor(() => expect(screen.getByText("Zurücksetzen")).toBeTruthy());
  });

  it("resets to the default folder when the user presses reset", async () => {
    mockDownloader = makeDownloaderWithFolderPicker({
      getDownloadsFolderName: jest.fn().mockResolvedValue("MyDownloads"),
    });
    await renderSettings();
    await waitFor(() => expect(screen.getByText("Zurücksetzen")).toBeTruthy());

    await fireEvent.press(screen.getByText("Zurücksetzen"));

    expect(mockDownloader.resetDownloadsFolder).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("Standard (öffentlicher Downloads-Ordner)")).toBeTruthy());
    expect(screen.queryByText("Zurücksetzen")).toBeNull();
  });

  it("shows the legal notice about content rights", async () => {
    await renderSettings();
    expect(
      screen.getByText("Bitte lade nur Inhalte herunter, an denen du die Rechte besitzt oder eine Nutzungserlaubnis hast.")
    ).toBeTruthy();
  });

  it("opens and closes the changelog modal", async () => {
    await renderSettings();
    expect(screen.queryByText("Änderungsprotokoll")).toBeNull();
    await fireEvent.press(screen.getByText("Änderungsprotokoll anzeigen"));
    expect(screen.getByText("Änderungsprotokoll")).toBeTruthy();
    await fireEvent.press(screen.getByText("Schließen"));
    expect(screen.queryByText("Änderungsprotokoll")).toBeNull();
  });
});
