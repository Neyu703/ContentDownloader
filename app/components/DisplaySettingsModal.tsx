import { Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useDisplayPreferences } from "../display/DisplayPreferencesContext";
import { DEBUG_FIELD_IDS, SIZE_SCALE_FACTORS, type SizeLevel } from "../display/displayPreferences";
import { useTheme } from "../theme/ThemeContext";
import { useStyles } from "../styles/useStyles";
import { withFeedback } from "../styles/interactive";
import { Dropdown } from "./Dropdown";
import { OverlayModal } from "./OverlayModal";

const SIZE_LEVELS: SizeLevel[] = ["original", "comfortable", "spacious"];

/** Miniature, non-interactive stand-in for a job card, scaled live as the user picks a size level. */
function JobCardSizePreview({ scale }: { scale: number }) {
  const { colors } = useTheme();
  const { t: translate } = useTranslation();
  const scaled = (baseSize: number) => baseSize * scale;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: scaled(8),
        backgroundColor: colors.surfaceVariant,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        padding: scaled(14),
      }}
    >
      <View style={{ width: scaled(56), height: scaled(32), borderRadius: 4, backgroundColor: colors.background }} />
      <Text style={{ color: colors.textPrimary, fontWeight: "600", fontSize: scaled(14) }} numberOfLines={1}>
        {translate("displaySettings.previewSampleTitle")}
      </Text>
    </View>
  );
}

/** Miniature, non-interactive stand-in for the URL field + download button, scaled live as the user picks a size level. */
function FormSizePreview({ scale }: { scale: number }) {
  const { colors } = useTheme();
  const { t: translate } = useTranslation();
  const scaled = (baseSize: number) => baseSize * scale;
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
      <View
        style={{
          flex: 1,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          backgroundColor: colors.inputBackground,
          borderRadius: 10,
          padding: scaled(14),
        }}
      >
        <Text style={{ color: colors.textMuted, fontSize: scaled(15) }} numberOfLines={1}>
          {translate("home.urlPlaceholder")}
        </Text>
      </View>
      <View
        style={{
          backgroundColor: colors.accent,
          borderRadius: 8,
          paddingVertical: scaled(12),
          paddingHorizontal: scaled(20),
        }}
      >
        <Text style={{ color: colors.onAccent, fontWeight: "600", fontSize: scaled(15) }} numberOfLines={1}>
          {translate("home.downloadButton")}
        </Text>
      </View>
    </View>
  );
}

export function DisplaySettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  const { t: translate } = useTranslation();
  const { preferences, setJobCardSize, setFormSize, setDebugFieldVisible, setAllDebugFieldsVisible } =
    useDisplayPreferences();

  const sizeOptions = SIZE_LEVELS.map((level) => ({ value: level, label: translate(`displaySettings.size.${level}`) }));
  const allFieldsVisible = DEBUG_FIELD_IDS.every((id) => preferences.debugFields[id]);

  return (
    <OverlayModal visible={visible} onClose={onClose}>
      <Pressable style={styles.displaySettingsModal} onPress={() => {}} accessibilityRole="none">
        <ScrollView>
          <Text style={styles.displaySettingsTitle}>{translate("displaySettings.title")}</Text>

          <Text style={styles.label}>{translate("displaySettings.jobCardSizeLabel")}</Text>
          <View style={styles.displaySettingsPreview}>
            <JobCardSizePreview scale={SIZE_SCALE_FACTORS[preferences.jobCardSize]} />
          </View>
          <Dropdown options={sizeOptions} value={preferences.jobCardSize} onChange={setJobCardSize} />

          <Text style={[styles.label, styles.fieldSpacing]}>{translate("displaySettings.formSizeLabel")}</Text>
          <View style={styles.displaySettingsPreview}>
            <FormSizePreview scale={SIZE_SCALE_FACTORS[preferences.formSize]} />
          </View>
          <Dropdown options={sizeOptions} value={preferences.formSize} onChange={setFormSize} />

          <Text style={[styles.label, styles.fieldSpacing]}>{translate("displaySettings.debugFieldsLabel")}</Text>
          <Pressable
            style={withFeedback(styles, styles.linkButton)}
            onPress={() => setAllDebugFieldsVisible(!allFieldsVisible)}
            accessibilityRole="button"
          >
            <Text style={styles.linkText}>
              {allFieldsVisible ? translate("displaySettings.deselectAllFields") : translate("displaySettings.selectAllFields")}
            </Text>
          </Pressable>
          {DEBUG_FIELD_IDS.map((id) => {
            const checked = preferences.debugFields[id];
            return (
              <Pressable
                key={id}
                style={withFeedback(styles, styles.displaySettingsFieldRow)}
                onPress={() => setDebugFieldVisible(id, !checked)}
                accessibilityRole="checkbox"
                aria-checked={checked}
              >
                <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                  {checked && <Text style={styles.checkboxMark}>✓</Text>}
                </View>
                <Text style={styles.displaySettingsFieldLabel}>{translate(`displaySettings.debugField.${id}`)}</Text>
              </Pressable>
            );
          })}

          <Pressable style={withFeedback(styles, [styles.linkButton, styles.flushTop])} onPress={onClose} accessibilityRole="button">
            <Text style={styles.linkText}>{translate("displaySettings.closeButton")}</Text>
          </Pressable>
        </ScrollView>
      </Pressable>
    </OverlayModal>
  );
}
