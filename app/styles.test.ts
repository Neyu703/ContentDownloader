import { darkColors } from "./theme/colors";

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
