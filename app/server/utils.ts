import { spawn } from "node:child_process";

export function errorMessage(err: unknown, fallback?: string): string {
  return err instanceof Error ? err.message : (fallback ?? String(err));
}

/** Resolves after `ms` milliseconds — used to space out retries. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Spawns `command` with `args`, resolving with stdout on exit code 0, rejecting with an Error
 * (stderr, or a generic exit-code message when stderr is empty) otherwise. */
export function spawnForOutput(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });
}

/** Whether `url` uses a scheme yt-dlp/the app actually supports (as opposed to e.g. ftp:, file:). */
export function isHttpOrHttps(url: URL): boolean {
  return url.protocol === "https:" || url.protocol === "http:";
}
