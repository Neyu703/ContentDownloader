# syntax=docker/dockerfile:1
FROM node:22-bookworm
WORKDIR /app

# ffmpeg (server runtime dep) + python3/pip (yt-dlp) + git (bgutil-ytdlp-pot-provider clone below)
RUN apt-get update -qq \
 && apt-get install -y -qq ffmpeg python3-pip python3-venv git \
 && rm -rf /var/lib/apt/lists/*

# yt-dlp — same install pattern as .claude/hooks/session-start.sh. --pre pulls nightly builds:
# YouTube's current PO-token/SABR enforcement is only handled there, not yet in stable.
RUN pip3 install --user --pre yt-dlp \
 || pip3 install --user --pre --break-system-packages yt-dlp
ENV PATH="/root/.local/bin:${PATH}"

# bgutil-ytdlp-pot-provider — supplies the PO tokens yt-dlp needs for reliable YouTube downloads
# (see checkPotProviderScript() in app/server/environment.ts). yt-dlp's script-mode plugin
# auto-discovers the built script at ~/bgutil-ytdlp-pot-provider (root's home here, since this
# image runs as root) by default, so no --extractor-args wiring is needed.
RUN git clone --single-branch --branch 2.0.0 https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /root/bgutil-ytdlp-pot-provider \
 && cd /root/bgutil-ytdlp-pot-provider/server \
 && npm ci \
 && npx tsc
RUN pip3 install --user bgutil-ytdlp-pot-provider \
 || pip3 install --user --break-system-packages bgutil-ytdlp-pot-provider

RUN npm install -g pnpm@11

# Manifests only, so `pnpm install` is cached and doesn't rerun on source edits
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY app/package.json ./app/package.json

# Cache mount so a retry after a network blip resumes instead of
# redownloading everything; fetch timeouts/retries are set in .npmrc
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Baked-in source snapshot so the container has something valid to run from the moment it starts.
# `docker compose watch`'s `sync` action (see docker-compose.yml) keeps this fresh with live host
# edits during a dev session — no bind mount, since Docker Desktop doesn't propagate Windows-host
# bind-mount writes as inotify events Metro/tsx can see. Rebuild the image after pulling changes
# that didn't come through your own edits (a fresh git pull, a branch switch).
COPY app ./app

EXPOSE 3001 8082
