// End-to-end smoke test: starts a real Party Rink server (dev hooks on, random port) and drives
// it with real Socket.IO clients. Usage: npm run smoke:8   (exit code 0 = PASS)
import { io, type Socket } from 'socket.io-client';
import { createPartyServer } from '../server/app';
import type { ControlState, ErrorMsg, JoinedMsg, RoomState, Snapshot } from '../shared/types';

const results: { name: string; ok: boolean; detail?: string }[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Client {
  socket: Socket;
  state: RoomState | null = null;
  joined: JoinedMsg | null = null;
  errors: ErrorMsg[] = [];
  snaps: Snapshot[] = [];
  control: ControlState | null = null;
  seq = 0;
  constructor(
    public url: string,
    role: 'tv' | 'phone',
  ) {
    this.socket = io(url, { auth: { role }, transports: ['websocket'], forceNew: true, reconnection: false });
    this.socket.on('room:state', (s: RoomState) => (this.state = s));
    this.socket.on('player:joined', (j: JoinedMsg) => (this.joined = j));
    this.socket.on('system:error', (e: ErrorMsg) => this.errors.push(e));
    this.socket.on('match:snapshot', (s: Snapshot) => {
      this.snaps.push(s);
      if (this.snaps.length > 400) this.snaps.shift();
    });
    this.socket.on('player:controlState', (c: ControlState) => (this.control = c));
  }
  connected() {
    return waitFor(() => this.socket.connected, 5000, 'socket connect');
  }
  emit(ev: string, payload?: unknown) {
    this.socket.emit(ev, payload);
  }
  input(x: number, y: number, pass: boolean, shoot: boolean, cancel = false) {
    this.emit('input:state', { seq: ++this.seq, x, y, pass, shoot, cancel });
  }
  close() {
    this.socket.close();
  }
}

async function waitFor(fn: () => boolean, ms: number, what: string) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return;
    await sleep(15);
  }
  throw new Error(`timeout waiting for ${what}`);
}

async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  PASS  ${name}`);
  } catch (e: any) {
    results.push({ name, ok: false, detail: e?.message ?? String(e) });
    console.log(`  FAIL  ${name}\n        ${e?.message ?? e}`);
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const snapFinite = (s: Snapshot) =>
  [s.clockMs, s.puck[0], s.puck[1], ...s.sk.flatMap((k) => [k.x, k.y, k.fx, k.fy]), ...s.gl.map((g) => g.y)].every(
    Number.isFinite,
  );

async function joinAll(url: string, n: number) {
  const phones: Client[] = [];
  for (let i = 1; i <= n; i++) {
    const c = new Client(url, 'phone');
    await c.connected();
    c.emit('player:join', { name: `Player ${i}` });
    await waitFor(() => !!c.joined, 3000, `Player ${i} joined`);
    phones.push(c);
  }
  return phones;
}

async function toMatch(tv: Client, phones: Client[], red: number) {
  const host = phones[0];
  const phase = (p: string) => waitFor(() => tv.state?.phase === p, 4000, `phase ${p}`);
  host.emit('room:advance', { action: 'START' });
  await phase('GAME_SELECT');
  host.emit('room:advance', { action: 'CHOOSE_HOCKEY' });
  await phase('TEAMS');
  phones.forEach((p, i) => p.emit('player:team', { team: i < red ? 'RED' : 'BLUE' }));
  await sleep(100);
  phones.forEach((p) => p.emit('player:ready', { ready: true }));
  await waitFor(() => !!tv.state?.teamCheck.ok, 3000, 'teams valid');
  host.emit('room:advance', { action: 'NEXT' });
  await phase('SETTINGS');
  host.emit('match:duration', { seconds: 300 });
  await waitFor(() => tv.state?.durationSeconds === 300, 2000, 'duration 300');
  host.emit('room:advance', { action: 'START_MATCH' });
  await phase('COUNTDOWN');
}

function streamRandomInput(phones: Client[], ms: number) {
  return new Promise<void>((resolve) => {
    let t = 0;
    const iv = setInterval(() => {
      t += 40;
      for (const p of phones) {
        const a = Math.random() * Math.PI * 2;
        const shoot = Math.random() < 0.35;
        p.input(Math.cos(a), Math.sin(a), Math.random() < 0.1, shoot, !shoot && Math.random() < 0.05);
      }
      if (t >= ms) {
        clearInterval(iv);
        for (const p of phones) p.input(0, 0, false, false, true);
        resolve();
      }
    }, 40);
  });
}

async function main() {
  const t0 = Date.now();
  const server = await createPartyServer({
    port: 0,
    host: '127.0.0.1',
    devHooks: true,
    client: 'none',
    quiet: true,
    hostGraceMs: 1200,
    pruneMs: 60_000,
  });
  const url = `http://127.0.0.1:${server.port}`;
  console.log(`\nParty Rink smoke test against ${url}\n`);

  const health = await fetch(`${url}/health`).then((r) => r.json());
  await check('GET /health returns ok', () => assert(health.ok === true, 'health not ok'));

  const tv = new Client(url, 'tv');
  await tv.connected();
  let phones: Client[] = [];

  // ---------------------------------------------------------- scenario 1: 8 players, 4v4
  console.log('Scenario 1 — eight players, 4 v 4');
  await check('8 phones join with unique ids/numbers; Player 1 is host', async () => {
    phones = await joinAll(url, 8);
    const ids = new Set(phones.map((p) => p.joined!.playerId));
    const nums = new Set(phones.map((p) => p.joined!.number));
    assert(ids.size === 8 && nums.size === 8, 'ids/numbers not unique');
    await waitFor(() => tv.state?.players.length === 8, 2000, 'TV roster 8');
    assert(tv.state!.hostId === phones[0].joined!.playerId, 'host is not Player 1');
  });

  await check('9th phone gets ROOM_FULL and state is unchanged', async () => {
    const extra = new Client(url, 'phone');
    await extra.connected();
    extra.emit('player:join', { name: 'Ninth' });
    await waitFor(() => extra.errors.length > 0, 2000, '9th error');
    assert(extra.errors[0].code === 'ROOM_FULL', `got ${extra.errors[0].code}`);
    assert(tv.state!.players.length === 8, 'roster changed');
    extra.close();
  });

  await check('non-host cannot advance', async () => {
    phones[3].emit('room:advance', { action: 'START' });
    await waitFor(() => phones[3].errors.some((e) => e.code === 'NOT_HOST'), 2000, 'NOT_HOST');
    assert(tv.state!.phase === 'LOBBY', 'phase changed');
  });

  await check('phones cannot use admin reset/end; unknown actions rejected', async () => {
    phones[2].emit('admin:reset', { keepPlayers: false });
    phones[2].emit('admin:endMatch');
    await waitFor(() => phones[2].errors.filter((e) => e.code === 'NOT_ADMIN').length === 2, 2000, 'NOT_ADMIN');
    phones[2].emit('room:advance', { action: 'HACK' });
    await waitFor(() => phones[2].errors.some((e) => e.code === 'BAD_ACTION'), 2000, 'BAD_ACTION');
    assert(tv.state!.players.length === 8, 'roster changed');
  });

  await check('flow lobby → game → teams 4v4 → settings → countdown → playing', async () => {
    await toMatch(tv, phones, 4);
    await waitFor(() => tv.state?.phase === 'PLAYING', 5000, 'PLAYING after countdown');
    await waitFor(() => phones.every((p) => p.control?.inMatch), 2000, 'controlState inMatch');
  });

  await check('8 controllers stream input for 5s; snapshots finite; skaters move', async () => {
    const before = tv.snaps.at(-1)!;
    await streamRandomInput(phones, 5000);
    const after = tv.snaps.at(-1)!;
    assert(tv.snaps.length > 50, `only ${tv.snaps.length} snapshots`);
    assert(tv.snaps.every(snapFinite), 'non-finite snapshot');
    assert(after.sk.length === 8, 'expected 8 skaters');
    const moved = after.sk.filter((s) => {
      const b = before.sk.find((x) => x.n === s.n)!;
      return Math.hypot(s.x - b.x, s.y - b.y) > 20;
    }).length;
    assert(moved >= 6, `only ${moved} skaters moved`);
  });

  await check('goal (dev hook) increments RED exactly once, pauses, resets to faceoff', async () => {
    await waitFor(() => tv.state?.phase === 'PLAYING', 5000, 'PLAYING');
    const start = tv.snaps.at(-1)!.score;
    tv.emit('dev:goal', { team: 'RED' });
    await waitFor(() => tv.snaps.at(-1)?.phase === 'GOAL_PAUSE', 3000, 'GOAL_PAUSE');
    const during = tv.snaps.at(-1)!;
    assert(during.score[0] === start[0] + 1, `red score ${during.score[0]} expected ${start[0] + 1}`);
    const clockAtGoal = during.clockMs;
    await sleep(1000);
    assert(Math.abs(tv.snaps.at(-1)!.clockMs - clockAtGoal) < 50, 'clock ran during goal pause');
    await waitFor(() => tv.state?.phase === 'PLAYING', 4000, 'PLAYING after goal');
    const s = tv.snaps.at(-1)!;
    assert(s.score[0] === start[0] + 1, 'score changed again');
    assert(Math.abs(s.puck[0] - 600) < 40, `puck not reset to center (${s.puck[0]})`);
  });

  await check('phone reload reclaims the same skater with its token', async () => {
    const old = phones[2];
    const token = old.joined!.reconnectToken;
    const pid = old.joined!.playerId;
    old.close();
    await waitFor(() => tv.state?.players.find((p) => p.id === pid)?.connected === false, 3000, 'marked away');
    await waitFor(() => tv.snaps.at(-1)!.sk.find((k) => k.n === old.joined!.number)?.c === 0, 2000, 'skater away');
    const fresh = new Client(url, 'phone');
    await fresh.connected();
    fresh.emit('player:join', { name: 'whatever', reconnectToken: token });
    await waitFor(() => !!fresh.joined, 3000, 'rejoined');
    assert(fresh.joined!.playerId === pid && fresh.joined!.reclaimed, 'did not reclaim same player');
    await waitFor(() => tv.state?.players.length === 8 && !!tv.state.players.find((p) => p.id === pid)?.connected, 2000, 'connected again');
    phones[2] = fresh;
  });

  await check('stale/invalid input packets are ignored safely', async () => {
    const p = phones[1];
    p.emit('input:state', { seq: -5, x: 1, y: 0, pass: true, shoot: true });
    p.emit('input:state', { seq: 'nope', x: 'a', y: null });
    p.emit('input:state', null);
    p.emit('input:state', { seq: 1e12, x: 1e9, y: -1e9, pass: 1, shoot: 'yes' });
    await sleep(300);
    assert(tv.snaps.slice(-5).every(snapFinite), 'non-finite after bad input');
    p.emit('input:state', { seq: 1e12 + 1, x: 0, y: 0, pass: false, shoot: false });
  });

  await check('clock fast-forward ends match → RESULTS with correct score', async () => {
    tv.emit('dev:clock', { ms: 500 });
    await waitFor(() => tv.state?.phase === 'RESULTS', 5000, 'RESULTS');
    const r = tv.state!.result!;
    const last = tv.snaps.at(-1)!;
    assert(r.red === last.score[0] && r.blue === last.score[1], 'result does not match last snapshot');
    assert(r.winner === (r.red > r.blue ? 'RED' : r.blue > r.red ? 'BLUE' : 'DRAW'), 'wrong winner');
  });

  await check('rematch returns to TEAMS with same teams, ready cleared', async () => {
    phones[0].emit('room:advance', { action: 'REMATCH' });
    await waitFor(() => tv.state?.phase === 'TEAMS', 3000, 'TEAMS');
    const ps = tv.state!.players;
    assert(ps.every((p) => p.team && !p.ready), 'teams lost or ready not cleared');
  });

  // ---------------------------------------------------------- scenario 2: 7 players, 3v4
  console.log('Scenario 2 — seven players, 3 v 4, host loss');
  await check('admin full reset clears everyone', async () => {
    const resets: number[] = [];
    phones.forEach((p, i) => p.socket.on('room:reset', () => resets.push(i)));
    tv.emit('admin:reset', { keepPlayers: false });
    await waitFor(() => tv.state?.phase === 'LOBBY' && tv.state.players.length === 0, 3000, 'empty lobby');
    await waitFor(() => resets.length === 8, 2000, 'phones told to reset');
    phones.forEach((p) => p.close());
  });

  await check('7 join; 2v5 rejected, then 3v4 accepted', async () => {
    phones = await joinAll(url, 7);
    const host = phones[0];
    host.emit('room:advance', { action: 'START' });
    await waitFor(() => tv.state?.phase === 'GAME_SELECT', 3000, 'GAME_SELECT');
    host.emit('room:advance', { action: 'CHOOSE_HOCKEY' });
    await waitFor(() => tv.state?.phase === 'TEAMS', 3000, 'TEAMS');
    phones.forEach((p, i) => p.emit('player:team', { team: i < 2 ? 'RED' : 'BLUE' }));
    await sleep(100);
    phones.forEach((p) => p.emit('player:ready', { ready: true }));
    await waitFor(() => tv.state!.players.every((p) => p.ready), 3000, 'all ready');
    assert(!tv.state!.teamCheck.ok, '2v5 should be invalid');
    host.emit('room:advance', { action: 'NEXT' });
    await waitFor(() => host.errors.some((e) => e.code === 'TEAMS_INVALID'), 2000, 'TEAMS_INVALID');
    phones[2].emit('player:team', { team: 'RED' });
    await sleep(100);
    phones[2].emit('player:ready', { ready: true });
    await waitFor(() => !!tv.state?.teamCheck.ok, 3000, '3v4 valid');
  });

  await check('host disconnect → host passes to Player 2 after grace; new host can continue', async () => {
    const oldHostId = phones[0].joined!.playerId;
    phones[0].close();
    await waitFor(() => !!tv.state && tv.state.hostId !== oldHostId, 4000, 'host transfer');
    assert(tv.state!.hostId === phones[1].joined!.playerId, 'host is not Player 2');
    // the departed host is excluded from the ready/balance check → 2v4 now; fix by moving one
    phones[3].emit('player:team', { team: 'RED' });
    await sleep(100);
    phones[3].emit('player:ready', { ready: true });
    await waitFor(() => !!tv.state?.teamCheck.ok, 3000, 'valid after host left');
    phones[1].emit('room:advance', { action: 'NEXT' });
    await waitFor(() => tv.state?.phase === 'SETTINGS', 3000, 'SETTINGS');
    phones[1].emit('room:advance', { action: 'START_MATCH' });
    await waitFor(() => tv.state?.phase === 'PLAYING', 6000, 'PLAYING');
    assert(tv.snaps.at(-1)!.sk.length === 6, `expected 6 skaters, got ${tv.snaps.at(-1)!.sk.length}`);
  });

  await check('late joiner is refused during the match', async () => {
    const late = new Client(url, 'phone');
    await late.connected();
    late.emit('player:join', { name: 'Late' });
    await waitFor(() => late.errors.length > 0, 2000, 'late error');
    assert(late.errors[0].code === 'JOIN_CLOSED', `got ${late.errors[0].code}`);
    late.close();
  });

  await check('6 controllers play 3s, blue goal counts, end via admin → results → new game', async () => {
    const active = phones.slice(1);
    await streamRandomInput(active, 3000);
    await waitFor(() => tv.state?.phase === 'PLAYING', 5000, 'PLAYING');
    const b0 = tv.snaps.at(-1)!.score[1];
    tv.emit('dev:goal', { team: 'BLUE' });
    await waitFor(() => tv.snaps.at(-1)!.score[1] === b0 + 1, 3000, 'blue goal');
    tv.emit('admin:endMatch');
    await waitFor(() => tv.state?.phase === 'RESULTS', 6000, 'RESULTS');
    assert(tv.state!.result!.blue >= 1, 'blue score missing in result');
    phones[1].emit('room:advance', { action: 'NEW_GAME' });
    await waitFor(() => tv.state?.phase === 'GAME_SELECT', 3000, 'GAME_SELECT');
    assert(tv.snaps.every(snapFinite), 'non-finite snapshot');
  });

  phones.forEach((p) => p.close());
  tv.close();
  await server.close();

  const failed = results.filter((r) => !r.ok);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n${'='.repeat(60)}`);
  console.log(
    failed.length
      ? `SMOKE RESULT: FAIL — ${failed.length} of ${results.length} checks failed (${secs}s)`
      : `SMOKE RESULT: PASS — ${results.length}/${results.length} checks passed (${secs}s)`,
  );
  console.log('='.repeat(60));
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('SMOKE RESULT: FAIL — crashed:', e);
  process.exit(1);
});
