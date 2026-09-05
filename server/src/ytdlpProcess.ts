import { spawn } from "node:child_process";

/**
 * Builds a stream `data` handler that always accumulates the full text (for callers that need the
 * complete stdout/stderr, e.g. to JSON.parse it), and additionally splits it into lines and calls
 * `onLine` per line — buffering the trailing partial line across chunks — when `onLine` is given.
 */
function makeChunkHandler(accumulate: (text: string) => void, onLine?: (line: string) => void, linePrefix = "") {
  let lineBuffer = "";
  return (chunk: Buffer) => {
    const text = chunk.toString();
    accumulate(text);
    if (!onLine) return;
    lineBuffer += text;
    const lines = lineBuffer.split("\n");
    // split() on a string always yields at least one element, so pop() can never be undefined here.
    lineBuffer = lines.pop()!;
    for (const line of lines) onLine(linePrefix + line);
  };
}

/** Runs yt-dlp with the given CLI args, resolving with stdout on exit code 0, rejecting with stderr otherwise. */
export function runYtDlp(args: string[], onLine?: (line: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("yt-dlp", onLine ? [...args, "--newline", "--no-color"] : args, { windowsHide: true });

    let stdout = "";
    let stderr = "";
    child.stdout.on(
      "data",
      makeChunkHandler((text) => (stdout += text), onLine)
    );
    child.stderr.on(
      "data",
      makeChunkHandler((text) => (stderr += text), onLine, "[stderr] ")
    );

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
    });
  });
}
