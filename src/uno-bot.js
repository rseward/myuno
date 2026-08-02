// Smart UNO bot — mirrors the strategy of python/uno_bot.py:
//   - Counter-stacks Draw 2 / Wild Draw 4 when possible.
//   - Says UNO when down to 2 cards (only if a card is playable).
//   - Plays to win immediately when holding 1 playable card.
//   - Prioritizes Skip/Reverse when opponent seems low on cards.
//   - Saves Wild cards for when no color match is available.
//   - Prefers matching the current color over value-matching (preserves flexibility).
//   - Chooses Wild color based on most common color in remaining hand.
//   - Draws when no valid play is available.
//
// Extends boardgame.io's RandomBot (which extends Bot) to inherit the
// random() method and enumerate support.

import { RandomBot } from 'boardgame.io';

const COLORS = ['red', 'yellow', 'green', 'blue'];

// ── Card helpers ─────────────────────────────────────────────────────────────

function canPlay(card, topCard, currentColor) {
  if (card.color === 'wild') return true;
  if (card.color === currentColor) return true;
  if (card.value === topCard.value && card.color !== 'wild') return true;
  return false;
}

function isDrawCard(card) {
  return card.value === 'draw2' || card.value === 'draw4';
}

function isSkipCard(card) {
  return card.value === 'skip' || card.value === 'reverse';
}

function isActionCard(card) {
  return ['skip', 'reverse', 'draw2', 'draw4'].includes(card.value);
}

function colorCounts(hand) {
  const counts = {};
  for (const c of COLORS) counts[c] = 0;
  for (const card of hand) {
    if (card.color in counts) counts[card.color]++;
  }
  return counts;
}

function bestWildColor(hand, currentColor) {
  const counts = colorCounts(hand);
  let best = COLORS[0];
  let bestCount = -1;
  for (const color of COLORS) {
    if (counts[color] > bestCount) {
      bestCount = counts[color];
      best = color;
    }
  }
  if (bestCount > 0) return best;
  return currentColor || 'red';
}

// ── Bot class ────────────────────────────────────────────────────────────────

export class UnoBot extends RandomBot {
  constructor({ game, seed } = {}) {
    super({ enumerate: game.ai.enumerate, seed });
  }

  play({ G, ctx }, playerID) {
    const player = playerID || ctx.currentPlayer;
    const hand = G.hands?.[player] || [];
    const moves = this.enumerate(G, ctx, playerID);

    if (moves.length === 0) {
      return Promise.resolve(null);
    }

    const discard = G.discardPile || [];
    const topCard = discard[discard.length - 1];
    if (!topCard) {
      const drawMove = moves.find(m => m.move === 'drawCard');
      return Promise.resolve({ action: drawMove || this.random(moves) });
    }

    const currentColor = G.currentColor || 'red';
    const pendingDraw = G.pendingDraw || 0;

    // ── 1. Pending draw: try to counter-stack, else take the penalty ────────
    if (pendingDraw > 0) {
      const topIsDraw2 = topCard.value === 'draw2';
      const topIsDraw4 = topCard.value === 'draw4';
      for (const card of hand) {
        if ((topIsDraw2 && card.value === 'draw2') ||
            (topIsDraw4 && card.value === 'draw4')) {
          const move = moves.find(m =>
            m.move === 'playCard' && m.args[0] === card.id
          );
          if (move) {
            let chosen = move;
            if (card.color === 'wild') {
              const chosenColor = bestWildColor(hand, currentColor);
              chosen = { ...move, args: [move.args[0], chosenColor] };
            }
            return Promise.resolve({ action: chosen });
          }
        }
      }
      // Can't stack — must draw the penalty
      const drawMove = moves.find(m => m.move === 'drawCard');
      return Promise.resolve({ action: drawMove || this.random(moves) });
    }

    // ── 2. Say UNO when at 2 cards (only if we can play a card) ─────────────
    if (hand.length === 2 && !G.saidUno?.[player]) {
      const canPlayAny = hand.some(c => canPlay(c, topCard, currentColor));
      if (canPlayAny) {
        const unoMove = moves.find(m => m.move === 'sayUno');
        if (unoMove) {
          return Promise.resolve({ action: unoMove });
        }
      }
    }

    // ── 3. Classify playable cards ──────────────────────────────────────────
    const playable = [];
    for (const card of hand) {
      if (canPlay(card, topCard, currentColor)) {
        const move = moves.find(m =>
          m.move === 'playCard' && m.args[0] === card.id
        );
        if (move) {
          playable.push({ card, move });
        }
      }
    }

    if (playable.length === 0) {
      const drawMove = moves.find(m => m.move === 'drawCard');
      return Promise.resolve({ action: drawMove || this.random(moves) });
    }

    // ── 4. If we can win right now (1 card, it's playable), do it ───────────
    if (hand.length === 1) {
      const { card, move } = playable[0];
      if (card.color === 'wild') {
        const chosenColor = bestWildColor(hand, currentColor);
        return Promise.resolve({ action: { ...move, args: [move.args[0], chosenColor] } });
      }
      return Promise.resolve({ action: move });
    }

    // ── 5. Estimate opponent's card count (heuristic for 2-player) ─────────
    const numPlayers = ctx.numPlayers || 2;
    let opponentLow = false;
    if (numPlayers === 2) {
      const deckSize = Array.isArray(G.deck) ? G.deck.length : 0;
      opponentLow = deckSize < 20;
    }

    // ── 6. Sort playable cards by strategic priority ───────────────────────
    // Lower priority value = play first.
    function cardPriority({ card }) {
      const isWild = card.color === 'wild';
      const isDraw = isDrawCard(card);
      const isSkip = isSkipCard(card);
      const matchesColor = card.color === currentColor;
      const matchesValue = !isWild && card.value === topCard.value && topCard.color !== 'wild';

      // Priority tiers (lower = play first):
      // 0: Win the game (handled above)
      // 1: Skip/Reverse when opponent might win (deny them a turn)
      // 2: Draw 2 / Wild Draw 4 when opponent is low on cards
      // 3: Skip/Reverse (general)
      // 4: Draw 2 (non-wild)
      // 5: Non-wild color match (keeps wilds in reserve)
      // 6: Non-wild value match (uses a card, changes color context)
      // 7: Wild Draw 4 (save unless opponent is threatening)
      // 8: Regular Wild (save for emergencies)

      if (isSkip && opponentLow) return 1;
      if (isDraw && opponentLow) return 2;
      if (isSkip) return 3;
      if (isDraw && !isWild) return 4;
      if (!isWild && matchesColor) return 5;
      if (!isWild && matchesValue) return 6;
      if (isDraw && isWild) return 7;  // Wild Draw 4
      if (isWild) return 8;             // Regular Wild
      return 9;
    }

    playable.sort((a, b) => cardPriority(a) - cardPriority(b));
    const { card, move } = playable[0];

    // ── 7. Wild color choice: pick the color we have the most of ───────────
    if (card.color === 'wild') {
      const chosenColor = bestWildColor(hand, currentColor);
      return Promise.resolve({ action: { ...move, args: [move.args[0], chosenColor] } });
    }

    return Promise.resolve({ action: move });
  }
}