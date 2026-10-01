import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useStyles } from "../styles/useStyles";
import { withFeedback } from "../styles/interactive";
import { dropdownButtonShape, dropdownButtonTextShape } from "../styles/dropdown";
import { useTheme } from "../theme/ThemeContext";

export function Dropdown<T extends string>({
  options,
  value,
  onChange,
  scale,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Optional size multiplier (default 1, no-op) — only HomeScreen's Format/Quality dropdowns pass one, scaled by the "Formular-Größe" display preference. */
  scale?: number;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  // Only recompute via the factory when actually scaled — otherwise reuse the static stylesheet
  // entry every other Dropdown instance (e.g. Settings' language/theme pickers) already shares.
  const isScaled = scale != null && scale !== 1;
  const buttonStyle = isScaled ? dropdownButtonShape(colors, scale) : styles.dropdownButton;
  const textStyle = isScaled ? dropdownButtonTextShape(colors, scale) : styles.dropdownButtonText;

  return (
    <>
      <Pressable
        style={withFeedback(styles, buttonStyle)}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        aria-expanded={open}
      >
        <Text style={textStyle}>{selected?.label ?? ""}</Text>
        <Text style={styles.dropdownChevron}>▾</Text>
      </Pressable>
      <Modal
        testID="dropdown-modal"
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          testID="dropdown-overlay"
          style={styles.dropdownOverlay}
          onPress={() => setOpen(false)}
          accessibilityRole="none"
        >
          <View style={styles.dropdownMenu} accessibilityRole="menu">
            {options.map((option) => (
              <Pressable
                key={option.value}
                style={withFeedback(styles, [styles.dropdownOption, option.value === value && styles.dropdownOptionSelected])}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                accessibilityRole="menuitem"
                aria-selected={option.value === value}
              >
                <Text style={styles.dropdownOptionText}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
