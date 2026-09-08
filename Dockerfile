# syntax=docker/dockerfile:1
FROM node:22-bookworm
WORKDIR /app

# ffmpeg (server runtime dep) + python3/pip (yt-dlp)
RUN apt-get update -qq \
 && apt-get install -y -qq ffmpeg python3-pip python3-venv \
 && rm -rf /var/lib/apt/lists/*

# yt-dlp — same install pattern as .claude/hooks/session-start.sh
RUN pip3 install --user yt-dlp \
 || pip3 install --user --break-system-packages yt-dlp
ENV PATH="/root/.local/bin:${PATH}"

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
