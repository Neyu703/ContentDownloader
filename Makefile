.PHONY: install dev dev-app dev-server build-server start-server control clean \
	docker-up docker-down docker-build docker-restart-app docker-logs docker-ps docker-clean

install:
	pnpm install

dev-app:
	pnpm --filter app web

dev-server:
	pnpm --filter server dev

dev:
	pnpm --filter server dev & pnpm --filter app web

build-server:
	pnpm --filter server build

start-server:
	pnpm --filter server start

control:
	node control-panel.js

clean:
	rm -rf node_modules app/node_modules server/node_modules

# Web dev stack (server + Expo web) via Docker Compose, hot reload on
# server/app edits — see docker-compose.yml
docker-up:
	docker compose up -d

docker-down:
	docker compose down

docker-build:
	docker compose build server && docker compose build app

docker-restart-app:
	docker compose restart app

docker-logs:
	docker compose logs -f

docker-ps:
	docker compose ps

# Removes containers, networks AND the named volumes (node_modules, Metro
# cache) — next docker-up rebuilds/reinstalls everything from scratch
docker-clean:
	docker compose down -v
