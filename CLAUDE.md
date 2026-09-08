# ContentDownloader

pnpm monorepo with a single workspace package, `app/` — an Expo/React Native app (Expo SDK 57,
React Native 0.86) that also contains its own backend:

- `app/` (RN/Android/Web UI) — native Android module at `app/modules/ytdlp`. **Expo has changed
  significantly since older training data** — read `app/AGENTS.md` and the versioned docs at
  https://docs.expo.dev/versions/v57.0.0/ before writing app code.
- `app/server/` — plain Node `http` API (no framework; ESM, run via `tsx`), a subfolder of the
  same `app` package, not a separate workspace. Entry point `app/server/index.ts`, routing in
  `app/server/app.ts`. Download logic is split per platform under `app/server/platforms/`
  (YouTube, TikTok, Instagram, Twitter/X, SoundCloud, Vimeo, Twitch), all shelling out to the
  external binaries `yt-dlp` and `ffmpeg` — both must be on `PATH` for downloads to actually work
  (the `.claude/hooks/session-start.sh` SessionStart hook installs them automatically in Claude
  Code on the web). `app.ts` also serves the exported Expo web build from `app/server/public/`
  (see `export:web` below) for any `GET` that isn't `/api/*` — in production this is the entire
  "web" deployable: one process, one port, API + UI together, one Docker container. yt-dlp/ffmpeg
  can't run in a browser (no process spawn, no CORS on the target CDNs), so this backend stays
  necessary even though Android needs none of it — Android already bundles yt-dlp/ffmpeg natively
  via `app/modules/ytdlp` and never talks to `app/server/`.

`app/server/` has its own `tsconfig.json` (NodeNext/ES2022, separate from `app/tsconfig.json`'s
Expo/RN target) — Metro never bundles it, since nothing in the RN code imports it.

## Commands

- `pnpm install` (`make install`) — install all workspace dependencies
- `pnpm --filter app run server:dev` (`make dev-server`) — backend dev mode (`tsx watch`), port 3001
- `pnpm --filter app run server:build` (`make build-server`) — typecheck/build the backend
  (`tsc -p app/server/tsconfig.json` → `app/server/dist/`)
- `pnpm --filter app export:web` (`make build-web`) — export the Expo web app into
  `app/server/public/` (build artifact, gitignored)
- `pnpm --filter app run server:start` (`make start-server`) — run the built backend; serves the
  API and, once `build-web` has run, the web UI on the same port
- `pnpm --filter app web` (`make dev-app`) — Expo web **dev** server with hot reload, port 8081;
  talks to the separate backend dev process on 3001 (still needs CORS, unlike the merged prod
  deploy) — a manual, non-Docker dev convenience for iterating on the UI with hot reload

`docker-compose.yml` has a single `web` service (`make docker-up`/`docker-build`) — one container
running both `server:dev` (tsx watch, port 3001) and the Expo web dev server (Metro, hot reload,
port 8082) side by side. `make docker-up` runs `docker compose up --watch`, not a bind mount:
Metro's and Node's `fs.watch`-based watchers never see writes made to a Windows-host bind mount
(Docker Desktop doesn't propagate those as inotify events into the container), so hot reload
instead relies on Compose Watch's `develop.watch.sync` rule in `docker-compose.yml` — it watches
the host side (reliable on Windows) and writes changed files into the container as real writes,
which *does* trigger Metro/tsx's watchers. The Dockerfile bakes in a full `app/` source snapshot
at build time as the container's starting point (see its `COPY app ./app`); rebuild the image
(`make docker-build`) after pulling changes that didn't come through your own live-synced edits.
`-d` and `--watch` can't be combined, so this container runs attached (Ctrl+C stops it) — this is
the dev convenience container, not the production artifact: production "web" is just
`make build-server && make build-web && make start-server` (one process, one port, no hot reload,
no Docker needed).

Production "web" deploy is `make build-server && make build-web && make start-server` (or
`docker compose up` for the containerized equivalent) — one process, one port, one container.
`app/downloader/index.web.ts`'s `SERVER_URL` constant is `__DEV__`-conditional: dev points at
`http://localhost:3001`, a production export uses relative (same-origin) paths.

No lint tooling is configured in this repo. Tests: `pnpm --filter app test` (jest), enforcing
100% coverage thresholds across the whole package — RN/Android code and `app/server/` alike.

## Versioning

Every commit bumps `app/app.json`'s `expo.version` and `expo.android.versionCode` by one patch
level (default, regardless of commit type), and `app/android/app/build.gradle`
(`versionName`/`versionCode`) in the same pass — the two must never drift, check both whenever
either is touched. Commit subjects start with the resulting version, leftmost:
`[vX.Y.Z] type: subject`.

Every commit that bumps to a new `X.Y.0` (i.e. this commit is the one cutting the official
release, per the rule above) must append a matching entry to
[app/changelog/entries.ts](app/changelog/entries.ts) in the SAME commit — `version` set to the
bumped `app.json` version, `date` today, `notes.de`/`notes.en` summarizing every user-facing
`feat`/`fix` (per `commit-message-format`'s changelog-category table — not
`chore`/`refactor`/`docs`/`style`/`test`, and not CI/release-tooling-only changes even if tagged
`feat`/`fix`) since the previous `X.Y.0` entry, i.e. the same range the release's own
"Changes since v{previous}" notes cover. Patch-level (`X.Y.Z`, `Z != 0`) commits do NOT get their
own entry — their user-facing changes accumulate into the next `.0` entry. This file backs the
in-app changelog modal (`ChangelogModal.tsx`, `SettingsScreen.tsx`) and must never fall behind the
actual released `X.Y.0` versions.

Every commit that lands on `main` is tagged and released automatically
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
