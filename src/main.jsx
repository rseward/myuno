import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Client, Lobby } from 'boardgame.io/react';
import { Local } from 'boardgame.io/multiplayer';
import { UnoGame } from './game.js';
import { Board } from './board.jsx';
import { UnoBot } from './uno-bot.js';
import { LobbyView } from './Lobby.jsx';
import './index.css';

// --- Single-player vs AI bot ---
const envNum = import.meta.env?.VITE_NUM_PLAYERS;
const numPlayers = envNum ? parseInt(envNum) : 2;

const UnoClient = Client({
  game: UnoGame,
  numPlayers,
  board: Board,
  multiplayer: Local({ bots: { '1': UnoBot } }),
  debug: true,
});

function SinglePlayer() {
  return <UnoClient matchID="single" playerID="0" playerName="You" />;
}

// --- Multiplayer lobby ---
// Requires the boardgame.io server running on port 8001:
//   node src/server/server.js
// Uses the same hostname as the page for the server URL.
function MultiplayerLobby() {
  const host = window.location.hostname;
  const serverUrl = `http://${host}:8001`;
  return (
    <Lobby
      gameServer={serverUrl}
      lobbyServer={serverUrl}
      gameComponents={[{
        game: UnoGame,
        board: Board,
        name: 'uno',
      }]}
      debug={false}
      renderer={(props) => <LobbyView {...props} />}
    />
  );
}

// --- App with mode toggle ---
// ?mode=lobby in URL starts in lobby mode. The toggle button switches modes.
// The lobby section collapses when a game starts (phase transitions to 'play').
function App() {
  const params = new URLSearchParams(window.location.search);
  const [mode, setMode] = useState(params.get('mode') === 'lobby' ? 'lobby' : 'single');

  return (
    <>
      <div className="fixed top-0 right-0 z-50 bg-uno-panel/80 backdrop-blur px-4 py-2 rounded-bl-xl flex gap-2">
        <button
          onClick={() => setMode('single')}
          className={`px-3 py-1.5 rounded-lg text-sm font-bold transition ${
            mode === 'single' ? 'bg-uno-red text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          vs Bot
        </button>
        <button
          onClick={() => setMode('lobby')}
          className={`px-3 py-1.5 rounded-lg text-sm font-bold transition ${
            mode === 'lobby' ? 'bg-uno-green text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          Multiplayer
        </button>
      </div>
      {mode === 'lobby' ? <MultiplayerLobby /> : <SinglePlayer />}
    </>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);