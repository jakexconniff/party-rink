import { describe, expect, it } from 'vitest';
import { HockeyMatch, type MatchPlayer } from '../simulation/match';
import { CFG } from '../simulation/config';
import { rng } from '../simulation/math';

const P = (id: string, number: number, team: 'RED' | 'BLUE'): MatchPlayer => ({ id, number, team });

/** Match already in PLAYING with skaters parked in corners (out of the way). */
function playing(players: MatchPlayer[] = [P('a', 1, 'RED'), P('b', 2, 'BLUE')], durationMs = 300_000) {
  const m = new HockeyMatch(players, durationMs, 42, { fullRink: true });
  while (m.phase === 'COUNTDOWN') m.step();
  m.skaters.forEach((s, i) => {
    s.x = 100 + i * 40;
    s.y = 600;
    s.vx = s.vy = 0;
  });
  return m;
}

function place(m: HockeyMatch, id: string, x: number, y: number, fx = 1, fy = 0) {
  const s = m.getSkater(id)!;
  Object.assign(s, { x, y, vx: 0, vy: 0, fx, fy, aimX: fx, aimY: fy });
  return s;
}

function give(m: HockeyMatch, id: string) {
  m.puck.carrierId = id;
  m.puck.lastTouchId = id;
  m.puck.protectedUntil = 0;
  m.step(); // positions the puck on the stick
}

const steps = (m: HockeyMatch, n: number) => {
  for (let i = 0; i < n; i++) m.step();
};
const ticks = (ms: number) => Math.ceil(ms / CFG.dtMs);

function shoot(m: HockeyMatch, id: string, holdTicks: number, aim?: [number, number]) {
  m.setInput(id, { shoot: true, x: aim?.[0] ?? 0, y: aim?.[1] ?? 0 });
  steps(m, Math.max(1, holdTicks));
  m.setInput(id, { shoot: false, x: 0, y: 0 });
  m.step();
}

describe('scoring geometry', () => {
  it('a 30° full-power shot from red scores in the right goal when unobstructed', () => {
    const m = playing();
    m.goaliesEnabled = false;
    const a = Math.PI / 6;
    place(m, 'a', 900, 340 - Math.tan(a) * 236, Math.cos(a), Math.sin(a));
    give(m, 'a');
    shoot(m, 'a', ticks(1600), [Math.cos(a), Math.sin(a)]);
    let n = 0;
    while (m.phase === 'PLAYING' && n++ < 200) m.step();
    expect(m.phase).toBe('GOAL_PAUSE');
    expect(m.score).toEqual({ RED: 1, BLUE: 0 });
  });

  it('a shot outside the goal mouth rebounds off the boards', () => {
    const m = playing();
    m.goaliesEnabled = false;
    place(m, 'a', 900, 200);
    give(m, 'a');
    shoot(m, 'a', ticks(1600), [1, 0]);
    let maxX = 0;
    let bounced = false;
    for (let i = 0; i < 120; i++) {
      m.step();
      maxX = Math.max(maxX, m.puck.x);
      if (m.puck.vx < 0) bounced = true;
    }
    expect(m.score.RED).toBe(0);
    expect(bounced).toBe(true);
    expect(maxX).toBeLessThanOrEqual(CFG.rink.maxX - CFG.puck.radius + 0.01);
  });

  it('blue scores in the left goal', () => {
    const m = playing();
    m.goaliesEnabled = false;
    place(m, 'b', 300, 340, -1, 0);
    give(m, 'b');
    shoot(m, 'b', 1, [-1, 0]);
    let n = 0;
    while (m.phase === 'PLAYING' && n++ < 200) m.step();
    expect(m.score).toEqual({ RED: 0, BLUE: 1 });
  });
});

describe('possession', () => {
  it('a fast shot is intercepted by a skater in its path; shooter cannot instantly recatch', () => {
    const m = playing();
    m.goaliesEnabled = false;
    place(m, 'a', 400, 340);
    place(m, 'b', 700, 340, -1, 0);
    give(m, 'a');
    shoot(m, 'a', ticks(1600), [1, 0]);
    let n = 0;
    while (!m.puck.carrierId && n++ < 120) m.step();
    expect(m.puck.carrierId).toBe('b');
  });

  it('self-recatch is blocked for ~250ms, then allowed', () => {
    const m = playing();
    const a = place(m, 'a', 500, 340);
    Object.assign(m.puck, { x: a.x + 10, y: a.y, vx: 0, vy: 0, carrierId: null, lastReleasedBy: 'a', lastReleaseT: m.t });
    m.step();
    expect(m.puck.carrierId).toBeNull();
    steps(m, ticks(CFG.selfRecatchMs + 20));
    expect(m.puck.carrierId).toBe('a');
  });

  it('pass reaches a teammate and can be intercepted by an opponent in the lane', () => {
    const players = [P('a', 1, 'RED'), P('c', 3, 'RED'), P('b', 2, 'BLUE')];
    const m = playing(players);
    place(m, 'a', 300, 340);
    place(m, 'c', 600, 380);
    give(m, 'a');
    m.setInput('a', { pass: true });
    m.step();
    m.setInput('a', { pass: false });
    let n = 0;
    while (!m.puck.carrierId && n++ < 120) m.step();
    expect(m.puck.carrierId).toBe('c');

    const m2 = playing(players);
    place(m2, 'a', 300, 340);
    place(m2, 'c', 650, 340);
    place(m2, 'b', 470, 340, -1, 0);
    give(m2, 'a');
    m2.setInput('a', { pass: true });
    m2.step();
    n = 0;
    while (!m2.puck.carrierId && n++ < 120) m2.step();
    expect(m2.puck.carrierId).toBe('b');
  });

  it('poke-check steals in range and in front, fails out of range or facing away', () => {
    const setup = (bx: number, bfx: number) => {
      const m = playing();
      place(m, 'a', 500, 340, 1, 0);
      give(m, 'a');
      place(m, 'b', bx, 340, bfx, 0);
      steps(m, ticks(CFG.pickupImmunityMs + 20));
      m.setInput('b', { pass: true });
      m.step();
      return m;
    };
    expect(setup(580, -1).puck.carrierId).toBe('b');
    expect(setup(640, -1).puck.carrierId).toBe('a');
    expect(setup(580, 1).puck.carrierId).toBe('a');
  });

  it('poke has a cooldown', () => {
    const m = playing();
    place(m, 'a', 500, 340);
    give(m, 'a');
    place(m, 'b', 640, 340, -1, 0); // out of range
    steps(m, ticks(400));
    m.setInput('b', { pass: true });
    m.step();
    m.setInput('b', { pass: false });
    m.step();
    place(m, 'b', 580, 340, -1, 0); // now in range but on cooldown
    m.setInput('b', { pass: true });
    m.step();
    expect(m.puck.carrierId).toBe('a');
  });

  it('body contact never steals, but slows the carrier', () => {
    const m = playing();
    const a = place(m, 'a', 500, 340);
    give(m, 'a');
    steps(m, ticks(CFG.pickupImmunityMs + 20));
    place(m, 'b', 525, 340, -1, 0);
    for (let i = 0; i < ticks(700); i++) {
      const b = m.getSkater('b')!;
      m.setInput('a', { x: Math.sign(b.x - a.x) || 1, y: 0 });
      m.setInput('b', { x: Math.sign(a.x - b.x) || -1, y: 0 });
      m.step();
      expect(m.puck.carrierId).toBe('a');
    }
    expect(m.t).toBeLessThan(a.slowUntil + 1);
  });

  it('carrying the puck lowers top speed', () => {
    const topSpeed = (carry: boolean) => {
      const m = playing();
      const a = place(m, 'a', 300, 150);
      if (carry) give(m, 'a');
      m.setInput('a', { x: 1, y: 0 });
      steps(m, ticks(2000));
      return Math.hypot(a.vx, a.vy);
    };
    const free = topSpeed(false);
    const carrying = topSpeed(true);
    expect(free).toBeCloseTo(CFG.skater.maxSpeed, 0);
    expect(carrying).toBeCloseTo(CFG.skater.maxSpeed * CFG.skater.carrierSpeedFactor, 0);
  });

  it('a whiffed poke (nothing near) stumbles and gets a long cooldown; a close miss does not', () => {
    const m = playing();
    const a = place(m, 'a', 300, 340);
    give(m, 'a');
    const b = place(m, 'b', 800, 340, -1, 0);
    steps(m, 5);
    m.setInput('b', { pass: true });
    m.step();
    m.setInput('b', { pass: false });
    expect(b.stumbleUntil).toBeGreaterThan(m.t);
    expect(b.pokeCooldownUntil - m.t).toBeGreaterThan(CFG.poke.cooldownMs);
    expect(m.drainEvents().some((e) => e.type === 'whiff')).toBe(true);
    // close miss: carrier near but behind us
    const m2 = playing();
    place(m2, 'a', 500, 340, 1, 0);
    give(m2, 'a');
    const b2 = place(m2, 'b', 600, 340, 1, 0); // facing away, ~100 from carrier
    steps(m2, 5);
    m2.setInput('b', { pass: true });
    m2.step();
    expect(b2.stumbleUntil).toBeLessThanOrEqual(m2.t);
    expect(m2.puck.carrierId).toBe('a');
    void a;
  });

  it('teammates do not steal by contact', () => {
    const m = playing([P('a', 1, 'RED'), P('c', 3, 'RED'), P('b', 2, 'BLUE')]);
    place(m, 'a', 500, 340);
    give(m, 'a');
    steps(m, ticks(400));
    place(m, 'c', 525, 340, -1, 0);
    steps(m, 30);
    expect(m.puck.carrierId).toBe('a');
  });
});

describe('shooting', () => {
  it('charging increases shot speed, tap still shoots at min speed', () => {
    const speedAfter = (hold: number) => {
      const m = playing();
      m.goaliesEnabled = false;
      place(m, 'a', 300, 340);
      give(m, 'a');
      shoot(m, 'a', hold, [1, 0]);
      return Math.hypot(m.puck.vx, m.puck.vy);
    };
    const tap = speedAfter(1);
    const half = speedAfter(ticks(750));
    const full = speedAfter(ticks(1500));
    const over = speedAfter(ticks(3000));
    expect(tap).toBeGreaterThan(CFG.shot.minSpeed - 10);
    expect(tap).toBeLessThan(CFG.shot.minSpeed + 30);
    expect(half).toBeGreaterThan(tap + 100);
    expect(full).toBeGreaterThan(half + 100);
    expect(over).toBeCloseTo(full, -1);
  });

  it('while charging the stick aims instead of accelerating; skater coasts', () => {
    const m = playing();
    const a = place(m, 'a', 400, 340);
    give(m, 'a');
    a.vx = 150;
    m.setInput('a', { shoot: true });
    m.step();
    const v0 = Math.hypot(a.vx, a.vy);
    m.setInput('a', { shoot: true, x: 0, y: 1 });
    steps(m, 20);
    const v1 = Math.hypot(a.vx, a.vy);
    expect(v1).toBeLessThan(v0);
    expect(v1).toBeGreaterThan(0);
    expect(a.aimY).toBeCloseTo(1);
    expect(m.puck.carrierId).toBe('a');
  });

  it('cancelled release does not fire; disconnect while charging does not fire', () => {
    const m = playing();
    place(m, 'a', 400, 340);
    give(m, 'a');
    m.setInput('a', { shoot: true });
    steps(m, 30);
    m.setInput('a', { shoot: false, cancel: true });
    m.step();
    expect(m.puck.carrierId).toBe('a');
    expect(m.getSkater('a')!.chargingSince).toBeNull();

    m.setInput('a', { shoot: true });
    steps(m, 30);
    m.setConnected('a', false);
    m.step();
    expect(Math.hypot(m.puck.vx, m.puck.vy)).toBeLessThan(50);
    expect(m.getSkater('a')!.chargingSince).toBeNull();
  });

  it('losing the puck mid-charge cancels the charge', () => {
    const m = playing();
    place(m, 'a', 500, 340);
    give(m, 'a');
    steps(m, ticks(400));
    m.setInput('a', { shoot: true });
    m.step();
    expect(m.getSkater('a')!.chargingSince).not.toBeNull();
    place(m, 'b', 580, 340, -1, 0);
    m.setInput('b', { pass: true });
    m.step();
    expect(m.puck.carrierId).toBe('b');
    expect(m.getSkater('a')!.chargingSince).toBeNull();
    m.setInput('a', { shoot: false });
    m.step();
    expect(m.puck.carrierId).toBe('b');
  });
});

describe('skill moves', () => {
  /** red 'a' passes to red 'c' standing at (650, 340) */
  function passSetup() {
    const m = playing([P('a', 1, 'RED'), P('c', 3, 'RED'), P('b', 2, 'BLUE')]);
    m.goaliesEnabled = false;
    place(m, 'a', 350, 340);
    place(m, 'c', 650, 340, 1, 0);
    place(m, 'b', 300, 600);
    give(m, 'a');
    return m;
  }
  const doPass = (m: HockeyMatch) => {
    m.setInput('a', { pass: true });
    m.step();
    m.setInput('a', { pass: false });
  };

  it('one-timer: holding SHOOT as a teammate’s pass arrives fires instantly', () => {
    const m = passSetup();
    m.setInput('c', { shoot: true, x: 1, y: 0 });
    m.step();
    doPass(m);
    let fired = false;
    for (let i = 0; i < 90 && !fired; i++) {
      m.step();
      fired = m.drainEvents().some((e) => e.type === 'shot' && e.oneTimer);
    }
    expect(fired).toBe(true);
    expect(m.puck.carrierId).toBeNull();
    expect(m.puck.vx).toBeGreaterThan(CFG.oneTimer.speed * 0.9);
    expect(m.getSkater('c')!.stats.oneTimers).toBe(1);
    // releasing the button afterwards does nothing
    m.setInput('c', { shoot: false });
    m.step();
    expect(m.getSkater('c')!.stats.shots).toBe(1);
  });

  it('without SHOOT held the pass is simply received', () => {
    const m = passSetup();
    doPass(m);
    let n = 0;
    while (m.puck.carrierId !== 'c' && n++ < 90) m.step();
    expect(m.puck.carrierId).toBe('c');
  });

  it('clean catch: POKE just before the pass arrives gives a speed boost', () => {
    const m = passSetup();
    doPass(m);
    const c = m.getSkater('c')!;
    let pressed = false;
    for (let i = 0; i < 90 && m.puck.carrierId !== 'c'; i++) {
      if (!pressed && m.catchHint(c) && Math.hypot(m.puck.x - c.x, m.puck.y - c.y) < 80) {
        m.setInput('c', { pass: true });
        pressed = true;
      }
      m.step();
    }
    m.setInput('c', { pass: false });
    expect(pressed).toBe(true);
    expect(m.puck.carrierId).toBe('c');
    expect(c.boostUntil).toBeGreaterThan(m.t);
    expect(c.stats.catches).toBe(1);
    expect(c.stumbleUntil).toBeLessThanOrEqual(m.t); // catch attempts never count as whiffs
  });

  it('perfect release (80–95% charge) beats a full charge', () => {
    const speedAfter = (holdMs: number) => {
      const m = playing();
      m.goaliesEnabled = false;
      place(m, 'a', 300, 340);
      give(m, 'a');
      shoot(m, 'a', ticks(holdMs) - 1, [1, 0]);
      return { speed: Math.hypot(m.puck.vx, m.puck.vy), perfects: m.getSkater('a')!.stats.perfects };
    };
    const perfect = speedAfter(CFG.shot.chargeMs * 0.87);
    const full = speedAfter(CFG.shot.chargeMs * 1.02);
    expect(perfect.perfects).toBe(1);
    expect(full.perfects).toBe(0);
    expect(perfect.speed).toBeGreaterThan(full.speed + 50);
  });

  it('over-charging makes the aim wobble', () => {
    const m = playing();
    place(m, 'a', 300, 340);
    give(m, 'a');
    m.setInput('a', { shoot: true });
    steps(m, ticks(CFG.shot.chargeMs + CFG.shot.overchargeWobbleRampMs));
    const ys = new Set<number>();
    for (let i = 0; i < 30; i++) {
      m.step();
      ys.add(Math.round(m.snapshot().sk[0].ay * 100));
    }
    expect(ys.size).toBeGreaterThan(3);
  });

  it('goals are credited to the last player of the scoring team to touch the puck', () => {
    const m = playing();
    m.goaliesEnabled = false;
    place(m, 'a', 1000, 340);
    give(m, 'a');
    shoot(m, 'a', 1, [1, 0]);
    while (m.phase === 'PLAYING') m.step();
    const goal = m.drainEvents().find((e) => e.type === 'goal');
    expect(goal && goal.type === 'goal' && goal.scorer).toBe(1);
    expect(m.getSkater('a')!.stats.goals).toBe(1);
  });

  it('rink shrinks for small games', () => {
    const two = new HockeyMatch([P('a', 1, 'RED'), P('b', 2, 'BLUE')], 1000);
    const eight = new HockeyMatch(
      Array.from({ length: 8 }, (_, i) => P(`p${i}`, i + 1, i < 4 ? 'RED' : 'BLUE')),
      1000,
    );
    expect(two.R.maxX - two.R.minX).toBeLessThan(eight.R.maxX - eight.R.minX);
    expect(eight.R.maxX).toBe(CFG.rink.maxX);
    // everyone starts inside the smaller rink, on their own side
    for (const s of two.skaters) {
      expect(s.x).toBeGreaterThan(two.R.minX);
      expect(s.x).toBeLessThan(two.R.maxX);
    }
    expect(two.goalies[1].x).toBeLessThan(two.R.maxX);
  });
});

describe('goalies', () => {
  it('save some shots, miss others, never leave the crease band', () => {
    const r = rng(7);
    let goals = 0;
    let saves = 0;
    for (let i = 0; i < 60; i++) {
      const m = new HockeyMatch([P('a', 1, 'RED'), P('b', 2, 'BLUE')], 300_000, 100 + i, { fullRink: true });
      while (m.phase === 'COUNTDOWN') m.step();
      m.skaters.forEach((s) => Object.assign(s, { x: 100, y: 100 + s.number * 40 }));
      steps(m, Math.floor(r() * 200)); // random goalie phase
      const sx = 700 + r() * 250;
      const sy = 120 + r() * 440;
      const ty = CFG.goal.minY + 14 + r() * (CFG.goal.maxY - CFG.goal.minY - 28);
      const dx = CFG.rink.maxX - sx;
      const dy = ty - sy;
      const d = Math.hypot(dx, dy);
      const sp = 450 + r() * 330;
      Object.assign(m.puck, { x: sx, y: sy, vx: (dx / d) * sp, vy: (dy / d) * sp, carrierId: null, lastReleasedBy: null });
      m.puck.launchId++;
      let saved = false;
      for (let k = 0; k < 240 && m.phase === 'PLAYING'; k++) {
        m.step();
        for (const g of m.goalies) {
          expect(g.y).toBeGreaterThanOrEqual(CFG.goalie.minY);
          expect(g.y).toBeLessThanOrEqual(CFG.goalie.maxY);
        }
        if (m.drainEvents().some((e) => e.type === 'save')) saved = true;
      }
      if (m.score.RED) goals++;
      else if (saved) saves++;
    }
    expect(goals).toBeGreaterThan(5);
    expect(saves).toBeGreaterThan(5);
    console.log(`goalie test: ${goals} goals, ${saves} saves of 60 on-target shots`);
  });
});

describe('match flow', () => {
  it('goal counts once, clock pauses, faceoff resets', () => {
    const m = playing();
    m.goaliesEnabled = false;
    place(m, 'a', 1000, 340);
    give(m, 'a');
    shoot(m, 'a', 1, [1, 0]);
    while (m.phase === 'PLAYING') m.step();
    const clock = m.clockMs;
    steps(m, ticks(CFG.goalPauseMs - 100));
    expect(m.phase).toBe('GOAL_PAUSE');
    expect(m.clockMs).toBe(clock);
    expect(m.score.RED).toBe(1);
    steps(m, ticks(200));
    expect(m.phase).toBe('PLAYING');
    expect(m.score.RED).toBe(1);
    expect(m.puck.x).toBeCloseTo(600, 0);
    expect(m.puck.y).toBeCloseTo(340, 0);
    expect(m.puck.carrierId).toBeNull();
    expect(m.getSkater('a')!.x).toBeLessThan(600);
    expect(m.getSkater('b')!.x).toBeGreaterThan(600);
  });

  it('clock only runs while playing: game ends on active time', () => {
    const m = new HockeyMatch([P('a', 1, 'RED'), P('b', 2, 'BLUE')], 5000, 1);
    m.goaliesEnabled = false;
    steps(m, ticks(CFG.countdownMs));
    expect(m.clockMs).toBe(5000);
    steps(m, 5);
    // score once → 2s pause
    m.devForceGoal('RED');
    while (m.phase === 'PLAYING') m.step();
    let n = 0;
    while (m.phase !== 'OVER' && n < 100_000) {
      m.step();
      n++;
    }
    // total elapsed must exceed countdown + duration + goal pause
    expect(m.t).toBeGreaterThan(CFG.countdownMs + 5000 + CFG.goalPauseMs - 50);
    expect(m.phase).toBe('OVER');
  });

  it('disconnect releases input immediately and drops the puck', () => {
    const m = playing();
    const a = place(m, 'a', 400, 340);
    give(m, 'a');
    m.setInput('a', { x: 1, y: 0 });
    steps(m, 30);
    m.setConnected('a', false);
    expect(a.input.x).toBe(0);
    expect(m.puck.carrierId).toBeNull();
    steps(m, 120);
    expect(Math.hypot(a.vx, a.vy)).toBe(0);
    // input from a disconnected skater is ignored
    m.setInput('a', { x: 1 });
    expect(a.input.x).toBe(0);
  });

  it('8 skaters, 10 simulated minutes of random input: always finite and inside the rink', () => {
    const players = Array.from({ length: 8 }, (_, i) => P(`p${i}`, i + 1, i < 4 ? 'RED' : 'BLUE'));
    const m = new HockeyMatch(players, 600_000, 9);
    const r = rng(3);
    let goals = 0;
    for (let i = 0; i < 600 * 60 + 1000 && m.phase !== 'OVER'; i++) {
      if (i % 6 === 0) {
        for (const p of players) {
          m.setInput(p.id, { x: r() * 2 - 1, y: r() * 2 - 1, pass: r() < 0.1, shoot: r() < 0.3 });
        }
      }
      m.step();
      goals += m.drainEvents().filter((e) => e.type === 'goal').length;
      const pk = m.puck;
      expect(Number.isFinite(pk.x + pk.y + pk.vx + pk.vy)).toBe(true);
      if (i % 60 === 0) {
        for (const s of m.skaters) {
          expect(Number.isFinite(s.x + s.y)).toBe(true);
          expect(s.x).toBeGreaterThanOrEqual(CFG.rink.minX);
          expect(s.x).toBeLessThanOrEqual(CFG.rink.maxX);
        }
      }
    }
    expect(m.phase).toBe('OVER');
    expect(goals).toBe(m.score.RED + m.score.BLUE);
    console.log(`random 10-min sim: ${m.score.RED}-${m.score.BLUE}`);
  });
});
