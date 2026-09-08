import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useStyles } from "../styles/useStyles";
import { withFeedback } from "../styles/interactive";

export function Dropdown<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <>
      <Pressable
        style={withFeedback(styles, styles.dropdownButton)}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        aria-expanded={open}
      >
        <Text style={styles.dropdownButtonText}>{selected?.label ?? ""}</Text>
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
