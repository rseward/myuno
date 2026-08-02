# UNO Bot — Agent Reference

Autonomous player for the boardgame.io UNO multiplayer server at `http://localhost:8001`.

---

## How to Play a Game (Step by Step)

This section is for AI agents (like Bonsai, Friday, or any LLM assistant) that need to
start a UNO game and have a bot play against a human. Follow these steps exactly.

### Prerequisites

The game server and web client must already be running on the host machine:

- **Game server**: `node src/server/server.js` on port 8001
- **Web client**: `npm run dev` (Vite dev server) on port 3000

You can verify the server is up:

```bash
curl -s http://localhost:8001/games/uno
```

If that returns JSON with a `"matches"` array, the server is running. If it fails, start it:

```bash
cd ~/projects/myuno && node src/server/server.js &
```

### Step 1: Start the bot

Run the bot in the background. It will create a new 2-player match and wait for the
human to join:

```bash
cd ~/projects/myuno
python3.14 python/uno_bot.py --name Friday --verbose &
```

The bot prints output like this when it is ready:

```
[lobby] Created match <MATCH_ID> (2 players)
[lobby] Joined match <MATCH_ID> as seat 0 ('Friday')
[bot] Ready: match=<MATCH_ID>  seat=0  name='Friday'  players=2
[bot] Waiting for all players to join...
[bot] Seats: Friday | [empty] — waiting...
```

**Note the MATCH_ID** in the output — the human needs it to join.

### Step 2: Tell the human to join

The human joins from their web browser. Send them these instructions:

1. Open `http://localhost:3000/?mode=lobby` in your browser
2. Type your name in the name box
3. Find the match with ID **<MATCH_ID>** in the "Open Matches" list
4. Click **Play** next to that match

The bot will detect the human joining and the game starts automatically.

### Step 3: Watch the bot play

The bot plays by itself — no input needed. Each turn it prints:

```
[game] turn=N | top=<card> | color=<color> | *** YOUR TURN ***
[game] last: <what the other player did>
[hand] (N cards): Card1, Card2, ...
[bot] Playing: <moveName> [args]
```

When the human is deciding their move, the bot prints:

```
[game] turn=N | top=<card> | color=<color> | waiting for player 1
```

### Step 4: Game over

When someone wins, the bot prints:

```
[game] GAME OVER — winner: <name>
```

The bot exits automatically. To play another game, repeat from Step 1.

### Playing a Series (Best of N)

To play multiple games in a row, just repeat Steps 1-4 for each game. Keep a running
score tally yourself. The bot does not remember games between runs — each launch is
independent.

### Troubleshooting

| Problem | Fix |
|---------|-----|
| Bot says "Waiting for all players to join..." forever | Human has not joined yet. Tell them the MATCH_ID. |
| `curl localhost:8001` fails | Server is not running. Start it: `cd ~/projects/myuno && node src/server/server.js &` |
| Bot exits immediately with error | Check if the match is already full. Run `python3.14 python/uno_bot.py --status` to see open matches. |
| Port 8001 already in use | Another server instance is running. Find and kill it, or just use the existing one. |
| `python3.14: command not found` | The project requires Python 3.14. Make sure it is installed. |
| Stale matches from previous games | Run `python3.14 python/uno_bot.py --status` to see them. They auto-expire after 15 minutes. |

---

## Quick Start ( condensed)

```bash
# See open matches
python3.14 python/uno_bot.py --status

# Join any open seat (or create a 2-player match if none exists)
python3.14 python/uno_bot.py --name MyBot

# Join a specific match
python3.14 python/uno_bot.py --name MyBot --match <MATCH_ID>

# Create a 3-player match and wait for others
python3.14 python/uno_bot.py --name MyBot --players 3
```

The bot **plays to completion automatically** — no input required after launch. It exits when the game ends.

---

## CLI Reference

```
python3.14 python/uno_bot.py [options]
```

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

---

## Credentials and Identity

Player credentials are issued by the server on first join and saved to the creds file (`~/.uno_bot_creds.json` by default). On subsequent runs:

- Same creds file + same match → **same seat, same identity** (no rejoin needed).
- Use `--creds /tmp/bot2.json` to run **multiple independent bots** on the same machine.

The creds file maps match IDs to `{ playerID, credentials, name }`. Delete it to start fresh.

---

## Lobby Flow

1. `--status` to find available matches and their seat layout.
2. Without `--match`: bot joins the first open seat it finds, or creates a new match.
3. With `--match ID`: bot joins the specified match (or reuses a saved seat in it).
4. The bot **waits in a polling loop** until all seats are filled, then connects and starts playing.

To run two bots against each other:

```bash
# Terminal 1 — creates match, waits
python3.14 python/uno_bot.py --name Alpha --creds /tmp/a.json

# Terminal 2 — joins Alpha's match (auto-detected as the only open seat)
python3.14 python/uno_bot.py --name Beta --creds /tmp/b.json
```

---

## Output Format

Each turn prints:

```
[game] turn=N | top=<card> | color=<color> | *** YOUR TURN *** | waiting for player X
[game] last: <last action message>
[hand] (N cards): Card1, Card2, ...
[bot] Playing: <moveName> [args]
```

End of game:

```
[game] GAME OVER — winner: <name>
```

**Reading the state:**
- `top=` — the current discard pile top card
- `color=` — active color (matters when a Wild was played)
- `pending draw=N` — a Draw 2 or Wild Draw 4 is stacked; this player must draw N or counter-stack
- `*** YOUR TURN ***` — bot is about to move
- `waiting for player X` — bot is idle

---

## UNO Rules (what the bot knows)

**Playable cards:**
- Any card matching the **current color**
- Any card matching the **top card's value** (e.g., two Skips of different colors)
- A **Wild** or **Wild Draw 4** (always playable)

**Special cards:**
| Card | Effect |
|------|--------|
| Skip | Next player loses their turn |
| Reverse | Play direction flips (in 2-player games acts like Skip) |
| Draw 2 | Next player draws 2 and loses turn (stackable) |
| Wild | Player declares new color |
| Wild Draw 4 | Next player draws 4, declares new color (stackable) |

**Stacking:** When a Draw 2 or Wild Draw 4 is active (`pending draw > 0`), the next player may play a matching draw card to stack the penalty, or must draw the full accumulated amount and skip their turn.

**UNO:** When a player reaches 2 cards, they say UNO before playing their second-to-last card.

**Win condition:** First player to empty their hand wins.

---

## Bot Strategy

The bot uses a priority-based strategy:

1. **Pending draw active** → try to counter-stack a matching draw card; otherwise draw the penalty.
2. **2 cards in hand** → say UNO before playing (only if a card is playable).
3. **1 card left** → play it immediately to win (any playable card).
4. **Opponent seems low on cards** → prioritize Skip/Reverse to deny them a turn, or Draw 2 / Wild Draw 4 to bloat their hand.
5. **Normal turn** → prefer color-matching cards over value-matching (preserves flexibility). Play action cards before number cards when opponent is threatening.
6. **Wild card** → save regular Wilds and Wild Draw 4 for when no color match is available. Choose the color most represented in the remaining hand.
7. **No valid card** → draw one card (turn ends automatically).

The bot does not track which specific cards the opponent has played or count the deck precisely, but it uses deck size as a rough heuristic for how close the opponent might be to winning.

---

## Server API (for custom agents)

The server runs on port 8001. REST endpoints:

| Method | Path | Body | Response |
|--------|------|------|----------|
| `GET` | `/games/uno` | — | `{ matches: [...] }` |
| `GET` | `/games/uno/<matchID>` | — | match metadata + player seats |
| `POST` | `/games/uno/create` | `{ numPlayers }` | `{ matchID }` |
| `POST` | `/games/uno/<matchID>/join` | `{ playerID, playerName }` | `{ playerID, playerCredentials }` |
| `POST` | `/games/uno/<matchID>/leave` | `{ playerID, credentials }` | — |

Game moves are sent over **Socket.IO** (namespace `/uno`):

```
# Connect, then emit:
sync  →  (matchID, playerID, credentials, numPlayers)
update →  ({ type: "MAKE_MOVE", payload: { type, args, playerID, credentials } }, stateID, matchID, playerID)

# Server sends:
sync     ←  (matchID, { state, log, filteredMetadata })
update   ←  (matchID, state, log)
patch    ←  (matchID, stateID, newStateID, jsonpatch, log)
matchData ← (matchID, [{ id, name, isConnected }])
```

Valid move names: `playCard`, `drawCard`, `passTurn`, `sayUno`, `setDisplayName`

`playCard` args: `[cardId, chosenColor | null]` — `chosenColor` required for Wild cards (`"red"`, `"yellow"`, `"green"`, `"blue"`).

---

## Common Agent Workflows

**Check if a game is in progress:**
```bash
python3.14 python/uno_bot.py --status
# Look for matches with no [empty] seats and no "FINISHED" label
```

**Join as the second player in an existing match:**
```bash
python3.14 python/uno_bot.py --status          # note the MATCH_ID with one [empty] seat
python3.14 python/uno_bot.py --name Bot --match MATCH_ID
```

**Run two bots, isolated credentials:**
```bash
python3.14 python/uno_bot.py --name BotA --creds /tmp/a.json &
python3.14 python/uno_bot.py --name BotB --creds /tmp/b.json &
wait
```

**3-player game (two bots + one human):**
```bash
# Bot creates the room
python3.14 python/uno_bot.py --name BotA --players 3 --creds /tmp/a.json &
# Second bot joins
python3.14 python/uno_bot.py --name BotB --creds /tmp/b.json &
# Human joins via the web UI at http://localhost:3000?mode=lobby
```

**Leave a match (free the seat):**
```bash
python3.14 python/uno_bot.py --leave <MATCH_ID>
# Uses credentials from default creds file; use --creds to specify another
```