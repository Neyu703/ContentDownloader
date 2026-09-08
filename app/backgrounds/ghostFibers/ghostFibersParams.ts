// Curated subset of GhostFibersProps (see GhostFibers.tsx) — every other prop stays at the
// component's own default. Values/labels mirror reactbits.dev's own defaults exactly.
export interface GhostFibersParams {
  lineColor: string;
  glowColor: string;
  speed: number;
  scale: number;
  layers: number;
  rotationSpeed: number;
}

export const GHOST_FIBERS_DEFAULT_PARAMS: GhostFibersParams = {
  lineColor: "#140E35",
  glowColor: "#3437A0",
  speed: 0.2,
  scale: 2,
  layers: 4,
  rotationSpeed: 0.25,
};

export const LINE_COLOR_PRESETS: { value: string; labelKey: string }[] = [
  { value: "#140E35", labelKey: "background.presetPurple" },
  { value: "#0B1F3A", labelKey: "background.presetBlue" },
  { value: "#0B2E1A", labelKey: "background.presetGreen" },
  { value: "#3A0B10", labelKey: "background.presetRed" },
  { value: "#3A1D0B", labelKey: "background.presetOrange" },
  { value: "#F5F5F5", labelKey: "background.presetWhite" },
];

export const GLOW_COLOR_PRESETS: { value: string; labelKey: string }[] = [
  { value: "#3437A0", labelKey: "background.presetPurple" },
  { value: "#3B82F6", labelKey: "background.presetBlue" },
  { value: "#22C55E", labelKey: "background.presetGreen" },
  { value: "#EF4444", labelKey: "background.presetRed" },
  { value: "#F97316", labelKey: "background.presetOrange" },
  { value: "#FFFFFF", labelKey: "background.presetWhite" },
];
