import type { ComponentType } from "react";

/** One selectable animated background, and the curated controls to customize it in Settings. */
export interface BackgroundDefinition<TParams extends object = Record<string, unknown>> {
  /** Stable id, persisted in AsyncStorage — never rename once shipped. */
  id: string;
  /** i18n key for its name in the picker Dropdown. */
  labelKey: string;
  /** Renders the full-screen animated background itself, driven live by `params`. */
  component: ComponentType<{ params: TParams }>;
  /** Renders the curated controls shown in the Settings modal for this background. */
  ParamsPanel: ComponentType<{ params: TParams; onChange: (params: TParams) => void }>;
  /** Seed values applied when the user first selects this background. */
  defaultParams: TParams;
}
