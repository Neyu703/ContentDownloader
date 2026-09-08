import type { Downloader } from "../../downloader/types";

// index.web.ts resolves translated text via the shared i18n instance. freshDownloaderFrom()'s
// jest.isolateModules() gives each downloader its own fresh copy of that instance, so it has to be
// initialized inside the same isolated registry rather than once at the top of this file.
function freshDownloader(): Downloader {
  let downloader!: Downloader;
  jest.isolateModules(() => {
    (require("../../i18n") as typeof import("../../i18n")).initI18n("de");
    downloader = (require("../../downloader/index.web") as typeof import("../../downloader/index.web")).downloader;
  });
  return downloader;
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

beforeEach(() => {
  jest.useFakeTimers();
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("subscribe / notify", () => {
  it("delivers jobs sorted by createdAt ascending", async () => {
    const downloader = freshDownloader();
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ service: "content-downloader-server" })) // ping for first enqueue
      .mockResolvedValueOnce(jsonResponse({ jobId: "second" }))
      .mockResolvedValueOnce(jsonResponse({ service: "content-downloader-server" })) // ping for second enqueue
      .mockResolvedValueOnce(jsonResponse({ jobId: "first" }));

    await downloader.enqueue({ url: "u1", format: "audio", quality: "320" });
    await downloader.enqueue({ url: "u2", format: "audio", quality: "320" });

    const listener = jest.fn();
    downloader.subscribe(listener);
    const [jobsArg] = listener.mock.calls[0];
    expect(jobsArg.map((j: { id: string }) => j.id)).toEqual(["second", "first"]);
  });

  it("unsubscribe stops further notifications", async () => {
    const downloader = freshDownloader();
    const listener = jest.fn();
    const unsubscribe = downloader.subscribe(listener);
    listener.mockClear();
    unsubscribe();
    downloader.clearFinished();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("enqueue", () => {
  it("throws when the server is unreachable", async () => {
    const downloader = freshDownloader();
    jest.mocked(fetch).mockRejectedValueOnce(new Error("network down"));
    await expect(downloader.enqueue({ url: "u", format: "audio", quality: "320" })).rejects.toThrow(
      /nicht erreichbar/
    );
  });

  it("treats an ok response with a mismatched service field as unreachable", async () => {
    const downloader = freshDownloader();
    jest.mocked(fetch).mockResolvedValueOnce(jsonResponse({ service: "something-else" }));
    await expect(downloader.enqueue({ url: "u", format: "audio", quality: "320" })).rejects.toThrow(
      /nicht erreichbar/
    );
  });

  it("treats a non-ok ping response as unreachable", async () => {
    const downloader = freshDownloader();
    jest.mocked(fetch).mockResolvedValueOnce(jsonResponse({}, false));
    await expect(downloader.enqueue({ url: "u", format: "audio", quality: "320" })).rejects.toThrow(
      /nicht erreichbar/
    );
  });

  it("aborts the ping and treats the server as unreachable once PING_TIMEOUT_MS elapses", async () => {
    const downloader = freshDownloader();
    jest.mocked(fetch).mockImplementationOnce(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          (options as RequestInit).signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        })
    );
    const result = downloader.enqueue({ url: "u", format: "audio", quality: "320" });
    const assertion = expect(result).rejects.toThrow(/nicht erreichbar/);
    await jest.advanceTimersByTimeAsync(2000);
    await assertion;
  });

  it("throws parseError's message when /api/convert itself fails", async () => {
    const downloader = freshDownloader();
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ service: "content-downloader-server" }))
      .mockResolvedValueOnce(jsonResponse({ errorKey: "errors.invalidUrl" }, false));
    await expect(downloader.enqueue({ url: "u", format: "audio", quality: "320" })).rejects.toThrow(
      "Bitte einen gültigen Link angeben."
    );
  });

  it("creates a job with every optional field's ?? fallback when provided", async () => {
    const downloader = freshDownloader();
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ service: "content-downloader-server" }))
      .mockResolvedValueOnce(jsonResponse({ jobId: "j1" }));
    const listener = jest.fn();
    downloader.subscribe(listener);
    listener.mockClear();

    await downloader.enqueue({
      url: "u",
      format: "audio",
      quality: "320",
      title: "T",
      durationSeconds: 42,
      thumbnail: "thumb.jpg",
      groupId: "g1",
      groupTitle: "Group",
    });

    const [jobsArg] = listener.mock.calls.at(-1)!;
    expect(jobsArg[0]).toMatchObject({
      title: "T",
      duration: 42,
      thumbnail: "thumb.jpg",
      groupId: "g1",
      groupTitle: "Group",
      phase: "queued",
    });
  });

  it("creates a job with every optional field's ?? null fallback when omitted", async () => {
    const downloader = freshDownloader();
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ service: "content-downloader-server" }))
      .mockResolvedValueOnce(jsonResponse({ jobId: "j1" }));
    const listener = jest.fn();
    downloader.subscribe(listener);
    listener.mockClear();

    await downloader.enqueue({ url: "u", format: "audio", quality: "320" });

    const [jobsArg] = listener.mock.calls.at(-1)!;
    expect(jobsArg[0]).toMatchObject({
      title: null,
      duration: null,
      thumbnail: null,
      groupId: null,
      groupTitle: null,
    });
  });
});

describe("pollJob (driven via enqueue + fake timers)", () => {
  async function enqueueAndGetId(downloader: Downloader) {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ service: "content-downloader-server" }))
      .mockResolvedValueOnce(jsonResponse({ jobId: "job-1" }));
    return downloader.enqueue({ url: "u", format: "audio", quality: "320" });
  }

  it("moves to error and stops polling when the job endpoint responds non-ok", async () => {
    const downloader = freshDownloader();
    await enqueueAndGetId(downloader);
    const listener = jest.fn();
    downloader.subscribe(listener);

    jest
      .mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ errorKey: "errors.raw", errorParams: { raw: "gone" } }, false));
    await jest.advanceTimersByTimeAsync(600);

    const [jobsArg] = listener.mock.calls.at(-1)!;
    expect(jobsArg[0]).toMatchObject({
      phase: "error",
      errorKey: "errors.raw",
      errorParams: { raw: "gone" },
    });
  });

  it("resolves to done when stage is done with resultId/title/ext all present", async () => {
    const downloader = freshDownloader();
    await enqueueAndGetId(downloader);
    const listener = jest.fn();
    downloader.subscribe(listener);

    jest
      .mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ stage: "done", resultId: "r1", title: "My Song", ext: "mp3" }));
    await jest.advanceTimersByTimeAsync(600);

    const [jobsArg] = listener.mock.calls.at(-1)!;
    expect(jobsArg[0]).toMatchObject({ phase: "done", title: "My Song", ext: "mp3", progress: 100 });
    expect(jobsArg[0].result).toContain("/api/download/r1?name=My%20Song");
  });

  it("falls through to the generic in-progress mapping when 'done' is missing a required field", async () => {
    const downloader = freshDownloader();
    await enqueueAndGetId(downloader);
    const listener = jest.fn();
    downloader.subscribe(listener);

    jest.mocked(fetch).mockResolvedValueOnce(jsonResponse({ stage: "done", message: "…", progress: 50 }));
    await jest.advanceTimersByTimeAsync(600);

    // STAGE_TO_PHASE still maps "done" -> "done", but going through the generic branch (missing
    // resultId/title/ext) means `result` never gets set, unlike the dedicated done-handling branch.
    const [jobsArg] = listener.mock.calls.at(-1)!;
    expect(jobsArg[0].result).toBeNull();
  });

  it("uses the job's own errorKey/errorParams when present", async () => {
    const downloader = freshDownloader();
    await enqueueAndGetId(downloader);
    const listener = jest.fn();
    downloader.subscribe(listener);

    jest
      .mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({ stage: "error", errorKey: "errors.raw", errorParams: { raw: "boom" } })
      );
    await jest.advanceTimersByTimeAsync(600);

    const [jobsArg] = listener.mock.calls.at(-1)!;
    expect(jobsArg[0]).toMatchObject({
      phase: "error",
      errorKey: "errors.raw",
      errorParams: { raw: "boom" },
    });
  });

  it("falls back to errors.unknown when the job stage is error but errorKey is absent", async () => {
    const downloader = freshDownloader();
    await enqueueAndGetId(downloader);
    const listener = jest.fn();
    downloader.subscribe(listener);

    jest.mocked(fetch).mockResolvedValueOnce(jsonResponse({ stage: "error" }));
    await jest.advanceTimersByTimeAsync(600);

    const [jobsArg] = listener.mock.calls.at(-1)!;
    expect(jobsArg[0]).toMatchObject({ phase: "error", errorKey: "errors.unknown" });
  });

  it("maps an in-progress stage and parses a present eta", async () => {
    const downloader = freshDownloader();
    await enqueueAndGetId(downloader);
    const listener = jest.fn();
    downloader.subscribe(listener);

    jest
      .mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ stage: "downloading", message: "…", progress: 10, eta: "1:05" }));
    await jest.advanceTimersByTimeAsync(600);

    const [jobsArg] = listener.mock.calls.at(-1)!;
    expect(jobsArg[0]).toMatchObject({ phase: "downloading", progress: 10, etaSeconds: 65 });
  });

  it("sets etaSeconds to null when eta is absent", async () => {
    const downloader = freshDownloader();
    await enqueueAndGetId(downloader);
    const listener = jest.fn();
    downloader.subscribe(listener);

    jest.mocked(fetch).mockResolvedValueOnce(jsonResponse({ stage: "downloading", message: "…", progress: 10 }));
    await jest.advanceTimersByTimeAsync(600);

    const [jobsArg] = listener.mock.calls.at(-1)!;
    expect(jobsArg[0].etaSeconds).toBeNull();
  });

  it("moves to error and stops polling when fetch itself throws", async () => {
    const downloader = freshDownloader();
    await enqueueAndGetId(downloader);
    const listener = jest.fn();
    downloader.subscribe(listener);

    jest.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    await jest.advanceTimersByTimeAsync(600);

    const [jobsArg] = listener.mock.calls.at(-1)!;
    expect(jobsArg[0]).toMatchObject({ phase: "error", errorKey: "errors.serverUnreachable" });
    expect(jobsArg[0].errorParams?.serverUrl).toContain("localhost");
  });
});

describe("parseEtaToSeconds (via the in-progress mapping)", () => {
  async function pollWithEta(eta: string) {
    const downloader = freshDownloader();
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ service: "content-downloader-server" }))
      .mockResolvedValueOnce(jsonResponse({ jobId: "job-1" }));
    await downloader.enqueue({ url: "u", format: "audio", quality: "320" });
    const listener = jest.fn();
    downloader.subscribe(listener);
    jest.mocked(fetch).mockResolvedValueOnce(jsonResponse({ stage: "downloading", message: "…", progress: 1, eta }));
    await jest.advanceTimersByTimeAsync(600);
    return listener.mock.calls.at(-1)![0][0].etaSeconds;
  }

  it("parses M:SS", async () => {
    expect(await pollWithEta("1:05")).toBe(65);
  });

  it("parses H:MM:SS", async () => {
    expect(await pollWithEta("1:02:05")).toBe(3725);
  });

  it("returns null for fewer than 2 parts", async () => {
    expect(await pollWithEta("5")).toBeNull();
  });

  it("returns null for more than 3 parts", async () => {
    expect(await pollWithEta("1:02:03:04")).toBeNull();
  });

  it("returns null when a part isn't numeric", async () => {
    expect(await pollWithEta("x:05")).toBeNull();
  });
});

describe("getVideoInfo / getPlaylistInfo", () => {
  it("getVideoInfo returns the parsed body on success", async () => {
    const downloader = freshDownloader();
    const info = { title: "T", duration: 1, thumbnail: null, uploader: null };
    jest.mocked(fetch).mockResolvedValueOnce(jsonResponse(info));
    await expect(downloader.getVideoInfo!("u")).resolves.toEqual(info);
  });

  it("getVideoInfo throws parseError's message on failure", async () => {
    const downloader = freshDownloader();
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ errorKey: "errors.raw", errorParams: { raw: "bad url" } }, false));
    await expect(downloader.getVideoInfo!("u")).rejects.toThrow("bad url");
  });

  it("getPlaylistInfo returns the parsed body on success", async () => {
    const downloader = freshDownloader();
    const info = { title: "P", entries: [], totalCount: 0 };
    jest.mocked(fetch).mockResolvedValueOnce(jsonResponse(info));
    await expect(downloader.getPlaylistInfo("u", 1)).resolves.toEqual(info);
  });

  it("getPlaylistInfo throws parseError's message on failure", async () => {
    const downloader = freshDownloader();
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ errorKey: "errors.raw", errorParams: { raw: "nope" } }, false));
    await expect(downloader.getPlaylistInfo("u", 1)).rejects.toThrow("nope");
  });
});

describe("importCookies / getCookiesStatus / clearCookies", () => {
  it("importCookies posts the cookies text as JSON", async () => {
    const downloader = freshDownloader();
    jest.mocked(fetch).mockResolvedValueOnce(jsonResponse({ ok: true }));
    await downloader.importCookies("# Netscape HTTP Cookie File\n");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/cookies"),
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookies: "# Netscape HTTP Cookie File\n" }),
      })
    );
  });

  it("importCookies throws parseError's message on failure", async () => {
    const downloader = freshDownloader();
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ errorKey: "errors.raw", errorParams: { raw: "empty" } }, false));
    await expect(downloader.importCookies("")).rejects.toThrow("empty");
  });

  it("getCookiesStatus returns the parsed body on success", async () => {
    const downloader = freshDownloader();
    const status = { present: true, updatedAt: "2026-09-07T12:00:00.000Z" };
    jest.mocked(fetch).mockResolvedValueOnce(jsonResponse(status));
    await expect(downloader.getCookiesStatus()).resolves.toEqual(status);
  });

  it("clearCookies sends a DELETE request", async () => {
    const downloader = freshDownloader();
    jest.mocked(fetch).mockResolvedValueOnce(jsonResponse({ ok: true }));
    await downloader.clearCookies();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/cookies"), expect.objectContaining({ method: "DELETE" }));
  });
});

describe("parseError (indirectly, via a response whose json() throws)", () => {
  it("falls back to the generic message when json() parsing itself fails", async () => {
    const downloader = freshDownloader();
    jest.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => {
        throw new Error("not json");
      },
    } as Response);
    await expect(downloader.getVideoInfo!("u")).rejects.toThrow("Unbekannter Fehler.");
  });

  it("falls back to the generic message when the body has no error field", async () => {
    const downloader = freshDownloader();
    jest.mocked(fetch).mockResolvedValueOnce(jsonResponse({}, false));
    await expect(downloader.getVideoInfo!("u")).rejects.toThrow("Unbekannter Fehler.");
  });
});

describe("updateJobPreview", () => {
  async function enqueueBare(downloader: Downloader) {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ service: "content-downloader-server" }))
      .mockResolvedValueOnce(jsonResponse({ jobId: "job-1" }));
    return downloader.enqueue({ url: "u", format: "audio", quality: "320" });
  }

  it("does nothing for an unknown job id", () => {
    const downloader = freshDownloader();
    expect(() => downloader.updateJobPreview!("missing", { title: "x" })).not.toThrow();
  });

  it("fills in fields that were still null", async () => {
    const downloader = freshDownloader();
    await enqueueBare(downloader);
    const listener = jest.fn();
    downloader.subscribe(listener);
    downloader.updateJobPreview!("job-1", { title: "New Title", duration: 10, thumbnail: "t.jpg" });
    const [jobsArg] = listener.mock.calls.at(-1)!;
    expect(jobsArg[0]).toMatchObject({ title: "New Title", duration: 10, thumbnail: "t.jpg" });
  });

  it("stays null when neither the existing job nor the patch has a value", async () => {
    const downloader = freshDownloader();
    await enqueueBare(downloader);
    const listener = jest.fn();
    downloader.subscribe(listener);
    downloader.updateJobPreview!("job-1", {});
    const [jobsArg] = listener.mock.calls.at(-1)!;
    expect(jobsArg[0]).toMatchObject({ title: null, duration: null, thumbnail: null });
  });

  it("keeps the already-confirmed fields instead of overwriting them", async () => {
    const downloader = freshDownloader();
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ service: "content-downloader-server" }))
      .mockResolvedValueOnce(jsonResponse({ jobId: "job-1" }));
    await downloader.enqueue({ url: "u", format: "audio", quality: "320", title: "Confirmed" });
    const listener = jest.fn();
    downloader.subscribe(listener);
    downloader.updateJobPreview!("job-1", { title: "Should Not Apply" });
    const [jobsArg] = listener.mock.calls.at(-1)!;
    expect(jobsArg[0].title).toBe("Confirmed");
  });
});

describe("patchJob's stale-response guard", () => {
  it("ignores a poll response that resolves after the job was already cancelled", async () => {
    const downloader = freshDownloader();
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ service: "content-downloader-server" }))
      .mockResolvedValueOnce(jsonResponse({ jobId: "job-1" }));
    await downloader.enqueue({ url: "u", format: "audio", quality: "320" });
    const listener = jest.fn();
    downloader.subscribe(listener);

    // Cancel happens the instant the poll's fetch() call starts (simulating the job being
    // cancelled while that request is still in flight), then the stale response arrives after.
    jest.mocked(fetch).mockImplementationOnce(() => {
      downloader.cancel("job-1");
      return Promise.resolve(jsonResponse({ stage: "downloading", message: "…", progress: 5 }));
    });
    await jest.advanceTimersByTimeAsync(600);

    // The stale response must not resurrect the already-cancelled/removed job.
    const [jobsArg] = listener.mock.calls.at(-1)!;
    expect(jobsArg).toEqual([]);
  });
});

describe("cancel", () => {
  it("no-ops cleanly when called for an id that was never polling (stopPolling's false branch)", () => {
    const downloader = freshDownloader();
    expect(() => downloader.cancel("never-existed")).not.toThrow();
  });

  it("stops polling, removes the job, and notifies", async () => {
    const downloader = freshDownloader();
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ service: "content-downloader-server" }))
      .mockResolvedValueOnce(jsonResponse({ jobId: "job-1" }));
    await downloader.enqueue({ url: "u", format: "audio", quality: "320" });
    const listener = jest.fn();
    downloader.subscribe(listener);
    listener.mockClear();

    downloader.cancel("job-1");
    expect(listener).toHaveBeenCalledWith([], expect.anything());

    // Confirms polling really stopped: no further fetch calls even after the poll interval passes.
    jest.mocked(fetch).mockClear();
    await jest.advanceTimersByTimeAsync(1200);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("removeJob", () => {
  it("no-ops cleanly when called for an id that was never polling (stopPolling's false branch)", () => {
    const downloader = freshDownloader();
    expect(() => downloader.removeJob("never-existed")).not.toThrow();
  });

  it("is a no-op for a still-active (not yet finished) job", async () => {
    const downloader = freshDownloader();
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ service: "content-downloader-server" }))
      .mockResolvedValueOnce(jsonResponse({ jobId: "job-1" }));
    await downloader.enqueue({ url: "u", format: "audio", quality: "320" });
    const listener = jest.fn();
    downloader.subscribe(listener);
    listener.mockClear();

    downloader.removeJob("job-1");
    expect(listener).not.toHaveBeenCalled();

    // The job must still be polling — removeJob() didn't stop it.
    jest.mocked(fetch).mockClear().mockResolvedValueOnce(jsonResponse({ stage: "downloading", progress: 5 }));
    await jest.advanceTimersByTimeAsync(600);
    expect(fetch).toHaveBeenCalled();
  });

  it("stops polling, removes a finished job, and notifies", async () => {
    const downloader = freshDownloader();
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ service: "content-downloader-server" }))
      .mockResolvedValueOnce(jsonResponse({ jobId: "job-1" }))
      .mockResolvedValueOnce(jsonResponse({ stage: "error", errorKey: "errors.unknown" }));
    await downloader.enqueue({ url: "u", format: "audio", quality: "320" });
    await jest.advanceTimersByTimeAsync(600); // let the poll resolve the job to "error"

    const listener = jest.fn();
    downloader.subscribe(listener);
    listener.mockClear();

    downloader.removeJob("job-1");
    expect(listener).toHaveBeenCalledWith([], expect.anything());

    // Confirms polling really stopped: no further fetch calls even after the poll interval passes.
    jest.mocked(fetch).mockClear();
    await jest.advanceTimersByTimeAsync(1200);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("clearFinished", () => {
  it("removes only done/error/cancelled jobs, keeps active ones, notifies once", async () => {
    const downloader = freshDownloader();
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ service: "content-downloader-server" }))
      .mockResolvedValueOnce(jsonResponse({ jobId: "active" }))
      .mockResolvedValueOnce(jsonResponse({ service: "content-downloader-server" }))
      .mockResolvedValueOnce(jsonResponse({ jobId: "finished" }));
    await downloader.enqueue({ url: "u1", format: "audio", quality: "320" });
    await downloader.enqueue({ url: "u2", format: "audio", quality: "320" });

    // Two pollers tick on the same 600ms interval; respond per job id rather than by call order.
    jest.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/job/finished")) return jsonResponse({ stage: "error", error: "x" });
      if (url.endsWith("/api/job/active")) return jsonResponse({ stage: "downloading", message: "…", progress: 1 });
      throw new Error(`unexpected fetch: ${url}`);
    });
    await jest.advanceTimersByTimeAsync(600);

    const listener = jest.fn();
    downloader.subscribe(listener);
    listener.mockClear();
    downloader.clearFinished();

    expect(listener).toHaveBeenCalledTimes(1);
    const [jobsArg] = listener.mock.calls[0];
    expect(jobsArg.map((j: { id: string }) => j.id)).toEqual(["active"]);
  });
});
