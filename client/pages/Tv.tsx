import { useEffect, useMemo, useRef, useState } from 'react';
import { makeSocket, useConnected, useRoomState, fmtClock } from '../net/socket';
import { RinkCanvas, type FxState, type RosterInfo, type SnapBuffer } from '../components/RinkCanvas';
import { HelpSheet } from '../components/Help';
import { TIPS, TIP_ROTATE_MS } from '../../shared/tips';
import type { AdvanceAction, ErrorMsg, MatchEvent, PublicPlayer, RoomState, ServerInfo, Snapshot, Team } from '../../shared/types';

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
  const fx = useRef<FxState>({ callouts: [], quips: [], shakeUntil: 0 });
  const [lastGoalInfo, setLastGoalInfo] = useState<{ scorer: string | null; hatTrick: boolean } | null>(null);

  useEffect(() => {
    const name = (n: number) => roster.current[n]?.name ?? `P${n}`;
    const add = (text: string, color: string, x: number, y: number, big = false) =>
      fx.current.callouts.push({ text, color, x, y, born: performance.now(), big });
    // comic-book burst over the skater who pulled off a skill move
    const burst = (text: string, color: string, by: number, x: number, y: number) =>
      fx.current.callouts.push({ text, color, x, y, born: performance.now(), burst: by });
    const onEvent = (e: MatchEvent) => {
      switch (e.type) {
        case 'goal':
          fx.current.shakeUntil = performance.now() + 500;
          setLastGoalInfo({ scorer: e.scorer ? `#${e.scorer} ${name(e.scorer)}` : null, hatTrick: e.goals === 3 });
          break;
        case 'steal':
          burst('STOLEN!', '#ffd23f', e.by, e.x, e.y);
          break;
        case 'shot':
          if (e.oneTimer) burst('ONE-TIMER!', '#ff8a3d', e.by, e.x, e.y);
          else if (e.perfect) burst('SKILL SHOT!', '#3cff8c', e.by, e.x, e.y);
          break;
        case 'cleanCatch':
          burst('CLEAN CATCH!', '#50e6ff', e.by, e.x, e.y);
          break;
        case 'whiff':
          add('whiff', '#b9c4d6', e.x, e.y);
          break;
        case 'quip':
          fx.current.quips.push({ n: e.by, text: e.text, born: performance.now() });
          break;
      }
    };
    socket.on('match:event', onEvent);
    return () => {
      socket.off('match:event', onEvent);
    };
  }, [socket]);

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
    for (const p of room.players) r[p.number] = { name: p.name, connected: p.connected, look: p.look };
    roster.current = r;
    if (!['COUNTDOWN', 'PLAYING', 'GOAL_PAUSE', 'PAUSED', 'RESULTS'].includes(room.phase)) buffer.current.items = [];
  }, [room]);

  const join = info?.urls[Math.min(urlIdx, Math.max(0, (info?.urls.length ?? 1) - 1))];
  const phase = room?.phase ?? 'LOBBY';
  const inMatch = phase === 'COUNTDOWN' || phase === 'PLAYING' || phase === 'GOAL_PAUSE' || phase === 'PAUSED';

  // Laptop shortcut: P or Space pauses/resumes the match (only works on the laptop itself).
  useEffect(() => {
    if (!info?.isLocal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'p' && e.key !== 'P' && e.key !== ' ') return;
      if (!room || !['COUNTDOWN', 'PLAYING', 'GOAL_PAUSE', 'PAUSED'].includes(room.phase)) return;
      e.preventDefault();
      socket.emit('match:pause', { paused: room.phase !== 'PAUSED' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [info?.isLocal, room, socket]);

  return (
    <div className="tv-root">
      {!connected ? <div className="conn-banner">Lost connection to the game server — is the terminal window still running?</div> : null}
      {toast ? <div className="conn-banner">{toast}</div> : null}
      {!room ? (
        <div className="tv-center">
          <h1 className="tv-title">Connecting…</h1>
        </div>
      ) : inMatch ? (
        <MatchView room={room} snap={snap} buffer={buffer} roster={roster} fx={fx} goalInfo={lastGoalInfo} />
      ) : phase === 'LOBBY' ? (
        <Lobby room={room} info={info} join={join} onPickUrl={setUrlIdx} />
      ) : phase === 'GAME_SELECT' ? (
        <GameSelect room={room} />
      ) : phase === 'TEAMS' || phase === 'SETTINGS' ? (
        <Teams room={room} />
      ) : (
        <Results room={room} socket={socket} canControl={!!info?.isLocal} />
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
      {p.test ? <span className="pill off">{p.dumb ? 'DUMB BOT' : 'TEST'}</span> : null}
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
        {info?.isLocal && connected < 2 ? (
          <div className="tv-sub" style={{ fontSize: '0.9em', marginTop: '0.6em' }}>
            Testing by yourself? Click <b>Admin</b> (bottom-left) → <b>Add test player</b>.
          </div>
        ) : null}
        <TipTicker />
      </div>
    </div>
  );
}

/** Rotating gameplay tip (lobby + results), so people pick up the skill moves while they wait. */
function TipTicker() {
  const [i, setI] = useState(() => Math.floor(Math.random() * TIPS.length));
  useEffect(() => {
    const iv = window.setInterval(() => setI((v) => (v + 1) % TIPS.length), TIP_ROTATE_MS);
    return () => window.clearInterval(iv);
  }, []);
  return (
    <div className="tip-ticker" key={i}>
      <span className="tip-label">TIP</span> {TIPS[i]}
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
  fx,
  goalInfo,
}: {
  room: RoomState;
  snap: Snapshot | null;
  buffer: React.MutableRefObject<SnapBuffer>;
  roster: React.MutableRefObject<RosterInfo>;
  fx: React.MutableRefObject<FxState>;
  goalInfo: { scorer: string | null; hatTrick: boolean } | null;
}) {
  const s = snap;
  const countdown = s && s.phase === 'COUNTDOWN' ? Math.max(1, Math.ceil(s.countdownMs / 1000)) : null;
  const [go, setGo] = useState(false);
  const prevPhase = useRef<string | null>(null);
  const goTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(goTimer.current), []);
  useEffect(() => {
    if (!s) return;
    if (prevPhase.current === 'COUNTDOWN' && s.phase === 'PLAYING') {
      setGo(true);
      window.clearTimeout(goTimer.current);
      goTimer.current = window.setTimeout(() => setGo(false), 800);
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
        <RinkCanvas buffer={buffer} roster={roster} fx={fx} />
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
        {s?.phase === 'PAUSED' ? (
          <div className="tv-paused">
            <h2>⏸ PAUSED</h2>
            <HelpSheet big />
            <div className="check-msg">Host: Resume on your phone · Laptop: press P or Space</div>
          </div>
        ) : null}
        {s?.phase === 'GOAL_PAUSE' && s.lastGoal ? (
          <div className="overlay">
            <div className={`goal-banner ${s.lastGoal}`}>
              {goalInfo?.hatTrick ? 'HAT TRICK!' : `${s.lastGoal} SCORES!`}
              {goalInfo?.scorer ? <div className="goal-scorer">{goalInfo.scorer}</div> : null}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

function Results({
  room,
  socket,
  canControl,
}: {
  room: RoomState;
  socket: ReturnType<typeof makeSocket>;
  canControl: boolean;
}) {
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
      {r?.mvp ? (
        <div className="mvp">
          ⭐ MVP: #{r.mvp} {r.stats.find((p) => p.number === r.mvp)?.name}
        </div>
      ) : null}
      {r?.stats.length ? (
        <table className="stats">
          <thead>
            <tr>
              <th>Player</th>
              <th>Goals</th>
              <th>Shots</th>
              <th>Steals</th>
              <th>One-timers</th>
              <th>Skill shots</th>
              <th>Clean catches</th>
            </tr>
          </thead>
          <tbody>
            {[...r.stats]
              .sort((a, b) => (a.team === b.team ? b.goals - a.goals : a.team === 'RED' ? -1 : 1))
              .map((p) => (
                <tr key={p.number} className={p.number === r.mvp ? 'is-mvp' : ''}>
                  <td>
                    <span className={`num-badge ${p.team}`}>{p.number}</span> {p.name}
                  </td>
                  <td>{p.goals}</td>
                  <td>{p.shots}</td>
                  <td>{p.steals}</td>
                  <td>{p.oneTimers}</td>
                  <td>{p.perfects}</td>
                  <td>{p.catches}</td>
                </tr>
              ))}
          </tbody>
        </table>
      ) : null}
      <TipTicker />
      <div className="check-msg">
        {host ? `${host.name} (host): Rematch or New game on your phone` : 'Waiting for host…'}
      </div>
      {canControl ? (
        <div className="results-actions">
          <button onClick={() => socket.emit('room:advance', { action: 'REMATCH' })}>Rematch</button>
          <button onClick={() => socket.emit('room:advance', { action: 'NEW_GAME' })}>New game</button>
          <button className="primary" onClick={() => socket.emit('admin:reset', { keepPlayers: true })}>
            Back to home
          </button>
        </div>
      ) : null}
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
  const inMatch = ['COUNTDOWN', 'PLAYING', 'GOAL_PAUSE', 'PAUSED'].includes(room.phase);
  const canAddTest = ['LOBBY', 'GAME_SELECT', 'TEAMS'].includes(room.phase) && room.players.length < 8;
  const testCount = room.players.filter((p) => p.test).length;
  return (
    <div className="admin-panel">
      <div className="lbl">Testing alone? Add test players</div>
      <button disabled={!canAddTest} onClick={() => socket.emit('admin:addTestPlayer', { kind: 'smart' })}>
        + Add test player ({testCount})
      </button>
      <button disabled={!canAddTest} onClick={() => socket.emit('admin:addTestPlayer', { kind: 'dumb' })}>
        + Add dumb bot (easy)
      </button>
      {testCount ? (
        <button disabled={inMatch} onClick={() => socket.emit('admin:removeTestPlayers')}>
          Remove test players
        </button>
      ) : null}
      <label className="lbl" style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={room.guideRings}
          onChange={(e) => socket.emit('admin:guideRings', { on: e.target.checked })}
        />
        Timing rings for new players
      </label>
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
      {inMatch ? (
        <button onClick={() => socket.emit('match:pause', { paused: room.phase !== 'PAUSED' })}>
          {room.phase === 'PAUSED' ? '▶ Resume (or press P)' : '⏸ Pause (or press P)'}
        </button>
      ) : null}
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
