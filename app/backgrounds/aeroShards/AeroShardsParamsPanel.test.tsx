import { fireEvent, render, screen } from "@testing-library/react-native";
import { AeroShardsParamsPanel } from "./AeroShardsParamsPanel";
import { AERO_SHARDS_DEFAULT_PARAMS, type AeroShardsParams } from "./aeroShardsParams";
import i18n, { initI18n } from "../../i18n";

initI18n("de");

// Renders through useStyles() -> useTheme() -> ThemeContext, which imports AsyncStorage even
// when no ThemeProvider is mounted.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

afterEach(() => {
  i18n.changeLanguage("de");
});

async function renderPanel(params: AeroShardsParams = AERO_SHARDS_DEFAULT_PARAMS) {
  const onChange = jest.fn();
  const utils = await render(<AeroShardsParamsPanel params={params} onChange={onChange} />);
  return { onChange, ...utils };
}

describe("AeroShardsParamsPanel", () => {
  it("changing the shard color dropdown merges only shardColor into the params", async () => {
    const { onChange } = await renderPanel();
    await fireEvent.press(screen.getAllByText("Standard (Lila)")[0]);
    await fireEvent.press(await screen.findByText("Blau"));
    expect(onChange).toHaveBeenCalledWith({ ...AERO_SHARDS_DEFAULT_PARAMS, shardColor: "#3B82F6" });
  });

  it("changing the accent color dropdown merges only accentColor into the params", async () => {
    const { onChange } = await renderPanel();
    const accentDropdowns = screen.getAllByText("Standard (Lila)");
    await fireEvent.press(accentDropdowns[1]);
    await fireEvent.press(await screen.findByText("Grün"));
    expect(onChange).toHaveBeenCalledWith({ ...AERO_SHARDS_DEFAULT_PARAMS, accentColor: "#4ADE80" });
  });

  it("changing placement merges only placement into the params", async () => {
    const { onChange } = await renderPanel();
    await fireEvent.press(screen.getByText("Vollflächig"));
    await fireEvent.press(await screen.findByText("Rechts"));
    expect(onChange).toHaveBeenCalledWith({ ...AERO_SHARDS_DEFAULT_PARAMS, placement: "right" });
  });

  it("changing material merges only material into the params", async () => {
    const { onChange } = await renderPanel();
    await fireEvent.press(screen.getByText("Perlmutt"));
    await fireEvent.press(await screen.findByText("Chrom"));
    expect(onChange).toHaveBeenCalledWith({ ...AERO_SHARDS_DEFAULT_PARAMS, material: "chrome" });
  });

  it("changing detail merges only detail into the params", async () => {
    const { onChange } = await renderPanel();
    await fireEvent.press(screen.getByText("Ausgewogen"));
    await fireEvent.press(await screen.findByText("Kräftig"));
    expect(onChange).toHaveBeenCalledWith({ ...AERO_SHARDS_DEFAULT_PARAMS, detail: "bold" });
  });

  it("changing flow merges only flow into the params", async () => {
    const { onChange } = await renderPanel();
    await fireEvent.press(screen.getByText("Strömung"));
    await fireEvent.press(await screen.findByText("Wirbel"));
    expect(onChange).toHaveBeenCalledWith({ ...AERO_SHARDS_DEFAULT_PARAMS, flow: "vortex" });
  });

  it("dragging the scale slider merges only scale into the params, formatted to one decimal", async () => {
    const { onChange } = await renderPanel();
    fireEvent(screen.getByTestId("background-scale-slider"), "change", { target: { value: "1.8" } });
    expect(onChange).toHaveBeenCalledWith({ ...AERO_SHARDS_DEFAULT_PARAMS, scale: 1.8 });
  });

  it("dragging the speed slider merges only speed into the params", async () => {
    const { onChange } = await renderPanel();
    fireEvent(screen.getByTestId("background-speed-slider"), "change", { target: { value: "0.4" } });
    expect(onChange).toHaveBeenCalledWith({ ...AERO_SHARDS_DEFAULT_PARAMS, speed: 0.4 });
  });

  it("shows the current scale/speed values formatted to one decimal", async () => {
    await renderPanel({ ...AERO_SHARDS_DEFAULT_PARAMS, scale: 1.5, speed: 0.5 });
    expect(screen.getByText("1.5")).toBeTruthy();
    expect(screen.getByText("0.5")).toBeTruthy();
  });
});
