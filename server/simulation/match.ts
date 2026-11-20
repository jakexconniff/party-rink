// Authoritative hockey match simulation. Pure: no timers, no I/O. Call step() at CFG.tickHz.
import { CFG, rinkFor, type RinkDims } from './config';
import { angleBetween, clamp, finite, lerp, norm, rng } from './math';
import type { MatchEvent, MatchPhase, Snapshot, Team } from '../../shared/types';

export type { MatchEvent };

export interface SkaterInput {
  x: number;
  y: number;
  pass: boolean;
  shoot: boolean;
  cancel: boolean;
}

export const NEUTRAL_INPUT: Readonly<SkaterInput> = Object.freeze({
  x: 0,
  y: 0,
  pass: false,
  shoot: false,
  cancel: false,
});

export interface SkaterStats {
  goals: number;
  shots: number;
  steals: number;
  catches: number;
  oneTimers: number;
  perfects: number;
}

export interface Skater {
  id: string;
  number: number;
  team: Team;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number;
  fy: number;
  connected: boolean;
  input: SkaterInput;
  prevPass: boolean;
  prevShoot: boolean;
  chargingSince: number | null;
  aimX: number;
  aimY: number;
  passCooldownUntil: number;
  pokeCooldownUntil: number;
  pokeCooldownLen: number;
  pokeShowUntil: number;
  /** last time SHOOT went down while not carrying (for one-timers) */
  shootPressedAt: number;
  /** clean-catch armed until this time */
  catchArmedUntil: number;
  /** time of the last pickup (for late clean-catch presses) */
  pickupAt: number;
  pickupCaught: boolean;
  stumbleUntil: number;
  boostUntil: number;
  slowUntil: number;
  stats: SkaterStats;
}

export interface Puck {
  x: number;
  y: number;
  vx: number;
  vy: number;
  carrierId: string | null;
  lastReleasedBy: string | null;
  lastReleaseT: number;
  /** how the puck was last launched */
  launchKind: 'shot' | 'pass' | 'other';
  /** last skater to have possession (for goal credit) */
  lastTouchId: string | null;
  protectedUntil: number;
  /** increments every time the puck is launched or deflected; goalies react once per launch */
  launchId: number;
  /** extra goalie reaction delay for this launch (perfect shots, one-timers) */
  goalieDelayMs: number;
  /** pickups disabled until this time (dev hooks only) */
  ghostUntil: number;
}

export interface Goalie {
  team: Team;
  x: number;
  y: number;
  period: number;
  phase: number;
  mode: 'PATROL' | 'REACT';
  trackLaunch: number;
  reactAt: number | null;
  targetY: number | null;
  saveCooldownUntil: number;
  saveFlashUntil: number;
}

export interface MatchPlayer {
  id: string;
  number: number;
  team: Team;
}

export interface MatchOptions {
  /** always use the full-size rink regardless of player count (tests) */
  fullRink?: boolean;
}

const { goal, skater: SK, puck: PK } = CFG;
const G = CFG.goalie;

/** Faceoff formations for one team on the LEFT half of a full rink, facing right.
 *  Slot 0 is always the "center" — the player nearest the puck. Who takes it rotates each faceoff. */
const FORMATIONS: Record<number, [number, number][]> = {
  1: [[440, 340]],
  2: [
    [450, 340],
    [320, 230],
  ],
  3: [
    [450, 340],
    [320, 220],
    [320, 460],
  ],
  4: [
    [450, 340],
    [330, 200],
    [330, 480],
    [230, 340],
  ],
};

const emptyStats = (): SkaterStats => ({ goals: 0, shots: 0, steals: 0, catches: 0, oneTimers: 0, perfects: 0 });

export class HockeyMatch {
  phase: MatchPhase = 'COUNTDOWN';
  /** simulated time in ms since match creation */
  t = 0;
  ticks = 0;
  clockMs: number;
  countdownMs: number = CFG.countdownMs;
  pauseMs = 0;
  score: Record<Team, number> = { RED: 0, BLUE: 0 };
  lastGoal: Team | null = null;
  R: RinkDims;
  skaters: Skater[];
  puck: Puck;
  goalies: [Goalie, Goalie];
  events: MatchEvent[] = [];
  /** tests only: disable goalie collisions */
  goaliesEnabled = true;
  /** called right after a goal is scored, with the score before that goal */
  onGoal?: (team: Team, before: Record<Team, number>) => void;
  private rand: () => number;

  constructor(players: MatchPlayer[], durationMs: number, seed = 1, opts: MatchOptions = {}) {
    this.clockMs = durationMs;
    this.rand = rng(seed);
    this.R = rinkFor(players.length, opts.fullRink);
    this.skaters = [...players]
      .sort((a, b) => a.number - b.number)
      .map((p) => ({
        id: p.id,
        number: p.number,
        team: p.team,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        fx: p.team === 'RED' ? 1 : -1,
        fy: 0,
        connected: true,
        input: { ...NEUTRAL_INPUT },
        prevPass: false,
        prevShoot: false,
        chargingSince: null,
        aimX: p.team === 'RED' ? 1 : -1,
        aimY: 0,
        passCooldownUntil: 0,
        pokeCooldownUntil: 0,
        pokeCooldownLen: CFG.poke.cooldownMs,
        pokeShowUntil: 0,
        shootPressedAt: -1e9,
        catchArmedUntil: 0,
        pickupAt: -1e9,
        pickupCaught: false,
        stumbleUntil: 0,
        boostUntil: 0,
        slowUntil: 0,
        stats: emptyStats(),
      }));
    this.puck = {
      x: this.R.cx,
      y: this.R.cy,
      vx: 0,
      vy: 0,
      carrierId: null,
      lastReleasedBy: null,
      lastReleaseT: -1e9,
      launchKind: 'other',
      lastTouchId: null,
      protectedUntil: 0,
      launchId: 0,
      goalieDelayMs: 0,
      ghostUntil: 0,
    };
    const mkGoalie = (team: Team): Goalie => ({
      team,
      x: team === 'RED' ? this.R.minX + CFG.goalieOffset : this.R.maxX - CFG.goalieOffset,
      y: this.R.cy,
      period: G.periodS * (1 - G.periodJitter / 2 + this.rand() * G.periodJitter),
      phase: this.rand() * Math.PI * 2,
      mode: 'PATROL',
      trackLaunch: -1,
      reactAt: null,
      targetY: null,
      saveCooldownUntil: 0,
      saveFlashUntil: 0,
    });
    this.goalies = [mkGoalie('RED'), mkGoalie('BLUE')];
    this.faceoff();
  }

  // ---------------------------------------------------------------- public API

  getSkater(id: string) {
    return this.skaters.find((s) => s.id === id);
  }

  setInput(id: string, input: Partial<SkaterInput>) {
    const s = this.getSkater(id);
    if (!s || !s.connected) return;
    s.input = { ...s.input, ...input, cancel: !!input.cancel };
  }

  /** Clear input immediately and cancel any charge without firing. */
  neutralize(id: string) {
    const s = this.getSkater(id);
    if (!s) return;
    s.input = { ...NEUTRAL_INPUT };
    s.chargingSince = null;
  }

  setConnected(id: string, connected: boolean) {
    const s = this.getSkater(id);
    if (!s) return;
    s.connected = connected;
    if (!connected) {
      this.neutralize(id);
      if (this.puck.carrierId === id) this.dropPuck(s);
    }
  }

  /** Dev/test helper: puts a fast puck right in front of the goal that `team` attacks. */
  devForceGoal(team: Team) {
    if (this.phase !== 'PLAYING') return;
    const p = this.puck;
    p.carrierId = null;
    p.lastReleasedBy = null;
    p.ghostUntil = this.t + 200;
    p.y = this.R.cy;
    if (team === 'RED') {
      p.x = this.R.maxX - 6;
      p.vx = 600;
    } else {
      p.x = this.R.minX + 6;
      p.vx = -600;
    }
    p.vy = 0;
    p.launchId++;
  }

  devSetClock(ms: number) {
    this.clockMs = Math.max(0, ms);
  }

  step() {
    const dtMs = CFG.dtMs;
    this.t += dtMs;
    this.ticks++;
    switch (this.phase) {
      case 'COUNTDOWN':
        this.countdownMs -= dtMs;
        this.updateGoalies(CFG.dt);
        if (this.countdownMs <= 0) {
          this.countdownMs = 0;
          this.phase = 'PLAYING';
          // Release button edges so nothing fires on GO; sticks are allowed.
          for (const s of this.skaters) {
            s.prevPass = s.input.pass;
            s.prevShoot = s.input.shoot;
            s.chargingSince = null;
          }
        }
        return;
      case 'GOAL_PAUSE':
        this.pauseMs -= dtMs;
        if (this.pauseMs <= 0) {
          if (this.clockMs <= 0) {
            this.end();
          } else {
            this.faceoff();
            this.phase = 'PLAYING';
          }
        }
        return;
      case 'OVER':
        return;
      case 'PLAYING':
        break;
    }

    this.clockMs = Math.max(0, this.clockMs - dtMs);
    const dt = CFG.dt;
    this.updateSkaters(dt);
    this.resolveBodies();
    this.updateGoalies(dt);
    this.updateCarried();
    if (!this.puck.carrierId) this.updateLoosePuck(dt);
    this.sanitize();

    if (this.phase === 'PLAYING' && this.clockMs <= 0) this.end();
  }

  snapshot(): Snapshot {
    const r1 = (v: number) => Math.round(v * 10) / 10;
    const r2 = (v: number) => Math.round(v * 100) / 100;
    const carrier = this.puck.carrierId ? this.getSkater(this.puck.carrierId) : undefined;
    return {
      t: Math.round(this.t),
      phase: this.phase,
      clockMs: Math.ceil(this.clockMs),
      countdownMs: Math.ceil(this.countdownMs),
      score: [this.score.RED, this.score.BLUE],
      lastGoal: this.lastGoal,
      puck: [r1(this.puck.x), r1(this.puck.y), carrier ? carrier.number : 0],
      sk: this.skaters.map((s) => {
        const [ax, ay] = this.effectiveAim(s);
        return {
          n: s.number,
          tm: s.team === 'RED' ? 0 : 1,
          x: r1(s.x),
          y: r1(s.y),
          fx: r2(s.fx),
          fy: r2(s.fy),
          ch: s.chargingSince === null ? -1 : r2(Math.min(1.2, this.chargeRaw(s))),
          ax: r2(ax),
          ay: r2(ay),
          c: s.connected ? 1 : 0,
          pk: this.t < s.pokeShowUntil ? 1 : 0,
          st: this.t < s.stumbleUntil ? 1 : 0,
          bo: this.t < s.boostUntil ? 1 : 0,
        };
      }),
      gl: this.goalies.map((g) => ({ x: g.x, y: r1(g.y), s: this.t < g.saveFlashUntil ? 1 : 0 })) as [
        Snapshot['gl'][0],
        Snapshot['gl'][1],
      ],
      rk: [this.R.minX, this.R.maxX, this.R.minY, this.R.maxY],
    };
  }

  /** charge fraction 0..1 (clamped) */
  chargeFrac(s: Skater) {
    return clamp(this.chargeRaw(s), 0, 1);
  }

  /** unclamped charge fraction (>1 means over-charged) */
  chargeRaw(s: Skater) {
    if (s.chargingSince === null) return 0;
    return Math.max(0, (this.t - s.chargingSince) / CFG.shot.chargeMs);
  }

  pokeReady(s: Skater) {
    if (this.t >= s.pokeCooldownUntil) return 1;
    return clamp(1 - (s.pokeCooldownUntil - this.t) / s.pokeCooldownLen, 0, 1);
  }

  /** True when a loose puck is about to reach this skater (phone shows a CATCH hint). */
  catchHint(s: Skater) {
    return this.incomingPuck(s);
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---------------------------------------------------------------- phases

  /** how many faceoffs have happened (drives the center rotation) */
  faceoffCount = 0;

  faceoff() {
    const R = this.R;
    // small vertical variation of the drop so openings aren't identical (same for both teams → still fair)
    const dropY = this.faceoffCount === 0 ? R.cy : R.cy + (this.rand() - 0.5) * 2 * CFG.faceoff.dropJitter * R.sy;
    for (const team of ['RED', 'BLUE'] as Team[]) {
      const members = this.skaters.filter((s) => s.team === team);
      const n = members.length;
      const form = FORMATIONS[clamp(n, 1, 4)] ?? FORMATIONS[4];
      // rotate who takes the center slot
      const rot = n ? this.faceoffCount % n : 0;
      const ordered = members.map((_, i) => members[(i + rot) % n]);
      // catch-up: the team that just scored starts its center further back
      const handicap = this.lastGoal === team ? CFG.faceoff.scorerSetBack : 0;
      ordered.forEach((s, i) => {
        const [fx, fy] = form[i % form.length];
        const x = R.cx - (R.cx - fx + (i === 0 ? handicap : 0)) * R.sx;
        s.x = team === 'RED' ? x : 2 * R.cx - x;
        s.y = R.cy + (fy - R.cy) * R.sy + (i === 0 ? dropY - R.cy : 0);
        s.vx = s.vy = 0;
        s.fx = team === 'RED' ? 1 : -1;
        s.fy = 0;
        s.aimX = s.fx;
        s.aimY = 0;
        s.chargingSince = null;
        s.stumbleUntil = s.boostUntil = s.slowUntil = 0;
        s.catchArmedUntil = 0;
      });
    }
    this.faceoffCount++;
    Object.assign(this.puck, {
      x: R.cx,
      y: dropY,
      vx: 0,
      vy: 0,
      carrierId: null,
      lastReleasedBy: null,
      lastReleaseT: -1e9,
      launchKind: 'other',
      lastTouchId: null,
      protectedUntil: 0,
      goalieDelayMs: 0,
      ghostUntil: 0,
    });
    this.puck.launchId++;
    for (const g of this.goalies) {
      g.y = R.cy;
      g.mode = 'PATROL';
      g.reactAt = null;
      g.targetY = null;
    }
  }

  private end() {
    this.phase = 'OVER';
    this.clockMs = 0;
    for (const s of this.skaters) this.neutralize(s.id);
    this.events.push({ type: 'end' });
  }

  private scoreGoal(team: Team) {
    const p = this.puck;
    const before = { ...this.score };
    this.score[team]++;
    this.lastGoal = team;
    this.phase = 'GOAL_PAUSE';
    this.pauseMs = CFG.goalPauseMs;
    const scorer = p.lastTouchId ? this.getSkater(p.lastTouchId) : undefined;
    const credited = scorer && scorer.team === team ? scorer : undefined;
    if (credited) credited.stats.goals++;
    this.events.push({
      type: 'goal',
      team,
      scorer: credited ? credited.number : null,
      goals: credited ? credited.stats.goals : 0,
      x: p.x,
      y: p.y,
    });
    p.vx = p.vy = 0;
    p.carrierId = null;
    for (const s of this.skaters) s.chargingSince = null;
    this.onGoal?.(team, before);
  }

  // ---------------------------------------------------------------- skaters

  private topSpeed(s: Skater) {
    let v = SK.maxSpeed;
    if (this.puck.carrierId === s.id) v *= SK.carrierSpeedFactor;
    if (this.t < s.slowUntil) v *= CFG.contact.slowFactor;
    if (this.t < s.stumbleUntil) v *= CFG.poke.stumbleSpeedFactor;
    if (this.t < s.boostUntil) v *= CFG.catch.boostFactor;
    return v;
  }

  private updateSkaters(dt: number) {
    for (const s of this.skaters) {
      const inp = s.connected ? s.input : NEUTRAL_INPUT;
      let mx = clamp(Number(inp.x) || 0, -1, 1);
      let my = clamp(Number(inp.y) || 0, -1, 1);
      let mag = Math.hypot(mx, my);
      if (mag < CFG.deadZone) {
        mx = my = mag = 0;
      } else if (mag > 1) {
        mx /= mag;
        my /= mag;
        mag = 1;
      }
      const dirX = mag > 0 ? mx / mag : 0;
      const dirY = mag > 0 ? my / mag : 0;
      const carrying = this.puck.carrierId === s.id;

      // SHOOT edges
      if (inp.shoot && !s.prevShoot) {
        if (carrying && s.chargingSince === null) this.startCharge(s, dirX, dirY, mag);
        else if (!carrying) s.shootPressedAt = this.t; // may become a one-timer
      }
      if (!inp.shoot && s.prevShoot && s.chargingSince !== null) {
        if (inp.cancel || !carrying) s.chargingSince = null;
        else this.fireShot(s);
      }
      if (s.chargingSince !== null && !carrying) s.chargingSince = null;

      // PASS / POKE edge
      if (inp.pass && !s.prevPass) {
        if (this.puck.carrierId === s.id) {
          const sincePickup = this.t - s.pickupAt;
          if (sincePickup <= CFG.catch.afterMs && !s.pickupCaught) {
            // a slightly late POKE press right after receiving still counts as a clean catch
            this.cleanCatch(s);
          } else if (sincePickup < CFG.catch.passLockMs) {
            // just got the puck: ignore the press so a late catch attempt never becomes a pass
          } else if (s.chargingSince === null) {
            this.doPass(s, dirX, dirY, mag);
          }
        } else {
          this.doPoke(s, dirX, dirY, mag);
        }
      }
      s.prevPass = inp.pass;
      s.prevShoot = inp.shoot;

      // Movement
      const top = this.topSpeed(s);
      if (s.chargingSince !== null) {
        if (mag > 0) {
          s.aimX = dirX;
          s.aimY = dirY;
        }
        this.decel(s, SK.chargeDrag, dt);
      } else if (mag > 0) {
        const tx = mx * top;
        const ty = my * top;
        let dvx = tx - s.vx;
        let dvy = ty - s.vy;
        const dl = Math.hypot(dvx, dvy);
        const speed = Math.hypot(s.vx, s.vy);
        const cos = speed > 1 ? (s.vx * dirX + s.vy * dirY) / speed : 1;
        const a = SK.accel * (1 + (SK.turnAssist * (1 - cos)) / 2);
        const maxDv = a * dt;
        if (dl > maxDv) {
          dvx *= maxDv / dl;
          dvy *= maxDv / dl;
        }
        s.vx += dvx;
        s.vy += dvy;
        s.fx = dirX;
        s.fy = dirY;
      } else {
        this.decel(s, SK.coastDecel, dt);
      }
      // over the (possibly reduced) top speed: bleed off quickly but smoothly
      const sp = Math.hypot(s.vx, s.vy);
      if (sp > top) {
        const ns = Math.max(top, sp - SK.overSpeedDecel * dt);
        s.vx *= ns / sp;
        s.vy *= ns / sp;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      this.clampSkater(s);
    }
  }

  private decel(s: Skater, d: number, dt: number) {
    const sp = Math.hypot(s.vx, s.vy);
    if (sp <= 0) return;
    const ns = Math.max(0, sp - d * dt);
    s.vx *= ns / sp;
    s.vy *= ns / sp;
  }

  private clampSkater(s: Skater) {
    const r = SK.radius;
    const R = this.R;
    if (s.x < R.minX + r) {
      s.x = R.minX + r;
      if (s.vx < 0) s.vx = 0;
    } else if (s.x > R.maxX - r) {
      s.x = R.maxX - r;
      if (s.vx > 0) s.vx = 0;
    }
    if (s.y < R.minY + r) {
      s.y = R.minY + r;
      if (s.vy < 0) s.vy = 0;
    } else if (s.y > R.maxY - r) {
      s.y = R.maxY - r;
      if (s.vy > 0) s.vy = 0;
    }
  }

  /** Separation between skaters (bodies block, no steals), and skaters vs (immovable) goalies. */
  private resolveBodies() {
    const r2 = SK.radius * 2;
    const list = this.skaters;
    const carrierId = this.puck.carrierId;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= r2 + 2) continue;
        // opponent contact with the carrier slows the carrier down (but never steals)
        if (a.team !== b.team) {
          if (a.id === carrierId) a.slowUntil = this.t + CFG.contact.slowMs;
          if (b.id === carrierId) b.slowUntil = this.t + CFG.contact.slowMs;
        }
        if (d >= r2) continue;
        if (d < 1e-6) {
          dx = 1;
          dy = 0;
          d = 1e-6;
        }
        const nx = dx / d;
        const ny = dy / d;
        const push = (r2 - d) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) {
          const imp = rel * 0.5;
          a.vx += nx * imp;
          a.vy += ny * imp;
          b.vx -= nx * imp;
          b.vy -= ny * imp;
        }
      }
    }
    const rg = SK.radius + G.radius;
    for (const s of list) {
      for (const g of this.goalies) {
        const dx = s.x - g.x;
        const dy = s.y - g.y;
        const d = Math.hypot(dx, dy);
        if (d >= rg) continue;
        const [nx, ny] = d < 1e-6 ? [g.team === 'RED' ? 1 : -1, 0] : [dx / d, dy / d];
        s.x = g.x + nx * rg;
        s.y = g.y + ny * rg;
        const vn = s.vx * nx + s.vy * ny;
        if (vn < 0) {
          s.vx -= vn * nx;
          s.vy -= vn * ny;
        }
      }
      this.clampSkater(s);
    }
  }

  // ---------------------------------------------------------------- actions

  private opponentGoalDir(s: Skater): [number, number] {
    const gx = s.team === 'RED' ? this.R.maxX : this.R.minX;
    return norm(gx - s.x, this.R.cy - s.y);
  }

  /** Aim including over-charge wobble. */
  private effectiveAim(s: Skater): [number, number] {
    if (s.chargingSince === null) return [s.aimX, s.aimY];
    const over = this.t - s.chargingSince - CFG.shot.chargeMs;
    if (over <= 0) return [s.aimX, s.aimY];
    const amp = (CFG.shot.overchargeWobbleDeg * Math.min(1, over / CFG.shot.overchargeWobbleRampMs) * Math.PI) / 180;
    const a = Math.sin(this.t / 90) * amp;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    return [s.aimX * c - s.aimY * sn, s.aimX * sn + s.aimY * c];
  }

  private startCharge(s: Skater, dirX: number, dirY: number, mag: number) {
    s.chargingSince = this.t;
    if (mag > 0) {
      s.aimX = dirX;
      s.aimY = dirY;
      return;
    }
    // Neutral stick: keep facing unless it points back toward our own goal.
    const towardOwn = s.team === 'RED' ? s.fx < -0.3 : s.fx > 0.3;
    if (!towardOwn && Math.hypot(s.fx, s.fy) > 0.5) {
      s.aimX = s.fx;
      s.aimY = s.fy;
    } else {
      [s.aimX, s.aimY] = this.opponentGoalDir(s);
    }
  }

  private fireShot(s: Skater) {
    const raw = this.chargeRaw(s);
    const perfect = raw >= CFG.shot.perfectMin && raw <= CFG.shot.perfectMax;
    const speed = perfect
      ? CFG.shot.perfectSpeed
      : lerp(CFG.shot.minSpeed, CFG.shot.maxSpeed, clamp(raw, 0, 1));
    const [ax, ay] = this.effectiveAim(s);
    s.chargingSince = null;
    this.release(s, ax, ay, speed, CFG.shot.momentumFactor, 'shot');
    if (perfect) {
      this.puck.goalieDelayMs = CFG.shot.perfectGoalieDelayMs;
      s.stats.perfects++;
    }
    s.stats.shots++;
    s.fx = ax;
    s.fy = ay;
    this.events.push({ type: 'shot', by: s.number, speed, perfect, oneTimer: false, x: s.x, y: s.y });
  }

  private fireOneTimer(s: Skater) {
    const inp = s.input;
    const mag = Math.hypot(inp.x, inp.y);
    let [ax, ay] = mag >= CFG.deadZone ? norm(inp.x, inp.y) : this.opponentGoalDir(s);
    // never one-time it into your own net by accident
    const towardOwn = s.team === 'RED' ? ax < -0.3 : ax > 0.3;
    if (towardOwn) [ax, ay] = this.opponentGoalDir(s);
    this.release(s, ax, ay, CFG.oneTimer.speed, 0.1, 'shot');
    this.puck.goalieDelayMs = CFG.oneTimer.goalieDelayMs;
    s.prevShoot = true; // the held button is "used"; releasing it does nothing
    s.stats.shots++;
    s.stats.oneTimers++;
    s.fx = ax;
    s.fy = ay;
    this.events.push({ type: 'shot', by: s.number, speed: CFG.oneTimer.speed, perfect: false, oneTimer: true, x: s.x, y: s.y });
  }

  private doPass(s: Skater, dirX: number, dirY: number, mag: number) {
    if (this.t < s.passCooldownUntil) return;
    let [ax, ay] = mag > 0 ? [dirX, dirY] : [s.fx, s.fy];
    if (Math.hypot(ax, ay) < 0.5) [ax, ay] = this.opponentGoalDir(s);
    const p = this.puck;
    let best: Skater | null = null;
    let bestScore = Infinity;
    for (const tm of this.skaters) {
      if (tm === s || tm.team !== s.team) continue;
      const dx = tm.x - p.x;
      const dy = tm.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > CFG.pass.range || dist < 20) continue;
      const ang = angleBetween(ax, ay, dx, dy);
      if (ang > CFG.pass.coneDeg) continue;
      const score = ang / CFG.pass.coneDeg + (dist / CFG.pass.range) * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = tm;
      }
    }
    if (best) {
      const dist = Math.hypot(best.x - p.x, best.y - p.y);
      const lead = (dist / CFG.pass.speed) * CFG.pass.leadFactor;
      [ax, ay] = norm(best.x + best.vx * lead - p.x, best.y + best.vy * lead - p.y);
    }
    s.passCooldownUntil = this.t + CFG.pass.cooldownMs;
    this.release(s, ax, ay, CFG.pass.speed, 0.1, 'pass');
    s.fx = ax;
    s.fy = ay;
    this.events.push({ type: 'pass', by: s.number, x: s.x, y: s.y });
  }

  /** Is a loose puck about to reach this skater? */
  private incomingPuck(s: Skater) {
    const p = this.puck;
    if (p.carrierId) return false;
    const dx = s.x - p.x;
    const dy = s.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > CFG.catch.incomingRange) return false;
    const reach = SK.radius + PK.radius;
    if (d <= reach + 6) return true;
    // relative velocity: works for a puck sliding to you AND for you skating onto a resting puck
    const rvx = p.vx - s.vx;
    const rvy = p.vy - s.vy;
    const closing = (rvx * dx + rvy * dy) / d; // closing speed
    if (closing < 60) return false;
    // will the (relative) path pass within reach of us?
    const sp = Math.hypot(rvx, rvy);
    const cross = Math.abs(rvx * dy - rvy * dx) / sp;
    return cross <= reach + 10 && ((d - reach) / closing) * 1000 <= CFG.catch.incomingTimeMs;
  }

  private doPoke(s: Skater, dirX: number, dirY: number, mag: number) {
    if (this.t < s.pokeCooldownUntil) return;
    const P = CFG.poke;
    const [ax, ay] = mag > 0 ? [dirX, dirY] : [s.fx, s.fy];
    const reach = P.range + SK.radius;
    const dist = (x: number, y: number) => Math.hypot(x - s.x, y - s.y);
    const inReach = (x: number, y: number) => dist(x, y) <= reach && angleBetween(ax, ay, x - s.x, y - s.y) <= P.arcDeg;
    const p = this.puck;
    const setCooldown = (ms: number) => {
      s.pokeCooldownUntil = this.t + ms;
      s.pokeCooldownLen = ms;
    };

    // 1) a loose puck is about to reach me → this press is a clean-catch attempt, never a whiff
    if (!p.carrierId && this.incomingPuck(s)) {
      s.catchArmedUntil = this.t + CFG.catch.beforeMs;
      return;
    }

    s.pokeShowUntil = this.t + P.showMs;
    if (p.carrierId) {
      const c = this.getSkater(p.carrierId);
      if (c && c.team !== s.team) {
        if (inReach(p.x, p.y) || inReach(c.x, c.y)) {
          setCooldown(P.cooldownMs);
          if (this.t >= p.protectedUntil) this.steal(s, c);
          return;
        }
        if (Math.min(dist(p.x, p.y), dist(c.x, c.y)) <= reach * P.closeMissFactor) {
          setCooldown(P.cooldownMs); // close miss: no stumble
          return;
        }
      } else if (c) {
        setCooldown(P.cooldownMs); // poking near your own carrier: harmless
        return;
      }
    } else if (inReach(p.x, p.y)) {
      setCooldown(P.cooldownMs);
      p.vx = ax * P.nudgeSpeed;
      p.vy = ay * P.nudgeSpeed;
      return;
    } else if (dist(p.x, p.y) <= reach * P.closeMissFactor) {
      setCooldown(P.cooldownMs);
      return;
    }
    // whiff: nothing to poke at — stumble and wait longer
    setCooldown(P.whiffCooldownMs);
    s.stumbleUntil = this.t + P.stumbleMs;
    this.events.push({ type: 'whiff', by: s.number, x: s.x, y: s.y });
  }

  private cleanCatch(s: Skater) {
    s.pickupCaught = true;
    s.catchArmedUntil = 0;
    s.boostUntil = this.t + CFG.catch.boostMs;
    const sp = Math.hypot(s.vx, s.vy);
    const [dx, dy] = sp > 20 ? [s.vx / sp, s.vy / sp] : [s.fx, s.fy];
    const target = Math.max(sp, SK.maxSpeed * 0.75) * 1.15;
    s.vx = dx * target;
    s.vy = dy * target;
    s.stats.catches++;
    this.events.push({ type: 'cleanCatch', by: s.number, x: s.x, y: s.y });
  }

  private release(s: Skater, dx: number, dy: number, speed: number, momentum: number, kind: Puck['launchKind']) {
    const p = this.puck;
    p.carrierId = null;
    p.vx = dx * speed + s.vx * momentum;
    p.vy = dy * speed + s.vy * momentum;
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > PK.maxSpeed) {
      p.vx *= PK.maxSpeed / sp;
      p.vy *= PK.maxSpeed / sp;
    }
    p.lastReleasedBy = s.id;
    p.lastReleaseT = this.t;
    p.launchKind = kind;
    p.goalieDelayMs = 0;
    p.launchId++;
  }

  private dropPuck(s: Skater) {
    const p = this.puck;
    p.carrierId = null;
    p.vx = s.vx * 0.5;
    p.vy = s.vy * 0.5;
    p.lastReleasedBy = s.id;
    p.lastReleaseT = this.t;
    p.launchKind = 'other';
    p.goalieDelayMs = 0;
    p.launchId++;
  }

  private steal(thief: Skater, victim: Skater) {
    victim.chargingSince = null;
    victim.slowUntil = this.t + CFG.stealVictimSlowMs;
    thief.stats.steals++;
    this.events.push({ type: 'steal', by: thief.number, from: victim.number, x: this.puck.x, y: this.puck.y });
    this.giveTo(thief);
    this.puck.protectedUntil = this.t + CFG.stealImmunityMs;
  }

  /** Possession change. Returns true if the puck was immediately shot as a one-timer. */
  private giveTo(s: Skater) {
    const p = this.puck;
    const fromTeammatePass =
      p.carrierId === null &&
      p.launchKind === 'pass' &&
      p.lastReleasedBy !== null &&
      p.lastReleasedBy !== s.id &&
      this.getSkater(p.lastReleasedBy)?.team === s.team;
    p.carrierId = s.id;
    p.lastTouchId = s.id;
    p.protectedUntil = this.t + CFG.pickupImmunityMs;
    p.vx = p.vy = 0;
    s.pickupAt = this.t;
    s.pickupCaught = false;
    if (fromTeammatePass && s.input.shoot && s.chargingSince === null && this.t - s.shootPressedAt <= CFG.oneTimer.windowMs) {
      this.positionCarried(s);
      this.fireOneTimer(s);
      return true;
    }
    if (this.t <= s.catchArmedUntil) this.cleanCatch(s);
    return false;
  }

  // ---------------------------------------------------------------- puck

  private positionCarried(owner: Skater) {
    const p = this.puck;
    const [dx, dy] = owner.chargingSince !== null ? this.effectiveAim(owner) : [owner.fx, owner.fy];
    p.x = clamp(owner.x + dx * PK.carryDist, this.R.minX + PK.radius, this.R.maxX - PK.radius);
    p.y = clamp(owner.y + dy * PK.carryDist, this.R.minY + PK.radius, this.R.maxY - PK.radius);
  }

  private updateCarried() {
    const p = this.puck;
    if (!p.carrierId) return;
    const owner = this.getSkater(p.carrierId);
    if (!owner) {
      p.carrierId = null;
      return;
    }
    this.positionCarried(owner);
    p.vx = owner.vx;
    p.vy = owner.vy;
  }

  private updateLoosePuck(dt: number) {
    const p = this.puck;
    const R = this.R;
    let sp = Math.hypot(p.vx, p.vy);
    if (sp > 0) {
      const ns = Math.max(0, sp - PK.friction * dt);
      p.vx *= ns / sp;
      p.vy *= ns / sp;
      sp = ns;
    }
    const steps = Math.max(1, Math.ceil((sp * dt) / PK.subStep));
    const sdt = dt / steps;
    const pr = PK.radius;
    for (let i = 0; i < steps; i++) {
      p.x += p.vx * sdt;
      p.y += p.vy * sdt;

      const inMouth = p.y > goal.minY && p.y < goal.maxY;
      const pastLeft = p.x - pr < R.minX;
      const pastRight = p.x + pr > R.maxX;
      if ((pastLeft || pastRight) && inMouth) {
        p.y = clamp(p.y, goal.minY + pr, goal.maxY - pr);
        if (pastLeft && p.x + pr < R.minX) return this.scoreGoal('BLUE');
        if (pastRight && p.x - pr > R.maxX) return this.scoreGoal('RED');
        if (p.x < R.minX - goal.depth + pr) {
          p.x = R.minX - goal.depth + pr;
          p.vx = Math.abs(p.vx) * 0.3;
        } else if (p.x > R.maxX + goal.depth - pr) {
          p.x = R.maxX + goal.depth - pr;
          p.vx = -Math.abs(p.vx) * 0.3;
        }
      } else {
        if (pastLeft) {
          p.x = R.minX + pr;
          p.vx = Math.abs(p.vx) * PK.wallRestitution;
          p.vy *= PK.wallTangentDamping;
        } else if (pastRight) {
          p.x = R.maxX - pr;
          p.vx = -Math.abs(p.vx) * PK.wallRestitution;
          p.vy *= PK.wallTangentDamping;
        }
      }
      if (p.y - pr < R.minY) {
        p.y = R.minY + pr;
        p.vy = Math.abs(p.vy) * PK.wallRestitution;
        p.vx *= PK.wallTangentDamping;
      } else if (p.y + pr > R.maxY) {
        p.y = R.maxY - pr;
        p.vy = -Math.abs(p.vy) * PK.wallRestitution;
        p.vx *= PK.wallTangentDamping;
      }

      // goalie saves
      for (const g of this.goalies) {
        if (!this.goaliesEnabled || this.t < g.saveCooldownUntil) continue;
        const dx = p.x - g.x;
        const dy = p.y - g.y;
        const d = Math.hypot(dx, dy);
        const rr = G.radius + pr;
        if (d >= rr) continue;
        const [nx, ny] = d < 1e-6 ? [g.team === 'RED' ? 1 : -1, 0] : [dx / d, dy / d];
        const vn = p.vx * nx + p.vy * ny;
        if (vn < 0) {
          p.vx -= (1 + G.deflectRestitution) * vn * nx;
          p.vy -= (1 + G.deflectRestitution) * vn * ny;
        }
        const out = g.team === 'RED' ? 1 : -1;
        if (p.vx * out < G.deflectMinOut) p.vx = out * G.deflectMinOut;
        p.vy += (this.rand() - 0.5) * 120;
        p.x = g.x + nx * (rr + 0.5);
        p.y = g.y + ny * (rr + 0.5);
        if (Math.sign(p.x - g.x) !== out) p.x = g.x + out * (rr + 0.5);
        p.lastReleasedBy = null;
        p.launchKind = 'other';
        p.goalieDelayMs = 0;
        p.launchId++;
        g.saveCooldownUntil = this.t + G.saveCooldownMs;
        g.saveFlashUntil = this.t + G.saveFlashMs;
        this.events.push({ type: 'save', team: g.team, x: p.x, y: p.y });
      }

      // pickups: any skater touching a loose puck takes it, however fast
      if (this.t >= p.ghostUntil) {
        let best: Skater | null = null;
        let bestD = SK.radius + pr;
        for (const s of this.skaters) {
          if (s.id === p.lastReleasedBy && this.t - p.lastReleaseT < CFG.selfRecatchMs) continue;
          const d = Math.hypot(s.x - p.x, s.y - p.y);
          if (d < bestD) {
            bestD = d;
            best = s;
          }
        }
        if (best) {
          this.events.push({ type: 'pickup', by: best.number, x: p.x, y: p.y });
          this.giveTo(best);
          return;
        }
      }
    }
  }

  // ---------------------------------------------------------------- goalies

  private updateGoalies(dt: number) {
    const p = this.puck;
    const R = this.R;
    const tSec = this.t / 1000;
    for (const g of this.goalies) {
      const own = g.team === 'RED' ? -1 : 1;
      const lineX = g.team === 'RED' ? R.minX : R.maxX;
      let patrolY = R.cy + G.patrolAmp * Math.sin((2 * Math.PI * tSec) / g.period + g.phase);
      const inOwnHalf = g.team === 'RED' ? p.x < R.cx : p.x > R.cx;
      if (inOwnHalf) patrolY = lerp(patrolY, p.y, G.patrolTrack);

      let target = patrolY;
      const loose = !p.carrierId;
      const toward = p.vx * own > 40;
      const distToLine = Math.abs(lineX - p.x);
      const danger = this.phase === 'PLAYING' && loose && toward && distToLine < G.dangerX;
      if (danger) {
        if (g.trackLaunch !== p.launchId) {
          g.trackLaunch = p.launchId;
          g.reactAt =
            this.t +
            G.reactDelayMinMs +
            this.rand() * (G.reactDelayMaxMs - G.reactDelayMinMs) +
            p.goalieDelayMs;
          g.targetY = null;
        }
        if (g.reactAt !== null && this.t >= g.reactAt) {
          if (g.targetY === null) {
            const time = (g.x - p.x) / p.vx;
            const py = time > 0 ? p.y + p.vy * time : p.y;
            g.targetY = py + (this.rand() - 0.5) * 2 * G.predictNoise;
          }
          target = lerp(patrolY, g.targetY, G.reactBlend);
          g.mode = 'REACT';
        }
      } else {
        g.mode = 'PATROL';
        g.reactAt = null;
        g.targetY = null;
      }
      const maxMove = G.speed * dt;
      g.y = clamp(g.y + clamp(target - g.y, -maxMove, maxMove), G.minY, G.maxY);
    }
  }

  // ---------------------------------------------------------------- safety

  private sanitize() {
    const p = this.puck;
    if (!finite(p.x, p.y, p.vx, p.vy)) {
      Object.assign(p, { x: this.R.cx, y: this.R.cy, vx: 0, vy: 0, carrierId: null });
    }
    for (const s of this.skaters) {
      if (!finite(s.x, s.y, s.vx, s.vy, s.fx, s.fy)) {
        s.x = s.team === 'RED' ? this.R.cx - 150 : this.R.cx + 150;
        s.y = this.R.cy;
        s.vx = s.vy = 0;
        s.fx = s.team === 'RED' ? 1 : -1;
        s.fy = 0;
      }
    }
  }
}
