import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { styles } from "../styles";

export function Dropdown<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <>
      <Pressable style={styles.dropdownButton} onPress={() => setOpen(true)}>
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
        <Pressable testID="dropdown-overlay" style={styles.dropdownOverlay} onPress={() => setOpen(false)}>
          <View style={styles.dropdownMenu}>
            {options.map((option) => (
              <Pressable
                key={option.value}
                style={[styles.dropdownOption, option.value === value && styles.dropdownOptionSelected]}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
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
