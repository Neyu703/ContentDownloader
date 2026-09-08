import { EventEmitter } from "node:events";

jest.mock("node:child_process", () => ({ spawn: jest.fn() }));

import { spawn } from "node:child_process";
import { delay, errorMessage, spawnForOutput } from "../../server/utils.js";

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

describe("delay", () => {
  it("resolves only after the given number of milliseconds", async () => {
    jest.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      const resolved = jest.fn();
      delay(1000).then(resolved);

      await jest.advanceTimersByTimeAsync(999);
      expect(resolved).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1);
      expect(resolved).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("spawnForOutput", () => {
  /** A minimal fake ChildProcess: stdout/stderr are EventEmitters, plus its own "error"/"close" events. */
  function createFakeChild() {
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    return child;
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("resolves with stdout on exit code 0", async () => {
    const child = createFakeChild();
    jest.mocked(spawn).mockReturnValueOnce(child as never);

    const promise = spawnForOutput("echo", ["hi"]);
    child.stdout.emit("data", Buffer.from("hi\n"));
    child.emit("close", 0);

    await expect(promise).resolves.toBe("hi\n");
  });

  it("rejects with stderr as the Error message on a non-zero exit code", async () => {
    const child = createFakeChild();
    jest.mocked(spawn).mockReturnValueOnce(child as never);

    const promise = spawnForOutput("false", []);
    child.stderr.emit("data", Buffer.from("boom"));
    child.emit("close", 1);

    await expect(promise).rejects.toThrow("boom");
  });

  it("rejects with a generic exit-code message when stderr is empty", async () => {
    const child = createFakeChild();
    jest.mocked(spawn).mockReturnValueOnce(child as never);

    const promise = spawnForOutput("false", []);
    child.emit("close", 1);

    await expect(promise).rejects.toThrow("false exited with code 1");
  });

  it("rejects when the spawn itself errors", async () => {
    const child = createFakeChild();
    jest.mocked(spawn).mockReturnValueOnce(child as never);

    const promise = spawnForOutput("nope", []);
    const spawnError = new Error("ENOENT");
    child.emit("error", spawnError);

    await expect(promise).rejects.toBe(spawnError);
  });
});
