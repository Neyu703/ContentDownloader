import { View } from "react-native";
import { backgroundRegistry } from "../backgrounds/registry";
import { useBackground } from "../backgrounds/BackgroundContext";
import { useStyles } from "../styles/useStyles";

/** Renders the user's chosen animated background full-screen, behind the nav stack. Renders nothing when "none" is selected, on native (empty registry), or for an unrecognized id. */
export function BackgroundLayer() {
  const styles = useStyles();
  const { backgroundId, params } = useBackground();
  const definition = backgroundRegistry.find((entry) => entry.id === backgroundId);
  if (!definition) return null;

  const Component = definition.component;
  return (
    <View style={styles.backgroundLayerContainer}>
      <Component params={params} />
    </View>
  );
}
