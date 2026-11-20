import { useEffect, useMemo, useState } from 'react';
import { makeSocket, storage, useConnected, useRoomState, fmtClock } from '../net/socket';
import { Controller } from '../components/Controller';
import {
  DURATIONS,
  MAX_NAME_LENGTH,
  type AdvanceAction,
  type ControlState,
  type ErrorMsg,
  type JoinedMsg,
  type PublicPlayer,
  type RoomState,
} from '../../shared/types';

const TOKEN = 'partyrink.token';
const NAME = 'partyrink.name';
const JOIN_ERRORS = new Set(['NAME_INVALID', 'ROOM_FULL', 'JOIN_CLOSED']);

export function Join() {
  const socket = useMemo(() => makeSocket('phone'), []);
  const connected = useConnected(socket);
  const room = useRoomState(socket);
  const [me, setMe] = useState<JoinedMsg | null>(null);
  const [name, setName] = useState(storage.get(NAME) ?? '');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [moved, setMoved] = useState(false);
  const [cs, setCs] = useState<ControlState | null>(null);
  const [everConnected, setEverConnected] = useState(false);

  useEffect(() => {
    const onConnect = () => {
      setEverConnected(true);
      const tok = storage.get(TOKEN);
      if (tok) {
        setJoining(true);
        socket.emit('player:join', { name: storage.get(NAME) ?? '', reconnectToken: tok });
      }
    };
    const onJoined = (m: JoinedMsg) => {
      storage.set(TOKEN, m.reconnectToken);
      storage.set(NAME, m.name);
      setMe(m);
      setJoining(false);
      setJoinError(null);
      setMoved(false);
    };
    const onError = (e: ErrorMsg) => {
      if (JOIN_ERRORS.has(e.code)) {
        setJoining(false);
        setMe(null);
        storage.del(TOKEN);
        setJoinError(e.message);
      } else if (e.code === 'SESSION_MOVED') {
        setMe(null);
        setMoved(true);
      } else {
        setToast(e.message);
        window.setTimeout(() => setToast(null), 2500);
      }
    };
    const onReset = () => {
      storage.del(TOKEN);
      setMe(null);
      setCs(null);
      setJoinError('The game was reset — join again!');
    };
    socket.on('connect', onConnect);
    socket.on('player:joined', onJoined);
    socket.on('system:error', onError);
    socket.on('room:reset', onReset);
    socket.on('player:controlState', setCs);
    if (socket.connected) onConnect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('player:joined', onJoined);
      socket.off('system:error', onError);
      socket.off('room:reset', onReset);
      socket.off('player:controlState', setCs);
    };
  }, [socket]);

  const self = me && room ? room.players.find((p) => p.id === me.playerId) : undefined;

  // if we were removed from the roster (pruned/reset) drop back to join form
  useEffect(() => {
    if (me && room && !self) {
      setMe(null);
      storage.del(TOKEN);
    }
  }, [me, room, self]);

  const doJoin = () => {
    setJoinError(null);
    setJoining(true);
    socket.emit('player:join', { name, reconnectToken: storage.get(TOKEN) ?? undefined });
  };
  const advance = (action: AdvanceAction) => socket.emit('room:advance', { action });

  const header = (
    <div className="ph-head">
      <span className="logo">
        <span className="red-t">PARTY</span> <span className="blue-t">RINK</span>
      </span>
      <span className="conn-label">
        <span className={`dot ${connected ? '' : 'bad'}`} />
        {connected ? 'Connected' : everConnected ? 'Reconnecting…' : 'Connecting…'}
      </span>
    </div>
  );

  if (moved) {
    return (
      <div className="ph">
        {header}
        <h1>Opened somewhere else</h1>
        <p>Your player is now controlled from another tab or phone.</p>
        <button className="btn" onClick={() => location.reload()}>
          Use this phone instead
        </button>
      </div>
    );
  }

  // --------------------------------------------------------- join form
  if (!me || !self || !room) {
    const waitingForAuto = joining && !!storage.get(TOKEN);
    return (
      <div className="ph">
        {header}
        <h1>Join the game!</h1>
        <p>Type your name, then tap Join.</p>
        {!connected && everConnected ? (
          <div className="err">Lost connection to the game. Check you're on the same Wi-Fi as the TV laptop.</div>
        ) : null}
        {!connected && !everConnected ? <p className="hint-small">Connecting to the game laptop…</p> : null}
        {joinError ? <div className="err">{joinError}</div> : null}
        <input
          type="text"
          inputMode="text"
          autoComplete="nickname"
          autoCapitalize="words"
          enterKeyHint="go"
          maxLength={MAX_NAME_LENGTH * 2}
          placeholder="Your name"
          value={name}
          disabled={waitingForAuto}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') doJoin();
          }}
        />
        <button
          className="btn"
          disabled={!connected || joining || !name.trim() || Array.from(name.trim()).length > MAX_NAME_LENGTH}
          onClick={doJoin}
        >
          {joining ? 'Joining…' : 'Join'}
        </button>
        <p className="hint-small">Max {MAX_NAME_LENGTH} characters. Up to 8 players.</p>
        {room ? (
          <p className="hint-small">
            {room.players.length}/8 joined{room.joinOpen ? '' : ' · joining is closed right now'}
          </p>
        ) : null}
      </div>
    );
  }

  const isHost = room.hostId === self.id;
  const phase = room.phase;

  // --------------------------------------------------------- controller
  const matchPhases = ['COUNTDOWN', 'PLAYING', 'GOAL_PAUSE'];
  if (matchPhases.includes(phase) && self.inMatch && self.team) {
    return (
      <>
        <Controller socket={socket} cs={cs} team={self.team} name={self.name} number={self.number} connected={connected} />
        <div className="rotate-msg">Please rotate your phone to portrait (upright) to play.</div>
      </>
    );
  }

  return (
    <div className="ph">
      {header}
      {!connected ? <div className="err">Reconnecting… keep this page open.</div> : null}
      {toast ? <div className="err">{toast}</div> : null}
      <div className="card me-badge">
        <span className={`num-badge ${self.team ?? ''}`}>{self.number}</span>
        <span>{self.name}</span>
        {isHost ? <span className="pill host">HOST</span> : null}
      </div>
      <PhaseView room={room} self={self} isHost={isHost} advance={advance} socket={socket} />
    </div>
  );
}

function PhaseView({
  room,
  self,
  isHost,
  advance,
  socket,
}: {
  room: RoomState;
  self: PublicPlayer;
  isHost: boolean;
  advance: (a: AdvanceAction) => void;
  socket: ReturnType<typeof makeSocket>;
}) {
  const connectedCount = room.players.filter((p) => p.connected).length;
  const hostName = room.players.find((p) => p.isHost)?.name ?? 'the host';
  switch (room.phase) {
    case 'LOBBY':
      return (
        <>
          <h1>You're in!</h1>
          <p>
            You are Player {self.number}. {isHost ? "You're the host — start when everyone's here." : `Waiting for ${hostName} to start…`}
          </p>
          <div className="mini-roster">
            {room.players.map((p) => (
              <span key={p.id}>
                #{p.number} {p.name}
                {p.connected ? '' : ' (away)'}
              </span>
            ))}
          </div>
          <div className="spacer" />
          {isHost ? (
            <>
              <button className="btn" disabled={!room.canStartLobby} onClick={() => advance('START')}>
                Continue ({connectedCount} players)
              </button>
              {!room.canStartLobby ? <p className="hint-small">Need at least 2 players</p> : null}
            </>
          ) : null}
        </>
      );
    case 'GAME_SELECT':
      return (
        <>
          <h1>Game: Ice Hockey 🏒</h1>
          <p>Red vs Blue arcade hockey. Skate, pass, shoot, score!</p>
          <div className="spacer" />
          {isHost ? (
            <>
              <button className="btn" onClick={() => advance('CHOOSE_HOCKEY')}>
                Play Ice Hockey
              </button>
              <button className="btn secondary" onClick={() => advance('BACK')}>
                Back
              </button>
            </>
          ) : (
            <p className="hint-small">Waiting for {hostName}…</p>
          )}
        </>
      );
    case 'TEAMS': {
      const red = room.players.filter((p) => p.team === 'RED' && p.connected).length;
      const blue = room.players.filter((p) => p.team === 'BLUE' && p.connected).length;
      return (
        <>
          <h1>Pick your team</h1>
          <p>Red defends the LEFT goal, Blue defends the RIGHT.</p>
          <div className="row">
            <button
              className={`btn red ${self.team === 'RED' ? 'selected' : ''}`}
              onClick={() => socket.emit('player:team', { team: 'RED' })}
            >
              RED ({red})
            </button>
            <button
              className={`btn blue ${self.team === 'BLUE' ? 'selected' : ''}`}
              onClick={() => socket.emit('player:team', { team: 'BLUE' })}
            >
              BLUE ({blue})
            </button>
          </div>
          <button
            className={`btn ${self.ready ? 'ok' : 'secondary'}`}
            disabled={!self.team}
            onClick={() => socket.emit('player:ready', { ready: !self.ready })}
          >
            {self.ready ? '✓ READY (tap to undo)' : self.team ? "I'm ready" : 'Pick a team first'}
          </button>
          <p className={`hint-small`}>{room.teamCheck.reason}</p>
          <div className="spacer" />
          {isHost ? (
            <>
              <button className="btn" disabled={!room.teamCheck.ok} onClick={() => advance('NEXT')}>
                Next: match length
              </button>
              <button className="btn secondary" onClick={() => advance('BACK')}>
                Back
              </button>
            </>
          ) : null}
        </>
      );
    }
    case 'SETTINGS':
      return (
        <>
          <h1>Match length</h1>
          <p>
            You're on{' '}
            <b className={self.team === 'RED' ? 'red-t' : 'blue-t'}>{self.team === 'RED' ? 'RED' : 'BLUE'}</b>. First puck
            drops 3 seconds after start.
          </p>
          {isHost ? (
            <>
              <div className="row">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    className={`btn ${room.durationSeconds === d ? '' : 'secondary'}`}
                    onClick={() => socket.emit('match:duration', { seconds: d })}
                  >
                    {d / 60} min
                  </button>
                ))}
              </div>
              <div className="spacer" />
              <button className="btn ok" onClick={() => advance('START_MATCH')}>
                Start Match!
              </button>
              <button className="btn secondary" onClick={() => advance('BACK')}>
                Back to teams
              </button>
            </>
          ) : (
            <p className="hint-small">
              {room.durationSeconds / 60} minute match. Waiting for {hostName} to start…
            </p>
          )}
        </>
      );
    case 'COUNTDOWN':
    case 'PLAYING':
    case 'GOAL_PAUSE':
      return (
        <>
          <h1>Match in progress</h1>
          <p>You'll be able to play in the next round. Watch the TV!</p>
        </>
      );
    case 'RESULTS': {
      const r = room.result;
      return (
        <>
          <h1>
            {r?.winner === 'DRAW' ? "It's a draw!" : r?.winner === 'RED' ? 'RED wins!' : 'BLUE wins!'}
          </h1>
          <p style={{ fontSize: 34, fontWeight: 900, color: '#fff' }}>
            <span className="red-t">{r?.red ?? 0}</span> – <span className="blue-t">{r?.blue ?? 0}</span>
          </p>
          {self.team && r && r.winner === self.team ? <p>🎉 Your team won!</p> : null}
          <div className="spacer" />
          {isHost ? (
            <>
              <button className="btn" onClick={() => advance('REMATCH')}>
                Rematch (same teams)
              </button>
              <button className="btn secondary" onClick={() => advance('NEW_GAME')}>
                New game
              </button>
            </>
          ) : (
            <p className="hint-small">Waiting for {hostName} to pick what's next…</p>
          )}
        </>
      );
    }
    default:
      return <p>{fmtClock(0)}</p>;
  }
}
