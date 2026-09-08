#!/bin/bash
set -uo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

install_yt_dlp() {
  echo "==> Checking yt-dlp"
  if command -v yt-dlp >/dev/null 2>&1; then
    echo "yt-dlp already available: $(yt-dlp --version)"
    return 0
  fi

  if pip3 install --user --pre yt-dlp >/dev/null 2>&1 || pip3 install --user --pre --break-system-packages yt-dlp; then
    USER_BASE="$(python3 -m site --user-base 2>/dev/null)"
    if [ -n "$USER_BASE" ] && [ -d "$USER_BASE/bin" ]; then
      echo "export PATH=\"$USER_BASE/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
    fi
    if [ -n "$USER_BASE" ] && [ -x "$USER_BASE/bin/yt-dlp" ]; then
      echo "yt-dlp installed: $("$USER_BASE/bin/yt-dlp" --version)"
    else
      echo "WARNING: yt-dlp installed via pip but not found on PATH" >&2
    fi
  else
    echo "WARNING: failed to install yt-dlp via pip (server download features won't work)" >&2
  fi
}

install_ffmpeg() {
  echo "==> Checking ffmpeg"
  if command -v ffmpeg >/dev/null 2>&1; then
    echo "ffmpeg already available: $(ffmpeg -version | head -n1)"
    return 0
  fi

  if sudo -n apt-get update -qq && sudo -n apt-get install -y -qq ffmpeg; then
    echo "ffmpeg installed: $(ffmpeg -version | head -n1)"
  else
    echo "WARNING: failed to install ffmpeg via apt-get (server download features won't work)" >&2
  fi
}

install_pot_provider() {
  echo "==> Checking bgutil-ytdlp-pot-provider"
  local script="$HOME/bgutil-ytdlp-pot-provider/server/build/generate_once.js"
  if [ -f "$script" ]; then
    echo "bgutil-ytdlp-pot-provider already built: $script"
    return 0
  fi

  if ! command -v git >/dev/null 2>&1; then
    if ! (sudo -n apt-get update -qq && sudo -n apt-get install -y -qq git); then
      echo "WARNING: git unavailable and could not be installed (YouTube downloads may hit HTTP 403)" >&2
      return 0
    fi
  fi

  if git clone --single-branch --branch 2.0.0 https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git \
       "$HOME/bgutil-ytdlp-pot-provider" >/dev/null 2>&1 \
     && (cd "$HOME/bgutil-ytdlp-pot-provider/server" && npm ci >/dev/null 2>&1 && npx tsc); then
    echo "bgutil-ytdlp-pot-provider built: $script"
  else
    echo "WARNING: failed to build bgutil-ytdlp-pot-provider (YouTube downloads may hit HTTP 403)" >&2
  fi

  if pip3 install --user bgutil-ytdlp-pot-provider >/dev/null 2>&1 \
     || pip3 install --user --break-system-packages bgutil-ytdlp-pot-provider >/dev/null 2>&1; then
    echo "bgutil-ytdlp-pot-provider yt-dlp plugin installed"
  else
    echo "WARNING: failed to install the bgutil-ytdlp-pot-provider pip plugin" >&2
  fi
}

echo "==> Installing workspace dependencies (pnpm install)"
pnpm install &
pnpm_pid=$!

install_yt_dlp &
ytdlp_pid=$!

install_ffmpeg &
ffmpeg_pid=$!

# Waited on before starting, not backgrounded alongside them: its pip3 install would otherwise
# race install_yt_dlp's pip3 install (both write to the same --user site-packages), and its
# apt-get fallback (for git) would race install_ffmpeg's apt-get the same way.
wait "$ytdlp_pid"
wait "$ffmpeg_pid"

install_pot_provider &
pot_provider_pid=$!

pnpm_status=0
wait "$pnpm_pid" || pnpm_status=$?
wait "$pot_provider_pid"

if [ "$pnpm_status" -ne 0 ]; then
  echo "FATAL: pnpm install failed" >&2
  exit 1
fi

echo "==> Session setup complete"
exit 0
