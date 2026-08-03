import React, { useState, useEffect } from 'react';
import { cardImage, cardName } from './game.js';

const COLORS = ['red', 'yellow', 'green', 'blue'];
const COLOR_HEX = {
  red: '#e74c3c',
  yellow: '#f1c40f',
  green: '#27ae60',
  blue: '#3498db',
  wild: '#9b59b6',
};

function CardView({ card, faceDown, onClick, small, playable, selected }) {
  const [showFront, setShowFront] = useState(true);
  if (faceDown) {
    return (
      <div style={styles.cardBack(small)} onClick={onClick}>
        <div style={styles.cardBackLogo(small)}>UNO</div>
      </div>
    );
  }
  return (
    <div
      style={{
        ...styles.card(small),
        border: selected ? '3px solid #fff' : playable ? '3px solid #2ecc71' : '2px solid #333',
        cursor: onClick ? 'pointer' : 'default',
        opacity: onClick && !playable && !selected ? 0.7 : 1,
        boxShadow: selected ? '0 0 12px #fff' : playable ? '0 0 8px #2ecc71' : 'none',
      }}
      onClick={onClick}
    >
      <img src={cardImage(card)} alt={cardName(card)} style={styles.cardImg(small)} draggable={false} />
    </div>
  );
}

function ColorPicker({ onPick }) {
  return (
    <div style={styles.colorPickerOverlay}>
      <div style={styles.colorPickerBox}>
        <h3>Choose a color</h3>
        <div style={styles.colorPickerButtons}>
          {COLORS.map(c => (
            <button
              key={c}
              onClick={() => onPick(c)}
              style={{ ...styles.colorButton, background: COLOR_HEX[c] }}
            >
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Board({ G, ctx, moves, playerID, isActive, playerName: myPlayerName, onExitMatch }) {
  const [selectedCard, setSelectedCard] = useState(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [pendingWildCard, setPendingWildCard] = useState(null);

  // Guard against null G during WebSocket reconnection
  if (!G) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#ccc' }}>
        Connecting to game...
      </div>
    );
  }

  const pid = parseInt(playerID) ?? 0;

  // Register our display name in game state.
  // Must fire when isActive changes because boardgame.io only accepts
  // moves from the active player — calling on mount alone fails for
  // players whose turn hasn't come up yet (their name stays "Bot N").
  useEffect(() => {
    if (myPlayerName && moves?.setDisplayName) {
      moves.setDisplayName(myPlayerName);
    }
  }, [isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const myHand = G.hands?.[pid] || [];
  const topCard = G.discardPile?.[G.discardPile.length - 1];
  // With Local() multiplayer, isActive is true only when it's our turn.
  // No fallback needed -- the bot's turns show "Waiting" with no controls.
  const isMyTurn = isActive || false;
  const pendingDrawForMe = G.pendingDraw > 0 && isMyTurn;

  // Check if a card is playable
  const isPlayable = (card) => {
    if (!isMyTurn) return false;
    if (pendingDrawForMe) {
      // Can only stack matching draw cards
      const topIsDraw2 = topCard?.value === 'draw2';
      const topIsDraw4 = topCard?.value === 'draw4';
      if (topIsDraw2 && card.value !== 'draw2') return false;
      if (topIsDraw4 && card.value !== 'draw4') return false;
      return true;
    }
    if (card.color === 'wild') return true;
    if (card.color === G.currentColor) return true;
    if (card.value === topCard?.value && topCard?.color !== 'wild') return true;
    return false;
  };

  const handlePlayCard = (card) => {
    if (!isPlayable(card)) return;
    if (card.color === 'wild') {
      setPendingWildCard(card);
      setShowColorPicker(true);
    } else {
      moves.playCard(card.id);
      setSelectedCard(null);
    }
  };

  const handleColorPick = (color) => {
    if (pendingWildCard) {
      moves.playCard(pendingWildCard.id, color);
      setPendingWildCard(null);
      setShowColorPicker(false);
      setSelectedCard(null);
    }
  };

  const handleDraw = () => {
    if (!isMyTurn) return;
    moves.drawCard();
    setSelectedCard(null);
  };

  const handlePass = () => {
    if (!isMyTurn) return;
    moves.passTurn();
    setSelectedCard(null);
  };

  const handleSayUno = () => {
    moves.sayUno();
  };

  // Winner banner
  if (G.winner !== null) {
    const winnerName = G.playerNames[G.winner] || G.playerNames?.[String(G.winner)] || G.playerNames?.[parseInt(G.winner)] || `Player ${G.winner}`;
    const isMe = String(G.winner) === String(pid);
    return (
      <div style={styles.winnerScreen}>
        <h1 style={styles.winnerText}>{isMe ? 'You Win!' : `${winnerName} Wins!`}</h1>
        <p style={styles.winnerSub}>UNO champion!</p>
        {onExitMatch && (
          <button
            onClick={onExitMatch}
            style={{
              ...styles.actionBtn,
              marginTop: '30px',
              background: '#27ae60',
              fontSize: '18px',
              padding: '12px 32px',
            }}
          >
            Return to Lobby
          </button>
        )}
      </div>
    );
  }

  // Build opponent views
  const opponents = [];
  for (let i = 0; i < ctx.numPlayers; i++) {
    if (i === pid) continue;
    opponents.push({
      id: i,
      name: G.playerNames[i] || `Player ${i}`,
      cardCount: G.hands[i]?.length || 0,
      isCurrent: i === ctx.currentPlayer,
    });
  }

  return (
    <div style={styles.board}>
      {showColorPicker && <ColorPicker onPick={handleColorPick} />}

      {/* Turn & color indicator — pinned to left edge, vertically centered */}
      <div style={styles.turnIndicator}>
        <div
          className={isMyTurn ? 'turn-glow-active' : ''}
          style={styles.turnText(isMyTurn)}
        >
          {isMyTurn ? 'YOUR TURN' : `${(G.playerNames?.[ctx.currentPlayer] || 'Player ' + ctx.currentPlayer).toUpperCase()}'S TURN`}
        </div>
        <div
          className="color-glow-pulse"
          style={{
            ...styles.colorBox,
            background: COLOR_HEX[G.currentColor] || COLOR_HEX.wild,
            boxShadow: `0 0 24px ${COLOR_HEX[G.currentColor] || COLOR_HEX.wild}AA, inset 0 0 0 3px rgba(255,255,255,0.2)`,
          }}
        >
          <span style={styles.colorBoxText}>{G.currentColor}</span>
        </div>
      </div>

      {/* Status bar — secondary info only (turn + color are in the center panel) */}
      <div style={styles.statusBar}>
        {G.pendingDraw > 0 && (
          <span style={{ ...styles.statusText, color: '#e74c3c', fontWeight: 'bold' }}>
            Pending: +{G.pendingDraw} cards
          </span>
        )}
        {G.lastMessage && <span style={styles.statusMsg}>{G.lastMessage}</span>}
      </div>

      {/* Opponents */}
      <div style={styles.opponentsRow}>
        {opponents.map(opp => (
          <div key={opp.id} style={{
            ...styles.opponent,
            border: opp.isCurrent ? '2px solid #2ecc71' : '2px solid #444',
          }}>
            <span style={styles.oppName}>{opp.name}</span>
            <div style={styles.oppCards}>
              {Array.from({ length: Math.min(opp.cardCount, 7) }).map((_, i) => (
                <CardView key={i} faceDown small />
              ))}
            </div>
            <span style={styles.oppCount}>{opp.cardCount} cards</span>
            {G.saidUno[opp.id] && <span style={styles.unoBadge}>UNO!</span>}
          </div>
        ))}
      </div>

      {/* Center: deck and discard pile */}
      <div style={styles.centerArea}>
        <div style={styles.deckArea}>
          <CardView faceDown onClick={isMyTurn ? handleDraw : null} />
          <span style={styles.deckCount}>{G.deck.length} in deck</span>
        </div>

        <div style={styles.discardArea}>
          {topCard && (
            <div style={styles.discardCard}>
              <CardView card={topCard} />
              {/* Color indicator */}
              <div style={{
                ...styles.colorDot,
                background: COLOR_HEX[G.currentColor],
              }} />
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div style={styles.actionBar}>
        {isMyTurn && (
          <>
            {pendingDrawForMe && (
              <span style={styles.pendingMsg}>
                You must draw {G.pendingDraw} cards (or stack a matching draw card)
              </span>
            )}
            <button
              style={{ ...styles.actionBtn, opacity: isMyTurn ? 1 : 0.4 }}
              onClick={handleDraw}
            >
              {pendingDrawForMe ? `Draw ${G.pendingDraw}` : 'Draw Card'}
            </button>
            {myHand.length === 2 && !G.saidUno[pid] && (
              <button style={{ ...styles.actionBtn, background: '#e74c3c' }} onClick={handleSayUno}>
                Say UNO!
              </button>
            )}
          </>
        )}
      </div>

      {/* My hand */}
      <div style={styles.myHandArea}>
        <div style={styles.myHandLabel}>
          Your Hand ({myHand.length})
        </div>
        <div style={styles.myHand}>
          {myHand.map(card => (
            <CardView
              key={card.id}
              card={card}
              playable={isPlayable(card)}
              selected={selectedCard === card.id}
              onClick={isMyTurn ? () => {
                if (selectedCard === card.id) {
                  handlePlayCard(card);
                } else {
                  setSelectedCard(card.id);
                }
              } : null}
            />
          ))}
        </div>
        {selectedCard !== null && isMyTurn && (
          <div style={styles.hint}>Click the card again to play it</div>
        )}
      </div>
    </div>
  );
}

const styles = {
  board: {
    position: 'relative',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    padding: '10px',
    gap: '8px',
  },
  statusBar: {
    display: 'flex',
    gap: '20px',
    alignItems: 'center',
    flexWrap: 'wrap',
    padding: '8px 12px',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: '8px',
  },
  statusText: { fontSize: '14px', color: '#ccc' },
  statusMsg: { fontSize: '13px', color: '#8899aa', fontStyle: 'italic' },
  opponentsRow: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
    flexWrap: 'wrap',
    padding: '8px',
  },
  opponent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '8px 12px',
    borderRadius: '10px',
    background: 'rgba(255,255,255,0.03)',
  },
  oppName: { fontSize: '13px', color: '#aaa' },
  oppCards: { display: 'flex', gap: '-20px' },
  oppCount: { fontSize: '12px', color: '#888' },
  unoBadge: {
    background: '#e74c3c', color: 'white', padding: '2px 8px',
    borderRadius: '10px', fontSize: '11px', fontWeight: 'bold',
  },
  centerArea: {
    display: 'flex',
    gap: '40px',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '20px',
    flex: 1,
  },
  deckArea: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  deckCount: { fontSize: '12px', color: '#888' },
  discardArea: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  discardCard: {
    position: 'relative',
  },
  colorDot: {
    position: 'absolute',
    bottom: -8,
    right: -8,
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    border: '3px solid white',
  },
  turnIndicator: {
    position: 'absolute',
    left: '16px',
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '14px',
    minWidth: '140px',
    zIndex: 10,
  },
  turnText: (isMyTurn) => ({
    fontSize: '24px',
    fontWeight: '900',
    letterSpacing: '1px',
    color: isMyTurn ? '#2ecc71' : '#888',
    textShadow: isMyTurn ? '0 0 16px rgba(46, 204, 113, 0.6)' : 'none',
    textAlign: 'center',
    lineHeight: '1.2',
  }),
  colorBox: {
    width: '130px',
    height: '78px',
    borderRadius: '14px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    border: '2px solid rgba(255,255,255,0.3)',
    transition: 'background 0.3s ease, box-shadow 0.3s ease',
  },
  colorBoxText: {
    fontSize: '22px',
    fontWeight: '900',
    color: 'rgba(255,255,255,0.9)',
    textTransform: 'capitalize',
    textShadow: '0 2px 6px rgba(0,0,0,0.6)',
    letterSpacing: '2px',
  },
  actionBar: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '8px',
  },
  pendingMsg: { color: '#e74c3c', fontSize: '14px', fontWeight: 'bold' },
  actionBtn: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '8px',
    background: '#3498db',
    color: 'white',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
  },
  myHandArea: {
    padding: '8px',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '10px',
  },
  myHandLabel: { fontSize: '13px', color: '#aaa', marginBottom: '6px' },
  myHand: {
    display: 'flex',
    gap: '4px',
    justifyContent: 'center',
    flexWrap: 'wrap',
    minHeight: '80px',
  },
  hint: { fontSize: '12px', color: '#888', textAlign: 'center', marginTop: '4px' },
  card: (small) => ({
    width: small ? '60px' : '120px',
    height: small ? '84px' : '168px',
    borderRadius: '8px',
    overflow: 'hidden',
    transition: 'all 0.15s',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    background: '#000',
  }),
  cardImg: (small) => ({
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  }),
  cardBack: (small) => ({
    width: small ? '60px' : '120px',
    height: small ? '84px' : '168px',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #2c3e50, #1a1a2e)',
    border: '2px solid #e74c3c',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    cursor: 'pointer',
  }),
  cardBackLogo: (small) => ({
    color: '#e74c3c',
    fontWeight: 'bold',
    fontSize: small ? '14px' : '24px',
    transform: 'rotate(-20deg)',
  }),
  colorPickerOverlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  colorPickerBox: {
    background: '#1a1a2e',
    padding: '30px',
    borderRadius: '16px',
    textAlign: 'center',
  },
  colorPickerButtons: {
    display: 'flex',
    gap: '12px',
    marginTop: '16px',
  },
  colorButton: {
    padding: '15px 25px',
    border: 'none',
    borderRadius: '10px',
    color: 'white',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  winnerScreen: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  },
  winnerText: {
    fontSize: '48px',
    color: '#2ecc71',
  },
  winnerSub: {
    fontSize: '20px',
    color: '#aaa',
    marginTop: '10px',
  },
};