.PHONY: install dev dev-app dev-server build-server start-server control clean

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
