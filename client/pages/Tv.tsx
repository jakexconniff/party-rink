import { useEffect, useMemo, useRef, useState } from 'react';
import { makeSocket, useConnected, useRoomState, fmtClock } from '../net/socket';
import { RinkCanvas, type RosterInfo, type SnapBuffer } from '../components/RinkCanvas';
import type { AdvanceAction, ErrorMsg, PublicPlayer, RoomState, ServerInfo, Snapshot, Team } from '../../shared/types';

export function Tv() {
  const socket = useMemo(() => makeSocket('tv'), []);
  const connected = useConnected(socket);
  const room = useRoomState(socket);
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [urlIdx, setUrlIdx] = useState(0);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const buffer = useRef<SnapBuffer>({ items: [] });
  const roster = useRef<RosterInfo>({});

  useEffect(() => {
    let stop = false;
    const load = () =>
      fetch('/api/info')
        .then((r) => r.json())
        .then((i: ServerInfo) => !stop && setInfo(i))
        .catch(() => undefined);
    void load();
    const iv = window.setInterval(load, 15000);
    return () => {
      stop = true;
      window.clearInterval(iv);
    };
  }, []);

  useEffect(() => {
    const onSnap = (s: Snapshot) => {
      const items = buffer.current.items;
      items.push({ snap: s, at: performance.now() });
      if (items.length > 20) items.splice(0, items.length - 20);
      setSnap(s);
    };
    const onErr = (e: ErrorMsg) => {
      setToast(e.message);
      window.setTimeout(() => setToast(null), 3000);
    };
    socket.on('match:snapshot', onSnap);
    socket.on('system:error', onErr);
    return () => {
      socket.off('match:snapshot', onSnap);
      socket.off('system:error', onErr);
    };
  }, [socket]);

  useEffect(() => {
    if (!room) return;
    const r: RosterInfo = {};
    for (const p of room.players) r[p.number] = { name: p.name, connected: p.connected };
    roster.current = r;
    if (!['COUNTDOWN', 'PLAYING', 'GOAL_PAUSE', 'RESULTS'].includes(room.phase)) buffer.current.items = [];
  }, [room]);

  const join = info?.urls[Math.min(urlIdx, Math.max(0, (info?.urls.length ?? 1) - 1))];
  const phase = room?.phase ?? 'LOBBY';
  const inMatch = phase === 'COUNTDOWN' || phase === 'PLAYING' || phase === 'GOAL_PAUSE';

  return (
    <div className="tv-root">
      {!connected ? <div className="conn-banner">Lost connection to the game server — is the terminal window still running?</div> : null}
      {toast ? <div className="conn-banner">{toast}</div> : null}
      {!room ? (
        <div className="tv-center">
          <h1 className="tv-title">Connecting…</h1>
        </div>
      ) : inMatch ? (
        <MatchView room={room} snap={snap} buffer={buffer} roster={roster} />
      ) : phase === 'LOBBY' ? (
        <Lobby room={room} info={info} join={join} onPickUrl={setUrlIdx} />
      ) : phase === 'GAME_SELECT' ? (
        <GameSelect room={room} />
      ) : phase === 'TEAMS' || phase === 'SETTINGS' ? (
        <Teams room={room} />
      ) : (
        <Results room={room} />
      )}
      {room && !inMatch && phase !== 'LOBBY' && join ? (
        <div className="corner-qr">
          <img src={join.qr} alt="" />
          Join
        </div>
      ) : null}
      {info?.isLocal && room ? (
        <>
          <button className="admin-toggle" onClick={() => setAdminOpen((v) => !v)}>
            {adminOpen ? 'Close admin' : 'Admin'}
          </button>
          {adminOpen ? <AdminPanel room={room} socket={socket} /> : null}
        </>
      ) : null}
    </div>
  );
}

function Title() {
  return (
    <h1 className="tv-title">
      <span className="r">PARTY</span> <span className="b">RINK</span>
    </h1>
  );
}

function Badge({ p }: { p: PublicPlayer }) {
  return <span className={`num-badge ${p.team ?? ''}`}>{p.number}</span>;
}

function PlayerLine({ p }: { p: PublicPlayer }) {
  return (
    <>
      <Badge p={p} />
      <span>{p.name}</span>
      {p.isHost ? <span className="pill host">HOST</span> : null}
      {!p.connected ? <span className="pill off">AWAY</span> : null}
    </>
  );
}

function Lobby({
  room,
  info,
  join,
  onPickUrl,
}: {
  room: RoomState;
  info: ServerInfo | null;
  join: ServerInfo['urls'][number] | undefined;
  onPickUrl: (i: number) => void;
}) {
  const slots = Array.from({ length: 8 }, (_, i) => room.players[i]);
  const connected = room.players.filter((p) => p.connected).length;
  const host = room.players.find((p) => p.isHost);
  return (
    <div className="tv-lobby">
      <div>
        {join ? (
          <div className="qr-card">
            <img src={join.qr} alt="Join QR code" />
            <div className="url">{join.url.replace('http://', '')}</div>
            <div className="hint">Scan with your phone camera · same Wi-Fi as this laptop</div>
          </div>
        ) : (
          <div className="warn-box">{info ? info.warning : 'Finding this laptop’s network address…'}</div>
        )}
        {info && info.urls.length > 1 ? (
          <div className="qr-alt">
            QR not working? Try another address:
            <br />
            {info.urls.map((u, i) => (
              <button key={u.url} onClick={() => onPickUrl(i)}>
                {u.ip} <small>({u.iface})</small>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div>
        <Title />
        <p className="tv-sub">Arcade hockey on your phones · 2–8 players · Red vs Blue</p>
        <div className="roster">
          {slots.map((p, i) =>
            p ? (
              <div className="roster-item" key={p.id}>
                <PlayerLine p={p} />
              </div>
            ) : (
              <div className="roster-item empty" key={`e${i}`}>
                <span className="num-badge">{i + 1}</span> open
              </div>
            ),
          )}
        </div>
        <div className="status-line">
          {room.players.length === 0
            ? 'Scan the code to join! The first person to join is the host.'
            : connected < 2
              ? `Waiting for players (${room.players.length}/8) — need at least 2`
              : `Waiting for players (${room.players.length}/8) · ${host?.name ?? 'Host'} can press Continue`}
        </div>
      </div>
    </div>
  );
}

function GameSelect({ room }: { room: RoomState }) {
  const host = room.players.find((p) => p.isHost);
  return (
    <div className="tv-center">
      <Title />
      <div className="game-card">
        <div className="mini-rink" />
        <h2>Ice Hockey</h2>
        <div>Red vs Blue · skate, pass, shoot, score</div>
      </div>
      <div className="check-msg">{host ? `${host.name} (host) is choosing…` : 'Waiting for host…'}</div>
    </div>
  );
}

function TeamColumn({ team, players }: { team: Team; players: PublicPlayer[] }) {
  return (
    <div className={`team-col ${team}`}>
      <h3 className={team === 'RED' ? 'red-t' : 'blue-t'} style={{ color: '#fff' }}>
        {team === 'RED' ? 'RED' : 'BLUE'} ({players.length}){' '}
        <span className="side">{team === 'RED' ? '◀ defends left goal' : 'defends right goal ▶'}</span>
      </h3>
      {players.map((p) => (
        <div className="team-member" key={p.id}>
          <PlayerLine p={p} />
          {p.ready ? <span className="pill ready">READY</span> : null}
        </div>
      ))}
    </div>
  );
}

function Teams({ room }: { room: RoomState }) {
  const red = room.players.filter((p) => p.team === 'RED');
  const blue = room.players.filter((p) => p.team === 'BLUE');
  const none = room.players.filter((p) => !p.team);
  const settings = room.phase === 'SETTINGS';
  return (
    <div className="tv-center">
      <div className="big-msg">{settings ? 'Match settings' : 'Choose your team on your phone'}</div>
      <div className="teams-wrap">
        <TeamColumn team="RED" players={red} />
        <div className="vs">VS</div>
        <TeamColumn team="BLUE" players={blue} />
      </div>
      {none.length ? <div className="unassigned">Still choosing: {none.map((p) => p.name).join(', ')}</div> : null}
      {settings ? (
        <>
          <div className="big-msg">{room.durationSeconds / 60} minute match</div>
          <div className="check-msg ok">Host: press Start Match · first puck drops in 3 seconds</div>
        </>
      ) : (
        <div className={`check-msg ${room.teamCheck.ok ? 'ok' : ''}`}>
          {room.teamCheck.ok ? `${room.teamCheck.reason} Host can press Next.` : room.teamCheck.reason}
        </div>
      )}
    </div>
  );
}

function MatchView({
  room,
  snap,
  buffer,
  roster,
}: {
  room: RoomState;
  snap: Snapshot | null;
  buffer: React.MutableRefObject<SnapBuffer>;
  roster: React.MutableRefObject<RosterInfo>;
}) {
  const s = snap;
  const countdown = s && s.phase === 'COUNTDOWN' ? Math.max(1, Math.ceil(s.countdownMs / 1000)) : null;
  const [go, setGo] = useState(false);
  const prevPhase = useRef<string | null>(null);
  useEffect(() => {
    if (!s) return;
    if (prevPhase.current === 'COUNTDOWN' && s.phase === 'PLAYING') {
      setGo(true);
      const t = window.setTimeout(() => setGo(false), 800);
      prevPhase.current = s.phase;
      return () => window.clearTimeout(t);
    }
    prevPhase.current = s.phase;
  }, [s]);
  const redNames = room.players.filter((p) => p.team === 'RED' && p.inMatch).length;
  const blueNames = room.players.filter((p) => p.team === 'BLUE' && p.inMatch).length;
  return (
    <>
      <div className="scoreboard">
        <div className="sb-team RED">
          RED <span style={{ fontSize: '0.55em', opacity: 0.85 }}>({redNames})</span>
          <span className="sb-score">{s?.score[0] ?? 0}</span>
        </div>
        <div className="sb-clock">{fmtClock(s?.clockMs ?? room.durationSeconds * 1000)}</div>
        <div className="sb-team BLUE">
          <span className="sb-score">{s?.score[1] ?? 0}</span>
          BLUE <span style={{ fontSize: '0.55em', opacity: 0.85 }}>({blueNames})</span>
        </div>
      </div>
      <div className="rink-wrap">
        <RinkCanvas buffer={buffer} roster={roster} />
        {countdown ? (
          <div className="overlay">
            <div className="countdown-num" key={countdown}>
              {countdown}
            </div>
          </div>
        ) : null}
        {go ? (
          <div className="overlay">
            <div className="countdown-num">GO!</div>
          </div>
        ) : null}
        {s?.phase === 'GOAL_PAUSE' && s.lastGoal ? (
          <div className="overlay">
            <div className={`goal-banner ${s.lastGoal}`}>{s.lastGoal} SCORES!</div>
          </div>
        ) : null}
      </div>
    </>
  );
}

function Results({ room }: { room: RoomState }) {
  const r = room.result;
  const host = room.players.find((p) => p.isHost);
  return (
    <div className="tv-center results">
      <div className="big-msg">Final score</div>
      <div className="final">
        <span className="red-t">{r?.red ?? 0}</span> – <span className="blue-t">{r?.blue ?? 0}</span>
      </div>
      <div className={`winner ${r?.winner === 'RED' ? 'red-t' : r?.winner === 'BLUE' ? 'blue-t' : ''}`}>
        {r?.winner === 'DRAW' ? "IT'S A DRAW!" : `${r?.winner} WINS!`}
      </div>
      <div className="teams-wrap">
        <TeamColumn team="RED" players={room.players.filter((p) => p.team === 'RED' && p.inMatch)} />
        <div className="vs">VS</div>
        <TeamColumn team="BLUE" players={room.players.filter((p) => p.team === 'BLUE' && p.inMatch)} />
      </div>
      <div className="check-msg">{host ? `${host.name} (host): Rematch or New game on your phone` : 'Waiting for host…'}</div>
    </div>
  );
}

function AdminPanel({ room, socket }: { room: RoomState; socket: ReturnType<typeof makeSocket> }) {
  const adv = (action: AdvanceAction) => socket.emit('room:advance', { action });
  const actions: Partial<Record<string, [AdvanceAction, string][]>> = {
    LOBBY: [['START', 'Continue to game select']],
    GAME_SELECT: [
      ['CHOOSE_HOCKEY', 'Choose Ice Hockey'],
      ['BACK', 'Back'],
    ],
    TEAMS: [
      ['NEXT', 'Next (settings)'],
      ['BACK', 'Back'],
    ],
    SETTINGS: [
      ['START_MATCH', 'Start match'],
      ['BACK', 'Back to teams'],
    ],
    RESULTS: [
      ['REMATCH', 'Rematch'],
      ['NEW_GAME', 'New game'],
    ],
  };
  const inMatch = ['COUNTDOWN', 'PLAYING', 'GOAL_PAUSE'].includes(room.phase);
  return (
    <div className="admin-panel">
      <div className="lbl">Host override ({room.phase})</div>
      {(actions[room.phase] ?? []).map(([a, label]) => (
        <button key={a} onClick={() => adv(a)}>
          {label}
        </button>
      ))}
      {room.phase === 'SETTINGS'
        ? [300, 600, 900].map((d) => (
            <button key={d} onClick={() => socket.emit('match:duration', { seconds: d })}>
              {d / 60} min {room.durationSeconds === d ? '✓' : ''}
            </button>
          ))
        : null}
      {inMatch ? <button onClick={() => socket.emit('admin:endMatch')}>End match now → results</button> : null}
      <div className="lbl">Safety</div>
      <button
        onClick={() => {
          if (confirm('Go back to the lobby? Players stay joined.')) socket.emit('admin:reset', { keepPlayers: true });
        }}
      >
        Restart lobby (keep players)
      </button>
      <button
        className="danger"
        onClick={() => {
          if (confirm('Full reset? Everyone will need to join again.')) socket.emit('admin:reset', { keepPlayers: false });
        }}
      >
        Full reset (everyone rejoins)
      </button>
      {room.devHooks ? (
        <>
          <div className="lbl">Dev only</div>
          <button onClick={() => socket.emit('dev:goal', { team: 'RED' })}>Force RED goal</button>
          <button onClick={() => socket.emit('dev:goal', { team: 'BLUE' })}>Force BLUE goal</button>
          <button onClick={() => socket.emit('dev:clock', { ms: 10000 })}>Clock → 0:10</button>
        </>
      ) : null}
    </div>
  );
}
