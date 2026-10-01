import { fireEvent, render, screen } from "@testing-library/react-native";
import { DisplaySettingsModal } from "../../components/DisplaySettingsModal";
import { useDisplayPreferences } from "../../display/DisplayPreferencesContext";
import { DEFAULT_DEBUG_FIELDS, SIZE_SCALE_FACTORS, type DisplayPreferences } from "../../display/displayPreferences";
import { initI18n } from "../../i18n";

initI18n("de");

// DisplaySettingsModal renders through useStyles() -> useTheme() -> ThemeContext, which imports
// AsyncStorage (for the persisted theme setting) even when no ThemeProvider is mounted.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("../../display/DisplayPreferencesContext", () => ({ useDisplayPreferences: jest.fn() }));

function mockPreferences(overrides: Partial<DisplayPreferences> = {}) {
  const setJobCardSize = jest.fn();
  const setFormSize = jest.fn();
  const setDebugFieldVisible = jest.fn();
  const setAllDebugFieldsVisible = jest.fn();
  (useDisplayPreferences as jest.Mock).mockReturnValue({
    preferences: { jobCardSize: "original", formSize: "original", debugFields: DEFAULT_DEBUG_FIELDS, ...overrides },
    setJobCardSize,
    setFormSize,
    setDebugFieldVisible,
    setAllDebugFieldsVisible,
  });
  return { setJobCardSize, setFormSize, setDebugFieldVisible, setAllDebugFieldsVisible };
}

beforeEach(() => {
  mockPreferences();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("DisplaySettingsModal — visibility", () => {
  it("renders nothing when not visible", async () => {
    await render(<DisplaySettingsModal visible={false} onClose={jest.fn()} />);
    expect(screen.queryByText("Anzeige anpassen")).toBeNull();
  });

  it("shows the title, both size sections, and the field-visibility section", async () => {
    await render(<DisplaySettingsModal visible onClose={jest.fn()} />);
    expect(screen.getByText("Anzeige anpassen")).toBeTruthy();
    expect(screen.getByText("Job-Karten-Größe")).toBeTruthy();
    expect(screen.getByText("Formular-Größe")).toBeTruthy();
    expect(screen.getByText("Angezeigte Infos beim Download")).toBeTruthy();
  });

  it("calls onClose when the close link is pressed", async () => {
    const onClose = jest.fn();
    await render(<DisplaySettingsModal visible onClose={onClose} />);
    await fireEvent.press(screen.getByText("Schließen"));
    expect(onClose).toHaveBeenCalled();
  });

  it("does not close when the modal card itself is pressed (only the overlay closes it)", async () => {
    const onClose = jest.fn();
    await render(<DisplaySettingsModal visible onClose={onClose} />);
    await fireEvent.press(screen.getByText("Anzeige anpassen"));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("DisplaySettingsModal — size dropdowns", () => {
  it("changes the job-card size via its dropdown", async () => {
    const { setJobCardSize, setFormSize } = mockPreferences();
    await render(<DisplaySettingsModal visible onClose={jest.fn()} />);
    // Both dropdowns start on "Original" — the first match is the job-card size trigger.
    await fireEvent.press(screen.getAllByText("Original")[0]);
    await fireEvent.press(screen.getByText("Geräumig"));
    expect(setJobCardSize).toHaveBeenCalledWith("spacious");
    expect(setFormSize).not.toHaveBeenCalled();
  });

  it("changes the form size via its dropdown", async () => {
    const { setJobCardSize, setFormSize } = mockPreferences();
    await render(<DisplaySettingsModal visible onClose={jest.fn()} />);
    await fireEvent.press(screen.getAllByText("Original")[1]);
    await fireEvent.press(screen.getByText("Komfortabel"));
    expect(setFormSize).toHaveBeenCalledWith("comfortable");
    expect(setJobCardSize).not.toHaveBeenCalled();
  });

  it("scales the live preview text sizes to match the currently selected levels", async () => {
    mockPreferences({ jobCardSize: "spacious", formSize: "comfortable" });
    await render(<DisplaySettingsModal visible onClose={jest.fn()} />);
    expect(screen.getByText("Beispiel-Videotitel").props.style.fontSize).toBe(14 * SIZE_SCALE_FACTORS.spacious);
    expect(screen.getByText("Link einfügen (YouTube, TikTok, Instagram, ...)").props.style.fontSize).toBe(
      15 * SIZE_SCALE_FACTORS.comfortable
    );
  });
});

describe("DisplaySettingsModal — debug field checklist", () => {
  it("enables a currently-hidden field when its row is pressed", async () => {
    const { setDebugFieldVisible } = mockPreferences({ debugFields: { ...DEFAULT_DEBUG_FIELDS, speed: false } });
    await render(<DisplaySettingsModal visible onClose={jest.fn()} />);
    await fireEvent.press(screen.getByText("Geschwindigkeit"));
    expect(setDebugFieldVisible).toHaveBeenCalledWith("speed", true);
  });

  it("disables a currently-visible field when its row is pressed", async () => {
    const { setDebugFieldVisible } = mockPreferences();
    await render(<DisplaySettingsModal visible onClose={jest.fn()} />);
    await fireEvent.press(screen.getByText("ETA"));
    expect(setDebugFieldVisible).toHaveBeenCalledWith("eta", false);
  });

  it("shows 'Alle abwählen' and deselects every field when all are currently visible", async () => {
    const { setAllDebugFieldsVisible } = mockPreferences();
    await render(<DisplaySettingsModal visible onClose={jest.fn()} />);
    await fireEvent.press(screen.getByText("Alle abwählen"));
    expect(setAllDebugFieldsVisible).toHaveBeenCalledWith(false);
  });

  it("shows 'Alle auswählen' and selects every field when at least one is currently hidden", async () => {
    const { setAllDebugFieldsVisible } = mockPreferences({ debugFields: { ...DEFAULT_DEBUG_FIELDS, rawStatus: false } });
    await render(<DisplaySettingsModal visible onClose={jest.fn()} />);
    await fireEvent.press(screen.getByText("Alle auswählen"));
    expect(setAllDebugFieldsVisible).toHaveBeenCalledWith(true);
  });
});
