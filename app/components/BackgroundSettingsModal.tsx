import { Pressable, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { backgroundRegistry } from "../backgrounds/registry";
import { useBackground } from "../backgrounds/BackgroundContext";
import { NONE_BACKGROUND_ID } from "../backgrounds/backgroundPreference";
import { Dropdown } from "./Dropdown";
import { OverlayModal } from "./OverlayModal";
import { useStyles } from "../styles/useStyles";
import { withFeedback } from "../styles/interactive";

export function BackgroundSettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  const { t: translate } = useTranslation();
  const { backgroundId, params, setBackground } = useBackground();
  const definition = backgroundRegistry.find((entry) => entry.id === backgroundId);

  const options = [
    { value: NONE_BACKGROUND_ID, label: translate("background.none") },
    ...backgroundRegistry.map((entry) => ({ value: entry.id, label: translate(entry.labelKey) })),
  ];

  function handleSelect(nextId: string) {
    const nextDefinition = backgroundRegistry.find((entry) => entry.id === nextId);
    setBackground(nextId, nextDefinition?.defaultParams ?? {});
  }

  return (
    <OverlayModal visible={visible} onClose={onClose}>
      <Pressable style={styles.backgroundSettingsModal} onPress={() => {}} accessibilityRole="none">
        <Text style={styles.backgroundSettingsTitle}>{translate("background.title")}</Text>
        <Dropdown options={options} value={backgroundId} onChange={handleSelect} />
        {definition && (
          <definition.ParamsPanel params={params} onChange={(nextParams) => setBackground(backgroundId, nextParams)} />
        )}
        <Pressable
          style={withFeedback(styles, [styles.linkButton, styles.flushTop])}
          onPress={onClose}
          accessibilityRole="button"
        >
          <Text style={styles.linkText}>{translate("background.closeButton")}</Text>
        </Pressable>
      </Pressable>
    </OverlayModal>
  );
}
