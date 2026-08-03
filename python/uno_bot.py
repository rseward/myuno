#!/usr/bin/env python3.14
"""
python/uno_bot.py — CLI bot/agent for the boardgame.io UNO multiplayer server.

Usage:
  python python/uno_bot.py --name <PlayerName> [options]

Options:
  --name NAME         Player name to register as (required)
  --server URL        Server base URL (default: http://localhost:8001)
  --match ID          Join a specific match ID (default: create or join any open match)
  --players N         Number of players when creating a new match (default: 2)
  --creds FILE        Path to credentials JSON file (default: ~/.uno_bot_creds.json)
  --verbose           Print verbose socket messages
  --status            Print current open matches and exit
  --leave MATCH_ID    Leave a match and exit

The bot plays automatically using a smarter strategy:
  - Counter-stacks Draw 2 / Wild Draw 4 when possible.
  - Says UNO when down to 2 cards.
  - Plays to win immediately when holding 1 playable card.
  - Prioritizes Skip/Reverse when the opponent seems low on cards.
  - Saves Wild cards for when no color match is available.
  - Prefers matching the current color over value-matching (preserves flexibility).
  - Chooses Wild color based on most common color in remaining hand.
  - Draws when no valid play is available.
"""

import argparse
import json
import os
import sys
import time
import threading
import random
from pathlib import Path

import requests
import socketio

COLORS = ['red', 'yellow', 'green', 'blue']

# ── Credentials store ──────────────────────────────────────────────────────────

def load_creds(path: str) -> dict:
    try:
        return json.loads(Path(path).read_text())
    except Exception:
        return {}

def save_creds(path: str, data: dict):
    Path(path).write_text(json.dumps(data, indent=2))

# ── REST helpers ───────────────────────────────────────────────────────────────

def list_matches(server: str) -> list:
    r = requests.get(f"{server}/games/uno", timeout=10)
    r.raise_for_status()
    return r.json().get("matches", [])

def create_match(server: str, num_players: int) -> str:
    r = requests.post(f"{server}/games/uno/create",
                      json={"numPlayers": num_players}, timeout=10)
    r.raise_for_status()
    match_id = r.json()["matchID"]
    print(f"[lobby] Created match {match_id} ({num_players} players)")
    return match_id

def join_match(server: str, match_id: str, player_id: str, player_name: str) -> str:
    r = requests.post(f"{server}/games/uno/{match_id}/join",
                      json={"playerID": player_id, "playerName": player_name},
                      timeout=10)
    r.raise_for_status()
    credentials = r.json()["playerCredentials"]
    print(f"[lobby] Joined match {match_id} as seat {player_id} ('{player_name}')")
    return credentials

def leave_match(server: str, match_id: str, player_id: str, credentials: str):
    r = requests.post(f"{server}/games/uno/{match_id}/leave",
                      json={"playerID": player_id, "credentials": credentials},
                      timeout=10)
    r.raise_for_status()
    print(f"[lobby] Left match {match_id}")

def get_match(server: str, match_id: str) -> dict:
    r = requests.get(f"{server}/games/uno/{match_id}", timeout=10)
    r.raise_for_status()
    return r.json()

# ── Card helpers ───────────────────────────────────────────────────────────────

def card_name(card: dict) -> str:
    if card["color"] == "wild":
        return "Wild Draw 4" if card["value"] == "draw4" else "Wild"
    color = card["color"].capitalize()
    value_map = {"skip": "Skip", "reverse": "Reverse", "draw2": "Draw 2"}
    val = value_map.get(card["value"], card["value"].upper() if len(card["value"]) == 1 else card["value"].capitalize())
    return f"{color} {val}"

def can_play(card: dict, top_card: dict, current_color: str) -> bool:
    if card["color"] == "wild":
        return True
    if card["color"] == current_color:
        return True
    if card["value"] == top_card["value"] and card["color"] != "wild":
        return True
    return False

# best_wild_color is defined below in the bot move logic section

# ── Bot move logic ─────────────────────────────────────────────────────────────

def color_counts(hand: list) -> dict:
    """Count non-wild cards per color in hand."""
    counts = {c: 0 for c in COLORS}
    for card in hand:
        if card["color"] in counts:
            counts[card["color"]] += 1
    return counts

def hand_values(hand: list) -> dict:
    """Count cards per value (for value-matching heuristic)."""
    counts = {}
    for card in hand:
        v = card["value"]
        counts[v] = counts.get(v, 0) + 1
    return counts

def best_wild_color(hand: list, current_color: str = None) -> str:
    """Pick the most frequent non-wild color in hand.
    Falls back to current_color if hand has no colored cards."""
    counts = color_counts(hand)
    best = max(counts, key=counts.get)
    if counts[best] > 0:
        return best
    return current_color or "red"

def is_action_card(card: dict) -> bool:
    """Is this a Skip, Reverse, or Draw card?"""
    return card["value"] in ("skip", "reverse", "draw2", "draw4")

def is_draw_card(card: dict) -> bool:
    return card["value"] in ("draw2", "draw4")

def is_skip_card(card: dict) -> bool:
    return card["value"] in ("skip", "reverse")

def choose_move(G: dict, ctx: dict, player_id: str) -> dict | None:
    """
    Smarter bot strategy with the following priorities:

    1. Pending draw: counter-stack if possible (and beneficial), else draw.
    2. Say UNO at 2 cards (before playing).
    3. If we can win this turn (1 card left, playable), play it.
    4. Play action cards strategically:
       - Play Skip/Reverse when opponent has few cards (keep them locked out).
       - Play Draw 2 / Wild Draw 4 aggressively when opponent is close to winning.
       - Save Wilds for when we have no matching color cards.
    5. Prefer playing cards that leave us with options (keep color diversity).
    6. Prefer matching the current color over value-matching (preserves flexibility).
    7. If nothing playable, draw.

    Move dict keys: 'move', 'args'
    """
    hand = G.get("hands", {}).get(player_id)
    if hand is None:
        return None

    discard = G.get("discardPile", [])
    top_card = discard[-1] if discard else None
    current_color = G.get("currentColor", "red")
    pending_draw = G.get("pendingDraw", 0)

    if top_card is None:
        return {"move": "drawCard", "args": []}

    # --- Pending draw: try to counter-stack, else take the penalty ---
    if pending_draw > 0:
        top_is_draw2 = top_card["value"] == "draw2"
        top_is_draw4 = top_card["value"] == "draw4"
        # Look for a stacking card
        for card in hand:
            if (top_is_draw2 and card["value"] == "draw2") or \
               (top_is_draw4 and card["value"] == "draw4"):
                chosen_color = best_wild_color(hand, current_color) if card["color"] == "wild" else None
                return {"move": "playCard", "args": [card["id"], chosen_color]}
        # Can't stack — must draw the penalty
        return {"move": "drawCard", "args": []}

    # --- Say UNO when at 2 cards (only if we can actually play a card) ---
    if len(hand) == 2 and not G.get("saidUno", {}).get(player_id):
        # Check if we have a playable card — no point saying UNO if we're about to draw
        can_play_any = any(can_play(c, top_card, current_color) for c in hand)
        if can_play_any:
            return {"move": "sayUno", "args": []}
        # Can't play — just draw (don't waste the UNO call)

    # Classify playable cards
    playable = []
    for card in hand:
        if can_play(card, top_card, current_color):
            playable.append(card)

    if not playable:
        return {"move": "drawCard", "args": []}

    # --- If we can win right now (1 card, it's playable), do it ---
    if len(hand) == 1:
        card = playable[0]
        chosen_color = best_wild_color(hand, current_color) if card["color"] == "wild" else None
        return {"move": "playCard", "args": [card["id"], chosen_color]}

    # --- Estimate opponent's card count (heuristic for 2-player) ---
    num_players = ctx.get("numPlayers", 2)
    opponent_low = False
    if num_players == 2:
        # In 2-player, the other player's hand size = total cards dealt - our hand - discard - deck
        # We can't see opponent's hand, but we can estimate from what we know.
        # If the discard pile is large and deck is small, opponent likely has few cards.
        deck_size = G.get("deck", [])
        deck_size = len(deck_size) if isinstance(deck_size, list) else 0
        # Rough heuristic: if deck is getting small, opponent probably has few cards
        opponent_low = deck_size < 20

    # --- Strategy: prioritize plays that hurt the opponent ---
    # Sort playable cards by strategic value
    def card_priority(card):
        """Lower = higher priority. Returns a tuple for sorting."""
        is_wild = card["color"] == "wild"
        is_draw = is_draw_card(card)
        is_skip = is_skip_card(card)
        matches_color = card["color"] == current_color
        matches_value = (not is_wild and card["value"] == top_card["value"] and top_card["color"] != "wild")

        # Priority tiers (lower = play first):
        # 0: Win the game (handled above)
        # 1: Skip/Reverse when opponent might win (deny them a turn)
        # 2: Draw 2 / Wild Draw 4 when opponent is low on cards
        # 3: Non-wild color match (keeps wilds in reserve)
        # 4: Non-wild value match (uses a card, changes color context)
        # 5: Regular Wild (save for emergencies)
        # 6: Wild Draw 4 (save unless opponent is threatening)

        if is_skip and opponent_low:
            return (1, 0)
        if is_draw and (is_wild or not is_wild) and opponent_low:
            return (2, 0)
        if is_skip:
            return (3, 0)
        if is_draw and not is_wild:
            return (4, 0)
        if not is_wild and matches_color:
            return (5, 0)
        if not is_wild and matches_value:
            return (6, 0)
        if is_draw and is_wild:  # Wild Draw 4
            return (7, 0)
        if is_wild:  # Regular Wild
            return (8, 0)
        return (9, 0)

    # Sort playable cards by priority
    playable.sort(key=card_priority)
    chosen = playable[0]

    # --- Wild color choice: pick the color we have the most of ---
    if chosen["color"] == "wild":
        chosen_color = best_wild_color(hand, current_color)
    else:
        chosen_color = None

    return {"move": "playCard", "args": [chosen["id"], chosen_color]}

# ── Action builders (boardgame.io wire format) ────────────────────────────────

def make_move_action(move_name: str, args: list, player_id: str, credentials: str) -> dict:
    return {
        "type": "MAKE_MOVE",
        "payload": {
            "type": move_name,
            "args": args,
            "playerID": player_id,
            "credentials": credentials,
        },
    }

# ── Bot session ────────────────────────────────────────────────────────────────

class UnoBot:
    def __init__(self, server: str, match_id: str, player_id: str,
                 credentials: str, player_name: str, verbose: bool = False):
        self.server = server
        self.match_id = match_id
        self.player_id = player_id
        self.credentials = credentials
        self.player_name = player_name
        self.verbose = verbose

        self.G: dict = {}
        self.ctx: dict = {}
        self.state_id: int = -1
        self.num_players: int = 2
        self.done = threading.Event()
        self._move_pending = False

        self.sio = socketio.SimpleClient()

    def _vprint(self, *args):
        if self.verbose:
            print("[verbose]", *args)

    def _print_state(self):
        hand = self.G.get("hands", {}).get(self.player_id, [])
        discard = self.G.get("discardPile", [])
        top = discard[-1] if discard else None
        current = self.G.get("currentColor", "?")
        pending = self.G.get("pendingDraw", 0)
        current_player = self.ctx.get("currentPlayer", "?")
        msg = self.G.get("lastMessage", "")

        top_name = card_name(top) if top else "none"
        hand_names = [card_name(c) for c in hand]
        my_turn = current_player == self.player_id

        print(f"\n[game] turn={self.ctx.get('turn','?')} | top={top_name} | color={current}"
              + (f" | pending draw={pending}" if pending else "")
              + (f" | {'*** YOUR TURN ***' if my_turn else f'waiting for player {current_player}'}")
              )
        if msg:
            print(f"[game] last: {msg}")
        print(f"[hand] ({len(hand)} cards): {', '.join(hand_names) if hand_names else '(empty)'}")

    def _send_move(self, move: dict):
        if self._move_pending:
            return
        action = make_move_action(move["move"], move["args"], self.player_id, self.credentials)
        self._vprint(f"sending update: {move['move']} {move['args']}")
        self._move_pending = True
        # boardgame.io expects: emit('update', action, stateID, matchID, playerID)
        self.sio.emit("update", (action, self.state_id, self.match_id, self.player_id))
        print(f"[bot] Playing: {move['move']} {move['args']}")

    def _on_sync(self, *args):
        self._vprint(f"sync received ({len(args)} args)")
        if not args:
            return
        match_id = args[0]
        if match_id != self.match_id:
            return
        sync_info = args[1] if len(args) > 1 else {}
        state = sync_info.get("state", {})
        self.G = state.get("G", {})
        self.ctx = state.get("ctx", {})
        self.state_id = state.get("_stateID", -1)
        self._move_pending = False
        self._check_and_play()

    def _on_update(self, *args):
        # Server sends: emit('update', matchID, filteredState, log)  ← 3 args
        self._vprint(f"update received ({len(args)} args)")
        if not args:
            return
        match_id = args[0]
        if match_id != self.match_id:
            return
        # filteredState is args[1]; args[2] is the log
        state = args[1] if len(args) > 1 and isinstance(args[1], dict) else {}
        self.G = state.get("G", self.G)
        self.ctx = state.get("ctx", self.ctx)
        self.state_id = state.get("_stateID", self.state_id)
        self._move_pending = False
        self._check_and_play()

    def _on_patch(self, *args):
        # Server sends: emit('patch', matchID, stateID, newStateID, jsonpatch, log)
        # Applying RFC 6902 JSON patch is complex; trigger a re-sync instead.
        self._vprint(f"patch received ({len(args)} args) — requesting re-sync")
        if not args:
            return
        match_id = args[0]
        if match_id != self.match_id:
            return
        self._move_pending = False
        self.sio.emit("sync", (self.match_id, self.player_id, self.credentials, self.num_players))

    def _on_match_data(self, *args):
        self._vprint(f"matchData: {args[1] if len(args) > 1 else args}")

    def _check_and_play(self):
        # Check gameover
        if self.ctx.get("gameover") is not None:
            winner_id = self.ctx["gameover"].get("winner")
            winner_name = self.G.get("playerNames", {}).get(str(winner_id), f"Player {winner_id}")
            won = str(winner_id) == str(self.player_id)
            me_str = "(that's me!)" if won else ""
            print(f"\n[game] GAME OVER — winner: {winner_name} {me_str}")
            self.done.set()
            return

        self._print_state()

        # Only act on our turn
        if str(self.ctx.get("currentPlayer")) != str(self.player_id):
            return

        # Register our display name on our first turn (fixes "Bot 0" showing
        # instead of our real name in the winner screen)
        player_names = self.G.get("playerNames", {})
        my_current_name = player_names.get(str(self.player_id)) or player_names.get(self.player_id)
        if my_current_name != self.player_name:
            print(f"[bot] Setting display name to '{self.player_name}'...")
            self._send_move({"move": "setDisplayName", "args": [self.player_name]})
            return

        move = choose_move(self.G, self.ctx, self.player_id)
        if move:
            # Small delay so we don't spam moves instantly
            time.sleep(0.4)
            self._send_move(move)

    def run(self):
        ws_url = self.server.replace("http://", "ws://").replace("https://", "wss://")

        print(f"[bot] Connecting to {ws_url} (namespace /uno)")
        try:
            self.sio.connect(ws_url, namespace="/uno",
                             transports=["websocket"])
        except Exception as e:
            print(f"[error] Could not connect: {e}")
            return

        print(f"[bot] Connected. Syncing match {self.match_id} as player {self.player_id} ('{self.player_name}')")
        # boardgame.io expects: emit('sync', matchID, playerID, credentials, numPlayers)
        # python-socketio SimpleClient passes a tuple as multiple socket.io arguments
        self.sio.emit("sync", (self.match_id, self.player_id, self.credentials, self.num_players))

        try:
            while not self.done.is_set():
                try:
                    event = self.sio.receive(timeout=2)
                except socketio.exceptions.TimeoutError:
                    continue

                event_name = event[0]
                args = event[1:]

                if event_name == "sync":
                    self._on_sync(*args)
                elif event_name == "update":
                    self._on_update(*args)
                elif event_name == "patch":
                    self._on_patch(*args)
                elif event_name == "matchData":
                    self._on_match_data(*args)
                else:
                    self._vprint(f"unhandled event: {event_name}")

        except KeyboardInterrupt:
            print("\n[bot] Interrupted.")
        finally:
            self.sio.disconnect()

# ── Lobby helpers ──────────────────────────────────────────────────────────────

def find_or_create_match(server: str, player_name: str, num_players: int,
                          creds_data: dict, creds_path: str) -> tuple[str, str, str]:
    """
    Returns (match_id, player_id, credentials).
    Reuses saved credentials when possible; otherwise joins an open seat or creates a match.
    """
    matches = list_matches(server)

    # If we already have credentials for a match, reuse them
    for saved_key, saved in creds_data.items():
        if saved_key.startswith("match:"):
            mid = saved_key[6:]
            for m in matches:
                if m["matchID"] == mid and not m.get("gameover"):
                    pid = saved["playerID"]
                    creds = saved["credentials"]
                    print(f"[creds] Reusing saved credentials for match {mid} seat {pid}")
                    return mid, pid, creds

    # Try to join an open match (a seat with no name)
    active = [m for m in matches if not m.get("gameover")]
    for m in active:
        players = m.get("players", [])
        free = next((p for p in players if not p.get("name")), None)
        if free is not None:
            mid = m["matchID"]
            pid = str(free["id"])
            try:
                creds = join_match(server, mid, pid, player_name)
                creds_data[f"match:{mid}"] = {"playerID": pid, "credentials": creds, "name": player_name}
                save_creds(creds_path, creds_data)
                return mid, pid, creds
            except Exception as e:
                print(f"[warn] Could not join {mid}: {e}")
                continue

    # Create a new match
    mid = create_match(server, num_players)
    pid = "0"
    creds = join_match(server, mid, pid, player_name)
    creds_data[f"match:{mid}"] = {"playerID": pid, "credentials": creds, "name": player_name}
    save_creds(creds_path, creds_data)
    return mid, pid, creds

def join_specific_match(server: str, match_id: str, player_name: str,
                         creds_data: dict, creds_path: str) -> tuple[str, str]:
    """
    Join (or re-use credentials for) a specific match.
    Returns (player_id, credentials).
    """
    # Check saved creds
    key = f"match:{match_id}"
    if key in creds_data:
        saved = creds_data[key]
        if saved.get("name") == player_name:
            print(f"[creds] Reusing saved credentials for match {match_id} seat {saved['playerID']}")
            return saved["playerID"], saved["credentials"]

    m = get_match(server, match_id)
    players = m.get("players", [])
    free = next((p for p in players if not p.get("name")), None)
    if free is None:
        # Check if we're already seated under a different saved entry
        for p in players:
            if p.get("name") == player_name:
                pid = str(p["id"])
                # Try to find credentials in creds_data
                if key in creds_data and creds_data[key].get("playerID") == pid:
                    return pid, creds_data[key]["credentials"]
        raise RuntimeError(f"Match {match_id} is full and you are not seated.")

    pid = str(free["id"])
    creds = join_match(server, match_id, pid, player_name)
    creds_data[key] = {"playerID": pid, "credentials": creds, "name": player_name}
    save_creds(creds_path, creds_data)
    return pid, creds

# ── CLI ────────────────────────────────────────────────────────────────────────

def print_matches(matches: list):
    if not matches:
        print("No matches found.")
        return
    active = [m for m in matches if not m.get("gameover")]
    finished = [m for m in matches if m.get("gameover")]
    if active:
        print("Open matches:")
        for m in active:
            players = m.get("players", [])
            seats = [p.get("name") or "[empty]" for p in players]
            print(f"  {m['matchID']}  seats: {' | '.join(seats)}")
    if finished:
        print("Finished matches:")
        for m in finished:
            players = m.get("players", [])
            winner_id = m["gameover"].get("winner")
            winner = next((p["name"] for p in players if str(p["id"]) == str(winner_id)), f"Player {winner_id}")
            seats = [p.get("name") or "[empty]" for p in players]
            print(f"  {m['matchID']}  players: {' | '.join(seats)}  winner: {winner}")

def main():
    parser = argparse.ArgumentParser(
        description="UNO bot — joins and plays the boardgame.io UNO server",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--name", "-n", help="Player name to register as")
    parser.add_argument("--server", "-s", default="http://localhost:8001",
                        help="Server base URL (default: http://localhost:8001)")
    parser.add_argument("--match", "-m", default=None,
                        help="Match ID to join (default: join open or create new)")
    parser.add_argument("--players", "-p", type=int, default=2,
                        help="Players when creating a new match (default: 2)")
    parser.add_argument("--creds", default=os.path.expanduser("~/.uno_bot_creds.json"),
                        help="Credentials file path (default: ~/.uno_bot_creds.json)")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="Print verbose socket messages")
    parser.add_argument("--status", action="store_true",
                        help="List current matches and exit")
    parser.add_argument("--leave", metavar="MATCH_ID",
                        help="Leave the specified match and exit")

    args = parser.parse_args()

    creds_data = load_creds(args.creds)

    # --status: list matches and exit
    if args.status:
        matches = list_matches(args.server)
        print_matches(matches)
        return

    # --leave: leave a match and exit
    if args.leave:
        key = f"match:{args.leave}"
        if key not in creds_data:
            print(f"[error] No saved credentials for match {args.leave}")
            sys.exit(1)
        saved = creds_data[key]
        leave_match(args.server, args.leave, saved["playerID"], saved["credentials"])
        del creds_data[key]
        save_creds(args.creds, creds_data)
        return

    if not args.name:
        parser.error("--name is required (unless using --status or --leave)")

    # Resolve match/seat/credentials
    if args.match:
        player_id, credentials = join_specific_match(
            args.server, args.match, args.name, creds_data, args.creds)
        match_id = args.match
    else:
        match_id, player_id, credentials = find_or_create_match(
            args.server, args.name, args.players, creds_data, args.creds)

    # Get match info for num_players
    m = get_match(args.server, match_id)
    num_players = len(m.get("players", []))

    print(f"[bot] Ready: match={match_id}  seat={player_id}  name='{args.name}'  players={num_players}")

    bot = UnoBot(
        server=args.server,
        match_id=match_id,
        player_id=player_id,
        credentials=credentials,
        player_name=args.name,
        verbose=args.verbose,
    )
    bot.num_players = num_players
    bot.run()

if __name__ == "__main__":
    main()
