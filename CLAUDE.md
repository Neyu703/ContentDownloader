# ContentDownloader

pnpm monorepo with two workspaces:

- `server/` — Express 5 + TypeScript API (ESM, run via `tsx`). Entry point
  `server/src/index.ts`. Core download logic in `server/src/youtube.ts` shells
  out to the external binaries `yt-dlp` and `ffmpeg` — both must be on `PATH`
  for downloads to actually work (the `.claude/hooks/session-start.sh`
  SessionStart hook installs them automatically in Claude Code on the web).
- `app/` — Expo/React Native app (Expo SDK 57, React Native 0.86), including a
  native Android module at `app/modules/ytdlp`. **Expo has changed
  significantly since older training data** — read `app/AGENTS.md` and the
  versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing app
  code.

## Commands

- `pnpm install` (`make install`) — install all workspace dependencies
- `pnpm --filter server dev` (`make dev-server`) — server dev mode, port 3001
- `pnpm --filter server build` (`make build-server`) — typecheck/build server
- `pnpm --filter server start` (`make start-server`) — run built server
- `pnpm --filter app web` (`make dev-app`) — Expo web dev server, port 8081

No lint or test tooling is configured in this repo.

## Versioning

Every commit bumps `app/app.json`'s `expo.version` and `expo.android.versionCode` by one patch
level (default, regardless of commit type), and `app/android/app/build.gradle`
(`versionName`/`versionCode`) in the same pass — the two must never drift, check both whenever
either is touched. Commit subjects start with the resulting version, leftmost:
`[vX.Y.Z] type: subject`. A GitHub Release is only ever cut at an `X.0` (minor) version — patch
versions accumulate internally and never become their own release.

## Android builds

Claude builds release APKs itself via the Android Studio project's own Gradle wrapper
(`app/android`, `gradlew assembleRelease`) — see the `build-apk` skill. These local builds are
always debug-signed, for on-device testing.

## CI / Release builds

`.github/workflows/release-apk.yml` builds the official, release-signed APK on GitHub's own
runners — triggers on `workflow_dispatch` (manual, from the Actions tab) and on `release:
published` (attaches the APK to that release automatically). Needs four repo secrets:
`RELEASE_KEYSTORE_BASE64`, `RELEASE_KEYSTORE_PASSWORD`, `RELEASE_KEY_ALIAS`,
`RELEASE_KEY_PASSWORD`. `build-apk` is the local debug-signed test-build path; this workflow is
the only source of the real-signed release artifact.

## Git commits

Claude Code must never appear as the commit author in this repo. Every
commit made by Claude must use
`git commit --author="Neyu703 <129206215+Neyu703@users.noreply.github.com>"`
(the repo owner's GitHub noreply address) instead of the default Claude
identity — do this via the `--author` flag on each commit, never by editing
git config.

## Not relevant in cloud sessions

`control-panel.js`, `deploy.vbs`, `start.bat`, `stop.bat` are local Windows-only
dev launcher scripts — ignore them here.
