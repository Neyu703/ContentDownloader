import { initI18n } from "../../i18n";
import {
  estimateAudioSizeMB,
  formatDuration,
  formatElapsed,
  formatMB,
  formatSecondsShort,
  generateGroupId,
  isAllPlaylistEntriesSelected,
  isFinishedPhase,
  playlistConfirmLabel,
  sanitizeFilename,
} from "../../lib/format";
import type { PlaylistInfo } from "../../downloader/types";

const translate = initI18n("de").getFixedT("de");

describe("formatMB", () => {
  it("shows MB below 1024", () => {
    expect(formatMB(512)).toBe("512.0 MB");
  });

  it("shows GB at and above 1024", () => {
    expect(formatMB(1024)).toBe("1.00 GB");
    expect(formatMB(2048)).toBe("2.00 GB");
  });
});

describe("estimateAudioSizeMB", () => {
  it("computes the CBR size from duration and bitrate", () => {
    expect(estimateAudioSizeMB(60, 320)).toBeCloseTo((60 * 320 * 1000) / 8 / (1024 * 1024));
  });
});

describe("formatSecondsShort", () => {
  it("shows plain seconds below a minute", () => {
    expect(formatSecondsShort(45)).toBe("45s");
  });

  it("shows minutes:seconds at and above a minute, zero-padded", () => {
    expect(formatSecondsShort(65)).toBe("1:05 min");
    expect(formatSecondsShort(60)).toBe("1:00 min");
  });
});

describe("formatDuration", () => {
  it("omits hours when under an hour", () => {
    expect(formatDuration(125)).toBe("2:05");
  });

  it("includes zero-padded hours when an hour or more", () => {
    expect(formatDuration(3725)).toBe("1:02:05");
  });

  it("rounds fractional seconds, including a carry into the next minute", () => {
    expect(formatDuration(59.6)).toBe("1:00");
  });
});

describe("formatElapsed", () => {
  it("delegates to formatSecondsShort on the floored second count", () => {
    expect(formatElapsed(65_400)).toBe("1:05 min");
  });
});

describe("sanitizeFilename", () => {
  it("strips illegal filesystem characters", () => {
    expect(sanitizeFilename('My<>:"/\\|?*Song')).toBe("MySong");
  });

  it("falls back to 'download' when nothing legal remains", () => {
    expect(sanitizeFilename("<<<>>>")).toBe("download");
  });

  it("leaves a normal name unchanged", () => {
    expect(sanitizeFilename("Normal Name")).toBe("Normal Name");
  });
});

describe("isFinishedPhase", () => {
  it.each(["done", "error", "cancelled"] as const)("treats '%s' as finished", (phase) => {
    expect(isFinishedPhase(phase)).toBe(true);
  });

  it("treats an active phase as not finished", () => {
    expect(isFinishedPhase("downloading")).toBe(false);
  });
});

describe("playlistConfirmLabel", () => {
  it("says nothing is selected at count 0", () => {
    expect(playlistConfirmLabel(translate, "audio", 0)).toBe("Nichts ausgewählt");
  });

  it("uses the singular audio noun at count 1", () => {
    expect(playlistConfirmLabel(translate, "audio", 1)).toBe("1 Audio herunterladen");
  });

  it("uses the plural audio noun above 1", () => {
    expect(playlistConfirmLabel(translate, "audio", 3)).toBe("3 Audios herunterladen");
  });

  it("uses the singular video noun at count 1", () => {
    expect(playlistConfirmLabel(translate, "video", 1)).toBe("1 Video herunterladen");
  });

  it("uses the plural video noun above 1", () => {
    expect(playlistConfirmLabel(translate, "video", 2)).toBe("2 Videos herunterladen");
  });
});

describe("generateGroupId", () => {
  it("returns a non-empty string in the expected shape", () => {
    expect(generateGroupId()).toMatch(/^[0-9a-z]+-[0-9a-z]+$/);
  });

  it("returns a different value on each call", () => {
    expect(generateGroupId()).not.toBe(generateGroupId());
  });
});

describe("isAllPlaylistEntriesSelected", () => {
  const info: PlaylistInfo = {
    title: "P",
    totalCount: 2,
    entries: [
      { id: "a", url: "u", title: "A", thumbnail: null, duration: null },
      { id: "b", url: "u", title: "B", thumbnail: null, duration: null },
    ],
  };

  it("is true when every entry is selected", () => {
    expect(isAllPlaylistEntriesSelected({ info, selected: new Set([0, 1]) })).toBe(true);
  });

  it("is true for the vacuous zero-entries case", () => {
    expect(isAllPlaylistEntriesSelected({ info: { ...info, entries: [] }, selected: new Set() })).toBe(true);
  });

  it("is false when fewer entries are selected", () => {
    expect(isAllPlaylistEntriesSelected({ info, selected: new Set([0]) })).toBe(false);
  });
});
