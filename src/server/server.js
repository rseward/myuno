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
        || `Player ${metadata.gameover.winner}`;
      console.log(`Match ${matchID} ended, deferring deletion for ${RETENTION_MS / 60000} min (winner: ${winnerName})`);
      return;
    }
  } catch (e) {
    // If we can't fetch metadata, just wipe
  }
  return originalWipe(matchID);
};

// Periodic cleanup: remove matches whose retention period has elapsed
setInterval(() => {
  const entries = [...db.metadata.entries()];
  const now = Date.now();
  for (const [matchID, metadata] of entries) {
    if (metadata.deletedAt && now - metadata.deletedAt > RETENTION_MS) {
      originalWipe(matchID);
      console.log(`Match ${matchID} cleaned up (retention period elapsed)`);
    }
  }
}, 60 * 1000); // check every minute

server.run(PORT, () => {
  console.log(`UNO server running on http://localhost:${PORT}`);
  console.log(`Match retention: ${RETENTION_MS / 60000} min after game end`);
});