import { PHASE_LABELS, type JobPhase } from "./types";

const ALL_PHASES: JobPhase[] = [
  "queued",
  "fetching_info",
  "downloading",
  "converting",
  "merging",
  "done",
  "error",
  "cancelled",
];

describe("PHASE_LABELS", () => {
  it("has a non-empty label for every JobPhase", () => {
    for (const phase of ALL_PHASES) {
      expect(PHASE_LABELS[phase]).toEqual(expect.any(String));
      expect(PHASE_LABELS[phase].length).toBeGreaterThan(0);
    }
  });
});
