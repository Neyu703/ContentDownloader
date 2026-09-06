import type { ReactNode } from "react";
import { Modal, Pressable } from "react-native";
import { useStyles } from "../styles/useStyles";

/**
 * Shared modal chrome for ChangelogModal and PlaylistPickerModal: conditionally rendering the
 * Modal element itself (not just toggling `visible`) — react-native-web's Modal was observed
 * staying visible with stale/empty content after `visible` flipped to false shortly after an
 * async state update, even though the underlying state had already gone back to null/false.
 */
export function OverlayModal({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const styles = useStyles();
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable testID="dropdown-overlay" style={styles.dropdownOverlay} onPress={onClose}>
        {children}
      </Pressable>
    </Modal>
  );
}
