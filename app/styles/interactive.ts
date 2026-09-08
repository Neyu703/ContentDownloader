import type { PressableStateCallbackType, StyleProp, ViewStyle } from "react-native";

/**
 * Builds a Pressable `style` callback that layers the shared hover/press opacity feedback
 * (see interactiveHovered/interactivePressed in layout.ts) on top of a button's own base style.
 * `hovered` is a no-op on native (react-native-web is the only Pressable that ever sets it).
 */
export function withFeedback(
  styles: { interactiveHovered: StyleProp<ViewStyle>; interactivePressed: StyleProp<ViewStyle> },
  base: StyleProp<ViewStyle>
) {
  return (state: PressableStateCallbackType): StyleProp<ViewStyle> => {
    return [base, isHovered(state) && styles.interactiveHovered, state.pressed && styles.interactivePressed];
  };
}

/** Reads a Pressable state's `hovered` field; react-native-web is the only platform that ever sets it. */
export function isHovered(state: PressableStateCallbackType): boolean {
  return Boolean(state.hovered);
}

/** True once a Pressable is hovered (web only) or actively pressed — for a single-tint feedback style. */
export function isActiveState(state: PressableStateCallbackType): boolean {
  return isHovered(state) || state.pressed;
}

/**
 * Builds a Pressable `style` callback for buttons that already have their own bespoke tint (e.g.
 * settingsAction's accentSelected background) instead of the generic opacity dimming above —
 * applies that single tint on hover OR press rather than two separate intensities.
 */
export function withActiveTint(base: StyleProp<ViewStyle>, activeStyle: StyleProp<ViewStyle>) {
  return (state: PressableStateCallbackType): StyleProp<ViewStyle> => [base, isActiveState(state) && activeStyle];
}
