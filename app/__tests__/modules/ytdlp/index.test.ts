const fakeNativeInstance = { name: "fake-ytdlp-instance" };
const mockRequireNativeModule = jest.fn().mockReturnValue(fakeNativeInstance);

jest.mock("expo-modules-core", () => ({
  NativeModule: class {},
  requireNativeModule: mockRequireNativeModule,
}));

describe("modules/ytdlp default export", () => {
  it("requires the native module under the exact name Kotlin registers ('Ytdlp')", () => {
    let ytdlp: unknown;
    jest.isolateModules(() => {
      ytdlp = require("../../../modules/ytdlp/index").default;
    });
    expect(mockRequireNativeModule).toHaveBeenCalledWith("Ytdlp");
    expect(ytdlp).toBe(fakeNativeInstance);
  });
});
