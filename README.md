# Content Downloader

A multi-platform audio/video downloader. Paste a link, pick audio (MP3) or video (MP4), and watch live progress until the file is ready. Supports YouTube, TikTok, Instagram, Twitter/X, SoundCloud, Vimeo, and Twitch.

The project is an [Expo](https://expo.dev)/React Native app that runs both as an Android app and in the browser, backed by two different download engines depending on platform:

- **Android** — downloads run on-device via a custom native module (`app/modules/ytdlp`) that wraps [yt-dlp](https://github.com/yt-dlp/yt-dlp) directly, no server required.
- **Web** — the browser build talks to a local Express server (`server/`) that runs yt-dlp and streams the finished file back.

Each supported platform is implemented once per side (`server/src/platforms/` in TypeScript, `app/modules/ytdlp/android/.../platforms/` in Kotlin), kept in sync by hand.

## Features

- Paste a link from any supported platform, choose **audio (MP3, up to 320 kbps)** or **video (MP4, up to 1080p / best available)**
- Video preview (thumbnail, title, duration) before starting a download
- Playlist links: pick which entries to download instead of just the first video
- Paste multiple links at once (one per line) to queue them as separate jobs
- Live progress: percentage, downloaded/total size, speed, ETA; automatic retry on transient errors
- Cancel a running job, clear finished jobs
- Settings screen: language, light/dark/system theme, and (Android) the Downloads save folder
- Android: save the finished file straight to the device's public Downloads folder, or share it
- Android: export a debug log via email when something goes wrong

> iOS is not currently supported — the native yt-dlp module only targets Android (see `app/modules/ytdlp/expo-module.config.json`).

## Project structure

```
app/                  Expo React Native app (Android + web)
  App.tsx             app shell (i18n/theme setup, navigation, changelog modal)
  screens/            HomeScreen (download UI) and SettingsScreen
  navigation/         bottom-tab navigator between the two screens
  downloader/          platform-split downloader abstraction
    index.native.ts     talks to the native yt-dlp module (Android)
    index.web.ts        talks to the local Express server (web)
  modules/ytdlp/       custom Expo native module wrapping yt-dlp (Android only)
                       platforms/ subfolder mirrors server/src/platforms/ in Kotlin
  theme/, i18n/        light/dark theme and translation (de/en) state + persistence
server/               Express + TypeScript server used by the web build
  src/app.ts           routes
  src/platforms/       one class per supported platform (YouTube, TikTok, ...)
control-panel.js      local dashboard (http://localhost:4321) to start/stop app + server
```

This is a pnpm workspace with two packages: `app` and `server`.

## Prerequisites

- [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/)
- For building/running the Android app: Android SDK + JDK 17+ (e.g. via Android Studio), with `ANDROID_HOME` set. The app uses a custom native module, so it can't run inside Expo Go — it needs a real native build.

## Setup

```bash
pnpm install
```

## Development

```bash
pnpm dev:server   # starts the Express server on :3001
pnpm dev:app      # starts the Expo web dev server on :8081
```

Equivalent `make` targets: `make dev-server`, `make dev-app`, or `make dev` to run both. On Windows, `start.bat` / `stop.bat` launch and kill both processes hidden in the background (via `deploy.vbs`), and `node control-panel.js` serves a small local dashboard at `http://localhost:4321` to start/stop/monitor them.

## Building the Android APK

Since the app depends on a custom native module, it must be built as a real native app rather than run through Expo Go. This project builds **locally with Gradle** — no Expo account or EAS cloud build required.

```bash
cd app
npx expo prebuild -p android   # generates the android/ native project from app.json + modules/ytdlp
cd android
./gradlew assembleRelease      # or assembleDebug, signed with the auto-generated debug key
```

The resulting APK is written to `app/android/app/build/outputs/apk/release/app-release.apk` (or `.../debug/app-debug.apk`). `assembleRelease` doesn't require a signing config for local builds: when `app/android/keystore.properties` (the real release keystore, see [Android's signing guide](https://developer.android.com/studio/publish/app-signing)) is absent, the build falls back to the auto-generated debug key while keeping the release build type's shrinking/minification — the only path that supplies a real release keystore is the `release-apk.yml` GitHub Actions workflow.

The generated `android/` folder is not committed (see `.gitignore`); rerun `expo prebuild` whenever `app.json` or the native module changes.

## License

No license file has been chosen for this project yet.
