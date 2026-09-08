// Curated subset of AeroShardsProps (see AeroShards.tsx) — every other prop stays at the
// component's own default. Values/labels mirror reactbits.dev's own option set exactly.
export interface AeroShardsParams {
  shardColor: string;
  accentColor: string;
  placement: "right" | "left" | "center" | "full";
  material: "pearl" | "chrome" | "satin";
  detail: "bold" | "balanced" | "fine";
  flow: "stream" | "vortex" | "ribbon";
  scale: number;
  speed: number;
}

export const AERO_SHARDS_DEFAULT_PARAMS: AeroShardsParams = {
  shardColor: "#896ABD",
  accentColor: "#A855F7",
  placement: "full",
  material: "pearl",
  detail: "balanced",
  flow: "stream",
  scale: 1,
  speed: 1,
};

export const SHARD_COLOR_PRESETS: { value: string; labelKey: string }[] = [
  { value: "#896ABD", labelKey: "background.presetPurple" },
  { value: "#3B82F6", labelKey: "background.presetBlue" },
  { value: "#22C55E", labelKey: "background.presetGreen" },
  { value: "#EF4444", labelKey: "background.presetRed" },
  { value: "#F97316", labelKey: "background.presetOrange" },
  { value: "#F5F5F5", labelKey: "background.presetWhite" },
];

export const ACCENT_COLOR_PRESETS: { value: string; labelKey: string }[] = [
  { value: "#A855F7", labelKey: "background.presetPurple" },
  { value: "#60A5FA", labelKey: "background.presetBlue" },
  { value: "#4ADE80", labelKey: "background.presetGreen" },
  { value: "#F87171", labelKey: "background.presetRed" },
  { value: "#FB923C", labelKey: "background.presetOrange" },
  { value: "#FFFFFF", labelKey: "background.presetWhite" },
];

export const PLACEMENT_OPTIONS: { value: AeroShardsParams["placement"]; labelKey: string }[] = [
  { value: "full", labelKey: "background.placementFull" },
  { value: "right", labelKey: "background.placementRight" },
  { value: "left", labelKey: "background.placementLeft" },
  { value: "center", labelKey: "background.placementCenter" },
];

export const MATERIAL_OPTIONS: { value: AeroShardsParams["material"]; labelKey: string }[] = [
  { value: "pearl", labelKey: "background.materialPearl" },
  { value: "chrome", labelKey: "background.materialChrome" },
  { value: "satin", labelKey: "background.materialSatin" },
];

export const DETAIL_OPTIONS: { value: AeroShardsParams["detail"]; labelKey: string }[] = [
  { value: "balanced", labelKey: "background.detailBalanced" },
  { value: "bold", labelKey: "background.detailBold" },
  { value: "fine", labelKey: "background.detailFine" },
];

export const FLOW_OPTIONS: { value: AeroShardsParams["flow"]; labelKey: string }[] = [
  { value: "stream", labelKey: "background.flowStream" },
  { value: "vortex", labelKey: "background.flowVortex" },
  { value: "ribbon", labelKey: "background.flowRibbon" },
];
