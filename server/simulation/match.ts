// Authoritative hockey match simulation. Pure: no timers, no I/O. Call step() at CFG.tickHz.
import { CFG } from './config';
import { angleBetween, clamp, finite, lerp, norm, rng } from './math';
import type { MatchPhase, Snapshot, Team } from '../../shared/types';

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
  pokeShowUntil: number;
  noContactStealUntil: number;
}

export interface Puck {
  x: number;
  y: number;
  vx: number;
  vy: number;
  carrierId: string | null;
  lastReleasedBy: string | null;
  lastReleaseT: number;
  protectedUntil: number;
  /** increments every time the puck is launched or deflected; goalies react once per launch */
  launchId: number;
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

export type MatchEvent =
  | { type: 'goal'; team: Team }
  | { type: 'possession'; playerId: string; steal: boolean }
  | { type: 'save'; team: Team }
  | { type: 'shot'; playerId: string; speed: number }
  | { type: 'pass'; playerId: string; targetId: string | null }
  | { type: 'end' };

const { rink, goal, skater: SK, puck: PK } = CFG;
const G = CFG.goalie;

/** Faceoff formations for one team on the LEFT half, facing right. Mirrored for the right side. */
const FORMATIONS: Record<number, [number, number][]> = {
  1: [[430, 340]],
  2: [
    [440, 270],
    [440, 410],
  ],
  3: [
    [450, 340],
    [320, 220],
    [320, 460],
  ],
  4: [
    [450, 260],
    [450, 420],
    [290, 190],
    [290, 490],
  ],
};

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
  skaters: Skater[];
  puck: Puck;
  goalies: [Goalie, Goalie];
  events: MatchEvent[] = [];
  /** tests only: disable goalie collisions */
  goaliesEnabled = true;
  private rand: () => number;

  constructor(players: MatchPlayer[], durationMs: number, seed = 1) {
    this.clockMs = durationMs;
    this.rand = rng(seed);
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
        pokeShowUntil: 0,
        noContactStealUntil: 0,
      }));
    this.puck = {
      x: rink.cx,
      y: rink.cy,
      vx: 0,
      vy: 0,
      carrierId: null,
      lastReleasedBy: null,
      lastReleaseT: -1e9,
      protectedUntil: 0,
      launchId: 0,
      ghostUntil: 0,
    };
    const mkGoalie = (team: Team): Goalie => ({
      team,
      x: team === 'RED' ? G.redX : G.blueX,
      y: rink.cy,
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
    p.y = rink.cy;
    if (team === 'RED') {
      p.x = rink.maxX - 6;
      p.vx = 600;
    } else {
      p.x = rink.minX + 6;
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
      sk: this.skaters.map((s) => ({
        n: s.number,
        tm: s.team === 'RED' ? 0 : 1,
        x: r1(s.x),
        y: r1(s.y),
        fx: r2(s.fx),
        fy: r2(s.fy),
        ch: s.chargingSince === null ? -1 : r2(this.chargeFrac(s)),
        ax: r2(s.aimX),
        ay: r2(s.aimY),
        c: s.connected ? 1 : 0,
        pk: this.t < s.pokeShowUntil ? 1 : 0,
      })),
      gl: this.goalies.map((g) => ({ x: g.x, y: r1(g.y), s: this.t < g.saveFlashUntil ? 1 : 0 })) as [
        Snapshot['gl'][0],
        Snapshot['gl'][1],
      ],
    };
  }

  chargeFrac(s: Skater) {
    if (s.chargingSince === null) return 0;
    return clamp((this.t - s.chargingSince) / CFG.shot.chargeMs, 0, 1);
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---------------------------------------------------------------- phases

  faceoff() {
    for (const team of ['RED', 'BLUE'] as Team[]) {
      const members = this.skaters.filter((s) => s.team === team);
      const form = FORMATIONS[clamp(members.length, 1, 4)] ?? FORMATIONS[4];
      members.forEach((s, i) => {
        const [fx, fy] = form[i % form.length];
        s.x = team === 'RED' ? fx : rink.width - fx;
        s.y = fy;
        s.vx = s.vy = 0;
        s.fx = team === 'RED' ? 1 : -1;
        s.fy = 0;
        s.aimX = s.fx;
        s.aimY = 0;
        s.chargingSince = null;
        s.noContactStealUntil = 0;
      });
    }
    Object.assign(this.puck, {
      x: rink.cx,
      y: rink.cy,
      vx: 0,
      vy: 0,
      carrierId: null,
      lastReleasedBy: null,
      lastReleaseT: -1e9,
      protectedUntil: 0,
      ghostUntil: 0,
    });
    this.puck.launchId++;
    for (const g of this.goalies) {
      g.y = rink.cy;
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
    this.score[team]++;
    this.lastGoal = team;
    this.phase = 'GOAL_PAUSE';
    this.pauseMs = CFG.goalPauseMs;
    this.puck.vx = this.puck.vy = 0;
    this.puck.carrierId = null;
    for (const s of this.skaters) s.chargingSince = null;
    this.events.push({ type: 'goal', team });
  }

  // ---------------------------------------------------------------- skaters

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
      if (inp.shoot && !s.prevShoot && carrying && s.chargingSince === null) {
        this.startCharge(s, dirX, dirY, mag);
      }
      if (!inp.shoot && s.prevShoot && s.chargingSince !== null) {
        if (inp.cancel || !carrying) s.chargingSince = null;
        else this.fireShot(s);
      }
      if (s.chargingSince !== null && !carrying) s.chargingSince = null;

      // PASS / POKE edge
      if (inp.pass && !s.prevPass) {
        if (this.puck.carrierId === s.id) {
          if (s.chargingSince === null) this.doPass(s, dirX, dirY, mag);
        } else {
          this.doPoke(s, dirX, dirY, mag);
        }
      }
      s.prevPass = inp.pass;
      s.prevShoot = inp.shoot;

      // Movement
      if (s.chargingSince !== null) {
        if (mag > 0) {
          s.aimX = dirX;
          s.aimY = dirY;
        }
        this.decel(s, SK.chargeDrag, dt);
      } else if (mag > 0) {
        const tx = mx * SK.maxSpeed;
        const ty = my * SK.maxSpeed;
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
      const sp = Math.hypot(s.vx, s.vy);
      if (sp > SK.maxSpeed) {
        s.vx *= SK.maxSpeed / sp;
        s.vy *= SK.maxSpeed / sp;
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
    if (s.x < rink.minX + r) {
      s.x = rink.minX + r;
      if (s.vx < 0) s.vx = 0;
    } else if (s.x > rink.maxX - r) {
      s.x = rink.maxX - r;
      if (s.vx > 0) s.vx = 0;
    }
    if (s.y < rink.minY + r) {
      s.y = rink.minY + r;
      if (s.vy < 0) s.vy = 0;
    } else if (s.y > rink.maxY - r) {
      s.y = rink.maxY - r;
      if (s.vy > 0) s.vy = 0;
    }
  }

  /** Gentle separation between skaters, and skaters vs (immovable) goalies. */
  private resolveBodies() {
    const r2 = SK.radius * 2;
    const list = this.skaters;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
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
        // exchange a little of the closing velocity
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
    const gx = s.team === 'RED' ? rink.maxX : rink.minX;
    return norm(gx - s.x, rink.cy - s.y);
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
    const frac = this.chargeFrac(s);
    const speed = lerp(CFG.shot.minSpeed, CFG.shot.maxSpeed, frac);
    s.chargingSince = null;
    this.release(s, s.aimX, s.aimY, speed, CFG.shot.momentumFactor);
    s.fx = s.aimX;
    s.fy = s.aimY;
    this.events.push({ type: 'shot', playerId: s.id, speed });
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
    this.release(s, ax, ay, CFG.pass.speed, 0.1);
    s.fx = ax;
    s.fy = ay;
    this.events.push({ type: 'pass', playerId: s.id, targetId: best ? best.id : null });
  }

  private doPoke(s: Skater, dirX: number, dirY: number, mag: number) {
    if (this.t < s.pokeCooldownUntil) return;
    s.pokeCooldownUntil = this.t + CFG.poke.cooldownMs;
    s.pokeShowUntil = this.t + CFG.poke.showMs;
    const [ax, ay] = mag > 0 ? [dirX, dirY] : [s.fx, s.fy];
    const reach = CFG.poke.range + SK.radius;
    const inReach = (x: number, y: number) => {
      const dx = x - s.x;
      const dy = y - s.y;
      return Math.hypot(dx, dy) <= reach && angleBetween(ax, ay, dx, dy) <= CFG.poke.arcDeg;
    };
    const p = this.puck;
    if (p.carrierId) {
      const c = this.getSkater(p.carrierId);
      if (!c || c.team === s.team) return;
      if ((inReach(p.x, p.y) || inReach(c.x, c.y)) && this.t >= p.protectedUntil) {
        this.steal(s, c);
      }
    } else if (inReach(p.x, p.y)) {
      p.vx = ax * CFG.poke.nudgeSpeed;
      p.vy = ay * CFG.poke.nudgeSpeed;
    }
  }

  private release(s: Skater, dx: number, dy: number, speed: number, momentum: number) {
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
    p.launchId++;
  }

  private dropPuck(s: Skater) {
    const p = this.puck;
    p.carrierId = null;
    p.vx = s.vx * 0.5;
    p.vy = s.vy * 0.5;
    p.lastReleasedBy = s.id;
    p.lastReleaseT = this.t;
    p.launchId++;
  }

  private steal(thief: Skater, victim: Skater) {
    victim.chargingSince = null;
    victim.noContactStealUntil = this.t + CFG.contactStealCooldownMs;
    this.giveTo(thief, true);
  }

  private giveTo(s: Skater, steal: boolean) {
    const p = this.puck;
    p.carrierId = s.id;
    p.protectedUntil = this.t + CFG.pickupImmunityMs;
    p.vx = p.vy = 0;
    this.events.push({ type: 'possession', playerId: s.id, steal });
  }

  // ---------------------------------------------------------------- puck

  private updateCarried() {
    const p = this.puck;
    if (!p.carrierId) return;
    const c = this.getSkater(p.carrierId);
    if (!c) {
      p.carrierId = null;
      return;
    }
    // contact steals by opponents
    if (this.t >= p.protectedUntil) {
      for (const s of this.skaters) {
        if (s.team === c.team || this.t < s.noContactStealUntil) continue;
        const touchBody = Math.hypot(s.x - c.x, s.y - c.y) < SK.radius * 2 + 2;
        const touchPuck = Math.hypot(s.x - p.x, s.y - p.y) < SK.radius + PK.radius;
        if (touchBody || touchPuck) {
          this.steal(s, c);
          break;
        }
      }
    }
    const owner = this.getSkater(p.carrierId!)!;
    const [dx, dy] = owner.chargingSince !== null ? [owner.aimX, owner.aimY] : [owner.fx, owner.fy];
    p.x = clamp(owner.x + dx * PK.carryDist, rink.minX + PK.radius, rink.maxX - PK.radius);
    p.y = clamp(owner.y + dy * PK.carryDist, rink.minY + PK.radius, rink.maxY - PK.radius);
    p.vx = owner.vx;
    p.vy = owner.vy;
  }

  private updateLoosePuck(dt: number) {
    const p = this.puck;
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
      const pastLeft = p.x - pr < rink.minX;
      const pastRight = p.x + pr > rink.maxX;
      if ((pastLeft || pastRight) && inMouth) {
        // entering a goal mouth: keep inside the net's vertical extent
        p.y = clamp(p.y, goal.minY + pr, goal.maxY - pr);
        if (pastLeft && p.x + pr < rink.minX) return this.scoreGoal('BLUE');
        if (pastRight && p.x - pr > rink.maxX) return this.scoreGoal('RED');
        // back of net
        if (p.x < rink.minX - goal.depth + pr) {
          p.x = rink.minX - goal.depth + pr;
          p.vx = Math.abs(p.vx) * 0.3;
        } else if (p.x > rink.maxX + goal.depth - pr) {
          p.x = rink.maxX + goal.depth - pr;
          p.vx = -Math.abs(p.vx) * 0.3;
        }
      } else {
        if (pastLeft) {
          p.x = rink.minX + pr;
          p.vx = Math.abs(p.vx) * PK.wallRestitution;
          p.vy *= PK.wallTangentDamping;
        } else if (pastRight) {
          p.x = rink.maxX - pr;
          p.vx = -Math.abs(p.vx) * PK.wallRestitution;
          p.vy *= PK.wallTangentDamping;
        }
      }
      if (p.y - pr < rink.minY) {
        p.y = rink.minY + pr;
        p.vy = Math.abs(p.vy) * PK.wallRestitution;
        p.vx *= PK.wallTangentDamping;
      } else if (p.y + pr > rink.maxY) {
        p.y = rink.maxY - pr;
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
        p.launchId++;
        g.saveCooldownUntil = this.t + G.saveCooldownMs;
        g.saveFlashUntil = this.t + G.saveFlashMs;
        this.events.push({ type: 'save', team: g.team });
      }

      // pickups (any skater touching a loose puck takes it, however fast)
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
          this.giveTo(best, false);
          return;
        }
      }
    }
  }

  // ---------------------------------------------------------------- goalies

  private updateGoalies(dt: number) {
    const p = this.puck;
    const tSec = this.t / 1000;
    for (const g of this.goalies) {
      const own = g.team === 'RED' ? -1 : 1; // direction toward own goal along x
      const lineX = g.team === 'RED' ? rink.minX : rink.maxX;
      let patrolY = rink.cy + G.patrolAmp * Math.sin((2 * Math.PI * tSec) / g.period + g.phase);
      const inOwnHalf = g.team === 'RED' ? p.x < rink.cx : p.x > rink.cx;
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
            this.t + G.reactDelayMinMs + this.rand() * (G.reactDelayMaxMs - G.reactDelayMinMs);
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
      Object.assign(p, { x: rink.cx, y: rink.cy, vx: 0, vy: 0, carrierId: null });
    }
    for (const s of this.skaters) {
      if (!finite(s.x, s.y, s.vx, s.vy, s.fx, s.fy)) {
        s.x = s.team === 'RED' ? 400 : 800;
        s.y = rink.cy;
        s.vx = s.vy = 0;
        s.fx = s.team === 'RED' ? 1 : -1;
        s.fy = 0;
      }
    }
  }
}
