// All gameplay tuning knobs in one place. Units: world units, seconds, milliseconds.

export const CFG = {
  tickHz: 60,
  dt: 1 / 60,
  dtMs: 1000 / 60,

  /** full-size rink (used for 7–8 players); smaller games use a scaled rink, see rinkScale */
  rink: { width: 1200, height: 680, minX: 64, maxX: 1136, minY: 48, maxY: 632, cx: 600, cy: 340 },
  /** [max total skaters, x scale, y scale] — first match wins */
  rinkScale: [
    [2, 0.7, 0.82],
    [4, 0.82, 0.88],
    [6, 0.92, 0.95],
    [8, 1, 1],
  ] as [number, number, number][],
  goal: { minY: 276, maxY: 404, depth: 34 },
  /** goalie distance in front of its goal line */
  goalieOffset: 41,

  deadZone: 0.13,

  skater: {
    radius: 16,
    maxSpeed: 265,
    accel: 320,
    /** extra acceleration multiplier when steering against current velocity (0 = none) */
    turnAssist: 1.2,
    coastDecel: 180,
    chargeDrag: 220,
    /** how fast a skater above their (temporarily reduced) top speed is slowed down */
    overSpeedDecel: 700,
    /** top-speed multiplier while carrying the puck — encourages passing */
    carrierSpeedFactor: 0.85,
  },

  puck: {
    radius: 9,
    carryDist: 24,
    friction: 120,
    wallRestitution: 0.8,
    wallTangentDamping: 0.94,
    maxSpeed: 920,
    /** max distance per collision sub-step */
    subStep: 4,
  },

  shot: {
    minSpeed: 360,
    maxSpeed: 780,
    chargeMs: 1500,
    momentumFactor: 0.15,
    /** releasing between these charge fractions is a PERFECT shot */
    perfectMin: 0.8,
    perfectMax: 0.95,
    perfectSpeed: 880,
    /** extra goalie reaction delay for perfect shots / one-timers */
    perfectGoalieDelayMs: 120,
    /** holding past full charge makes the aim wobble up to this many degrees */
    overchargeWobbleDeg: 16,
    overchargeWobbleRampMs: 700,
  },
  oneTimer: {
    /** SHOOT must have been pressed this recently (and still held) when a teammate's pass arrives */
    windowMs: 1200,
    speed: 800,
    goalieDelayMs: 160,
  },
  pass: { speed: 470, coneDeg: 45, range: 470, cooldownMs: 350, leadFactor: 0.7 },
  poke: {
    range: 65,
    /** angle (deg) either side of facing that counts as "in front" */
    arcDeg: 50,
    cooldownMs: 650,
    showMs: 180,
    nudgeSpeed: 260,
    /** whiff (nothing nearby): stumble + long cooldown */
    whiffCooldownMs: 1200,
    stumbleMs: 400,
    stumbleSpeedFactor: 0.5,
    /** a target within range × this (any direction) is a "close miss": normal cooldown, no stumble */
    closeMissFactor: 1.6,
  },
  catch: {
    /** POKE pressed while a loose puck is about to reach you arms a clean catch */
    beforeMs: 200,
    afterMs: 150,
    /** after gaining the puck, PASS is ignored this long (a late catch tap must never become a pass) */
    passLockMs: 300,
    /** how close / soon an incoming loose puck must be for POKE to count as a catch attempt */
    incomingRange: 220,
    incomingTimeMs: 600,
    /** TV timing ring: shown this long before an incoming puck arrives (looks further than incomingRange) */
    ringMs: 750,
    ringRange: 480,
    /** after this many successes of a move, that player's ring stops showing */
    ringLearnedAfter: 3,
    boostFactor: 1.3,
    boostMs: 600,
  },
  contact: {
    /** an opponent bumping the carrier slows them (no steal) */
    slowFactor: 0.6,
    slowMs: 250,
  },

  selfRecatchMs: 250,
  pickupImmunityMs: 200,
  /** after a successful poke-steal the new carrier is safe this long (prevents steal ping-pong) */
  stealImmunityMs: 900,
  /** the player who got robbed is slowed briefly */
  stealVictimSlowMs: 400,

  goalie: {
    minY: 298,
    maxY: 382,
    radius: 15,
    periodS: 3.5,
    periodJitter: 0.4,
    patrolAmp: 42,
    /** fraction of puck y tracked while patrolling and the puck is in the own half */
    patrolTrack: 0.0,
    speed: 120,
    reactDelayMinMs: 280,
    reactDelayMaxMs: 420,
    dangerX: 280,
    predictNoise: 30,
    reactBlend: 0.75,
    saveCooldownMs: 120,
    saveFlashMs: 300,
    deflectRestitution: 0.5,
    deflectMinOut: 140,
  },

  faceoff: {
    /** after a goal, the scoring team's center starts this much further from the puck */
    scorerSetBack: 120,
    /** the puck drop varies up/down by up to this much (not on the opening faceoff) */
    dropJitter: 50,
  },

  countdownMs: 3000,
  goalPauseMs: 2000,
  inputTimeoutMs: 500,
} as const;

export type Config = typeof CFG;

export interface RinkDims {
  width: number;
  height: number;
  cx: number;
  cy: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  sx: number;
  sy: number;
}

/** Rink size for a given number of skaters (smaller games get a tighter rink → more action). */
export function rinkFor(totalSkaters: number, full = false): RinkDims {
  const r = CFG.rink;
  const [, sx, sy] = full ? [8, 1, 1] : CFG.rinkScale.find(([n]) => totalSkaters <= n) ?? [8, 1, 1];
  const hw = (r.maxX - r.cx) * sx;
  const hh = (r.maxY - r.cy) * sy;
  return {
    width: r.width,
    height: r.height,
    cx: r.cx,
    cy: r.cy,
    minX: r.cx - hw,
    maxX: r.cx + hw,
    minY: r.cy - hh,
    maxY: r.cy + hh,
    sx,
    sy,
  };
}
