.PHONY: run build dev server clean

# Default: build then serve
run: build
	npx serve dist -l 3000

# Dev mode with hot reload -- 2-player game
dev:
	npx vite

# Production build
build:
	npx vite build

# Multiplayer game server (port 8001 -- 8000 is used by OCManager)
server:
	node src/server/server.js

# Clean build artifacts
clean:
	rm -rf dist