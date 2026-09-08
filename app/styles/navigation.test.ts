import { makeNavigationStyles } from "./navigation";
import { darkColors } from "../theme/colors";

describe("makeNavigationStyles().sceneContainer.backgroundColor", () => {
  it("uses the theme's background color when no background is active", () => {
    expect(makeNavigationStyles(darkColors, false).sceneContainer.backgroundColor).toBe(darkColors.background);
  });

  it("becomes transparent when a background is active, so BackgroundLayer shows through", () => {
    expect(makeNavigationStyles(darkColors, true).sceneContainer.backgroundColor).toBe("transparent");
  });
});
