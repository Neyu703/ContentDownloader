import type { Downloader } from "./types";

/** Re-requires a downloader module in isolation so each test starts from its module-level state fresh. */
export function freshDownloaderFrom(modulePath: string): Downloader {
  let downloader!: Downloader;
  jest.isolateModules(() => {
    downloader = require(modulePath).downloader;
  });
  return downloader;
}
