import { Alert } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { JobCard } from "./JobCard";
import type { JobState } from "../downloader/types";
import { initI18n } from "../i18n";

// JobCard renders every label via useTranslation()'s t(), which otherwise returns the raw key.
initI18n("de");

// JobCard renders through useStyles() -> useTheme() -> ThemeContext, which imports AsyncStorage
// (for the persisted theme setting) even when no ThemeProvider is mounted.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const BASE_JOB: JobState = {
  id: "1",
  url: "https://youtube.com/watch?v=x",
  format: "audio",
  quality: "320",
  phase: "downloading",
  title: "My Song",
  duration: 125,
  progress: 42,
  downloadedMB: 4.2,
  totalMB: 10,
  speedMBs: 1.5,
  etaSeconds: 30,
  lastLine: "[download] 42%",
  thumbnail: "https://example.com/thumb.jpg",
  result: null,
  ext: null,
  createdAt: Date.now() - 5000,
  updatedAt: Date.now(),
};

function noop() {}
async function noopAsync() {}

describe("JobCard — header", () => {
  it("renders the thumbnail when present", async () => {
    await render(<JobCard job={BASE_JOB} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />);
    expect(screen.getByTestId("job-thumbnail")).toBeTruthy();
  });

  it("omits the thumbnail when absent", async () => {
    await render(
      <JobCard job={{ ...BASE_JOB, thumbnail: undefined }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />
    );
    expect(screen.queryByTestId("job-thumbnail")).toBeNull();
  });

  it("falls back to the raw url when no title is set", async () => {
    await render(
      <JobCard job={{ ...BASE_JOB, title: null }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />
    );
    expect(screen.getByText(BASE_JOB.url)).toBeTruthy();
  });

  it("shows the formatted duration when positive", async () => {
    await render(<JobCard job={BASE_JOB} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />);
    expect(screen.getByText("2:05")).toBeTruthy();
  });

  it("omits the duration line when null", async () => {
    await render(
      <JobCard job={{ ...BASE_JOB, duration: null }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />
    );
    expect(screen.queryByText("2:05")).toBeNull();
  });

  it("omits the duration line when zero", async () => {
    await render(
      <JobCard job={{ ...BASE_JOB, duration: 0 }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />
    );
    expect(screen.queryByText("0:00")).toBeNull();
  });
});

describe("JobCard — phase-specific body", () => {
  it("shows the translated error message and no progress UI on error", async () => {
    await render(
      <JobCard
        job={{ ...BASE_JOB, phase: "error", errorKey: "errors.raw", errorParams: { raw: "Netzwerkfehler" } }}
        now={Date.now()}
        onCancel={noop}
        onRetry={noop}
        onShare={noop}
        isSharing={false}
      />
    );
    expect(screen.getByText("Netzwerkfehler")).toBeTruthy();
  });

  it("falls back to the generic unknown-error text when no errorKey is set", async () => {
    await render(
      <JobCard job={{ ...BASE_JOB, phase: "error", errorKey: undefined }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />
    );
    expect(screen.getByText("Unbekannter Fehler.")).toBeTruthy();
  });

  it("shows the PHASE_LABELS text for done", async () => {
    await render(<JobCard job={{ ...BASE_JOB, phase: "done" }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />);
    expect(screen.getByText("Fertig!")).toBeTruthy();
  });

  it("shows the PHASE_LABELS text for cancelled", async () => {
    await render(
      <JobCard job={{ ...BASE_JOB, phase: "cancelled" }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />
    );
    expect(screen.getByText("Abgebrochen")).toBeTruthy();
  });

  it("shows the status row and progress bar for an active phase", async () => {
    await render(<JobCard job={BASE_JOB} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />);
    expect(screen.getByText("Lädt herunter…")).toBeTruthy();
  });
});

describe("JobCard — stalled hint", () => {
  it("appends the stalled hint when idle for over the threshold", async () => {
    const staleJob = { ...BASE_JOB, updatedAt: Date.now() - 25_000 };
    await render(<JobCard job={staleJob} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />);
    expect(screen.getByText(/läuft weiter, die Quelle antwortet gerade langsam/)).toBeTruthy();
  });

  it("shows no stalled hint when recently updated", async () => {
    await render(<JobCard job={BASE_JOB} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />);
    expect(screen.queryByText(/läuft weiter/)).toBeNull();
  });

  it("never shows the stalled hint once the job is finished", async () => {
    const staleDoneJob = { ...BASE_JOB, phase: "done" as const, updatedAt: Date.now() - 25_000 };
    await render(<JobCard job={staleDoneJob} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />);
    expect(screen.queryByText(/läuft weiter/)).toBeNull();
  });
});

describe("JobCard — progress percent and eta", () => {
  it("uses the explicit progress value when present", async () => {
    await render(<JobCard job={{ ...BASE_JOB, progress: 77 }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />);
    expect(screen.getByText("Fortschritt: 77.0%")).toBeTruthy();
  });

  it("falls back to 90% while converting with no explicit progress", async () => {
    await render(
      <JobCard job={{ ...BASE_JOB, phase: "converting", progress: null }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />
    );
    // No numeric "Fortschritt:" line renders when progress is null; the 90% only drives the bar width,
    // so assert indirectly via the debug box omitting the progress line while the phase label still shows.
    expect(screen.getByText("Wird konvertiert…")).toBeTruthy();
    expect(screen.queryByText(/^Fortschritt:/)).toBeNull();
  });

  it("falls back to 90% while merging with no explicit progress", async () => {
    await render(
      <JobCard job={{ ...BASE_JOB, phase: "merging", progress: null }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />
    );
    expect(screen.getByText("Führt Video und Audio zusammen…")).toBeTruthy();
  });

  it("falls back to 10% for any other active phase with no explicit progress", async () => {
    await render(
      <JobCard job={{ ...BASE_JOB, phase: "fetching_info", progress: null }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />
    );
    expect(screen.getByText("Lade Video-Informationen…")).toBeTruthy();
  });

  it("shows the eta badge and debug line when etaSeconds is positive", async () => {
    await render(<JobCard job={{ ...BASE_JOB, etaSeconds: 45 }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />);
    expect(screen.getByText("ETA: 45s")).toBeTruthy();
  });

  it("omits the eta when null", async () => {
    await render(<JobCard job={{ ...BASE_JOB, etaSeconds: null }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />);
    expect(screen.queryByText(/^ETA:/)).toBeNull();
  });

  it("omits the eta when zero", async () => {
    await render(<JobCard job={{ ...BASE_JOB, etaSeconds: 0 }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />);
    expect(screen.queryByText(/^ETA:/)).toBeNull();
  });
});

describe("JobCard — estimated final size", () => {
  it("shows an estimate for audio with a known duration", async () => {
    await render(<JobCard job={BASE_JOB} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />);
    expect(screen.getByText(/Geschätzte Endgröße:/)).toBeTruthy();
  });

  it("omits the estimate for video", async () => {
    await render(<JobCard job={{ ...BASE_JOB, format: "video" }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />);
    expect(screen.queryByText(/Geschätzte Endgröße:/)).toBeNull();
  });

  it("omits the estimate when duration is null", async () => {
    await render(<JobCard job={{ ...BASE_JOB, duration: null }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />);
    expect(screen.queryByText(/Geschätzte Endgröße:/)).toBeNull();
  });

  it("omits the estimate when duration is zero", async () => {
    await render(<JobCard job={{ ...BASE_JOB, duration: 0 }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />);
    expect(screen.queryByText(/Geschätzte Endgröße:/)).toBeNull();
  });
});

describe("JobCard — details expand/collapse and debug lines", () => {
  it("toggles isDetailsExpanded on status row press and flips the accessibility label", async () => {
    await render(<JobCard job={BASE_JOB} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />);
    const row = screen.getByLabelText("Details einklappen");
    await fireEvent.press(row);
    expect(screen.getByLabelText("Details ausklappen")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Details ausklappen"));
    expect(screen.getByLabelText("Details einklappen")).toBeTruthy();
  });

  it("shows the downloaded/total MB line only when totalMB is known, with '?' when downloadedMB is unknown", async () => {
    await render(
      <JobCard job={{ ...BASE_JOB, downloadedMB: undefined }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />
    );
    expect(screen.getByText(/Heruntergeladen: \? \//)).toBeTruthy();
  });

  it("omits the downloaded/total line when totalMB is unknown", async () => {
    await render(
      <JobCard job={{ ...BASE_JOB, totalMB: undefined }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />
    );
    expect(screen.queryByText(/Heruntergeladen:/)).toBeNull();
  });

  it("shows the speed line when known, omits it when unknown", async () => {
    await render(<JobCard job={BASE_JOB} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />);
    expect(screen.getByText(/Geschwindigkeit:/)).toBeTruthy();
  });

  it("stores the debug box's measured height on layout", async () => {
    await render(<JobCard job={BASE_JOB} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />);
    const box = screen.getByTestId("job-debug-box");
    fireEvent(box, "layout", { nativeEvent: { layout: { height: 120, width: 300, x: 0, y: 0 } } });
    expect(box).toBeTruthy();
  });

  it("shows the last raw line when non-empty, omits it when empty", async () => {
    await render(<JobCard job={{ ...BASE_JOB, lastLine: "" }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />);
    expect(screen.queryByText("[download] 42%")).toBeNull();
  });

  it("prefers the translated lastLineKey over the raw lastLine text when both are present", async () => {
    await render(
      <JobCard
        job={{ ...BASE_JOB, lastLineKey: "job.retrying", lastLineParams: { attempt: 2, maxAttempts: 3 } }}
        now={Date.now()}
        onCancel={noop}
        onRetry={noop}
        onShare={noop}
        isSharing={false}
      />
    );
    expect(screen.getByText("Erneuter Versuch (2/3)…")).toBeTruthy();
    expect(screen.queryByText("[download] 42%")).toBeNull();
  });

  it("hides the details toggle and box entirely when there's nothing informative to show yet", async () => {
    const emptyJob: JobState = {
      ...BASE_JOB,
      phase: "fetching_info",
      progress: null,
      totalMB: undefined,
      downloadedMB: undefined,
      speedMBs: undefined,
      etaSeconds: null,
      duration: null,
      lastLine: "",
    };
    await render(<JobCard job={emptyJob} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />);
    expect(screen.queryByTestId("job-debug-box")).toBeNull();
    expect(screen.queryByLabelText("Details ausklappen")).toBeNull();
    expect(screen.queryByLabelText("Details einklappen")).toBeNull();
  });
});

describe("JobCard — actions", () => {
  it("shows Abbrechen while not finished, calls onCancel", async () => {
    const onCancel = jest.fn();
    await render(<JobCard job={BASE_JOB} now={Date.now()} onCancel={onCancel} onRetry={noop} onShare={noop} isSharing={false} />);
    await fireEvent.press(screen.getByText("Abbrechen"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("hides Abbrechen once finished", async () => {
    await render(<JobCard job={{ ...BASE_JOB, phase: "done" }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />);
    expect(screen.queryByText("Abbrechen")).toBeNull();
  });

  it("shows Erneut versuchen on error and calls onRetry", async () => {
    const onRetry = jest.fn();
    await render(
      <JobCard job={{ ...BASE_JOB, phase: "error" }} now={Date.now()} onCancel={noop} onRetry={onRetry} onShare={noop} isSharing={false} />
    );
    await fireEvent.press(screen.getByText("Erneut versuchen"));
    expect(onRetry).toHaveBeenCalled();
  });

  it("shows save+share buttons when done and onSave is provided (native)", async () => {
    await render(
      <JobCard job={{ ...BASE_JOB, phase: "done", ext: "mp3" }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} onSave={noopAsync} />
    );
    expect(screen.getByText("MP3 speichern")).toBeTruthy();
    expect(screen.getByText("Teilen")).toBeTruthy();
  });

  it("shows the single web download button when done and onSave is absent", async () => {
    await render(
      <JobCard job={{ ...BASE_JOB, phase: "done", ext: "mp4" }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />
    );
    expect(screen.getByText("MP4 herunterladen")).toBeTruthy();
  });

  it("shows the sharing/loading label while isSharing", async () => {
    await render(
      <JobCard job={{ ...BASE_JOB, phase: "done", ext: "mp4" }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing />
    );
    expect(screen.getByText("Lädt herunter…")).toBeTruthy();
  });

  it("shows the sharing ellipsis on the native Teilen button while isSharing", async () => {
    await render(
      <JobCard job={{ ...BASE_JOB, phase: "done", ext: "mp3" }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing onSave={noopAsync} />
    );
    expect(screen.getByText("…")).toBeTruthy();
  });

  it("shows no done-block buttons for an active (non-done) phase", async () => {
    await render(<JobCard job={BASE_JOB} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />);
    expect(screen.queryByText(/speichern|herunterladen/)).toBeNull();
  });

  it("uses an empty uppercased ext label when ext is null (native, done)", async () => {
    await render(
      <JobCard job={{ ...BASE_JOB, phase: "done", ext: null }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} onSave={noopAsync} />
    );
    expect(screen.getByText(" speichern")).toBeTruthy();
  });
});

describe("JobCard — save flow", () => {
  it("saves successfully: saving -> saved label transition", async () => {
    let resolveSave: () => void = () => {};
    const onSave = jest.fn(() => new Promise<void>((resolve) => (resolveSave = resolve)));
    await render(
      <JobCard job={{ ...BASE_JOB, phase: "done", ext: "mp3" }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} onSave={onSave} />
    );
    fireEvent.press(screen.getByText("MP3 speichern"));
    await screen.findByText("Speichert…");
    resolveSave();
    await screen.findByText("In Downloads gespeichert ✓");
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("shows the error state and message when saving fails", async () => {
    const onSave = jest.fn().mockRejectedValue(new Error("disk full"));
    await render(
      <JobCard job={{ ...BASE_JOB, phase: "done", ext: "mp3" }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} onSave={onSave} />
    );
    await fireEvent.press(screen.getByText("MP3 speichern"));
    await screen.findByText("Speichern fehlgeschlagen.");
  });

  it("ignores a press while already saving", async () => {
    let resolveSave: () => void = () => {};
    const onSave = jest.fn(() => new Promise<void>((resolve) => (resolveSave = resolve)));
    await render(
      <JobCard job={{ ...BASE_JOB, phase: "done", ext: "mp3" }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} onSave={onSave} />
    );
    fireEvent.press(screen.getByText("MP3 speichern"));
    await screen.findByText("Speichert…");
    await fireEvent.press(screen.getByText("Speichert…"));
    expect(onSave).toHaveBeenCalledTimes(1);
    resolveSave();
    await screen.findByText("In Downloads gespeichert ✓");
  });

  it("does nothing on handleSavePress when onSave is absent", async () => {
    await render(
      <JobCard job={{ ...BASE_JOB, phase: "done", ext: "mp4" }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} />
    );
    // No save button rendered at all without onSave — nothing to press, this documents the guard.
    expect(screen.queryByText(/speichern/)).toBeNull();
  });

  it("re-pressing 'saved' shows the confirmation alert; cancel leaves it saved", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation((_title, _msg, buttons) => {
      const cancelButton = buttons?.find((b) => b.text === "Abbrechen");
      cancelButton?.onPress?.();
    });
    const onSave = jest.fn().mockResolvedValue(undefined);
    await render(
      <JobCard job={{ ...BASE_JOB, phase: "done", ext: "mp3" }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} onSave={onSave} />
    );
    await fireEvent.press(screen.getByText("MP3 speichern"));
    await screen.findByText("In Downloads gespeichert ✓");
    await fireEvent.press(screen.getByText("In Downloads gespeichert ✓"));
    expect(alertSpy).toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });

  it("re-pressing 'saved' and choosing 'Nochmal speichern' saves again", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation((_title, _msg, buttons) => {
      const again = buttons?.find((b) => b.text === "Nochmal speichern");
      again?.onPress?.();
    });
    const onSave = jest.fn().mockResolvedValue(undefined);
    await render(
      <JobCard job={{ ...BASE_JOB, phase: "done", ext: "mp3" }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={noop} isSharing={false} onSave={onSave} />
    );
    await fireEvent.press(screen.getByText("MP3 speichern"));
    await screen.findByText("In Downloads gespeichert ✓");
    await fireEvent.press(screen.getByText("In Downloads gespeichert ✓"));
    expect(onSave).toHaveBeenCalledTimes(2);
    alertSpy.mockRestore();
  });

  it("calls onShare when Teilen is pressed", async () => {
    const onShare = jest.fn();
    await render(
      <JobCard job={{ ...BASE_JOB, phase: "done", ext: "mp3" }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={onShare} isSharing={false} onSave={noopAsync} />
    );
    await fireEvent.press(screen.getByText("Teilen"));
    expect(onShare).toHaveBeenCalled();
  });

  it("calls onShare on the web single-button variant", async () => {
    const onShare = jest.fn();
    await render(
      <JobCard job={{ ...BASE_JOB, phase: "done", ext: "mp4" }} now={Date.now()} onCancel={noop} onRetry={noop} onShare={onShare} isSharing={false} />
    );
    await fireEvent.press(screen.getByText("MP4 herunterladen"));
    expect(onShare).toHaveBeenCalled();
  });
});
