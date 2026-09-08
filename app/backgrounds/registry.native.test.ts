import { backgroundRegistry } from "./registry.native";

describe("backgroundRegistry (native)", () => {
  it("is empty — no WebGPU-backed background is available on native", () => {
    expect(backgroundRegistry).toEqual([]);
  });
});
