import { describe, expect, it } from "vitest";
import { errorMessage, isRetryableError, userFacingErrorMessage } from "./utils.js";

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

describe("userFacingErrorMessage", () => {
  it("rewrites YouTube's sign-in-gate message to the German fallback", () => {
    expect(userFacingErrorMessage(new Error("Sign in to confirm you're not a bot"))).toBe(
      "Dieses Video verlangt eine YouTube-Anmeldung und kann nicht heruntergeladen werden."
    );
  });

  it("matches the sign-in-gate pattern case-insensitively with a curly-apostrophe variant", () => {
    expect(userFacingErrorMessage(new Error("SIGN IN TO CONFIRM YOU’RE NOT A BOT"))).toBe(
      "Dieses Video verlangt eine YouTube-Anmeldung und kann nicht heruntergeladen werden."
    );
  });

  it("passes through a non-matching message unchanged", () => {
    expect(userFacingErrorMessage(new Error("network timeout"))).toBe("network timeout");
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
