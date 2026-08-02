// boardgame.io multiplayer server
// Wraps the default InMemory DB to defer deletion of finished matches.
// When the last player leaves a game that has ended (gameover is set),
// the match is marked with `deletedAt` instead of being wiped immediately.
// A periodic cleanup timer removes matches 15 minutes after `deletedAt`.

import { Server } from 'boardgame.io/dist/cjs/server.js';
import { UnoGame } from '../game.js';

const PORT = 8001;
const RETENTION_MS = 15 * 60 * 1000; // 15 minutes

const server = Server({
  games: [UnoGame],
  origins: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://beleg:3000',
            'http://localhost:8001', 'http://beleg:8001'],
});

// Grab the internal InMemory db instance and wrap its wipe method
const db = server.db;

const originalWipe = db.wipe.bind(db);
db.wipe = async function (matchID) {
  try {
    const { metadata } = await this.fetch(matchID, { metadata: true });
    if (metadata && metadata.gameover) {
      // Match has ended -- defer deletion
      metadata.deletedAt = Date.now();
      this.metadata.set(matchID, metadata);
      const winnerName = metadata.players?.[metadata.gameover.winner]?.name
        || metadata.players?.[parseInt(metadata.gameover.winner)]?.name
        || `Player ${metadata.gameover.winner}`;
      console.log(`Match ${matchID} ended, deferring deletion for ${RETENTION_MS / 60000} min (winner: ${winnerName})`);
      return;
    }
  } catch (e) {
    // If we can't fetch metadata, just wipe
  }
  return originalWipe(matchID);
};

// Periodic cleanup: remove matches whose retention period has elapsed.
// Two cases:
//   1. Match was ended and a player left -> deletedAt was set by the wipe wrapper.
//   2. Match was ended but nobody left -> use updatedAt as the fallback timestamp.
setInterval(() => {
  const entries = [...db.metadata.entries()];
  const now = Date.now();
  for (const [matchID, metadata] of entries) {
    if (!metadata.gameover) continue;
    const since = metadata.deletedAt || metadata.updatedAt;
    if (since && now - since > RETENTION_MS) {
      originalWipe(matchID);
      console.log(`Match ${matchID} cleaned up (retention period elapsed)`);
    }
  }
}, 60 * 1000); // check every minute

// Debug endpoint: GET /debug/creds?name=Friday&matchID=xxx
// Returns the player credentials for development/testing purposes.
// boardgame.io uses Koa + @koa/router internally.
const Koa = (await import('koa')).default;
const Router = (await import('@koa/router')).default;
const koaCors = (await import('@koa/cors')).default;
const debugApp = new Koa();
const debugRouter = new Router();
debugApp.use(koaCors({ origin: '*' }));
debugRouter.get('/debug/creds', (ctx) => {
  const name = ctx.query.name;
  const matchID = ctx.query.matchID;
  const entries = [...db.metadata.entries()];
  for (const [mid, metadata] of entries) {
    if (matchID && mid !== matchID) continue;
    for (const player of Object.values(metadata.players || {})) {
      if (player.name === name) {
        ctx.body = { matchID: mid, playerID: player.id, credentials: player.credentials };
        return;
      }
    }
  }
  ctx.status = 404;
  ctx.body = { error: 'not found' };
});

// Delete a match by ID (for lobby "Delete" button)
debugRouter.post('/debug/delete/:matchID', (ctx) => {
  const matchID = ctx.params.matchID;
  if (db.metadata.has(matchID)) {
    originalWipe(matchID);
    console.log(`Match ${matchID} deleted via debug endpoint`);
    ctx.body = { ok: true, matchID };
  } else {
    ctx.status = 404;
    ctx.body = { error: 'match not found' };
  }
});
debugApp.use(debugRouter.routes());
debugApp.use(debugRouter.allowedMethods());
debugApp.listen(PORT + 1, () => {
  console.log(`Debug endpoint running on http://localhost:${PORT + 1}`);
});

server.run(PORT, () => {
  console.log(`UNO server running on http://localhost:${PORT}`);
  console.log(`Match retention: ${RETENTION_MS / 60000} min after game end`);
});