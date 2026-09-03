import { describe, expect, it } from "vitest";
import { errorMessage, isRetryableError, userFacingError } from "./utils.js";

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

describe("userFacingError", () => {
  it("rewrites YouTube's sign-in-gate message to the sign-in-required key", () => {
    expect(userFacingError(new Error("Sign in to confirm you're not a bot"))).toEqual({
      key: "errors.signInRequired",
    });
  });

  it("matches the sign-in-gate pattern case-insensitively with a curly-apostrophe variant", () => {
    expect(userFacingError(new Error("SIGN IN TO CONFIRM YOU’RE NOT A BOT"))).toEqual({
      key: "errors.signInRequired",
    });
  });

  it("passes through a non-matching message as the raw key's param", () => {
    expect(userFacingError(new Error("network timeout"))).toEqual({
      key: "errors.raw",
      params: { raw: "network timeout" },
    });
  });

  it("uses the fallback as the raw param when err isn't an Error instance", () => {
    expect(userFacingError("boom", "fallback")).toEqual({
      key: "errors.raw",
      params: { raw: "fallback" },
    });
  });
});

describe("isRetryableError", () => {
  it("is false for the known-permanent sign-in gate", () => {
    expect(isRetryableError(new Error("ERROR: Sign in to confirm you're not a bot"))).toBe(false);
  });

  it("is true for any other error", () => {
    expect(isRetryableError(new Error("HTTP Error 403: Forbidden"))).toBe(true);
  });
});
