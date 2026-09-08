import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { AeroShardsParamsPanel } from "../../backgrounds/aeroShards/AeroShardsParamsPanel";
import { AERO_SHARDS_DEFAULT_PARAMS } from "../../backgrounds/aeroShards/aeroShardsParams";
import { GhostFibersParamsPanel } from "../../backgrounds/ghostFibers/GhostFibersParamsPanel";
import { GHOST_FIBERS_DEFAULT_PARAMS } from "../../backgrounds/ghostFibers/ghostFibersParams";

// AeroShardsParamsPanel/GhostFibersParamsPanel render through useStyles() -> useTheme() ->
// ThemeContext, which imports AsyncStorage (for the persisted theme setting) even when no
// ThemeProvider is mounted.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// AeroShards.tsx and GhostFibers.tsx are vendored/coverage-excluded, need a real GPU to render,
// and pull in ESM-only WebGPU/WebGL packages (`vgpu`, `ogl`) that aren't meant to load under Jest
// at all — mock them out so this test only verifies the registry's wiring, not the components
// themselves. Rendering something observable (rather than null) lets the adapter tests below
// confirm the registry's components actually forward their params through.
function MockAeroShards(props: Record<string, unknown>) {
  return <Text>mock-aero-shards:{JSON.stringify(props)}</Text>;
}
jest.mock("../../backgrounds/aeroShards/AeroShards", () => ({ __esModule: true, default: MockAeroShards }));

function MockGhostFibers(props: Record<string, unknown>) {
  return <Text>mock-ghost-fibers:{JSON.stringify(props)}</Text>;
}
jest.mock("../../backgrounds/ghostFibers/GhostFibers", () => ({ __esModule: true, default: MockGhostFibers }));

describe("backgroundRegistry (web)", () => {
  it("has exactly two entries: Aero Shards and Ghost Fibers", () => {
    const { backgroundRegistry } = require("../../backgrounds/registry.web");
    expect(backgroundRegistry).toHaveLength(2);
  });

  it("wires the Aero Shards entry to its real id, label, panel, and default params", () => {
    const { backgroundRegistry } = require("../../backgrounds/registry.web");
    const aeroShards = backgroundRegistry.find((entry: { id: string }) => entry.id === "aeroShards");
    expect(aeroShards.labelKey).toBe("background.aeroShardsName");
    expect(aeroShards.ParamsPanel).toBe(AeroShardsParamsPanel);
    expect(aeroShards.defaultParams).toEqual(AERO_SHARDS_DEFAULT_PARAMS);
  });

  it("its component adapter spreads params through to AeroShards", async () => {
    const { backgroundRegistry } = require("../../backgrounds/registry.web");
    const aeroShards = backgroundRegistry.find((entry: { id: string }) => entry.id === "aeroShards");
    await render(<aeroShards.component params={AERO_SHARDS_DEFAULT_PARAMS} />);
    expect(screen.getByText(`mock-aero-shards:${JSON.stringify(AERO_SHARDS_DEFAULT_PARAMS)}`)).toBeTruthy();
  });

  it("wires the Ghost Fibers entry to its real id, label, panel, and default params", () => {
    const { backgroundRegistry } = require("../../backgrounds/registry.web");
    const ghostFibers = backgroundRegistry.find((entry: { id: string }) => entry.id === "ghostFibers");
    expect(ghostFibers.labelKey).toBe("background.ghostFibersName");
    expect(ghostFibers.ParamsPanel).toBe(GhostFibersParamsPanel);
    expect(ghostFibers.defaultParams).toEqual(GHOST_FIBERS_DEFAULT_PARAMS);
  });

  it("its component adapter spreads params through to GhostFibers", async () => {
    const { backgroundRegistry } = require("../../backgrounds/registry.web");
    const ghostFibers = backgroundRegistry.find((entry: { id: string }) => entry.id === "ghostFibers");
    await render(<ghostFibers.component params={GHOST_FIBERS_DEFAULT_PARAMS} />);
    expect(screen.getByText(`mock-ghost-fibers:${JSON.stringify(GHOST_FIBERS_DEFAULT_PARAMS)}`)).toBeTruthy();
  });
});
