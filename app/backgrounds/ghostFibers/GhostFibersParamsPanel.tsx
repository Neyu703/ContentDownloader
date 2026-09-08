import type { InputHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { Dropdown } from "../../components/Dropdown";
import { useStyles } from "../../styles/useStyles";
import { GLOW_COLOR_PRESETS, LINE_COLOR_PRESETS, type GhostFibersParams } from "./ghostFibersParams";

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

export function GhostFibersParamsPanel({
  params,
  onChange,
}: {
  params: GhostFibersParams;
  onChange: (params: GhostFibersParams) => void;
}) {
  const styles = useStyles();
  const { t: translate } = useTranslation();

  return (
    <View>
      <Text style={styles.label}>{translate("background.lineColorLabel")}</Text>
      <Dropdown
        options={LINE_COLOR_PRESETS.map((preset) => ({ value: preset.value, label: translate(preset.labelKey) }))}
        value={params.lineColor}
        onChange={(lineColor) => onChange({ ...params, lineColor })}
      />

      <Text style={[styles.label, styles.fieldSpacing]}>{translate("background.glowColorLabel")}</Text>
      <Dropdown
        options={GLOW_COLOR_PRESETS.map((preset) => ({ value: preset.value, label: translate(preset.labelKey) }))}
        value={params.glowColor}
        onChange={(glowColor) => onChange({ ...params, glowColor })}
      />

      <Text style={[styles.label, styles.fieldSpacing]}>{translate("background.scaleLabel")}</Text>
      <SliderControl
        testID="background-scale-slider"
        value={params.scale}
        min={0.5}
        max={4}
        step={0.1}
        onChange={(scale) => onChange({ ...params, scale })}
      />

      <Text style={[styles.label, styles.fieldSpacing]}>{translate("background.speedLabel")}</Text>
      <SliderControl
        testID="background-speed-slider"
        value={params.speed}
        min={0}
        max={1}
        step={0.05}
        onChange={(speed) => onChange({ ...params, speed })}
      />

      <Text style={[styles.label, styles.fieldSpacing]}>{translate("background.layersLabel")}</Text>
      <SliderControl
        testID="background-layers-slider"
        value={params.layers}
        min={1}
        max={10}
        step={1}
        onChange={(layers) => onChange({ ...params, layers })}
      />

      <Text style={[styles.label, styles.fieldSpacing]}>{translate("background.rotationSpeedLabel")}</Text>
      <SliderControl
        testID="background-rotation-speed-slider"
        value={params.rotationSpeed}
        min={0}
        max={1}
        step={0.05}
        onChange={(rotationSpeed) => onChange({ ...params, rotationSpeed })}
      />
    </View>
  );
}
