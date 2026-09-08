import type { InputHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { Dropdown } from "../../components/Dropdown";
import { useStyles } from "../../styles/useStyles";
import {
  ACCENT_COLOR_PRESETS,
  DETAIL_OPTIONS,
  FLOW_OPTIONS,
  MATERIAL_OPTIONS,
  PLACEMENT_OPTIONS,
  SHARD_COLOR_PRESETS,
  type AeroShardsParams,
} from "./aeroShardsParams";

// Only ever imported (transitively, via registry.web.ts) into the web bundle, so a raw DOM
// <input type="range"> is safe here without a .web.tsx split or a native slider dependency.
function SliderControl({
  testID,
  value,
  min,
  max,
  step,
  onChange,
}: {
  testID: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const styles = useStyles();
  // testID (not data-testid) so getByTestId works in tests — react-test-renderer doesn't validate
  // DOM prop names; only a real browser logs a harmless unknown-prop warning for it. Typed via this
  // extended props object (rather than inline on the JSX element) so that one exception doesn't
  // need a broader type-check bypass.
  const inputProps: InputHTMLAttributes<HTMLInputElement> & { testID?: string } = {
    testID,
    type: "range",
    min,
    max,
    step,
    value,
    onChange: (event) => onChange(Number(event.target.value)),
    style: { flex: 1 },
  };
  return (
    <View style={styles.backgroundSettingsSliderRow}>
      <input {...inputProps} />
      <Text style={styles.backgroundSettingsSliderValue}>{value.toFixed(1)}</Text>
    </View>
  );
}

export function AeroShardsParamsPanel({
  params,
  onChange,
}: {
  params: AeroShardsParams;
  onChange: (params: AeroShardsParams) => void;
}) {
  const styles = useStyles();
  const { t: translate } = useTranslation();

  return (
    <View>
      <Text style={styles.label}>{translate("background.shardColorLabel")}</Text>
      <Dropdown
        options={SHARD_COLOR_PRESETS.map((preset) => ({ value: preset.value, label: translate(preset.labelKey) }))}
        value={params.shardColor}
        onChange={(shardColor) => onChange({ ...params, shardColor })}
      />

      <Text style={[styles.label, styles.fieldSpacing]}>{translate("background.accentColorLabel")}</Text>
      <Dropdown
        options={ACCENT_COLOR_PRESETS.map((preset) => ({ value: preset.value, label: translate(preset.labelKey) }))}
        value={params.accentColor}
        onChange={(accentColor) => onChange({ ...params, accentColor })}
      />

      <Text style={[styles.label, styles.fieldSpacing]}>{translate("background.placementLabel")}</Text>
      <Dropdown
        options={PLACEMENT_OPTIONS.map((option) => ({ value: option.value, label: translate(option.labelKey) }))}
        value={params.placement}
        onChange={(placement) => onChange({ ...params, placement })}
      />

      <Text style={[styles.label, styles.fieldSpacing]}>{translate("background.materialLabel")}</Text>
      <Dropdown
        options={MATERIAL_OPTIONS.map((option) => ({ value: option.value, label: translate(option.labelKey) }))}
        value={params.material}
        onChange={(material) => onChange({ ...params, material })}
      />

      <Text style={[styles.label, styles.fieldSpacing]}>{translate("background.detailLabel")}</Text>
      <Dropdown
        options={DETAIL_OPTIONS.map((option) => ({ value: option.value, label: translate(option.labelKey) }))}
        value={params.detail}
        onChange={(detail) => onChange({ ...params, detail })}
      />

      <Text style={[styles.label, styles.fieldSpacing]}>{translate("background.flowLabel")}</Text>
      <Dropdown
        options={FLOW_OPTIONS.map((option) => ({ value: option.value, label: translate(option.labelKey) }))}
        value={params.flow}
        onChange={(flow) => onChange({ ...params, flow })}
      />

      <Text style={[styles.label, styles.fieldSpacing]}>{translate("background.scaleLabel")}</Text>
      <SliderControl
        testID="background-scale-slider"
        value={params.scale}
        min={0.5}
        max={2.5}
        step={0.1}
        onChange={(scale) => onChange({ ...params, scale })}
      />

      <Text style={[styles.label, styles.fieldSpacing]}>{translate("background.speedLabel")}</Text>
      <SliderControl
        testID="background-speed-slider"
        value={params.speed}
        min={0}
        max={2}
        step={0.1}
        onChange={(speed) => onChange({ ...params, speed })}
      />
    </View>
  );
}
