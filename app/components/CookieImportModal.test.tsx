import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { CookieImportModal } from "./CookieImportModal";
import i18n, { initI18n } from "../i18n";

initI18n("de");

// CookieImportModal renders through useStyles() -> useTheme() -> ThemeContext, which imports
// AsyncStorage (for the persisted theme setting) even when no ThemeProvider is mounted.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("expo-clipboard", () => ({ getStringAsync: jest.fn() }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));

const VALID_COOKIES = "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tNAME\tvalue";

const mockDownloader = {
  getCookiesStatus: jest.fn(),
  importCookies: jest.fn(),
  clearCookies: jest.fn(),
};
jest.mock("../downloader", () => ({
  get downloader() {
    return mockDownloader;
  },
}));

/**
 * Renders the modal and waits for its initial getCookiesStatus() effect to settle before
 * returning — otherwise that pending promise resolves during a later test and updates state on
 * an already-unmounted component, corrupting React's act() tracking for every test after it.
 */
async function renderModal(onClose = jest.fn()) {
  const utils = await render(<CookieImportModal visible onClose={onClose} />);
  await waitFor(() => expect(mockDownloader.getCookiesStatus).toHaveBeenCalled());
  await screen.findByText(/Keine Cookies hinterlegt|Cookies importiert am/);
  return utils;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDownloader.getCookiesStatus.mockResolvedValue({ present: false, updatedAt: null });
  mockDownloader.importCookies.mockResolvedValue(undefined);
  mockDownloader.clearCookies.mockResolvedValue(undefined);
});

afterEach(() => {
  i18n.changeLanguage("de");
});

describe("CookieImportModal", () => {
  it("renders nothing when not visible", async () => {
    const { toJSON } = await render(<CookieImportModal visible={false} onClose={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });

  it("shows the title, the numbered steps, and the absent-cookies status", async () => {
    await renderModal();
    expect(screen.getByText("YouTube-Cookies importieren")).toBeTruthy();
    expect(screen.getByText(/^1\./)).toBeTruthy();
    expect(screen.getByText("Keine Cookies hinterlegt")).toBeTruthy();
  });

  it("shows the present status with the formatted date once cookies are stored", async () => {
    mockDownloader.getCookiesStatus.mockResolvedValue({ present: true, updatedAt: "2026-09-07T12:00:00.000Z" });
    await renderModal();
    expect(screen.getByText(/Cookies importiert am/)).toBeTruthy();
  });

  it("shows the present status without a date when the platform reports none (native)", async () => {
    mockDownloader.getCookiesStatus.mockResolvedValue({ present: true, updatedAt: null });
    await renderModal();
    expect(screen.getByText("Cookies importiert am")).toBeTruthy();
  });

  it("opens the Chrome Web Store link", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await renderModal();
    await fireEvent.press(screen.getByText("Chrome Web Store"));
    expect(openURL).toHaveBeenCalledWith(expect.stringContaining("chromewebstore.google.com"));
    openURL.mockRestore();
  });

  it("opens the Firefox Add-ons link", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await renderModal();
    await fireEvent.press(screen.getByText("Firefox Add-ons"));
    expect(openURL).toHaveBeenCalledWith(expect.stringContaining("addons.mozilla.org"));
    openURL.mockRestore();
  });

  it("pastes clipboard content into the text field", async () => {
    (Clipboard.getStringAsync as jest.Mock).mockResolvedValue(VALID_COOKIES);
    await renderModal();
    await fireEvent.press(screen.getByLabelText("Cookie-Inhalt hier einfügen"));
    await waitFor(() => expect(screen.getByDisplayValue(VALID_COOKIES)).toBeTruthy());
  });

  it("does not paste when the clipboard is empty", async () => {
    (Clipboard.getStringAsync as jest.Mock).mockResolvedValue("");
    await renderModal();
    await fireEvent.press(screen.getByLabelText("Cookie-Inhalt hier einfügen"));
    expect(screen.getByPlaceholderText("Cookie-Inhalt hier einfügen").props.value).toBe("");
  });

  it("shows a validation error and skips saving when the content is empty", async () => {
    await renderModal();
    await fireEvent.press(screen.getByText("Speichern"));
    expect(screen.getByText("Bitte Cookie-Inhalt einfügen.")).toBeTruthy();
    expect(mockDownloader.importCookies).not.toHaveBeenCalled();
  });

  it("shows a validation error and skips saving when the content isn't a real cookies.txt", async () => {
    await renderModal();
    await fireEvent.changeText(screen.getByPlaceholderText("Cookie-Inhalt hier einfügen"), "not a cookies file");

    await fireEvent.press(screen.getByText("Speichern"));

    expect(screen.getByText("Das sieht nicht wie eine gültige cookies.txt aus.")).toBeTruthy();
    expect(mockDownloader.importCookies).not.toHaveBeenCalled();
  });

  it("saves trimmed content and refreshes the status", async () => {
    await renderModal();
    mockDownloader.getCookiesStatus.mockResolvedValueOnce({ present: true, updatedAt: "2026-09-07T12:00:00.000Z" });
    await fireEvent.changeText(screen.getByPlaceholderText("Cookie-Inhalt hier einfügen"), `  ${VALID_COOKIES}  `);

    await fireEvent.press(screen.getByText("Speichern"));

    await waitFor(() => expect(mockDownloader.importCookies).toHaveBeenCalledWith(VALID_COOKIES));
    await waitFor(() => expect(screen.getByText(/Cookies importiert am/)).toBeTruthy());
    expect(screen.getByText("Cookies erfolgreich gespeichert.")).toBeTruthy();
  });

  it("shows an error message when saving fails", async () => {
    await renderModal();
    mockDownloader.importCookies.mockRejectedValueOnce(new Error("boom"));
    await fireEvent.changeText(screen.getByPlaceholderText("Cookie-Inhalt hier einfügen"), VALID_COOKIES);

    await fireEvent.press(screen.getByText("Speichern"));

    await waitFor(() => expect(screen.getByText("Cookies konnten nicht gespeichert werden.")).toBeTruthy());
  });

  it("shows the remove button only once cookies are present, and clears them on press", async () => {
    mockDownloader.getCookiesStatus.mockResolvedValue({ present: true, updatedAt: "2026-09-07T12:00:00.000Z" });
    await renderModal();
    expect(screen.getByText("Entfernen")).toBeTruthy();
    mockDownloader.getCookiesStatus.mockResolvedValueOnce({ present: false, updatedAt: null });

    await fireEvent.press(screen.getByText("Entfernen"));

    expect(mockDownloader.clearCookies).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("Keine Cookies hinterlegt")).toBeTruthy());
  });

  it("hides the remove button while no cookies are stored", async () => {
    await renderModal();
    expect(screen.queryByText("Entfernen")).toBeNull();
  });

  it("calls onClose when the close link is pressed", async () => {
    const onClose = jest.fn();
    await renderModal(onClose);
    await fireEvent.press(screen.getByText("Schließen"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when the modal card itself is pressed (only the overlay closes it)", async () => {
    const onClose = jest.fn();
    await renderModal(onClose);
    await fireEvent.press(screen.getByText("YouTube-Cookies importieren"));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("CookieImportModal — file picker", () => {
  it("reads a picked file and fills the text field when it looks valid", async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///cookies.txt" }],
    });
    globalThis.fetch = jest.fn().mockResolvedValue({ text: () => Promise.resolve(VALID_COOKIES) }) as typeof fetch;
    await renderModal();

    await fireEvent.press(screen.getByText("Datei auswählen"));

    await waitFor(() => expect(screen.getByDisplayValue(VALID_COOKIES)).toBeTruthy());
    expect(screen.queryByText("Das sieht nicht wie eine gültige cookies.txt aus.")).toBeNull();
  });

  it("flags a picked file immediately when it doesn't look like a cookies.txt", async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///whatever.txt" }],
    });
    globalThis.fetch = jest.fn().mockResolvedValue({ text: () => Promise.resolve("not a cookie file") }) as typeof fetch;
    await renderModal();

    await fireEvent.press(screen.getByText("Datei auswählen"));

    await waitFor(() => expect(screen.getByText("Das sieht nicht wie eine gültige cookies.txt aus.")).toBeTruthy());
  });

  it("does nothing when the picker is cancelled", async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
    await renderModal();

    await fireEvent.press(screen.getByText("Datei auswählen"));

    expect(screen.getByPlaceholderText("Cookie-Inhalt hier einfügen").props.value).toBe("");
  });

  it("shows an error when the picked file can't be read", async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///cookies.txt" }],
    });
    globalThis.fetch = jest.fn().mockRejectedValue(new Error("nope")) as typeof fetch;
    await renderModal();

    await fireEvent.press(screen.getByText("Datei auswählen"));

    await waitFor(() => expect(screen.getByText("Datei konnte nicht gelesen werden.")).toBeTruthy());
  });
});

// Real drag-and-drop is wired directly onto the drop zone's DOM node via ref (see
// CookieImportModal's effect) since react-native-web doesn't forward onDrop/onDragOver as props —
// react-test-renderer never creates a real DOM node for that ref to attach to, so this can only be
// verified by hand in a real browser, not exercised here. The shared file-reading/validation logic
// it calls (readAndApplyFile) is fully covered by the file-picker tests above.
it("renders the drop zone for the (browser-only) drag-and-drop target", async () => {
  await renderModal();
  expect(screen.getByTestId("cookie-drop-zone")).toBeTruthy();
});
