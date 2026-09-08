import { fireEvent, render, screen } from "@testing-library/react-native";
import { ChangelogModal } from "../../components/ChangelogModal";
import { CHANGELOG_ENTRIES } from "../../changelog/entries";
import i18n, { initI18n } from "../../i18n";

initI18n("de");

// ChangelogModal renders through useStyles() -> useTheme() -> ThemeContext, which imports
// AsyncStorage (for the persisted theme setting) even when no ThemeProvider is mounted.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

afterEach(() => {
  i18n.changeLanguage("de");
});

describe("ChangelogModal", () => {
  it("renders nothing when not visible", async () => {
    const { toJSON } = await render(<ChangelogModal visible={false} onClose={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });

  it("shows the title, every entry's version/date, and its German notes when visible", async () => {
    await render(<ChangelogModal visible onClose={jest.fn()} />);
    expect(screen.getByText("Änderungsprotokoll")).toBeTruthy();
    const first = CHANGELOG_ENTRIES[0];
    expect(screen.getByText(`${first.version} — ${first.date}`)).toBeTruthy();
    expect(screen.getByText(`• ${first.notes.de[0]}`)).toBeTruthy();
  });

  it("shows English notes when the current language is English", async () => {
    i18n.changeLanguage("en");
    await render(<ChangelogModal visible onClose={jest.fn()} />);
    const first = CHANGELOG_ENTRIES[0];
    expect(screen.getByText(`• ${first.notes.en[0]}`)).toBeTruthy();
  });

  it("falls back to English notes for any language other than German", async () => {
    i18n.changeLanguage("fr");
    await render(<ChangelogModal visible onClose={jest.fn()} />);
    const first = CHANGELOG_ENTRIES[0];
    expect(screen.getByText(`• ${first.notes.en[0]}`)).toBeTruthy();
  });

  it("calls onClose when the close button is pressed", async () => {
    const onClose = jest.fn();
    await render(<ChangelogModal visible onClose={onClose} />);
    await fireEvent.press(screen.getByText("Schließen"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the overlay is pressed", async () => {
    const onClose = jest.fn();
    await render(<ChangelogModal visible onClose={onClose} />);
    await fireEvent.press(screen.getByTestId("dropdown-overlay"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when the modal card itself is pressed (only the overlay closes it)", async () => {
    const onClose = jest.fn();
    await render(<ChangelogModal visible onClose={onClose} />);
    await fireEvent.press(screen.getByText("Änderungsprotokoll"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
