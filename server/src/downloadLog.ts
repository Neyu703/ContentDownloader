import fs from "node:fs";
import path from "node:path";

export const LOGS_DIR = path.join(process.cwd(), "logs");
const MAX_LOG_FILES = 10;

function pruneLogs(): void {
  const files = fs
    .readdirSync(LOGS_DIR)
    .map((name) => ({ name, mtime: fs.statSync(path.join(LOGS_DIR, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const file of files.slice(MAX_LOG_FILES)) {
    fs.unlinkSync(path.join(LOGS_DIR, file.name));
  }
}

/** Quotes an argv token for a copy-pasteable shell command, only when it actually needs it. */
function quoteArg(arg: string): string {
  return /[\s"'$`\\]/.test(arg) ? `"${arg.replace(/(["\\$`])/g, "\\$1")}"` : arg;
}

/**
 * Writes one download's log incrementally to `logs/<id>.log` instead of buffering it in memory, so
 * a hung or crashed download still leaves a readable, live-growing file on disk. The log is
 * structured into "=== SECTION ===" blocks with a timestamp on every line and a literal,
 * copy-pasteable `command:` entry for every yt-dlp invocation, so the whole download can be traced
 * (and, in principle, reproduced from the command lines alone) after the fact.
 */
export class DownloadLogger {
  // A yt-dlp download emits many output lines per second; an open stream queues and flushes
  // writes off the event loop instead of blocking it with a synchronous syscall per line.
  private readonly stream: fs.WriteStream;

  constructor(id: string) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    this.stream = fs.createWriteStream(path.join(LOGS_DIR, `${id}.log`), { flags: "w", encoding: "utf-8" });
    // Best-effort logging: a disk error here shouldn't crash the download or the server.
    this.stream.on("error", () => {});
    pruneLogs();
  }

  private append(text: string): void {
    this.stream.write(text);
  }

  /** Starts a new "=== TITLE ===" block. */
  section(title: string): void {
    const text = `\n=== ${title} ===\n`;
    this.append(text);
    console.log(text.trim());
  }

  /** Appends one timestamped line to the current section. */
  line(message: string): void {
    const text = `[${new Date().toISOString()}] ${message}\n`;
    this.append(text);
    console.log(text.trim());
  }

  /** Logs a yt-dlp invocation as a single, copy-pasteable shell command. */
  command(argv: string[]): void {
    this.line(`command: yt-dlp ${argv.map(quoteArg).join(" ")}`);
  }
}
