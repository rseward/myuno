// UNO Game Logic for boardgame.io
// Based on official UNO rules: https://en.wikipedia.org/wiki/Uno_(card_game)
//
// IMPORTANT: boardgame.io v0.50.2 calls moves as fn({ G, ctx, playerID, events, ... }, ...args)
// The first argument is a context object, NOT (G, ctx). All moves must use destructuring.

const COLORS = ['red', 'yellow', 'green', 'blue'];
const VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];

// Helper: get display name for a player
function playerName(G, playerId) {
  return G.playerNames?.[playerId] || G.playerNames?.[String(playerId)] || G.playerNames?.[parseInt(playerId)] || `Player ${playerId}`;
}

// Build the standard 108-card deck
function buildDeck() {
  const deck = [];
  let id = 0;

  for (const color of COLORS) {
    // One 0 per color
    deck.push({ id: id++, color, value: '0', type: 'number' });
    // Two of each 1-9, skip, reverse, draw2 per color
    for (const value of VALUES.slice(1)) {
      deck.push({ id: id++, color, value, type: value === '0' ? 'number' : (['skip', 'reverse', 'draw2'].includes(value) ? 'action' : 'number') });
      deck.push({ id: id++, color, value, type: value === '0' ? 'number' : (['skip', 'reverse', 'draw2'].includes(value) ? 'action' : 'number') });
    }
  }

  // Four Wild and four Wild Draw 4
  for (let i = 0; i < 4; i++) {
    deck.push({ id: id++, color: 'wild', value: 'wild', type: 'wild' });
    deck.push({ id: id++, color: 'wild', value: 'draw4', type: 'wild' });
  }

  return deck;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Get card image path
export function cardImage(card) {
  if (card.color === 'wild') {
    if (card.value === 'draw4') return '/images/cards/Wild_Card_Draw_4.png';
    return '/images/cards/Wild_Card_Change_Colour.png';
  }
  const colorCap = card.color.charAt(0).toUpperCase() + card.color.slice(1);
  const valueMap = {
    skip: 'Skip',
    reverse: 'Reverse',
    draw2: 'Draw_2',
  };
  const valueCap = valueMap[card.value] || card.value.toUpperCase();
  return `/images/cards/${colorCap}_${valueCap}.png`;
}

// Card display name
export function cardName(card) {
  const colorCap = card.color.charAt(0).toUpperCase() + card.color.slice(1);
  if (card.color === 'wild') {
    return card.value === 'draw4' ? 'Wild Draw 4' : 'Wild';
  }
  const valueMap = {
    skip: 'Skip',
    reverse: 'Reverse',
    draw2: 'Draw 2',
  };
  const valName = valueMap[card.value] || card.value;
  return `${colorCap} ${valName}`;
}

// Check if a card can be played on the current discard pile
function canPlay(card, topCard, currentColor) {
  // Wild cards can always be played
  if (card.color === 'wild') return true;
  // Match color
  if (card.color === currentColor) return true;
  // Match value
  if (card.value === topCard.value && card.color !== 'wild') return true;
  return false;
}

// Game definition
export const UnoGame = {
  name: 'uno',
  minPlayers: 2,
  maxPlayers: 4,

  // setup receives ({ G, ctx, ...pluginAPIs }, setupData)
  // In v0.50.2, ctx.numPlayers is available on the ctx object.
  setup: ({ ctx, random }, setupData) => {
    const numPlayers = ctx.numPlayers || setupData?.numPlayers || 2;
    const deck = shuffle(buildDeck());
    const hands = {};
    const playerNames = setupData?.playerNames || {};
    // Default names for bot seats in single-player mode
    for (let p = 0; p < numPlayers; p++) {
      if (!playerNames[p] && p > 0) playerNames[p] = `Bot ${p}`;
    }

    // Deal 7 cards to each player
    for (let p = 0; p < numPlayers; p++) {
      hands[p] = deck.splice(0, 7);
    }

    // First discard card (must not be a wild draw 4 per rules, but we'll allow it)
    let firstCard = deck.pop();
    // If first card is wild draw4, put it back and draw another
    while (firstCard.value === 'draw4') {
      deck.unshift(firstCard);
      firstCard = deck.pop();
    }

    const currentColor = firstCard.color === 'wild' ? COLORS[Math.floor(Math.random() * 4)] : firstCard.color;

    return {
      deck,
      hands,
      discardPile: [firstCard],
      currentColor,
      currentValues: firstCard,
      // Track pending draw count for stacked draw cards
      pendingDraw: 0,
      // Track if a wild color choice is needed
      wildPlayer: null,
      // Direction: 1 = clockwise, -1 = counter-clockwise
      direction: 1,
      // Player names for display
      playerNames,
      // Winner
      winner: null,
      // Last action message
      lastMessage: '',
      // Track if someone said UNO
      saidUno: {},
    };
  },

  moves: {
    // Play a card from hand
    // v0.50.2 signature: ({ G, ctx, playerID, events }, ...args)
    playCard: ({ G, ctx, playerID, events }, cardId, chosenColor = null) => {
      const player = playerID || ctx.currentPlayer;
      const hand = G.hands[player];
      const cardIndex = hand.findIndex(c => c.id === cardId);

      if (cardIndex === -1) {
        return; // Card not in hand
      }

      const card = hand[cardIndex];
      const topCard = G.discardPile[G.discardPile.length - 1];

      // If there's a pending draw (someone played Draw 2 or Wild Draw 4 and we're the victim)
      // The victim can only play a matching draw card to stack, or must draw
      if (G.pendingDraw > 0) {
        const topIsDraw2 = topCard.value === 'draw2';
        const topIsDraw4 = topCard.value === 'draw4';
        if (topIsDraw2 && card.value !== 'draw2') return;
        if (topIsDraw4 && card.value !== 'draw4') return;
      }

      if (!canPlay(card, topCard, G.currentColor)) {
        return; // Can't play this card
      }

      // Remove card from hand
      hand.splice(cardIndex, 1);

      // Add to discard pile
      G.discardPile.push(card);

      // Set current color
      if (card.color === 'wild') {
        if (chosenColor && COLORS.includes(chosenColor)) {
          G.currentColor = chosenColor;
        } else {
          G.currentColor = COLORS[0];
        }
      } else {
        G.currentColor = card.color;
      }

      G.currentValues = card;
      G.lastMessage = `${playerName(G, player)} played ${cardName(card)}`;

      // Handle action cards
      if (card.value === 'skip') {
        events.endTurn({ skip: 1 });
      } else if (card.value === 'reverse') {
        if (ctx.numPlayers === 2) {
          events.endTurn({ skip: 1 });
        } else {
          G.direction *= -1;
          events.endTurn();
        }
      } else if (card.value === 'draw2') {
        G.pendingDraw += 2;
        events.endTurn();
      } else if (card.value === 'draw4') {
        G.pendingDraw += 4;
        events.endTurn();
      } else {
        events.endTurn();
      }

      // Clear UNO flag if player has more than 1 card
      if (hand.length > 1) {
        G.saidUno[player] = false;
      }

      // Check for win
      if (hand.length === 0) {
        G.winner = player;
        G.lastMessage = `${playerName(G, player)} wins!`;
      }
    },

    // Draw a card from the deck
    drawCard: ({ G, ctx, playerID, events }) => {
      const player = playerID || ctx.currentPlayer;

      // If there's a pending draw, the player must draw those cards
      if (G.pendingDraw > 0) {
        const drawCount = G.pendingDraw;
        for (let i = 0; i < drawCount; i++) {
          if (G.deck.length === 0) {
            const top = G.discardPile.pop();
            G.deck = shuffle(G.discardPile);
            G.discardPile = [top];
          }
          if (G.deck.length > 0) {
            G.hands[player].push(G.deck.pop());
          }
        }
        G.pendingDraw = 0;
        G.lastMessage = `${playerName(G, player)} drew ${drawCount} cards`;
        events.endTurn();
        return;
      }

      // Normal draw - draw 1 card and end turn (draw-and-pass simplification).
      // This makes the bot work: after drawing, the turn ends automatically.
      // A more complex flow could let the player play the drawn card, but
      // that requires stages/phases which complicate the v0.50 local mode.
      if (G.deck.length === 0) {
        const top = G.discardPile.pop();
        G.deck = shuffle(G.discardPile);
        G.discardPile = [top];
      }

      if (G.deck.length > 0) {
        const drawnCard = G.deck.pop();
        G.hands[player].push(drawnCard);
        G.lastMessage = `${playerName(G, player)} drew a card`;
      }
      events.endTurn();
    },

    // Pass turn (after drawing)
    passTurn: ({ G, ctx, playerID, events }) => {
      const player = playerID || ctx.currentPlayer;
      G.lastMessage = `${playerName(G, player)} passed`;
      events.endTurn();
    },

    // Say UNO
    sayUno: ({ G, ctx, playerID }) => {
      const player = playerID || ctx.currentPlayer;
      G.saidUno[player] = true;
      G.lastMessage = `${playerName(G, player)} said UNO!`;
    },

    // Set player display name (called by each client on game start)
    setDisplayName: ({ G, ctx, playerID }, name) => {
      const player = playerID || ctx.currentPlayer;
      if (!G.playerNames) G.playerNames = {};
      G.playerNames[player] = name;
    },
  },

  turn: {
    // No stages -- all moves available during active player's turn.
    // In v0.50 local mode, activePlayers/stages can block moves.
    // No maxMoves: our moves call events.endTurn() manually, which
    // ends the turn. Setting maxMoves=1 would auto-end after any move
    // including sayUno, which we don't want.
  },

  // endIf receives ({ G, ctx, ...pluginAPIs })
  endIf: ({ G, ctx }) => {
    if (G.winner !== null) {
      return { winner: G.winner };
    }
  },

  // AI bot support -- enumerate returns all valid moves for a player.
  // Used by boardgame.io's RandomBot (and MCTSBot) via Local() multiplayer.
  // enumerate receives raw (G, ctx, playerID) -- NOT the destructured context.
  ai: {
    enumerate: (G, ctx, playerID) => {
      const player = playerID || ctx.currentPlayer;
      const hand = G.hands?.[player] || [];
      const topCard = G.discardPile?.[G.discardPile.length - 1];
      const moves = [];

      if (!topCard) return moves;

      // If there's a pending draw, the player can either stack a matching
      // draw card or draw the penalty cards.
      if (G.pendingDraw > 0) {
        const topIsDraw2 = topCard.value === 'draw2';
        const topIsDraw4 = topCard.value === 'draw4';
        for (const card of hand) {
          if ((topIsDraw2 && card.value === 'draw2') ||
              (topIsDraw4 && card.value === 'draw4')) {
            if (card.color === 'wild') {
              // Wild draw cards need a color choice
              for (const color of COLORS) {
                moves.push({ move: 'playCard', args: [card.id, color] });
              }
            } else {
              moves.push({ move: 'playCard', args: [card.id, null] });
            }
          }
        }
        // Can always draw the penalty
        moves.push({ move: 'drawCard', args: [] });
        return moves;
      }

      // Normal play: find all playable cards
      for (const card of hand) {
        // Wild cards can always be played
        if (card.color === 'wild') {
          if (card.value === 'draw4') {
            // Wild Draw 4 needs a color choice
            for (const color of COLORS) {
              moves.push({ move: 'playCard', args: [card.id, color] });
            }
          } else {
            // Regular wild needs a color choice
            for (const color of COLORS) {
              moves.push({ move: 'playCard', args: [card.id, color] });
            }
          }
        } else if (card.color === G.currentColor || card.value === topCard.value) {
          moves.push({ move: 'playCard', args: [card.id, null] });
        }
      }

      // Can always draw a card (draw now ends the turn automatically)
      moves.push({ move: 'drawCard', args: [] });

      // Can say UNO if at 2 cards
      if (hand.length === 2 && !G.saidUno?.[player]) {
        moves.push({ move: 'sayUno', args: [] });
      }

      return moves;
    },
  },
};