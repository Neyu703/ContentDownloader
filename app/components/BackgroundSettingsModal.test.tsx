import { Text } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { BackgroundSettingsModal } from "./BackgroundSettingsModal";
import { BackgroundProvider } from "../backgrounds/BackgroundContext";
import i18n, { initI18n } from "../i18n";

initI18n("de");

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

beforeEach(async () => {
  await AsyncStorage.clear();
});

const FakePanel = ({
  params,
  onChange,
}: {
  params: { label: string };
  onChange: (params: { label: string }) => void;
}) => <Text onPress={() => onChange({ label: "changed" })}>fake-panel:{params.label}</Text>;

const mockRegistry = [
  {
    id: "fake",
    labelKey: "background.fakeName",
    component: () => null,
    ParamsPanel: FakePanel,
    defaultParams: { label: "default" },
  },
];
jest.mock("../backgrounds/registry", () => ({
  get backgroundRegistry() {
    return mockRegistry;
  },
}));

afterEach(() => {
  i18n.changeLanguage("de");
});

function renderModal(onClose = jest.fn()) {
  return render(
    <BackgroundProvider>
      <BackgroundSettingsModal visible onClose={onClose} />
    </BackgroundProvider>
  );
}

describe("BackgroundSettingsModal", () => {
  it("renders nothing when not visible", async () => {
    const { toJSON } = await render(
      <BackgroundProvider>
        <BackgroundSettingsModal visible={false} onClose={jest.fn()} />
      </BackgroundProvider>
    );
    expect(toJSON()).toBeNull();
  });

  it("shows the title and defaults the picker to 'Kein Hintergrund'", async () => {
    await renderModal();
    expect(screen.getByText("Hintergrund")).toBeTruthy();
    expect(screen.getByText("Kein Hintergrund")).toBeTruthy();
  });

  it("does not show a ParamsPanel while 'none' is selected", async () => {
    await renderModal();
    expect(screen.queryByText(/fake-panel:/)).toBeNull();
  });

  it("selecting a background shows its ParamsPanel seeded with defaultParams", async () => {
    await renderModal();
    await fireEvent.press(screen.getByText("Kein Hintergrund"));
    await fireEvent.press(await screen.findByText("background.fakeName"));

    await waitFor(() => expect(screen.getByText("fake-panel:default")).toBeTruthy());
  });

  it("selecting 'Kein Hintergrund' again hides the ParamsPanel", async () => {
    await renderModal();
    await fireEvent.press(screen.getByText("Kein Hintergrund"));
    await fireEvent.press(await screen.findByText("background.fakeName"));
    await waitFor(() => expect(screen.getByText("fake-panel:default")).toBeTruthy());

    await fireEvent.press(screen.getByText("background.fakeName"));
    await fireEvent.press(await screen.findByText("Kein Hintergrund"));

    expect(screen.queryByText(/fake-panel:/)).toBeNull();
  });

  it("a ParamsPanel change updates the panel's own params live, keeping the same background selected", async () => {
    await renderModal();
    await fireEvent.press(screen.getByText("Kein Hintergrund"));
    await fireEvent.press(await screen.findByText("background.fakeName"));
    await waitFor(() => expect(screen.getByText("fake-panel:default")).toBeTruthy());

    await fireEvent.press(screen.getByText("fake-panel:default"));

    await waitFor(() => expect(screen.getByText("fake-panel:changed")).toBeTruthy());
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
    await fireEvent.press(screen.getByText("Hintergrund"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
