// Party room: players, host, phase machine. Pure logic with injectable clock (no sockets).
import { createHash, randomBytes } from 'node:crypto';
import { HockeyMatch } from './simulation/match';
import { CFG } from './simulation/config';
import { LOSING_QUIPS, QUIP_RULES } from '../shared/quips';
import { ACCENTS, randomLook, sanitizeLook, type Look } from '../shared/appearance';
import {
  DURATIONS,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  type AdvanceAction,
  type Duration,
  type InputMsg,
  type MatchResult,
  type Phase,
  type PlayerStat,
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
  /** a deliberately bad test bot */
  dumbBot: boolean;
  look: Look;
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
  /** random source for easter eggs (tests inject a fixed one) */
  random?: () => number;
  quipChance?: number;
  quipCooldownMs?: number;
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
    this.random = opts.random ?? Math.random;
    this.quipChance = opts.quipChance ?? QUIP_RULES.chance;
    this.quipCooldownMs = opts.quipCooldownMs ?? QUIP_RULES.cooldownMs;
  }
  private random: () => number;
  private quipChance: number;
  private quipCooldownMs: number;

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
            dumb: p.dumbBot,
            look: p.look,
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
      dumbBot: false,
      look: randomLook(this.random),
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
    this.fixAccents();
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

  /** Change your look (any time except during a match). A taken team accent is swapped for a free one. */
  setLook(id: string, raw: unknown) {
    if (this.stage === 'MATCH') throw new RoomError('BAD_PHASE', 'Change your look after the match');
    const p = this.getPlayer(id);
    if (!p) throw new RoomError('UNKNOWN_PLAYER', 'Unknown player');
    const look = sanitizeLook(raw);
    if (!look) throw new RoomError('BAD_LOOK', 'Invalid look');
    p.look = look;
    if (p.team) {
      const taken = new Set(this.players.filter((o) => o !== p && o.team === p.team).map((o) => o.look.accent));
      if (taken.has(look.accent)) p.look.accent = this.freeAccent(taken, look.accent);
    }
    this.dirty = true;
  }

  private freeAccent(taken: Set<number>, from: number) {
    for (let i = 1; i <= ACCENTS.length; i++) {
      const a = (from + i) % ACCENTS.length;
      if (!taken.has(a)) return a;
    }
    return from;
  }

  /** Teammates never share an accent color: the later joiner gets moved to a free one. */
  private fixAccents() {
    for (const team of ['RED', 'BLUE'] as Team[]) {
      const taken = new Set<number>();
      for (const p of this.players.filter((x) => x.team === team).sort((a, b) => a.joinedAt - b.joinedAt || a.number - b.number)) {
        if (taken.has(p.look.accent)) {
          p.look = { ...p.look, accent: this.freeAccent(taken, p.look.accent) };
          this.dirty = true;
        }
        taken.add(p.look.accent);
      }
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

  addTestPlayer(kind: 'smart' | 'dumb' = 'smart') {
    if (!JOINABLE.includes(this.stage)) throw new RoomError('BAD_PHASE', 'Add test players in the lobby or team screen');
    const n = this.players.filter((p) => p.testPlayer && p.dumbBot === (kind === 'dumb')).length;
    const res = this.join(`${kind === 'dumb' ? 'Dumb' : 'Test'} Bot ${String.fromCharCode(65 + n)}`);
    if (!res.ok) throw new RoomError(res.code, res.message);
    res.player.testPlayer = true;
    res.player.dumbBot = kind === 'dumb';
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
      if (pl.dumbBot) {
        this.driveDumbBot(m, s);
        continue;
      }
      const goalX = s.team === 'RED' ? m.R.maxX : m.R.minX;
      const carrier = p.carrierId ? m.getSkater(p.carrierId) : undefined;
      let tx = p.x;
      let ty = p.y;
      let shoot = false;
      let pass = false;
      if (carrier?.id === s.id) {
        tx = goalX;
        ty = m.R.cy + Math.sin(this.botTick / 40 + s.number) * 50;
        const dist = Math.abs(goalX - s.x);
        // hold shoot for a short charge, then release
        const phaseT = (this.botTick + s.number * 7) % 40;
        shoot = dist < 420 && phaseT < 20;
      } else if (carrier && carrier.team === s.team) {
        // spread out ahead of the teammate
        tx = carrier.x + (s.team === 'RED' ? 160 : -160);
        ty = carrier.y > m.R.cy ? m.R.cy - 140 * m.R.sy : m.R.cy + 140 * m.R.sy;
      } else if (carrier) {
        pass = Math.hypot(carrier.x - s.x, carrier.y - s.y) < 70 && (this.botTick + s.number * 13) % 50 === 0;
      }
      const dx = tx - s.x;
      const dy = ty - s.y;
      const d = Math.hypot(dx, dy) || 1;
      const speed = d < 30 ? d / 30 : 0.75; // test bots skate a little slower than full speed
      m.setInput(s.id, { x: (dx / d) * speed, y: (dy / d) * speed, shoot, pass });
    }
  }

  /** Dumb bots drift slowly between random spots, only chase the puck when it's right next to them,
   *  shoot in random directions, and sometimes poke at nothing. Easy to beat. */
  private dumbState = new Map<string, { tx: number; ty: number; untilTick: number }>();
  private driveDumbBot(m: HockeyMatch, s: ReturnType<HockeyMatch['getSkater']> & object) {
    const R = m.R;
    let st = this.dumbState.get(s.id);
    if (!st || this.botTick >= st.untilTick) {
      st = {
        tx: R.minX + 40 + Math.random() * (R.maxX - R.minX - 80),
        ty: R.minY + 40 + Math.random() * (R.maxY - R.minY - 80),
        untilTick: this.botTick + 90 + Math.floor(Math.random() * 120),
      };
      this.dumbState.set(s.id, st);
    }
    const p = m.puck;
    let tx = st.tx;
    let ty = st.ty;
    const near = Math.hypot(p.x - s.x, p.y - s.y);
    if (!p.carrierId && near < 110) {
      tx = p.x;
      ty = p.y;
    }
    const carrying = p.carrierId === s.id;
    // shoot roughly every 2.5s while carrying, in whatever direction it's skating
    const shoot = carrying && this.botTick % 150 < 6;
    // occasionally poke at nothing in particular
    const pass = !carrying && Math.random() < 0.004;
    const dx = tx - s.x;
    const dy = ty - s.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = Math.min(0.4, d / 60);
    m.setInput(s.id, { x: (dx / d) * speed, y: (dy / d) * speed, shoot, pass });
  }

  // ---------------------------------------------------------------- easter egg: losing-team quips

  private lastQuipAt = -Infinity;
  /** Called by the match after every goal. Rare on purpose — see shared/quips.ts. */
  private maybeQuip(m: HockeyMatch, team: Team, before: Record<Team, number>) {
    const loser: Team = team === 'RED' ? 'BLUE' : 'RED';
    if (before[team] - before[loser] < QUIP_RULES.minDeficit) return;
    const now = this.now();
    if (now - this.lastQuipAt < this.quipCooldownMs) return;
    if (this.random() >= this.quipChance) return;
    const losers = m.skaters.filter((s) => s.team === loser && s.connected);
    if (!losers.length || !LOSING_QUIPS.length) return;
    const who = losers[Math.floor(this.random() * losers.length)];
    const text = LOSING_QUIPS[Math.floor(this.random() * LOSING_QUIPS.length)];
    this.lastQuipAt = now;
    m.events.push({ type: 'quip', by: who.number, text });
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
    const m = this.match;
    m.onGoal = (team, before) => this.maybeQuip(m, team, before);
    this.result = null;
    this.stage = 'MATCH';
  }

  private finishMatchCleanup() {
    this.match = null;
    for (const p of this.players) p.inMatch = false;
  }

  /** Host (or laptop admin) pauses/resumes the match. */
  setPaused(actor: Actor, paused: boolean) {
    this.requireHost(actor);
    if (this.stage !== 'MATCH' || !this.match) throw new RoomError('BAD_PHASE', 'Nothing to pause');
    const ok = paused ? this.match.pause() : this.match.resume();
    if (ok) this.dirty = true;
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
        const stats: PlayerStat[] = m.skaters.map((s) => ({
          number: s.number,
          name: this.getPlayer(s.id)?.name ?? `P${s.number}`,
          team: s.team,
          ...s.stats,
        }));
        const mvpScore = (p: PlayerStat) =>
          p.goals * 5 + p.steals * 2 + p.oneTimers * 2 + p.catches + p.perfects + p.shots * 0.5;
        const best = [...stats].sort((a, b) => mvpScore(b) - mvpScore(a))[0];
        this.result = {
          red: m.score.RED,
          blue: m.score.BLUE,
          winner: m.score.RED > m.score.BLUE ? 'RED' : m.score.BLUE > m.score.RED ? 'BLUE' : 'DRAW',
          stats,
          mvp: best && mvpScore(best) > 0 ? best.number : null,
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
