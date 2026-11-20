// Party room: players, host, phase machine. Pure logic with injectable clock (no sockets).
import { createHash, randomBytes } from 'node:crypto';
import { HockeyMatch } from './simulation/match';
import { CFG } from './simulation/config';
import {
  DURATIONS,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  type AdvanceAction,
  type Duration,
  type InputMsg,
  type MatchResult,
  type Phase,
  type PublicPlayer,
  type RoomState,
  type Team,
} from '../shared/types';

export type RoomStage = 'LOBBY' | 'GAME_SELECT' | 'TEAMS' | 'SETTINGS' | 'MATCH' | 'RESULTS';

export interface Player {
  id: string;
  name: string;
  number: number;
  team: Team | null;
  ready: boolean;
  connected: boolean;
  joinedAt: number;
  lastConnectedAt: number;
  disconnectedAt: number | null;
  tokenHash: string;
  inMatch: boolean;
  testPlayer: boolean;
  lastSeq: number;
  lastInputAt: number;
}

export interface RoomOptions {
  now?: () => number;
  /** how long a disconnected host keeps the role before it passes on */
  hostGraceMs?: number;
  /** pre-match: disconnected players are removed after this long */
  pruneMs?: number;
  devHooks?: boolean;
  seed?: number;
}

export type JoinResult =
  | { ok: true; player: Player; token: string; reclaimed: boolean }
  | { ok: false; code: string; message: string };

export type Actor = { kind: 'player'; id: string } | { kind: 'admin' };

export class RoomError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

/** Trim, collapse whitespace, strip control/format characters. Returns null if invalid. */
export function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = Array.from(cleaned);
  if (chars.length < 1 || chars.length > MAX_NAME_LENGTH) return null;
  return cleaned;
}

const PRE_MATCH: RoomStage[] = ['LOBBY', 'GAME_SELECT', 'TEAMS', 'SETTINGS'];
const JOINABLE: RoomStage[] = ['LOBBY', 'GAME_SELECT', 'TEAMS'];

export class Room {
  stage: RoomStage = 'LOBBY';
  players: Player[] = [];
  hostId: string | null = null;
  durationSeconds: Duration = 300;
  match: HockeyMatch | null = null;
  result: MatchResult | null = null;
  /** set whenever public state changes; the server flushes and clears it */
  dirty = true;
  /** incremented on full reset so clients know to drop their token */
  epoch = 0;

  private tokenIndex = new Map<string, string>();
  private now: () => number;
  private hostGraceMs: number;
  private pruneMs: number;
  private seed: number;
  readonly devHooks: boolean;
  private matchCount = 0;
  private lastPublicPhase: Phase = 'LOBBY';

  constructor(opts: RoomOptions = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.hostGraceMs = opts.hostGraceMs ?? 8000;
    this.pruneMs = opts.pruneMs ?? 20000;
    this.devHooks = !!opts.devHooks;
    this.seed = opts.seed ?? (Date.now() & 0xffff);
  }

  // ---------------------------------------------------------------- queries

  get phase(): Phase {
    if (this.stage === 'MATCH' && this.match) {
      return this.match.phase === 'OVER' ? 'RESULTS' : this.match.phase;
    }
    return this.stage as Phase;
  }

  get joinOpen() {
    return JOINABLE.includes(this.stage) && this.players.length < MAX_PLAYERS;
  }

  getPlayer(id: string) {
    return this.players.find((p) => p.id === id);
  }

  connectedPlayers() {
    return this.players.filter((p) => p.connected);
  }

  teamCheck(): { ok: boolean; reason: string } {
    const active = this.connectedPlayers();
    if (active.length < 2) return { ok: false, reason: 'Need at least 2 players' };
    const unassigned = active.filter((p) => !p.team).length;
    if (unassigned) return { ok: false, reason: `${unassigned} player${unassigned > 1 ? 's' : ''} still choosing a team` };
    const red = active.filter((p) => p.team === 'RED').length;
    const blue = active.length - red;
    if (red === 0 || blue === 0) return { ok: false, reason: 'Both teams need at least one player' };
    if (Math.abs(red - blue) > 1) return { ok: false, reason: `Teams too uneven (${red} v ${blue}) — max difference is 1` };
    const notReady = active.filter((p) => !p.ready).length;
    if (notReady) return { ok: false, reason: `Waiting for ${notReady} player${notReady > 1 ? 's' : ''} to press Ready` };
    return { ok: true, reason: `${red} v ${blue} — ready to go!` };
  }

  publicState(): RoomState {
    return {
      phase: this.phase,
      hostId: this.hostId,
      players: this.players
        .slice()
        .sort((a, b) => a.number - b.number)
        .map(
          (p): PublicPlayer => ({
            id: p.id,
            name: p.name,
            number: p.number,
            team: p.team,
            ready: p.ready,
            connected: p.connected,
            isHost: p.id === this.hostId,
            inMatch: p.inMatch,
            test: p.testPlayer,
          }),
        ),
      durationSeconds: this.durationSeconds,
      canStartLobby: this.connectedPlayers().length >= 2,
      teamCheck: this.teamCheck(),
      joinOpen: this.joinOpen,
      result: this.result,
      devHooks: this.devHooks,
    };
  }

  // ---------------------------------------------------------------- membership

  join(rawName: unknown, token?: unknown): JoinResult {
    const now = this.now();
    if (typeof token === 'string' && token.length > 0 && token.length < 200) {
      const id = this.tokenIndex.get(hashToken(token));
      const p = id ? this.getPlayer(id) : undefined;
      if (p) {
        p.connected = true;
        p.lastConnectedAt = now;
        p.disconnectedAt = null;
        p.lastSeq = -1;
        if (this.match && p.inMatch) {
          this.match.setConnected(p.id, true);
          this.match.neutralize(p.id);
        }
        if (!this.hostId && !p.testPlayer) this.hostId = p.id;
        this.dirty = true;
        return { ok: true, player: p, token, reclaimed: true };
      }
    }
    const name = sanitizeName(rawName);
    if (!name) return { ok: false, code: 'NAME_INVALID', message: `Enter a name (1–${MAX_NAME_LENGTH} characters)` };
    if (this.players.length >= MAX_PLAYERS) return { ok: false, code: 'ROOM_FULL', message: 'Sorry, the room is full (8 players)' };
    if (!JOINABLE.includes(this.stage)) {
      return { ok: false, code: 'JOIN_CLOSED', message: 'A match is in progress — you can join when it finishes' };
    }
    const used = new Set(this.players.map((p) => p.number));
    let number = 1;
    while (used.has(number)) number++;
    const newToken = randomBytes(24).toString('base64url');
    const player: Player = {
      id: randomBytes(8).toString('hex'),
      name,
      number,
      team: null,
      ready: false,
      connected: true,
      joinedAt: now,
      lastConnectedAt: now,
      disconnectedAt: null,
      tokenHash: hashToken(newToken),
      inMatch: false,
      testPlayer: false,
      lastSeq: -1,
      lastInputAt: 0,
    };
    this.players.push(player);
    this.tokenIndex.set(player.tokenHash, player.id);
    if (!this.hostId && !player.testPlayer) this.hostId = player.id;
    this.dirty = true;
    return { ok: true, player, token: newToken, reclaimed: false };
  }

  disconnect(id: string) {
    const p = this.getPlayer(id);
    if (!p || !p.connected) return;
    p.connected = false;
    p.disconnectedAt = this.now();
    if (this.match && p.inMatch) this.match.setConnected(id, false);
    this.dirty = true;
  }

  private removePlayer(id: string) {
    const p = this.getPlayer(id);
    if (!p) return;
    this.players = this.players.filter((x) => x.id !== id);
    this.tokenIndex.delete(p.tokenHash);
    if (this.hostId === id) this.hostId = null;
    this.dirty = true;
  }

  /** Called regularly (e.g. every tick). Handles host succession and pruning. */
  housekeeping() {
    const now = this.now();
    this.balanceTestPlayers();
    if (PRE_MATCH.includes(this.stage)) {
      for (const p of [...this.players]) {
        if (!p.connected && p.disconnectedAt !== null && now - p.disconnectedAt > this.pruneMs) {
          this.removePlayer(p.id);
        }
      }
    }
    const host = this.hostId ? this.getPlayer(this.hostId) : undefined;
    const hostGone =
      !host || (!host.connected && host.disconnectedAt !== null && now - host.disconnectedAt > this.hostGraceMs);
    if (hostGone) {
      const next = this.connectedPlayers().filter((p) => !p.testPlayer).sort((a, b) => a.joinedAt - b.joinedAt)[0];
      const nextId = next ? next.id : host ? host.id : null;
      if (nextId !== this.hostId) {
        this.hostId = nextId;
        this.dirty = true;
      }
    }
  }

  // ---------------------------------------------------------------- lobby actions

  private requireHost(actor: Actor) {
    if (actor.kind === 'admin') return;
    if (actor.id !== this.hostId) throw new RoomError('NOT_HOST', 'Only the host can do that');
  }

  advance(actor: Actor, action: AdvanceAction) {
    this.requireHost(actor);
    const bad = () => {
      throw new RoomError('BAD_PHASE', `Can't ${action} right now`);
    };
    switch (action) {
      case 'START':
        if (this.stage !== 'LOBBY') bad();
        if (this.connectedPlayers().length < 2) throw new RoomError('NEED_PLAYERS', 'Need at least 2 players');
        this.stage = 'GAME_SELECT';
        break;
      case 'CHOOSE_HOCKEY':
        if (this.stage !== 'GAME_SELECT') bad();
        this.stage = 'TEAMS';
        this.clearReady();
        break;
      case 'NEXT': {
        if (this.stage !== 'TEAMS') bad();
        const check = this.teamCheck();
        if (!check.ok) throw new RoomError('TEAMS_INVALID', check.reason);
        this.stage = 'SETTINGS';
        break;
      }
      case 'BACK':
        if (this.stage === 'GAME_SELECT') this.stage = 'LOBBY';
        else if (this.stage === 'TEAMS') this.stage = 'GAME_SELECT';
        else if (this.stage === 'SETTINGS') {
          this.stage = 'TEAMS';
          this.clearReady();
        } else bad();
        break;
      case 'START_MATCH':
        if (this.stage !== 'SETTINGS') bad();
        this.startMatch();
        break;
      case 'REMATCH':
        if (this.stage !== 'RESULTS') bad();
        this.finishMatchCleanup();
        this.stage = 'TEAMS';
        this.clearReady();
        break;
      case 'NEW_GAME':
        if (this.stage !== 'RESULTS') bad();
        this.finishMatchCleanup();
        this.stage = 'GAME_SELECT';
        this.clearReady();
        break;
      default:
        throw new RoomError('BAD_ACTION', 'Unknown action');
    }
    this.dirty = true;
  }

  setTeam(id: string, team: unknown) {
    if (this.stage !== 'TEAMS') throw new RoomError('BAD_PHASE', 'Teams are locked right now');
    if (team !== 'RED' && team !== 'BLUE') throw new RoomError('BAD_TEAM', 'Pick Red or Blue');
    const p = this.getPlayer(id);
    if (!p) throw new RoomError('UNKNOWN_PLAYER', 'Unknown player');
    if (p.team !== team) {
      p.team = team;
      p.ready = false;
      this.dirty = true;
    }
  }

  setReady(id: string, ready: unknown) {
    if (this.stage !== 'TEAMS') throw new RoomError('BAD_PHASE', 'Ready is locked right now');
    const p = this.getPlayer(id);
    if (!p) throw new RoomError('UNKNOWN_PLAYER', 'Unknown player');
    if (ready === true && !p.team) throw new RoomError('NO_TEAM', 'Pick a team first');
    p.ready = ready === true;
    this.dirty = true;
  }

  setDuration(actor: Actor, seconds: unknown) {
    this.requireHost(actor);
    if (this.stage !== 'SETTINGS') throw new RoomError('BAD_PHASE', 'Duration can only change in settings');
    if (!DURATIONS.includes(seconds as Duration)) throw new RoomError('BAD_DURATION', 'Choose 5, 10, or 15 minutes');
    this.durationSeconds = seconds as Duration;
    this.dirty = true;
  }

  // ---------------------------------------------------------------- local test players
  // Added from the laptop admin panel so one person can test the full flow. They never become host,
  // auto-join the smaller team and auto-ready, and skate with very simple scripted input.

  addTestPlayer() {
    if (!JOINABLE.includes(this.stage)) throw new RoomError('BAD_PHASE', 'Add test players in the lobby or team screen');
    const n = this.players.filter((p) => p.testPlayer).length;
    const res = this.join(`Test Bot ${String.fromCharCode(65 + n)}`);
    if (!res.ok) throw new RoomError(res.code, res.message);
    res.player.testPlayer = true;
    this.tokenIndex.delete(res.player.tokenHash);
    if (this.hostId === res.player.id) this.hostId = null;
    this.dirty = true;
  }

  removeTestPlayers() {
    if (this.stage === 'MATCH') throw new RoomError('BAD_PHASE', 'Remove test players after the match');
    for (const p of this.players.filter((x) => x.testPlayer)) this.removePlayer(p.id);
  }

  private balanceTestPlayers() {
    if (this.stage !== 'TEAMS') return;
    const tests = this.players.filter((p) => p.testPlayer).sort((a, b) => a.number - b.number);
    if (!tests.length) return;
    const humans = this.connectedPlayers().filter((p) => !p.testPlayer);
    let red = humans.filter((p) => p.team === 'RED').length;
    let blue = humans.filter((p) => p.team === 'BLUE').length;
    for (const t of tests) {
      const team: Team = red <= blue ? 'RED' : 'BLUE';
      if (team === 'RED') red++;
      else blue++;
      if (t.team !== team || !t.ready) {
        t.team = team;
        t.ready = true;
        this.dirty = true;
      }
    }
  }

  private botTick = 0;
  private driveTestPlayers(m: HockeyMatch) {
    if (m.phase !== 'PLAYING') return;
    this.botTick++;
    const p = m.puck;
    for (const pl of this.players) {
      if (!pl.testPlayer || !pl.inMatch) continue;
      const s = m.getSkater(pl.id);
      if (!s) continue;
      const goalX = s.team === 'RED' ? CFG.rink.maxX : CFG.rink.minX;
      const carrier = p.carrierId ? m.getSkater(p.carrierId) : undefined;
      let tx = p.x;
      let ty = p.y;
      let shoot = false;
      let pass = false;
      if (carrier?.id === s.id) {
        tx = goalX;
        ty = CFG.rink.cy + Math.sin(this.botTick / 40 + s.number) * 50;
        const dist = Math.abs(goalX - s.x);
        // hold shoot for a short charge, then release
        const phaseT = (this.botTick + s.number * 7) % 40;
        shoot = dist < 420 && phaseT < 20;
      } else if (carrier && carrier.team === s.team) {
        // spread out ahead of the teammate
        tx = carrier.x + (s.team === 'RED' ? 160 : -160);
        ty = carrier.y > CFG.rink.cy ? 200 : 480;
      } else if (carrier) {
        pass = Math.hypot(carrier.x - s.x, carrier.y - s.y) < 70 && (this.botTick + s.number) % 30 === 0;
      }
      const dx = tx - s.x;
      const dy = ty - s.y;
      const d = Math.hypot(dx, dy) || 1;
      const speed = d < 30 ? d / 30 : 0.75; // test bots skate a little slower than full speed
      m.setInput(s.id, { x: (dx / d) * speed, y: (dy / d) * speed, shoot, pass });
    }
  }

  private clearReady() {
    for (const p of this.players) p.ready = false;
  }

  private startMatch() {
    const check = this.teamCheck();
    if (!check.ok) {
      this.stage = 'TEAMS';
      throw new RoomError('TEAMS_INVALID', check.reason);
    }
    const skaters = this.connectedPlayers().filter((p) => p.team);
    for (const p of this.players) p.inMatch = skaters.includes(p);
    this.matchCount++;
    this.match = new HockeyMatch(
      skaters.map((p) => ({ id: p.id, number: p.number, team: p.team! })),
      this.durationSeconds * 1000,
      this.seed + this.matchCount * 7919,
    );
    this.result = null;
    this.stage = 'MATCH';
  }

  private finishMatchCleanup() {
    this.match = null;
    for (const p of this.players) p.inMatch = false;
  }

  /** Admin: end the current match immediately (goes to results). */
  endMatch() {
    if (this.stage === 'MATCH' && this.match) {
      this.match.devSetClock(0);
      if (this.match.phase !== 'PLAYING') {
        this.match.phase = 'OVER';
      }
    }
  }

  /** Back to lobby. keepPlayers=false wipes everyone (tokens revoked). */
  resetToLobby(keepPlayers: boolean) {
    this.finishMatchCleanup();
    this.result = null;
    this.stage = 'LOBBY';
    if (keepPlayers) {
      for (const p of this.players) {
        p.team = null;
        p.ready = false;
      }
    } else {
      this.players = [];
      this.tokenIndex.clear();
      this.hostId = null;
      this.epoch++;
    }
    this.dirty = true;
  }

  // ---------------------------------------------------------------- match

  input(id: string, msg: InputMsg) {
    const p = this.getPlayer(id);
    if (!p || !p.connected || !p.inMatch || !this.match) return;
    if (typeof msg.seq !== 'number' || !Number.isFinite(msg.seq) || msg.seq <= p.lastSeq) return;
    p.lastSeq = msg.seq;
    p.lastInputAt = this.now();
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
    let x = num(msg.x);
    let y = num(msg.y);
    const mag = Math.hypot(x, y);
    if (mag > 1) {
      x /= mag;
      y /= mag;
    }
    this.match.setInput(id, { x, y, pass: msg.pass === true, shoot: msg.shoot === true, cancel: msg.cancel === true });
  }

  /** Advance the simulation by one fixed tick. */
  tick() {
    this.housekeeping();
    const m = this.match;
    if (this.stage === 'MATCH' && m) {
      const now = this.now();
      // stale input watchdog
      for (const p of this.players) {
        if (p.inMatch && p.connected && p.lastInputAt && now - p.lastInputAt > CFG.inputTimeoutMs) {
          const s = m.getSkater(p.id);
          if (s && (s.input.x || s.input.y || s.input.pass || s.input.shoot)) m.neutralize(p.id);
        }
      }
      this.driveTestPlayers(m);
      m.step();
      if (m.phase === 'OVER') {
        this.result = {
          red: m.score.RED,
          blue: m.score.BLUE,
          winner: m.score.RED > m.score.BLUE ? 'RED' : m.score.BLUE > m.score.RED ? 'BLUE' : 'DRAW',
        };
        this.stage = 'RESULTS';
        this.dirty = true;
      }
    }
    const ph = this.phase;
    if (ph !== this.lastPublicPhase) {
      this.lastPublicPhase = ph;
      this.dirty = true;
    }
  }
}
