import AsyncStorage from "@react-native-async-storage/async-storage";
import { checkForVersionUpdate, getLastSeenVersion, setLastSeenVersion } from "../../changelog/lastSeenVersion";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

afterEach(async () => {
  await AsyncStorage.clear();
});

describe("getLastSeenVersion / setLastSeenVersion", () => {
  it("returns null when nothing was ever recorded", async () => {
    await expect(getLastSeenVersion()).resolves.toBeNull();
  });

  it("returns the recorded version after setLastSeenVersion", async () => {
    await setLastSeenVersion("1.2.3");
    await expect(getLastSeenVersion()).resolves.toBe("1.2.3");
  });
});

describe("checkForVersionUpdate", () => {
  it("returns false on a fresh install (no stored value) and records the current version", async () => {
    await expect(checkForVersionUpdate("1.5.0")).resolves.toBe(false);
    await expect(getLastSeenVersion()).resolves.toBe("1.5.0");
  });

  it("returns false when the stored version already matches the current version", async () => {
    await setLastSeenVersion("1.5.0");
    await expect(checkForVersionUpdate("1.5.0")).resolves.toBe(false);
  });

  it("returns true when a stored version exists and differs from the current version", async () => {
    await setLastSeenVersion("1.4.0");
    await expect(checkForVersionUpdate("1.5.0")).resolves.toBe(true);
  });

  it("always persists currentVersion, even when returning true", async () => {
    await setLastSeenVersion("1.4.0");
    await checkForVersionUpdate("1.5.0");
    await expect(getLastSeenVersion()).resolves.toBe("1.5.0");
  });
});
