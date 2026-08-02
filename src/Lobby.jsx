import React, { useState } from 'react';

/**
 * Custom dark-themed lobby renderer for boardgame.io's <Lobby> component.
 * Uses the `renderer` prop to get full control over the UI while keeping
 * all the lobby connection / match management logic from boardgame.io.
 *
 * The lobby collapses when a match is running (phase === 'play').
 * Finished matches show the winner and are retained for 15 minutes
 * before being cleaned up by the server.
 */

export function LobbyView({
  errorMsg,
  gameComponents,
  matches,
  phase,
  playerName,
  runningMatch,
  handleEnterLobby,
  handleExitLobby,
  handleCreateMatch,
  handleJoinMatch,
  handleLeaveMatch,
  handleExitMatch,
  handleRefreshMatches,
  handleStartMatch,
}) {
  const [enteredName, setEnteredName] = useState(playerName || '');
  const [selectedGame, setSelectedGame] = useState(0);
  const [numPlayers, setNumPlayers] = useState(2);
  const [deleteError, setDeleteError] = useState('');

  const inGame = phase === 'play';

  // Delete a match via the debug endpoint
  const handleDeleteMatch = async (matchID) => {
    const host = window.location.hostname;
    try {
      const resp = await fetch(`http://${host}:8002/debug/delete/${matchID}`, { method: 'POST' });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      setDeleteError('');
      handleRefreshMatches();
    } catch (e) {
      setDeleteError(`Failed to delete match: ${e.message}`);
    }
  };

  // -- Login phase --
  if (phase === 'enter') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-uno-panel rounded-2xl shadow-2xl p-10 w-full max-w-md border border-slate-700">
          <div className="text-center mb-8">
            <h1 className="text-5xl font-bold text-white tracking-wide">UNO</h1>
            <p className="text-slate-400 mt-2 text-lg">Multiplayer Lobby</p>
          </div>
          <label className="block text-slate-300 text-lg mb-2">
            Choose a player name
          </label>
          <input
            type="text"
            value={enteredName}
            onChange={(e) => setEnteredName(e.target.value.trim())}
            onKeyDown={(e) => e.key === 'Enter' && enteredName && handleEnterLobby(enteredName)}
            placeholder="Your name..."
            className="w-full bg-uno-dark text-white text-lg px-4 py-3 rounded-xl border border-slate-600 focus:border-uno-green focus:outline-none focus:ring-2 focus:ring-uno-green/30 transition mb-4"
          />
          <button
            onClick={() => enteredName && handleEnterLobby(enteredName)}
            disabled={!enteredName}
            className="w-full bg-uno-green hover:bg-green-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-lg font-bold py-3 rounded-xl transition"
          >
            Enter Lobby
          </button>
        </div>
      </div>
    );
  }

  // -- Play phase (match running) --
  // The lobby collapses to a thin bar; the game board renders below.
  if (inGame) {
    return (
      <div className="lobby-collapse expanded">
        <div className="bg-uno-panel border-b border-slate-700 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-uno-green text-xl font-bold">UNO</span>
            <span className="text-slate-400 text-sm">
              Match {runningMatch?.matchID?.slice(0, 8)}... | Player: {playerName}
            </span>
          </div>
          <button
            onClick={handleExitMatch}
            className="bg-uno-red hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold transition"
          >
            Exit Match
          </button>
        </div>
        {/* The running match (game board) is rendered by the parent <Lobby> */}
        {runningMatch && (
          <runningMatch.app
            matchID={runningMatch.matchID}
            playerID={runningMatch.playerID}
            credentials={runningMatch.credentials}
            playerName={playerName}
            onExitMatch={handleExitMatch}
          />
        )}
      </div>
    );
  }

  // -- List phase (lobby main screen) --
  const gameComp = gameComponents[0]; // we only have 'uno'
  const maxP = gameComp?.game?.maxPlayers || 4;
  const minP = gameComp?.game?.minPlayers || 2;
  const playerRange = Array.from({ length: maxP - minP + 1 }, (_, i) => i + minP);

  // Split matches into active and finished
  const activeMatches = matches.filter((m) => !m.gameover);
  const finishedMatches = matches.filter((m) => m.gameover);

  return (
    <div className="min-h-screen p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-bold text-white">UNO Lobby</h1>
          <p className="text-slate-400 text-lg mt-1">
            Welcome, <span className="text-uno-green font-semibold">{playerName}</span>
          </p>
        </div>
        <button
          onClick={handleExitLobby}
          className="bg-slate-700 hover:bg-slate-600 text-white px-5 py-2.5 rounded-lg text-base font-medium transition"
        >
          Exit Lobby
        </button>
      </div>

      {/* Error banner */}
      {errorMsg && (
        <div className="bg-uno-red/20 border border-uno-red text-red-300 rounded-xl px-5 py-3 mb-6 text-base">
          {errorMsg}
        </div>
      )}
      {deleteError && (
        <div className="bg-uno-red/20 border border-uno-red text-red-300 rounded-xl px-5 py-3 mb-6 text-base">
          {deleteError}
        </div>
      )}

      {/* Create match panel */}
      <div className="bg-uno-panel rounded-2xl p-6 mb-8 border border-slate-700 shadow-lg">
        <h2 className="text-xl font-bold text-white mb-4">Create a Match</h2>
        <div className="flex flex-wrap items-end gap-5">
          <div>
            <label className="block text-slate-400 text-sm mb-1.5">Game</label>
            <select
              value={selectedGame}
              onChange={(e) => {
                const idx = parseInt(e.target.value);
                setSelectedGame(idx);
                setNumPlayers(gameComponents[idx].game.minPlayers);
              }}
              className="bg-uno-dark text-white text-lg px-4 py-2.5 rounded-xl border border-slate-600 focus:border-uno-blue focus:outline-none"
            >
              {gameComponents.map((gc, i) => (
                <option key={i} value={i}>{gc.game.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-slate-400 text-sm mb-1.5">Players</label>
            <select
              value={numPlayers}
              onChange={(e) => setNumPlayers(parseInt(e.target.value))}
              className="bg-uno-dark text-white text-lg px-4 py-2.5 rounded-xl border border-slate-600 focus:border-uno-blue focus:outline-none"
            >
              {playerRange.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => handleCreateMatch(gameComponents[selectedGame].game.name, numPlayers)}
            className="bg-uno-blue hover:bg-blue-600 text-white text-lg font-bold px-6 py-2.5 rounded-xl transition"
          >
            Create
          </button>
          <button
            onClick={handleRefreshMatches}
            className="bg-slate-600 hover:bg-slate-500 text-white text-lg font-medium px-5 py-2.5 rounded-xl transition"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Active matches */}
      <div className="bg-uno-panel rounded-2xl p-6 mb-6 border border-slate-700 shadow-lg">
        <h2 className="text-xl font-bold text-white mb-4">Open Matches</h2>
        {activeMatches.length === 0 ? (
          <p className="text-slate-500 text-lg py-8 text-center">
            No active matches. Create one above to get started.
          </p>
        ) : (
          <div className="space-y-3">
            {activeMatches.map((match) => (
              <MatchRow
                key={match.matchID}
                match={match}
                playerName={playerName}
                onJoin={handleJoinMatch}
                onLeave={handleLeaveMatch}
                onPlay={handleStartMatch}
                onDelete={handleDeleteMatch}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recently finished matches */}
      {finishedMatches.length > 0 && (
        <div className="bg-uno-panel rounded-2xl p-6 border border-slate-700 shadow-lg">
          <h2 className="text-xl font-bold text-white mb-1">Recent Results</h2>
          <p className="text-slate-500 text-sm mb-4">
            Finished matches are retained for 15 minutes, then automatically removed.
          </p>
          <div className="space-y-3">
            {finishedMatches.map((match) => (
              <FinishedMatchRow key={match.matchID} match={match} onDelete={handleDeleteMatch} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function MatchRow({ match, playerName, onJoin, onLeave, onPlay, onDelete }) {
  const { matchID, gameName, players, createdAt } = match;
  const playerList = Object.values(players);
  const playerSeat = playerList.find((p) => p.name === playerName);
  const freeSeat = playerList.find((p) => !p.name);
  const isFull = !freeSeat;

  return (
    <div className="bg-uno-dark rounded-xl p-5 border border-slate-700 flex flex-wrap items-center justify-between gap-4">
      {/* Match info */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <span className="text-white text-lg font-semibold">{gameName}</span>
          <span className={`text-sm px-2.5 py-0.5 rounded-full font-medium ${
            isFull && !playerSeat ? 'bg-uno-red/20 text-red-400' : 'bg-uno-green/20 text-green-400'
          }`}>
            {isFull && !playerSeat ? 'FULL' : 'OPEN'}
          </span>
        </div>
        <span className="text-slate-500 text-sm font-mono">
          ID: {matchID.slice(0, 12)}... {createdAt && `| started ${formatTime(createdAt)}`}
        </span>
      </div>

      {/* Seats */}
      <div className="flex gap-2 flex-wrap">
        {playerList.map((p, i) => (
          <div
            key={i}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              p.name
                ? p.name === playerName
                  ? 'bg-uno-green/20 text-green-400 font-semibold'
                  : 'bg-slate-700 text-slate-300'
                : 'bg-slate-800 text-slate-500'
            }`}
          >
            {p.name || '[empty]'}
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {playerSeat && freeSeat && (
          <button
            onClick={() => onLeave(gameName, matchID)}
            className="bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition"
          >
            Leave
          </button>
        )}
        {freeSeat && !playerSeat && (
          <button
            onClick={() => onJoin(gameName, matchID, freeSeat.id.toString())}
            className="bg-uno-green hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold transition"
          >
            Join
          </button>
        )}
        {isFull && playerSeat && (
          <>
            <button
              onClick={() => onPlay(gameName, { matchID, playerID: playerSeat.id.toString(), numPlayers: playerList.length })}
              className="bg-uno-blue hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold transition"
            >
              Play
            </button>
            <button
              onClick={() => onLeave(gameName, matchID)}
              className="bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition"
            >
              Leave
            </button>
          </>
        )}
        {isFull && !playerSeat && (
          <button
            onClick={() => onPlay(gameName, { matchID, numPlayers: playerList.length })}
            className="bg-uno-blue hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold transition"
          >
            Spectate
          </button>
        )}
        <button
          onClick={() => onDelete(matchID)}
          className="bg-uno-red/80 hover:bg-uno-red text-white px-4 py-2 rounded-lg text-sm font-bold transition"
          title="Delete this match"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function FinishedMatchRow({ match, onDelete }) {
  const { matchID, gameName, players, gameover, updatedAt, createdAt } = match;
  const playerList = Object.values(players);
  const winnerId = gameover?.winner;
  const winnerName = playerList.find((p) => String(p.id) === String(winnerId))?.name || `Player ${winnerId}`;

  // Calculate how long ago the match was last updated
  const lastUpdate = updatedAt ? new Date(updatedAt) : null;
  const timeStr = lastUpdate
    ? lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  const startTimeStr = createdAt ? formatTime(createdAt) : '';

  return (
    <div className="bg-uno-dark rounded-xl p-5 border border-slate-700 flex flex-wrap items-center justify-between gap-4 opacity-80">
      {/* Match info */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <span className="text-slate-300 text-lg font-semibold">{gameName}</span>
          <span className="text-sm px-2.5 py-0.5 rounded-full font-medium bg-slate-600 text-slate-300">
            FINISHED
          </span>
        </div>
        <span className="text-slate-500 text-sm font-mono">
          ID: {matchID.slice(0, 12)}... {startTimeStr && `| started ${startTimeStr}`}{timeStr && ` | ended ${timeStr}`}
        </span>
      </div>

      {/* Winner display */}
      <div className="flex items-center gap-3">
        <span className="text-slate-400 text-sm">Winner:</span>
        <span className="text-uno-yellow text-lg font-bold">
          {winnerName}
        </span>
      </div>

      {/* Player seats (read-only) + Delete */}
      <div className="flex items-center gap-2 flex-wrap">
        {playerList.map((p, i) => (
          <div
            key={i}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              p.id === winnerId
                ? 'bg-uno-yellow/20 text-yellow-400 font-semibold'
                : p.name
                  ? 'bg-slate-700 text-slate-400'
                  : 'bg-slate-800 text-slate-600'
            }`}
          >
            {p.name || '[empty]'}
          </div>
        ))}
        <button
          onClick={() => onDelete(matchID)}
          className="bg-uno-red/80 hover:bg-uno-red text-white px-4 py-2 rounded-lg text-sm font-bold transition ml-2"
          title="Delete this match"
        >
          Delete
        </button>
      </div>
    </div>
  );
}