# UNO Online

A multiplayer UNO card game built with [boardgame.io](https://boardgame.io).

## Features
- Full 108-card UNO deck with real card images
- 2-4 player multiplayer over the internet
- All UNO rules: Skip, Reverse, Draw 2, Wild, Wild Draw 4, color matching
- Card stacking for draw cards
- UNO call button
- AI bot for single-player practice
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

## How It Works

- `src/game.js` -- UNO game logic (deck, moves, rules, AI enumerate) as a boardgame.io game definition
- `src/board.jsx` -- React UI component (card display, hand, discard pile, color picker)
- `src/uno-bot.js` -- Custom AI bot (extends RandomBot, prefers action cards, smart wild color choice)
- `src/server/server.js` -- boardgame.io multiplayer server (port 8001)
- `src/main.jsx` -- React entry point with mode toggle (?mode=lobby for multiplayer)
- `public/images/cards/` -- 55 UNO card PNG images

## Card Images

Card images are from https://github.com/john-costantzo/uno-card-images
Original credit: https://www.reddit.com/user/kuroakela/