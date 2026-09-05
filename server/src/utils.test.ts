import { describe, expect, it } from "vitest";
import { errorMessage } from "./utils.js";

describe("errorMessage", () => {
  it("returns the message of a real Error", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("returns the given fallback for a non-Error with a fallback", () => {
    expect(errorMessage("boom", "fallback")).toBe("fallback");
  });

  it("stringifies a non-Error without a fallback", () => {
    expect(errorMessage("boom")).toBe("boom");
    expect(errorMessage(42)).toBe("42");
  });
});
