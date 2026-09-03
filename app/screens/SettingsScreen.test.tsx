import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SettingsScreen } from "./SettingsScreen";
import i18n, { initI18n } from "../i18n";

initI18n("de");

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

beforeEach(async () => {
  await AsyncStorage.clear();
});

afterEach(async () => {
  await i18n.changeLanguage("de");
});

describe("SettingsScreen", () => {
  it("renders the title and the language dropdown defaulted to 'System language'", async () => {
    await render(<SettingsScreen />);
    expect(screen.getByText("Einstellungen")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Systemsprache")).toBeTruthy());
  });

  it("loads a previously saved language setting on mount", async () => {
    await AsyncStorage.setItem("contentdownloader.languageSetting", "en");
    await render(<SettingsScreen />);
    await waitFor(() => expect(screen.getByText("English")).toBeTruthy());
  });

  it("saves the choice and switches i18next's active language when the user picks German", async () => {
    await render(<SettingsScreen />);
    await waitFor(() => expect(screen.getByText("Systemsprache")).toBeTruthy());
    await fireEvent.press(screen.getByText("Systemsprache"));
    await fireEvent.press(await screen.findByText("Deutsch"));

    await waitFor(async () => expect(await AsyncStorage.getItem("contentdownloader.languageSetting")).toBe("de"));
    expect(i18n.language).toBe("de");
  });

  it("resolves the system language when the user picks English then back to 'system'", async () => {
    await render(<SettingsScreen />);
    await waitFor(() => expect(screen.getByText("Systemsprache")).toBeTruthy());
    await fireEvent.press(screen.getByText("Systemsprache"));
    await fireEvent.press(await screen.findByText("English"));
    expect(i18n.language).toBe("en");
  });

  it("opens and closes the changelog modal", async () => {
    await render(<SettingsScreen />);
    expect(screen.queryByText("Änderungsprotokoll")).toBeNull();
    await fireEvent.press(screen.getByText("Änderungsprotokoll anzeigen"));
    expect(screen.getByText("Änderungsprotokoll")).toBeTruthy();
    await fireEvent.press(screen.getByText("Schließen"));
    expect(screen.queryByText("Änderungsprotokoll")).toBeNull();
  });
});
