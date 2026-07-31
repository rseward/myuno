# TODO - MyUNO

## Critical: Moves not being processed by boardgame.io v0.50.2

**Problem:** All moves (playCard, drawCard, passTurn, sayUno) are silently rejected by the reducer. `store.getState()` shows no change after any move call -- `_stateID` stays 0, `log` stays empty, `G` unchanged. Even `sayUno` (which just sets a flag, no `endTurn` call) doesn't work.

**Root cause traced:** The reducer's `GetMove()` function (reducer-24ea3e4c.js line 505) returns `null` for all our moves, causing the reducer to reject them as "disallowed move" at line 1027-1029.

**KEY FINDING:** The official boardgame.io tic-tac-toe example (at `examples/react-web/src/tic-tac-toe/game.js` on the boardgame.io GitHub repo) reveals TWO critical differences from our implementation:

### Fix 1: Move signature uses destructured `{ G, playerID }` not `(G, ctx)`

The official example uses:
```js
moves: {
  click_cell({ G, playerID }, id) {
    const cells = [...G.cells];
    if (cells[id] === null) {
      cells[id] = playerID;
      return { ...G, cells };    // RETURNS a new G object
    }
  },
}
```

Our code uses:
```js
moves: {
  drawCard: (G, ctx) => {
    G.hands[player].push(G.deck.pop());  // MUTATES G in place
    // no return statement
  },
}
```

The official example returns a NEW state object (`return { ...G, cells }`). Our code mutates G and returns nothing (undefined). boardgame.io v0.50's Immer-based reducer may not capture mutations when the move function doesn't return G. Try changing all moves to return a new `{ ...G }` object.

### Fix 2: `turn: { minMoves: 1, maxMoves: 1 }`

The official example sets `turn: { minMoves: 1, maxMoves: 1 }`. Our game has an empty `turn: {}`. Without `minMoves`/`maxMoves`, the flow may not properly track move counts and may reject moves. Try adding these.

### Fix 3: No `playerID` prop, just `matchID`

The official singleplayer example renders:
```js
const App = Client({ game: TicTacToe, board: Board, debug: { impl: Debug } });
const Singleplayer = () => <App matchID="single" />;
```

No `playerID` prop, no `numPlayers` on the Client (default is 2). The `matchID` is set to "single". We're not passing `matchID` -- the default is "default" which should be fine, but try passing an explicit `matchID`.

### Fix 4: Moves use `{ G, playerID }` destructuring, not `(G, ctx)`

The first argument to a move is an object containing `{ G, playerID, ...pluginAPIs }`, NOT `(G, ctx)`. Our `ctx` parameter is actually this merged object. So `ctx.currentPlayer` works because it's spread in from the flow, but `ctx.events` might not be available. The official example accesses `playerID` directly from the destructured first arg. Events like `endTurn` may need to be accessed differently.

Try restructuring moves as:
```js
moves: {
  playCard: ({ G, playerID, events }, cardId, chosenColor) => {
    // mutate or return new G
    return { ...G };  // or just mutate G if Immer handles it
    events.endTurn();  // events might be on the first arg
  },
}
```

### Reference files to study next session:

1. **Official tic-tac-toe game.js**: `https://raw.githubusercontent.com/boardgameio/boardgame.io/main/examples/react-web/src/tic-tac-toe/game.js`
2. **Official tic-tac-toe board.js**: `https://raw.githubusercontent.com/boardgameio/boardgame.io/main/examples/react-web/src/tic-tac-toe/board.js`
3. **Official tic-tac-toe singleplayer.js**: `https://raw.githubusercontent.com/boardgameio/boardgame.io/main/examples/react-web/src/tic-tac-toe/singleplayer.js`
4. **FreeBoardGames Bridge** (card game with phases): `https://raw.githubusercontent.com/freeboardgames/FreeBoardGames.org/master/web/src/games/bridge/game.ts`
5. **FreeBoardGames cardtable** (generic card table): `https://github.com/freeboardgames/FreeBoardGames.org/tree/master/web/src/games/cardtable`
6. **boardgame.io chess example** (more complex game with multiple phases): `https://github.com/boardgameio/boardgame.io/tree/main/examples/react-web/src/chess`

### Plan of attack for next session:

1. Rewrite `game.js` moves using the `{ G, playerID, events }` destructured signature
2. Return new G objects from each move (`return { ...G }` or build a new state)
3. Add `turn: { minMoves: 1, maxMoves: 1 }` to the turn config
4. Pass `matchID="single"` in the Client render
5. Remove `numPlayers` from Client config (let it default to 2)
6. Test with the debug panel -- if `_stateID` increments, moves are working
7. Once basic moves work, add back the `endTurn` calls for action cards
8. Add `phases` if needed (Bridge example shows how to structure multi-phase card games)

## Fix: playerID handling once moves work

Once moves are being processed, the `playerID` handling needs attention:

- Currently rendering `<UnoClient />` with no `playerID` prop so `assumedPlayerID` auto-assigns `currentPlayer`. This means the "current player" perspective follows the turn. Player 0 sees Player 0's hand on Player 0's turn, then sees Player 1's hand on Player 1's turn (since `assumedPlayerID` switches).
- For a shared-screen 2-player game, this is actually fine -- the current player's hand is always shown.
- For a "you are always Player 0" mode, pass `playerID="0"` and use `Local()` multiplayer so the Master validates moves. The `isActive` check would then need to pass -- check `isPlayerActive` returns true when `currentPlayer === playerID` (which it does at line 653 of reducer-24ea3e4c.js).

## Feature: Draw-then-play flow

Currently `drawCard` draws one card but doesn't end the turn (except for pending draws). The intended UNO flow is: draw a card, then either play it (if playable) or pass. Ideas:

- Add a `drawnCard` flag to G. After drawing, if the drawn card is playable, the player can play it. If not, they pass.
- Or simplify: `drawCard` draws and automatically ends the turn (draw and pass as one action). Less flexible but simpler.
- Or add a "Play Drawn Card" button that appears after drawing.

## Feature: Card stacking rules

The game supports draw2-on-draw2 and draw4-on-draw4 stacking (the `pendingDraw` logic). But the UI should:

- Show a visual indicator when stacking is possible ("Stack a Draw 2 to pass it along!")
- Highlight only stackable cards in the hand when `pendingDraw > 0`
- Show the pending draw count prominently

## Feature: UNO call enforcement

Currently `sayUno` is a voluntary button. Real UNO rules:

- If a player plays their second-to-last card and doesn't say UNO before the next player starts, they draw 2 penalty cards.
- Implement: when a player goes to 1 card, they have a window to click "Say UNO". If the next player starts their turn and UNO wasn't said, auto-draw 2 penalty cards.

## Feature: AI bot for Player 1

For solo play, implement a simple AI for Player 1:

- On their turn, find the first playable card in hand (matching color or value, or wild).
- If a wild is played, pick the color the AI has the most of.
- If no playable card, draw and pass.
- Could use boardgame.io's built-in `Bot` framework (see `ai-7998b00f.js` in the dist).

## Feature: Multiplayer over the internet

The server file (`src/server/server.js`) is ready. To enable real multiplayer:

1. Start the boardgame.io server: `make server` (port 8000)
2. Change `main.jsx` to use the `Lobby` component instead of `UnoClient`
3. Players connect via the lobby, create/join matches, and play remotely
4. Need to handle: player names, match creation UI, credentials

## Polish: UI improvements

- Card back design: currently shows "UNO" text on a gradient. Could use an actual card back image if one exists in the card images.
- Animations: card slide when playing, draw animation, color picker transition.
- Sound effects: card flip, play, draw, UNO call.
- Responsive layout: current CSS is desktop-only. Mobile layout with smaller cards and horizontal scrolling hand.
- Show whose turn it is more prominently (arrow indicator, highlight current player's area).

## Polish: Debug panel

- The boardgame.io debug panel is enabled in dev mode. Consider disabling it for `make run` (production): set `debug: false` in the Client config when `import.meta.env.PROD`.
- Or keep it but styled to match the dark theme.

## Infrastructure: .gitignore and git init

- Create a `.gitignore` for `node_modules/`, `dist/`, `.env`
- `git init` and initial commit
- The card images in `public/images/cards/` came from `~/tmp/unocards/uno-card-images/` which is already a git repo (github.com/john-costanzo/uno-card-images). Consider submoduling it or crediting properly.

## Infrastructure: .env for production

- The `.env` file sets `VITE_NUM_PLAYERS=2` which affects both `make dev` and `make run` (production build). For production with 4 players, either:
  - Use a separate `.env.production` that overrides to 4
  - Or remove `.env` and set the default in `main.jsx` back to 4, with `make dev` passing the env var differently