// HTTP + Socket.IO wiring around the pure Room. Used by server/index.ts and the smoke test.
import express from 'express';
import { createServer, type Server as HttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { Server, type Socket } from 'socket.io';
import QRCode from 'qrcode';
import { Room, RoomError, type Actor } from './room';
import { CFG } from './simulation/config';
import { isLocalAddress, lanAddresses } from './lan';
import {
  ADVANCE_ACTIONS,
  type AdvanceAction,
  type ControlState,
  type ErrorMsg,
  type InputMsg,
  type JoinedMsg,
  type ServerInfo,
  type Team,
} from '../shared/types';

export interface PartyServerOptions {
  port: number;
  host?: string;
  devHooks?: boolean;
  lanIp?: string;
  /** 'vite' = dev middleware, 'static' = serve dist/client, 'none' = API/sockets only */
  client: 'vite' | 'static' | 'none';
  hostGraceMs?: number;
  pruneMs?: number;
  quiet?: boolean;
}

export interface PartyServer {
  http: HttpServer;
  io: Server;
  room: Room;
  port: number;
  info: () => Promise<ServerInfo>;
  adminReset: (keepPlayers: boolean) => void;
  close: () => Promise<void>;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** simple per-socket token bucket */
function limiter(ratePerSec: number, burst: number) {
  let tokens = burst;
  let last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(burst, tokens + ((now - last) / 1000) * ratePerSec);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

export async function createPartyServer(opts: PartyServerOptions): Promise<PartyServer> {
  const app = express();
  app.disable('x-powered-by');
  const http = createServer(app);
  const io = new Server(http, { serveClient: false, pingInterval: 5000, pingTimeout: 8000 });
  const room = new Room({ devHooks: opts.devHooks, hostGraceMs: opts.hostGraceMs, pruneMs: opts.pruneMs });
  const log = (...a: unknown[]) => {
    if (!opts.quiet) console.log(new Date().toLocaleTimeString('en-US', { hour12: false }), ...a);
  };

  let actualPort = opts.port;
  const qrCache = new Map<string, string>();
  async function info(isLocal = false): Promise<ServerInfo> {
    const override = opts.lanIp || process.env.LAN_IP || '';
    const addrs = override ? [{ ip: override, iface: 'LAN_IP override', score: 100 }] : lanAddresses();
    const urls = [];
    for (const a of addrs) {
      const url = `http://${a.ip}:${actualPort}/join`;
      let qr = qrCache.get(url);
      if (!qr) {
        qr = await QRCode.toDataURL(url, { margin: 1, width: 560, errorCorrectionLevel: 'M' });
        qrCache.set(url, qr);
      }
      urls.push({ ip: a.ip, url, qr, iface: a.iface });
    }
    return {
      urls,
      port: actualPort,
      lanOverride: !!override,
      warning: urls.length
        ? null
        : 'No Wi-Fi/LAN address found. Connect this laptop to Wi-Fi (not guest) and restart, or set LAN_IP.',
      isLocal,
    };
  }

  // ------------------------------------------------------------ HTTP
  app.get('/health', (_req, res) => {
    res.json({ ok: true, phase: room.phase, players: room.players.length, time: new Date().toISOString() });
  });
  app.get('/api/info', async (req, res) => {
    res.json(await info(isLocalAddress(req.socket.remoteAddress)));
  });
  app.get('/', (req, res) => {
    res.redirect(isLocalAddress(req.socket.remoteAddress) ? '/tv' : '/join');
  });

  let viteClose: (() => Promise<void>) | null = null;
  if (opts.client === 'vite') {
    const { createServer: createVite } = await import('vite');
    const vite = await createVite({
      configFile: path.join(ROOT, 'vite.config.ts'),
      server: { middlewareMode: true, hmr: { server: http } },
      appType: 'custom',
    });
    viteClose = () => vite.close();
    app.use(vite.middlewares);
    app.get(['/tv', '/join'], async (req, res, next) => {
      try {
        const html = fs.readFileSync(path.join(ROOT, 'client', 'index.html'), 'utf8');
        res.type('html').send(await vite.transformIndexHtml(req.originalUrl, html));
      } catch (e) {
        next(e);
      }
    });
  } else if (opts.client === 'static') {
    const dist = path.join(ROOT, 'dist', 'client');
    if (!fs.existsSync(path.join(dist, 'index.html'))) {
      throw new Error('dist/client is missing — run "npm run build" first (or use "npm run party").');
    }
    app.use(express.static(dist, { index: false }));
    app.get(['/tv', '/join'], (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // ------------------------------------------------------------ sockets
  const socketsByPlayer = new Map<string, Socket>();
  function adminReset(keep: boolean) {
    room.resetToLobby(keep);
    if (!keep) {
      io.to('phones').emit('room:reset');
      socketsByPlayer.clear();
    }
    log(`[admin] reset to lobby (${keep ? 'kept players' : 'cleared players'})`);
  }
  const err = (socket: Socket, code: string, message: string) => {
    const p = socket.data.playerId ? room.getPlayer(socket.data.playerId) : undefined;
    log(`[rejected] ${p ? `#${p.number} ${p.name}` : socket.id.slice(0, 5)}: ${code} — ${message}`);
    socket.emit('system:error', { code, message } satisfies ErrorMsg);
  };

  io.on('connection', (socket) => {
    const role = socket.handshake.auth?.role === 'tv' ? 'tv' : 'phone';
    const local = isLocalAddress(socket.handshake.address);
    const allow = limiter(80, 120);
    let playerId: string | null = null;

    if (role === 'tv') {
      socket.join('tv');
      socket.emit('room:state', room.publicState());
    } else {
      socket.join('phones');
      socket.emit('room:state', room.publicState());
    }

    const guard = (fn: (...args: any[]) => void) =>
      (...args: any[]) => {
        if (!allow()) return;
        try {
          fn(...args);
        } catch (e) {
          if (e instanceof RoomError) err(socket, e.code, e.message);
          else {
            console.error(e);
            err(socket, 'SERVER_ERROR', 'Something went wrong');
          }
        }
      };
    const me = (): Actor => {
      if (!playerId) throw new RoomError('NOT_JOINED', 'Join first');
      return { kind: 'player', id: playerId };
    };
    const adminGuard = () => {
      if (!local || role !== 'tv') throw new RoomError('NOT_ADMIN', 'Admin controls only work on the laptop TV screen');
    };
    const who = () => {
      const p = playerId ? room.getPlayer(playerId) : undefined;
      return p ? `#${p.number} ${p.name}` : role === 'tv' ? `TV${local ? '(laptop)' : ''}` : `phone ${socket.id.slice(0, 5)}`;
    };
    log(`[connect] ${role} ${socket.id.slice(0, 5)} from ${socket.handshake.address}`);

    // Diagnostic log of every non-input event (tokens redacted).
    socket.onAny((ev: string, payload: unknown) => {
      if (ev === 'input:state' || ev === 'client:log') return;
      let shown = '';
      try {
        shown = JSON.stringify(payload, (k, v) => (k === 'reconnectToken' ? (v ? '<token>' : v) : v)) ?? '';
      } catch {
        shown = '?';
      }
      log(`[event] ${who()} → ${ev} ${shown.slice(0, 120)}  (phase ${room.phase})`);
    });
    // Phones/TV forward their own errors and state changes here so everything is in one log.
    socket.on(
      'client:log',
      guard((payload: { msg?: unknown } = {}) => {
        if (typeof payload?.msg === 'string') log(`[client ${who()}] ${payload.msg.slice(0, 300)}`);
      }),
    );

    socket.on(
      'player:join',
      guard((payload: { name?: unknown; reconnectToken?: unknown } = {}) => {
        if (role !== 'phone') return;
        const res = room.join(payload?.name, payload?.reconnectToken);
        if (!res.ok) {
          // a stale token from an old session: tell the phone so it can show the name form
          err(socket, res.code, res.message);
          return;
        }
        const old = socketsByPlayer.get(res.player.id);
        if (old && old.id !== socket.id) {
          err(old, 'SESSION_MOVED', 'You joined from another tab or device');
          old.data.playerId = null;
          old.disconnect(true);
        }
        playerId = res.player.id;
        socket.data.playerId = playerId;
        socketsByPlayer.set(playerId, socket);
        const msg: JoinedMsg = {
          playerId,
          reconnectToken: res.token,
          number: res.player.number,
          name: res.player.name,
          reclaimed: res.reclaimed,
        };
        // send the roster that already contains this player first, so the phone never sees itself "missing"
        socket.emit('room:state', room.publicState());
        socket.emit('player:joined', msg);
        log(`[join] #${res.player.number} ${res.player.name}${res.reclaimed ? ' (reconnected)' : ''}`);
      }),
    );

    socket.on(
      'room:advance',
      guard((payload: { action?: unknown } = {}) => {
        const action = payload?.action as AdvanceAction;
        if (!ADVANCE_ACTIONS.includes(action)) throw new RoomError('BAD_ACTION', 'Unknown action');
        room.advance(role === 'tv' ? (adminGuard(), { kind: 'admin' }) : me(), action);
      }),
    );
    socket.on(
      'player:team',
      guard((payload: { team?: unknown } = {}) => {
        me();
        room.setTeam(playerId!, payload?.team as Team);
      }),
    );
    socket.on(
      'player:ready',
      guard((payload: { ready?: unknown } = {}) => {
        me();
        room.setReady(playerId!, payload?.ready);
      }),
    );
    socket.on(
      'match:pause',
      guard((payload: { paused?: unknown } = {}) => {
        const actor: Actor = role === 'tv' ? (adminGuard(), { kind: 'admin' }) : me();
        room.setPaused(actor, payload?.paused === true);
      }),
    );
    socket.on(
      'player:look',
      guard((payload: { look?: unknown } = {}) => {
        me();
        room.setLook(playerId!, payload?.look);
      }),
    );
    socket.on(
      'match:duration',
      guard((payload: { seconds?: unknown } = {}) =>
        room.setDuration(role === 'tv' ? (adminGuard(), { kind: 'admin' }) : me(), payload?.seconds),
      ),
    );
    socket.on(
      'input:state',
      guard((msg: InputMsg) => {
        if (!playerId || !msg || typeof msg !== 'object') return;
        room.input(playerId, msg);
      }),
    );
    socket.on(
      'admin:reset',
      guard((payload: { keepPlayers?: unknown } = {}) => {
        adminGuard();
        adminReset(payload?.keepPlayers === true);
      }),
    );
    socket.on(
      'admin:addTestPlayer',
      guard((payload: { kind?: unknown } = {}) => {
        adminGuard();
        room.addTestPlayer(payload?.kind === 'dumb' ? 'dumb' : 'smart');
      }),
    );
    socket.on(
      'admin:removeTestPlayers',
      guard(() => {
        adminGuard();
        room.removeTestPlayers();
      }),
    );
    socket.on(
      'admin:endMatch',
      guard(() => {
        adminGuard();
        room.endMatch();
      }),
    );

    if (room.devHooks) {
      socket.on(
        'dev:goal',
        guard((payload: { team?: unknown } = {}) => {
          if (payload?.team === 'RED' || payload?.team === 'BLUE') room.match?.devForceGoal(payload.team);
        }),
      );
      socket.on(
        'dev:clock',
        guard((payload: { ms?: unknown } = {}) => {
          if (typeof payload?.ms === 'number') room.match?.devSetClock(payload.ms);
        }),
      );
    }

    socket.on('disconnect', (reason) => {
      const label = who();
      if (playerId && socketsByPlayer.get(playerId) === socket) {
        socketsByPlayer.delete(playerId);
        room.disconnect(playerId);
      }
      log(`[disconnect] ${label} (${reason})`);
    });
  });

  // ------------------------------------------------------------ loop
  let last = performance.now();
  let acc = 0;
  let snapAcc = 0;
  let ctrlAcc = 0;
  const stepMs = CFG.dtMs;
  let lastLoggedPhase: string = room.phase;
  let lastLoggedHost: string | null = null;
  const loop = setInterval(() => {
    const now = performance.now();
    acc += Math.min(now - last, 250);
    last = now;
    let steps = 0;
    while (acc >= stepMs && steps < 6) {
      try {
        room.tick();
      } catch (e) {
        console.error('[tick error]', e);
      }
      acc -= stepMs;
      steps++;
      snapAcc += stepMs;
      ctrlAcc += stepMs;
    }
    if (steps === 6) acc = 0;
    if (room.dirty) {
      room.dirty = false;
      const st = room.publicState();
      if (st.phase !== lastLoggedPhase) {
        log(`[phase] ${lastLoggedPhase} → ${st.phase}  (players: ${st.players.map((p) => `#${p.number}${p.connected ? '' : '(away)'}${p.team ? '/' + p.team[0] : ''}`).join(' ') || 'none'})`);
        lastLoggedPhase = st.phase;
      }
      if (st.hostId !== lastLoggedHost) {
        const h = st.players.find((p) => p.id === st.hostId);
        log(`[host] ${h ? `#${h.number} ${h.name}` : 'none'}`);
        lastLoggedHost = st.hostId;
      }
      io.emit('room:state', st);
    }
    const m = room.match;
    if (m && snapAcc >= 33) {
      snapAcc = 0;
      io.to('tv').emit('match:snapshot', m.snapshot());
      for (const e of m.drainEvents()) {
        if (e.type === 'goal') log(`[goal] ${e.team}  ${m.score.RED}-${m.score.BLUE}`);
        io.to('tv').emit('match:event', e);
      }
    } else if (!m) {
      snapAcc = 0;
    }
    if (ctrlAcc >= 66) {
      ctrlAcc = 0;
      for (const [pid, sock] of socketsByPlayer) {
        const s = m?.getSkater(pid);
        const cs: ControlState = {
          inMatch: !!s,
          team: s?.team ?? room.getPlayer(pid)?.team ?? null,
          hasPuck: !!s && m!.puck.carrierId === pid,
          charging: !!s && s.chargingSince !== null,
          chargePct: s && m ? m.chargeFrac(s) : 0,
          phase: m?.phase ?? null,
          clockMs: m ? Math.ceil(m.clockMs) : 0,
          score: m ? [m.score.RED, m.score.BLUE] : [0, 0],
          pokeReady: s && m ? m.pokeReady(s) : 1,
          stumbling: !!s && m!.t < s.stumbleUntil,
          boosting: !!s && m!.t < s.boostUntil,
          catchHint: !!s && m!.phase === 'PLAYING' && m!.catchHint(s),
        };
        sock.emit('player:controlState', cs);
      }
    }
  }, 5);

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(opts.port, opts.host ?? '0.0.0.0', () => {
      http.off('error', reject);
      const addr = http.address();
      if (addr && typeof addr === 'object') actualPort = addr.port;
      resolve();
    });
  });

  return {
    http,
    io,
    room,
    port: actualPort,
    info: () => info(true),
    adminReset,
    close: async () => {
      clearInterval(loop);
      io.close();
      await viteClose?.();
      await new Promise<void>((r) => http.close(() => r()));
    },
  };
}
