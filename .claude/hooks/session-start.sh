#!/bin/bash
set -uo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

echo "==> Installing workspace dependencies (pnpm install)"
if ! pnpm install; then
  echo "FATAL: pnpm install failed" >&2
  exit 1
fi

echo "==> Checking yt-dlp"
if command -v yt-dlp >/dev/null 2>&1; then
  echo "yt-dlp already available: $(yt-dlp --version)"
else
  if pip3 install --user yt-dlp; then
    USER_BASE="$(python3 -m site --user-base 2>/dev/null)"
    if [ -n "$USER_BASE" ] && [ -d "$USER_BASE/bin" ]; then
      echo "export PATH=\"$USER_BASE/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
      export PATH="$USER_BASE/bin:$PATH"
    fi
    if command -v yt-dlp >/dev/null 2>&1; then
      echo "yt-dlp installed: $(yt-dlp --version)"
    else
      echo "WARNING: yt-dlp installed via pip but not found on PATH" >&2
    fi
  else
    echo "WARNING: failed to install yt-dlp via pip (server download features won't work)" >&2
  fi
fi

echo "==> Checking ffmpeg"
if command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg already available: $(ffmpeg -version | head -n1)"
else
  if sudo -n apt-get update -qq && sudo -n apt-get install -y -qq ffmpeg; then
    echo "ffmpeg installed: $(ffmpeg -version | head -n1)"
  else
    echo "WARNING: failed to install ffmpeg via apt-get (server download features won't work)" >&2
  fi
fi

echo "==> Session setup complete"
exit 0
