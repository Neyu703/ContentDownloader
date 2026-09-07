import { looksLikeNetscapeCookiesFile } from "./cookies";

describe("looksLikeNetscapeCookiesFile", () => {
  it("accepts a real Netscape cookies.txt export", () => {
    const content = [
      "# Netscape HTTP Cookie File",
      "# https://curl.haxx.se/rfc/cookie_spec.html",
      "",
      ".youtube.com\tTRUE\t/\tTRUE\t1805995942\tLOGIN_INFO\tsomevalue",
      ".youtube.com\tTRUE\t/\tFALSE\t0\tYSC\tanothervalue",
    ].join("\n");
    expect(looksLikeNetscapeCookiesFile(content)).toBe(true);
  });

  it("rejects empty content", () => {
    expect(looksLikeNetscapeCookiesFile("")).toBe(false);
  });

  it("rejects content that is only comments and blank lines", () => {
    expect(looksLikeNetscapeCookiesFile("# Netscape HTTP Cookie File\n\n  \n")).toBe(false);
  });

  it("rejects a data line with the wrong number of tab-separated fields", () => {
    const content = "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\tLOGIN_INFO\tsomevalue";
    expect(looksLikeNetscapeCookiesFile(content)).toBe(false);
  });

  it("rejects arbitrary pasted text", () => {
    expect(looksLikeNetscapeCookiesFile("hello world, this is not a cookies file")).toBe(false);
  });
});
