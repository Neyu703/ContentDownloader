# ContentDownloader

pnpm monorepo with two workspaces:

- `server/` — Express 5 + TypeScript API (ESM, run via `tsx`). Entry point
  `server/src/index.ts`, routes in `server/src/app.ts`. Download logic is
  split per platform under `server/src/platforms/` (YouTube, TikTok,
  Instagram, Twitter/X, SoundCloud, Vimeo, Twitch), all shelling out to the
  external binaries `yt-dlp` and `ffmpeg` — both must be on `PATH` for
  downloads to actually work (the `.claude/hooks/session-start.sh`
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

No lint tooling is configured in this repo. Tests: `pnpm --filter server test` (vitest) and
`pnpm --filter app test` (jest), both enforcing 100% coverage thresholds.

## Versioning

Every commit bumps `app/app.json`'s `expo.version` and `expo.android.versionCode` by one patch
level (default, regardless of commit type), and `app/android/app/build.gradle`
(`versionName`/`versionCode`) in the same pass — the two must never drift, check both whenever
either is touched. Commit subjects start with the resulting version, leftmost:
`[vX.Y.Z] type: subject`. Every commit that lands on `main` is tagged and released automatically
by `.github/workflows/auto-prerelease.yml`: an `X.0` (minor) version becomes a real GitHub
**Release** marked `latest`; every other commit (`X.Y.Z` with `Z != 0`) becomes a GitHub
**pre-release**. Either kind fires `.github/workflows/release-apk.yml` and attaches the
release-signed APK.

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

`.github/workflows/auto-prerelease.yml` triggers on every push to `main`. For each new commit in
the push (walks the whole range, not just the tip — a batch of `smart-commit` commits pushed
together all get processed) with a version bump, it pushes a `vX.Y.Z` tag and publishes a GitHub
release using that commit's own message as the release notes — `--latest` for an `X.0` (minor)
commit, `--prerelease` for every other (`X.Y.Z` with `Z != 0`) commit. Either kind fires
`release-apk.yml` above and attaches the real signed APK automatically.

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
