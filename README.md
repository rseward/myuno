# UNO Online

A multiplayer UNO card game built with [boardgame.io](https://boardgame.io).

## Features
- Full 108-card UNO deck with real card images
- 2-4 player multiplayer over the internet
- All UNO rules: Skip, Reverse, Draw 2, Wild, Wild Draw 4, color matching
- Card stacking for draw cards
- UNO call button
- AI bot for single-player practice (in-browser, `src/uno-bot.js`)
- Standalone CLI bot for multiplayer matches (`python/uno_bot.py`)
- Real card art (from ~/tmp/unocards/uno-card-images)

## Quick Start (Single-Player vs AI Bot)

```bash
cd ~/projects/myuno
npm run dev
```

Open http://localhost:3000 in your browser. You play as Player 0 against an AI bot (Player 1). The bot prefers action cards, saves wilds, and picks the color it has the most of.

## Multiplayer (Over the Internet)

1. Start the game server (port 8001 -- 8000 is used by OCManager):
```bash
cd ~/projects/myuno
node src/server/server.js
```

2. In another terminal, start the web client:
```bash
npm run dev
```

3. Open http://localhost:3000?mode=lobby in your browser.

4. Enter your name, create a match (2-4 players), and share the URL with other players. They go to the same URL, enter their name, and join the match.

5. Once all seats are filled, each player clicks "Play" to start the game.

For remote players, expose port 8001 (game server) and 3000 (web client) through your firewall/reverse proxy. Update the `origins` array in `src/server/server.js` and the `gameServer`/`lobbyServer` URLs in `src/main.jsx` to match your domain.

## Python CLI Bot (`python/uno_bot.py`)

A standalone Python bot that joins a **multiplayer** server match over the network and plays automatically — useful for testing, filling empty seats, or running bot-vs-bot games. It connects via REST (lobby) + Socket.IO (game state) and uses the same smart strategy as the in-browser bot (counter-stacking, UNO calls, wild color optimization, etc.).

### Prerequisites

```bash
pip install -r python/requirements.txt
```

Requires Python 3.14+.

### Quick Start

Make sure the game server is running (`node src/server/server.js` on port 8001), then:

```bash
# List open matches
python python/uno_bot.py --status

# Create/join a 2-player match and play automatically
python python/uno_bot.py --name Friday

# Join a specific match
python python/uno_bot.py --name Friday --match <MATCH_ID>

# Verbose output (raw socket events)
python python/uno_bot.py --name Friday --verbose
```

The bot plays to completion and exits when the game ends. No input needed after launch.

### Running Two Bots Against Each Other

```bash
python python/uno_bot.py --name Alpha --creds /tmp/a.json &
python python/uno_bot.py --name Beta  --creds /tmp/b.json &
wait
```

### CLI Options

| Flag | Default | Description |
|------|---------|-------------|
| `--name NAME` | *(required)* | Player name shown to others |
| `--match ID` | auto | Join this specific match ID |
| `--players N` | `2` | Player count when creating a new match (2–4) |
| `--server URL` | `http://localhost:8001` | Game server base URL |
| `--creds FILE` | `~/.uno_bot_creds.json` | Credential store path |
| `--status` | — | Print open/finished matches and exit |
| `--leave MATCH_ID` | — | Leave a match and exit |
| `--verbose` | — | Print raw socket events |

For full details — lobby flow, output format, bot strategy, server API, and common agent workflows — see [`python/UNO_BOT.md`](python/UNO_BOT.md).

## How It Works

- `src/game.js` -- UNO game logic (deck, moves, rules, AI enumerate) as a boardgame.io game definition
- `src/board.jsx` -- React UI component (card display, hand, discard pile, color picker)
- `src/uno-bot.js` -- In-browser AI bot (extends RandomBot, prefers action cards, smart wild color choice)
- `python/uno_bot.py` -- Standalone CLI bot for multiplayer servers (REST + Socket.IO, same smart strategy)
- `python/UNO_BOT.md` -- Reference documentation for the Python CLI bot
- `python/requirements.txt` -- Python dependencies for the CLI bot
- `src/server/server.js` -- boardgame.io multiplayer server (port 8001)
- `src/main.jsx` -- React entry point with mode toggle (?mode=lobby for multiplayer)
- `public/images/cards/` -- 55 UNO card PNG images

## Card Images

Card images are from https://github.com/john-costantzo/uno-card-images
Original credit: https://www.reddit.com/user/kuroakela/

## Docker / Podman

A container image of the multiplayer server is published to GitLab Container Registry.
The GitLab project is at: https://gitlab.com/rseward1/myuno/

### Pulling the image for deployment

```bash
podman pull registry.gitlab.com/rseward1/myuno:latest
```

Then run it, exposing the game server (8001) and debug endpoint (8002):

```bash
podman run -d --name myuno -p 8001:8001 -p 8002:8002 registry.gitlab.com/rseward1/myuno:latest
```
