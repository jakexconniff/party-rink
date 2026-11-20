// Dev/QA helper: joins N simulated phones to a running server and plays with random-ish input.
// Usage: npm run fake-phones -- [count=6] [url=http://localhost:3000] [--no-start]
// The first fake phone is host and drives the flow into a match unless --no-start.
import { io } from 'socket.io-client';
import type { JoinedMsg, RoomState } from '../shared/types';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const count = Math.min(8, Number(args[0]) || 6);
const url = args[1] || 'http://localhost:3000';
const autoStart = !process.argv.includes('--no-start');
const names = ['Ava', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay', 'Gus', 'Hana'];

const phones = Array.from({ length: count }, (_, i) => {
  const s = io(url, { auth: { role: 'phone' }, transports: ['websocket'], forceNew: true });
  const st = { me: null as JoinedMsg | null, room: null as RoomState | null, seq: 0, i };
  let asked = false;
  const join = () => {
    asked = true;
    s.emit('player:join', { name: `${names[i]} (bot)`.slice(0, 16) });
  };
  // With --no-start, bots wait until a real person has joined so that person is the host.
  s.on('connect', () => {
    if (autoStart) join();
  });
  s.on('player:joined', (m: JoinedMsg) => (st.me = m));
  s.on('room:state', (r: RoomState) => {
    st.room = r;
    if (!autoStart && !asked && r.phase === 'LOBBY' && r.players.some((p) => !p.name.endsWith('(bot)'))) join();
  });
  s.on('system:error', (e: { message: string }) => console.log(`[${names[i]}] ${e.message}`));
  return { s, st };
});

let stepT = 0;
setInterval(() => {
  stepT += 50;
  for (const { s, st } of phones) {
    const r = st.room;
    if (!r || !st.me) continue;
    const isHost = r.hostId === st.me.playerId;
    const self = r.players.find((p) => p.id === st.me!.playerId);
    if (r.phase === 'TEAMS' && self) {
      const want = st.i % 2 === 0 ? 'RED' : 'BLUE';
      if (self.team !== want) s.emit('player:team', { team: want });
      else if (!self.ready) s.emit('player:ready', { ready: true });
    }
    if (autoStart && isHost && stepT % 1000 === 0) {
      if (r.phase === 'LOBBY' && r.players.length >= count) s.emit('room:advance', { action: 'START' });
      if (r.phase === 'GAME_SELECT') s.emit('room:advance', { action: 'CHOOSE_HOCKEY' });
      if (r.phase === 'TEAMS' && r.teamCheck.ok) s.emit('room:advance', { action: 'NEXT' });
      if (r.phase === 'SETTINGS') s.emit('room:advance', { action: 'START_MATCH' });
    }
    if (r.phase === 'PLAYING' || r.phase === 'COUNTDOWN' || r.phase === 'GOAL_PAUSE') {
      const t = stepT / 1000 + st.i * 1.7;
      const x = Math.cos(t * 0.9) * 0.9 + (st.i % 2 === 0 ? 0.3 : -0.3);
      const y = Math.sin(t * 1.3) * 0.9;
      const shoot = Math.sin(t * 2.1) > 0.6;
      const pass = Math.sin(t * 3.3) > 0.97;
      s.emit('input:state', { seq: ++st.seq, x, y, pass, shoot });
    }
  }
}, 50);

console.log(`${count} fake phones → ${url}${autoStart ? ' (auto-start)' : ''}. Ctrl+C to stop.`);
