.PHONY: install dev dev-app dev-server build-server build-web start-server control clean \
	docker-up docker-down docker-build docker-restart-web docker-logs docker-ps docker-clean

install:
	pnpm install

dev-app:
	pnpm --filter app web

dev-server:
	pnpm --filter app run server:dev

dev:
	pnpm --filter app run server:dev & pnpm --filter app web

build-server:
	pnpm --filter app run server:build

# Exports the Expo web app into app/server/public — the running server serves it alongside the API.
build-web:
	pnpm --filter app export:web

start-server:
	pnpm --filter app run server:start

control:
	node control-panel.js

clean:
	rm -rf node_modules app/node_modules

# Single dev container (backend tsx watch + Expo web dev server, hot reload on every host edit
# via `docker compose watch` — see docker-compose.yml). Runs attached; Ctrl+C stops it. `-d` and
# `--watch` can't be combined, so there's no detached variant of this target.
docker-up:
	docker compose up --watch

docker-down:
	docker compose down

docker-build:
	docker compose build web

docker-restart-web:
	docker compose restart web

docker-logs:
	docker compose logs -f

docker-ps:
	docker compose ps

# Removes containers, networks AND the named volumes (node_modules, Metro
# cache) — next docker-up rebuilds/reinstalls everything from scratch
docker-clean:
	docker compose down -v
