import { fireEvent, render, screen } from "@testing-library/react-native";
import { GhostFibersParamsPanel } from "../../../backgrounds/ghostFibers/GhostFibersParamsPanel";
import { GHOST_FIBERS_DEFAULT_PARAMS, type GhostFibersParams } from "../../../backgrounds/ghostFibers/ghostFibersParams";
import i18n, { initI18n } from "../../../i18n";

initI18n("de");

// Renders through useStyles() -> useTheme() -> ThemeContext, which imports AsyncStorage even
// when no ThemeProvider is mounted.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

afterEach(() => {
  i18n.changeLanguage("de");
});

async function renderPanel(params: GhostFibersParams = GHOST_FIBERS_DEFAULT_PARAMS) {
  const onChange = jest.fn();
  const utils = await render(<GhostFibersParamsPanel params={params} onChange={onChange} />);
  return { onChange, ...utils };
}

describe("GhostFibersParamsPanel", () => {
  it("changing the line color dropdown merges only lineColor into the params", async () => {
    const { onChange } = await renderPanel();
    await fireEvent.press(screen.getAllByText("Standard (Lila)")[0]);
    await fireEvent.press(await screen.findByText("Blau"));
    expect(onChange).toHaveBeenCalledWith({ ...GHOST_FIBERS_DEFAULT_PARAMS, lineColor: "#0B1F3A" });
  });

  it("changing the glow color dropdown merges only glowColor into the params", async () => {
    const { onChange } = await renderPanel();
    const glowDropdowns = screen.getAllByText("Standard (Lila)");
    await fireEvent.press(glowDropdowns[1]);
    await fireEvent.press(await screen.findByText("Grün"));
    expect(onChange).toHaveBeenCalledWith({ ...GHOST_FIBERS_DEFAULT_PARAMS, glowColor: "#22C55E" });
  });

  it("dragging the scale slider merges only scale into the params, formatted to one decimal", async () => {
    const { onChange } = await renderPanel();
    fireEvent(screen.getByTestId("background-scale-slider"), "change", { target: { value: "3.2" } });
    expect(onChange).toHaveBeenCalledWith({ ...GHOST_FIBERS_DEFAULT_PARAMS, scale: 3.2 });
  });

  it("dragging the speed slider merges only speed into the params", async () => {
    const { onChange } = await renderPanel();
    fireEvent(screen.getByTestId("background-speed-slider"), "change", { target: { value: "0.4" } });
    expect(onChange).toHaveBeenCalledWith({ ...GHOST_FIBERS_DEFAULT_PARAMS, speed: 0.4 });
  });

  it("dragging the layers slider merges only layers into the params", async () => {
    const { onChange } = await renderPanel();
    fireEvent(screen.getByTestId("background-layers-slider"), "change", { target: { value: "7" } });
    expect(onChange).toHaveBeenCalledWith({ ...GHOST_FIBERS_DEFAULT_PARAMS, layers: 7 });
  });

  it("dragging the rotation speed slider merges only rotationSpeed into the params", async () => {
    const { onChange } = await renderPanel();
    fireEvent(screen.getByTestId("background-rotation-speed-slider"), "change", { target: { value: "0.6" } });
    expect(onChange).toHaveBeenCalledWith({ ...GHOST_FIBERS_DEFAULT_PARAMS, rotationSpeed: 0.6 });
  });

  it("shows the current scale/speed/layers/rotationSpeed values formatted to one decimal", async () => {
    await renderPanel({ ...GHOST_FIBERS_DEFAULT_PARAMS, scale: 1.5, speed: 0.5, layers: 6, rotationSpeed: 0.3 });
    expect(screen.getByText("1.5")).toBeTruthy();
    expect(screen.getByText("0.5")).toBeTruthy();
    expect(screen.getByText("6.0")).toBeTruthy();
    expect(screen.getByText("0.3")).toBeTruthy();
  });
});
