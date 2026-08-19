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

## Not relevant in cloud sessions

`control-panel.js`, `deploy.vbs`, `start.bat`, `stop.bat` are local Windows-only
dev launcher scripts — ignore them here.
