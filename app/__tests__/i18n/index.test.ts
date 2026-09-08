import type i18next from "i18next";

/** Requires a fresh copy of "../../i18n/index" so each test controls whether i18next starts uninitialized. */
function freshI18nModule(): typeof import("../../i18n/index") {
  let mod!: typeof import("../../i18n/index");
  jest.isolateModules(() => {
    mod = require("../../i18n/index");
  });
  return mod;
}

describe("initI18n", () => {
  it("initializes i18next with the given language on first call", () => {
    const { initI18n } = freshI18nModule();
    const instance = initI18n("de");
    expect(instance.isInitialized).toBe(true);
    expect(instance.language).toBe("de");
  });

  it("is idempotent: a second call just switches the language instead of re-initializing", () => {
    const { initI18n } = freshI18nModule();
    const first = initI18n("de");
    const second = initI18n("en");
    expect(second).toBe(first);
    expect(second.language).toBe("en");
  });

  it("translates a known key in the requested language", () => {
    const { initI18n } = freshI18nModule();
    const instance: typeof i18next = initI18n("en");
    expect(instance.t("settings.title")).toBe("Settings");
  });
});

describe("resources / SUPPORTED_LANGUAGES", () => {
  it("exposes exactly the German and English resource bundles", () => {
    const { resources, SUPPORTED_LANGUAGES } = freshI18nModule();
    expect(SUPPORTED_LANGUAGES).toEqual(["de", "en"]);
    expect(Object.keys(resources)).toEqual(["de", "en"]);
  });
});
