// All gameplay tuning knobs in one place. Units: world units, seconds, milliseconds.

export const CFG = {
  tickHz: 60,
  dt: 1 / 60,
  dtMs: 1000 / 60,

  rink: { width: 1200, height: 680, minX: 64, maxX: 1136, minY: 48, maxY: 632, cx: 600, cy: 340 },
  goal: { minY: 276, maxY: 404, depth: 34 },

  deadZone: 0.13,

  skater: {
    radius: 16,
    maxSpeed: 230,
    accel: 260,
    /** extra acceleration multiplier when steering against current velocity (0 = none) */
    turnAssist: 1.2,
    coastDecel: 180,
    chargeDrag: 220,
  },

  puck: {
    radius: 9,
    carryDist: 24,
    friction: 150,
    wallRestitution: 0.72,
    wallTangentDamping: 0.92,
    maxSpeed: 900,
    /** max distance per collision sub-step */
    subStep: 4,
  },

  shot: { minSpeed: 360, maxSpeed: 780, chargeMs: 1500, momentumFactor: 0.15 },
  pass: { speed: 450, coneDeg: 45, range: 450, cooldownMs: 350, leadFactor: 0.7 },
  poke: { range: 55, arcDeg: 40, cooldownMs: 650, showMs: 180, nudgeSpeed: 260 },

  selfRecatchMs: 250,
  pickupImmunityMs: 300,
  /** after being robbed by contact, the victim cannot contact-steal back for this long */
  contactStealCooldownMs: 800,

  goalie: {
    redX: 105,
    blueX: 1095,
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

  countdownMs: 3000,
  goalPauseMs: 2000,
  inputTimeoutMs: 500,
} as const;

export type Config = typeof CFG;
