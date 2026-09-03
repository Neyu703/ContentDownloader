---
name: run-web
description: Build, run, and drive the ContentDownloader web app (Expo web UI + Express API server). Use when asked to start the web app, launch the server, take a screenshot of the UI, or verify a YouTube-download flow end-to-end.
---

Two-process pnpm monorepo: `server/` (Express API, port 3001, shells out to
`yt-dlp`/`ffmpeg`) and `app/` (Expo web UI, port 8082) which calls the server
over HTTP. Drive it with the Browser pane MCP tools
(`mcp__Claude_Browser__*`) against the configs already defined in
`.claude/launch.json` — no custom driver script needed, that's the
off-the-shelf harness in this environment.

All paths below are relative to the repo root.

## Prerequisites

- `yt-dlp` and `ffmpeg` on `PATH` (the `.claude/hooks/session-start.sh`
  SessionStart hook installs both automatically in Claude Code on the web).
- `pnpm install` already run.

## Run (agent path)

Start both named configs from `.claude/launch.json` — don't add a new one,
these two already exist and are correct:

```
mcp__Claude_Browser__preview_start {"name": "server"}    # -> port 3001
mcp__Claude_Browser__preview_start {"name": "app-web"}   # -> port 8082, returns a tabId (e.g. "tab-1")
```

Expo/Metro takes ~15-25s to finish bundling. Don't `navigate` immediately —
it returns `navigation to http://localhost:8082 was denied or failed` while
Metro is still starting. Poll the log instead of guessing a sleep:

```
mcp__Claude_Browser__preview_logs {"serverId": "<app-web serverId>"}
```

until it contains `Waiting on http://localhost:8082`, then:

```
mcp__Claude_Browser__navigate {"url": "http://localhost:8082", "tabId": "tab-1"}
```

Confirm the API independently of the UI:

```bash
curl -sf http://localhost:3001/api/ping
# -> {"ok":true,"service":"content-downloader-server"}
```

One representative interaction — paste a URL and watch the app round-trip to
the server:

1. `mcp__Claude_Browser__read_page {"filter": "interactive"}` → get the `ref`
   of the URL textbox (placeholder `https://www.youtube.com/watch?v=...`).
2. `mcp__Claude_Browser__computer {"action": "left_click", "ref": "<ref>"}`
   then `{"action": "type", "text": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}`.
3. Wait ~5s — the app debounces, then calls `/api/info` — then
   `mcp__Claude_Browser__computer {"action": "screenshot"}`.
4. `mcp__Claude_Browser__read_network_requests {"urlPattern": "api/info"}` →
   should show `200 OK`.

A working run shows the video's real title, thumbnail, and duration appear
under the input field, and
`mcp__Claude_Browser__read_console_messages {"onlyErrors": true}` returns no
console logs.

Stop: `mcp__Claude_Browser__preview_stop {"serverId": "<id>"}` for each
process (or let the session end — the Browser pane is session-scoped).

## Run (human path)

```bash
pnpm --filter server dev             # terminal 1, port 3001
pnpm --filter app web --port 8082    # terminal 2, opens the Expo web UI
```

Ctrl-C each to stop.

## Gotchas

- The app renders an empty form with no server running, but every real
  action (`/api/info`, `/api/convert`) hits `localhost:3001` — always start
  `server` before or alongside `app-web`, or the UI looks fine but nothing
  works.
- `navigate` right after `preview_start` on `app-web` fails because Metro
  isn't listening yet — check `preview_logs` for the `Waiting on
  http://localhost:8082` line first, don't blind-sleep-and-retry.

## Troubleshooting

- `navigate to http://localhost:8082 was denied or failed`: Metro is still
  bundling. Check `preview_logs` for `Waiting on http://localhost:8082`,
  then retry `navigate`.
