import type { BackgroundDefinition } from "./types";

// Android has no WebGPU — the background feature is structurally absent here. Nothing in this
// file imports AeroShards.tsx or vgpu, so neither ever reaches the native bundle.
export const backgroundRegistry: BackgroundDefinition[] = [];
