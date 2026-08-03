# Release Notes

## v0.1.0

Initial release of UNO Online — a multiplayer UNO card game built with boardgame.io.

- **Play UNO in the browser**: Full 108-card deck with real card art. All standard UNO rules including Skip, Reverse, Draw 2, Wild, Wild Draw 4, and draw card stacking. Includes a UNO call button and color picker for wild cards.
- **Single-player vs AI bot**: Practice against a smart in-browser bot that counter-stacks draw cards, says UNO at the right time, and optimizes wild color choices based on its hand.
- **Multiplayer lobby**: Create or join 2–4 player matches over the internet using the boardgame.io server. Finished matches are retained for 15 minutes before cleanup so players can review results.
- **Standalone Python CLI bot**: Join multiplayer matches from the terminal with `python/uno_bot.py` — useful for testing, filling empty seats, or running bot-vs-bot games.
- **Container image available**: Pull the multiplayer server from `registry.gitlab.com/rseward1/myuno:latest` and deploy with podman or Docker. See the README for deployment instructions.
- **Polished game UI**: Dark-themed React interface with a prominent turn indicator and glowing color display pinned to the left edge of the playfield, showing whose turn it is and what color is in play at a glance.