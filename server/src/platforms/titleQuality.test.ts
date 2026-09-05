import { describe, expect, it } from "vitest";
import { isLowQualityTitle, pickTitle } from "./titleQuality.js";

describe("isLowQualityTitle", () => {
  it("flags Instagram's synthesized 'Video by X' placeholder", () => {
    expect(isLowQualityTitle("Video by dubisthalle")).toBe(true);
  });

  it("flags Instagram's synthesized 'Photo by X' placeholder", () => {
    expect(isLowQualityTitle("Photo by someone")).toBe(true);
  });

  it("flags a bare hashtag (TikTok)", () => {
    expect(isLowQualityTitle("#foryou")).toBe(true);
  });

  it("flags an empty/whitespace-only title", () => {
    expect(isLowQualityTitle("   ")).toBe(true);
  });

  it("does not flag a real title", () => {
    expect(isLowQualityTitle("How to bake bread")).toBe(false);
  });
});

describe("pickTitle", () => {
  it("uses the title as-is when it's not low quality", () => {
    expect(pickTitle({ title: "How to bake bread" })).toBe("How to bake bread");
  });

  it("falls back to the first non-empty caption line when the title is a placeholder", () => {
    expect(pickTitle({ title: "Video by dubisthalle", description: "\n\nMy trip to the mountains\nmore text" })).toBe(
      "My trip to the mountains"
    );
  });

  it("truncates a very long caption fallback to 100 characters with an ellipsis", () => {
    const longCaption = "a".repeat(150);
    const result = pickTitle({ title: "#foryou", description: longCaption });
    expect(result).toBe(`${"a".repeat(100)}…`);
  });

  it("skips a caption that is itself low quality", () => {
    expect(pickTitle({ title: "Video by dubisthalle", description: "#foryou", uploader: "dubisthalle" })).toBe(
      "dubisthalle"
    );
  });

  it("treats a whitespace-only description as no caption at all", () => {
    expect(
      pickTitle({ title: "Video by dubisthalle", description: "   \n   ", uploader: "dubisthalle", uploadDate: "20260115" })
    ).toBe("dubisthalle - 2026-01-15");
  });

  it("composes uploader + formatted upload date when there's no usable title or caption", () => {
    expect(pickTitle({ title: "Video by dubisthalle", uploader: "dubisthalle", uploadDate: "20260115" })).toBe(
      "dubisthalle - 2026-01-15"
    );
  });

  it("uses just the uploader when there's no upload date", () => {
    expect(pickTitle({ title: "#foryou", uploader: "someuser" })).toBe("someuser");
  });

  it("ignores a malformed upload date", () => {
    expect(pickTitle({ title: "Video by X", uploader: "X", uploadDate: "not-a-date" })).toBe("X");
  });

  it("falls back to the placeholder title when nothing else is available", () => {
    expect(pickTitle({ title: "Video by dubisthalle" })).toBe("Video by dubisthalle");
  });

  it("falls back to the id when there's no title at all", () => {
    expect(pickTitle({ id: "ABC123" })).toBe("ABC123");
  });

  it("falls back to 'Unknown title' when nothing at all is available", () => {
    expect(pickTitle({})).toBe("Unknown title");
  });
});
