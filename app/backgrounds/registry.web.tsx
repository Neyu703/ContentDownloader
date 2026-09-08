import AeroShards from "./aeroShards/AeroShards";
import { AeroShardsParamsPanel } from "./aeroShards/AeroShardsParamsPanel";
import { AERO_SHARDS_DEFAULT_PARAMS, type AeroShardsParams } from "./aeroShards/aeroShardsParams";
import GhostFibers from "./ghostFibers/GhostFibers";
import { GhostFibersParamsPanel } from "./ghostFibers/GhostFibersParamsPanel";
import { GHOST_FIBERS_DEFAULT_PARAMS, type GhostFibersParams } from "./ghostFibers/ghostFibersParams";
import type { BackgroundDefinition } from "./types";

/** Adapts AeroShards' individual props to the registry's uniform `{ params }` component shape. */
function AeroShardsBackground({ params }: { params: AeroShardsParams }) {
  return <AeroShards {...params} />;
}

/** Adapts GhostFibers' individual props to the registry's uniform `{ params }` component shape. */
function GhostFibersBackground({ params }: { params: GhostFibersParams }) {
  return <GhostFibers {...params} />;
}

const aeroShardsDefinition: BackgroundDefinition<AeroShardsParams> = {
  id: "aeroShards",
  labelKey: "background.aeroShardsName",
  component: AeroShardsBackground,
  ParamsPanel: AeroShardsParamsPanel,
  defaultParams: AERO_SHARDS_DEFAULT_PARAMS,
};

const ghostFibersDefinition: BackgroundDefinition<GhostFibersParams> = {
  id: "ghostFibers",
  labelKey: "background.ghostFibersName",
  component: GhostFibersBackground,
  ParamsPanel: GhostFibersParamsPanel,
  defaultParams: GHOST_FIBERS_DEFAULT_PARAMS,
};

// Widened once, at this single boundary, so every entry in the shared registry array can share
// one BackgroundDefinition type regardless of each background's own params shape. Safe because
// consumers always look a definition up by id and use its component/ParamsPanel/defaultParams
// together, never mix-and-matched across entries.
export const backgroundRegistry: BackgroundDefinition[] = [
  aeroShardsDefinition as unknown as BackgroundDefinition,
  ghostFibersDefinition as unknown as BackgroundDefinition,
];
