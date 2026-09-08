# Content Downloader

A multi-platform audio/video downloader. Paste a link, pick audio (MP3) or video (MP4), and watch live progress until the file is ready. Supports YouTube, TikTok, Instagram, Twitter/X, SoundCloud, Vimeo, and Twitch.

The project is a single [Expo](https://expo.dev)/React Native app that runs both as an Android app and in the browser, backed by two different download engines depending on platform:

- **Android** — downloads run on-device via a custom native module (`app/modules/ytdlp`) that wraps [yt-dlp](https://github.com/yt-dlp/yt-dlp) directly, no server required.
- **Web** — the browser build talks to a plain Node `http` API (`app/server/`, no framework, run via `tsx`) that runs yt-dlp/ffmpeg and streams the finished file back. In production this same process also serves the exported Expo web build, so "web" ships as one process, one port, one Docker container.

Each supported platform is implemented once per side (`app/server/platforms/` in TypeScript, `app/modules/ytdlp/android/.../platforms/` in Kotlin), kept in sync by hand.

## Features

- Paste a link from any supported platform, choose **audio (MP3, up to 320 kbps)** or **video (MP4, up to 1080p / best available)**
- Video preview (thumbnail, title, duration) before starting a download
- Playlist links: pick which entries to download instead of just the first video
- Paste multiple links at once (one per line) to queue them as separate jobs
- Live progress: percentage, downloaded/total size, speed, ETA; automatic retry on transient errors
- Cancel a running job, clear finished jobs; edit a finished download's title before saving or sharing
- YouTube cookie import (paste, upload, or drag-and-drop a `cookies.txt`) for age-restricted or login-only videos
- Settings: language (de/en), light/dark/system theme, customizable animated backgrounds, and (Android) the Downloads save folder
- Android: save the finished file straight to the device's public Downloads folder, or share it
- Android: export a debug log via email when something goes wrong
- Keyboard/screen-reader accessible controls (hover/press feedback, ARIA roles and state)

> iOS is not currently supported — the native yt-dlp module only targets Android (see `app/modules/ytdlp/expo-module.config.json`).

## Project structure

```
app/                    Expo React Native app + its own backend (single pnpm workspace package)
  App.tsx               app shell (i18n/theme setup, navigation, changelog modal)
  screens/              HomeScreen (download UI) and SettingsScreen
  navigation/           bottom-tab navigator between the two screens
  downloader/           platform-split downloader abstraction
    index.native.ts       talks to the native yt-dlp module (Android)
    index.web.ts          talks to app/server (web)
  modules/ytdlp/        custom Expo native module wrapping yt-dlp (Android only)
                         platforms/ subfolder mirrors app/server/platforms/ in Kotlin
  theme/, i18n/         light/dark theme and translation (de/en) state + persistence
  android/              committed native Android project (Gradle wrapper lives here)
  server/               Node http API used by the web build (own tsconfig, ESM, run via tsx)
    index.ts              entry point
    app.ts                routing; also serves server/public/ (exported web build) for non-API GETs
    platforms/            one class per supported platform (YouTube, TikTok, ...)
docker-compose.yml      single dev container: backend (tsx watch) + Expo web dev server, hot reload
control-panel.js        local dashboard (http://localhost:4321) to start/stop app + server (Windows dev convenience)
```

This is a pnpm workspace with a single package, `app`.

## Prerequisites

- [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) and [ffmpeg](https://ffmpeg.org/) on `PATH` — required by `app/server/` for the web/API build; Android needs neither, it bundles yt-dlp/ffmpeg natively.
- For building/running the Android app: Android SDK + JDK 17+ (e.g. via Android Studio), with `ANDROID_HOME` set. The app uses a custom native module, so it can't run inside Expo Go.

## Setup

```bash
pnpm install
```

## Development

```bash
pnpm dev:server   # starts the backend API on :3001 (tsx watch)
pnpm dev:app      # starts the Expo web dev server on :8081, hot reload
```

Equivalent `make` targets: `make dev-server`, `make dev-app`, or `make dev` to run both. The dev app and dev server are separate processes (CORS-enabled), unlike the merged production build below.

**Docker**: `make docker-up` (`docker compose up --watch`) runs a single dev container with the backend and the Expo web dev server side by side, hot-reloading on host file changes via Compose Watch. Runs attached; `Ctrl+C` stops it. Rebuild the image (`make docker-build`) after pulling changes that weren't synced live.

On Windows, `start.bat` / `stop.bat` launch and stop both dev processes hidden in the background, and `node control-panel.js` (`make control`) serves a small local dashboard at `http://localhost:4321` to start/stop/monitor them — local dev conveniences, not part of the deployable app.

## Production build ("web")

```bash
make build-server   # typecheck/build the backend -> app/server/dist/
make build-web      # export the Expo web app into app/server/public/
make start-server   # serve API + web UI together on one port
```

Or the containerized equivalent: `docker compose build web && docker compose up`. There is no hot reload here — this is the actual deployable artifact: one Node process, one port, API and UI together.

## Building the Android APK

The native Android project (`app/android/`) is committed directly — no `expo prebuild` step needed.

```bash
cd app/android
./gradlew assembleRelease   # or assembleDebug
```

The resulting APK is written to `app/android/app/build/outputs/apk/release/app-release.apk` (or `.../debug/app-debug.apk`). Without `app/android/keystore.properties` (the real release keystore), `assembleRelease` falls back to the committed debug key (`app/android/app/debug.keystore` — the standard, publicly-known Android debug key, not a secret) while keeping the release build type's shrinking/minification. The only path that supplies a real release keystore and produces an officially signed APK is the `release-apk.yml` GitHub Actions workflow, triggered on `workflow_dispatch` or when a GitHub Release is published.

## License

No license file has been chosen for this project yet.
