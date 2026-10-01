import { Component as ReactComponent, type ReactNode } from "react";
import { View } from "react-native";
import { backgroundRegistry } from "../backgrounds/registry";
import { useBackground } from "../backgrounds/BackgroundContext";
import { useStyles } from "../styles/useStyles";

interface BackgroundBoundaryState {
  hasError: boolean;
}

/**
 * Catches a crash from the active background (e.g. a GPU context the browser can't create) and
 * renders nothing instead of taking down the whole app. Sits once around the registry lookup in
 * BackgroundLayer, so every background — current or future — is covered without needing its own
 * defensive code.
 */
class BackgroundErrorBoundary extends ReactComponent<{ children: ReactNode }, BackgroundBoundaryState> {
  state: BackgroundBoundaryState = { hasError: false };

  static getDerivedStateFromError(): BackgroundBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

/** Renders the user's chosen animated background full-screen, behind the nav stack. Renders nothing when "none" is selected, on native (empty registry), for an unrecognized id, or if the background crashes while mounting/rendering. */
export function BackgroundLayer() {
  const styles = useStyles();
  const { backgroundId, params } = useBackground();
  const definition = backgroundRegistry.find((entry) => entry.id === backgroundId);
  if (!definition) return null;

  const Component = definition.component;
  return (
    <View style={styles.backgroundLayerContainer}>
      <BackgroundErrorBoundary>
        <Component params={params} />
      </BackgroundErrorBoundary>
    </View>
  );
}
