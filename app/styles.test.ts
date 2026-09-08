import { darkColors } from "./theme/colors";
import { makeStyles } from "./styles";

describe("makeStyles().page.backgroundColor", () => {
  it("uses the theme's background color when no background is active", () => {
    expect(makeStyles(darkColors).page.backgroundColor).toBe(darkColors.background);
  });

  it("becomes transparent when a background is active", () => {
    expect(makeStyles(darkColors, true).page.backgroundColor).toBe("transparent");
  });
});

describe("makeStyles().page.userSelect / .card.userSelect", () => {
  function stylesOnPlatform(platform: string, isBackgroundActive?: boolean) {
    let page: { userSelect?: string };
    let card: { userSelect?: string };
    jest.isolateModules(() => {
      const RN = require("react-native");
      RN.Platform.OS = platform;
      const { makeStyles } = require("./styles");
      const built = makeStyles(darkColors, isBackgroundActive);
      page = built.page;
      card = built.card;
    });
    return { page: page!, card: card! };
  }

  it("leaves page.userSelect unset when no background is active, even on web", () => {
    expect(stylesOnPlatform("web", false).page.userSelect).toBeUndefined();
  });

  it("sets page.userSelect to 'none' on web once a background is active", () => {
    expect(stylesOnPlatform("web", true).page.userSelect).toBe("none");
  });

  it("leaves page.userSelect unset on native even with a background active", () => {
    expect(stylesOnPlatform("ios", true).page.userSelect).toBeUndefined();
  });

  it("keeps card.userSelect as 'text' on web regardless of background state, overriding page's 'none'", () => {
    expect(stylesOnPlatform("web", true).card.userSelect).toBe("text");
  });

  it("leaves card.userSelect unset on native", () => {
    expect(stylesOnPlatform("ios", true).card.userSelect).toBeUndefined();
  });
});

describe("makeStyles().debugLine.fontFamily", () => {
  it("uses monospace on web", () => {
    let fontFamily: string | undefined;
    jest.isolateModules(() => {
      const RN = require("react-native");
      RN.Platform.OS = "web";
      const { makeStyles } = require("./styles");
      fontFamily = makeStyles(darkColors).debugLine.fontFamily;
    });
    expect(fontFamily).toBe("monospace");
  });

  it("falls back to the system default off web", () => {
    let fontFamily: string | undefined;
    jest.isolateModules(() => {
      const RN = require("react-native");
      RN.Platform.OS = "ios";
      const { makeStyles } = require("./styles");
      fontFamily = makeStyles(darkColors).debugLine.fontFamily;
    });
    expect(fontFamily).toBeUndefined();
  });
});
