describe("styles.debugLine.fontFamily", () => {
  it("uses monospace on web", () => {
    let styles: typeof import("./styles").styles;
    jest.isolateModules(() => {
      const RN = require("react-native");
      RN.Platform.OS = "web";
      styles = require("./styles").styles;
    });
    expect(styles!.debugLine.fontFamily).toBe("monospace");
  });

  it("falls back to the system default off web", () => {
    let styles: typeof import("./styles").styles;
    jest.isolateModules(() => {
      const RN = require("react-native");
      RN.Platform.OS = "ios";
      styles = require("./styles").styles;
    });
    expect(styles!.debugLine.fontFamily).toBeUndefined();
  });
});
