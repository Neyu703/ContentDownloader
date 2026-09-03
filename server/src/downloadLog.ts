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

export function writeLog(id: string, lines: string[]): void {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  fs.writeFileSync(path.join(LOGS_DIR, `${id}.log`), lines.join("\n") + "\n", "utf-8");
  pruneLogs();
}
