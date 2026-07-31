// Smart UNO bot -- prefers playing cards over drawing, picks the color
// it has the most of for wilds, and says UNO when at 2 cards.
// Extends boardgame.io's RandomBot (which extends Bot) to inherit the
// random() method and enumerate support.

import { RandomBot } from 'boardgame.io';

const COLORS = ['red', 'yellow', 'green', 'blue'];

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

    // Say UNO if at 2 cards and we haven't yet
    if (hand.length === 2 && !G.saidUno?.[player]) {
      const unoMove = moves.find(m => m.move === 'sayUno');
      if (unoMove) {
        return Promise.resolve({ action: unoMove });
      }
    }

    // Prefer playing a card over drawing
    const playMoves = moves.filter(m => m.move === 'playCard');

    if (playMoves.length > 0) {
      // Strategy: prefer action cards (skip, reverse, draw2) to slow opponent,
      // then number cards, then wilds (save wilds for when stuck).
      // Among action cards, prefer draw2/draw4 (most disruptive).
      const actionCards = playMoves.filter(m => {
        const card = hand.find(c => c.id === m.args[0]);
        return card && ['skip', 'reverse', 'draw2', 'draw4'].includes(card.value);
      });

      const numberCards = playMoves.filter(m => {
        const card = hand.find(c => c.id === m.args[0]);
        return card && card.type === 'number';
      });

      const wildCards = playMoves.filter(m => {
        const card = hand.find(c => c.id === m.args[0]);
        return card && card.color === 'wild';
      });

      let chosen;
      if (actionCards.length > 0) {
        // Prefer draw cards (most disruptive)
        const drawCards = actionCards.filter(m => {
          const card = hand.find(c => c.id === m.args[0]);
          return ['draw2', 'draw4'].includes(card.value);
        });
        chosen = drawCards.length > 0 ? this.random(drawCards) : this.random(actionCards);
      } else if (numberCards.length > 0) {
        chosen = this.random(numberCards);
      } else {
        // Must play a wild -- pick the color we have the most of
        chosen = this.random(wildCards);
      }

      // For wild cards, pick the best color (most cards in hand of that color)
      const card = hand.find(c => c.id === chosen.args[0]);
      if (card && card.color === 'wild' && chosen.args[1]) {
        const colorCounts = {};
        for (const c of hand) {
          if (c.color !== 'wild') {
            colorCounts[c.color] = (colorCounts[c.color] || 0) + 1;
          }
        }
        let bestColor = COLORS[0];
        let bestCount = -1;
        for (const color of COLORS) {
          const count = colorCounts[color] || 0;
          if (count > bestCount) {
            bestCount = count;
            bestColor = color;
          }
        }
        chosen = { ...chosen, args: [chosen.args[0], bestColor] };
      }

      return Promise.resolve({ action: chosen });
    }

    // No playable cards -- draw
    const drawMove = moves.find(m => m.move === 'drawCard');
    if (drawMove) {
      return Promise.resolve({ action: drawMove });
    }

    // Fallback: random move
    return Promise.resolve({ action: this.random(moves) });
  }
}