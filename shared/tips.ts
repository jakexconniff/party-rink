// Gameplay tips: rotated on the TV lobby/results screens, and one personal tip per phone after a match.
// Add or reword freely; keep each tip to one short line.
import type { PlayerStat } from './types';

export const TIPS: string[] = [
  'Release SHOOT while the fill is in the green band for a SKILL SHOT',
  'Hold SHOOT before a teammate’s pass reaches you for a ONE-TIMER',
  'Tap POKE just as a loose puck reaches you for a CLEAN CATCH and a speed boost',
  'A shrinking ring around your skater means the puck is coming: act when it closes',
  'POKE only steals when you’re right next to the carrier and facing them',
  'Bumping the carrier slows them down, but only POKE steals the puck',
  'POKE at nothing and you stumble: get close first',
  'Carrying the puck slows you down. Pass it around!',
  'PASS aims at the teammate you’re facing',
  'Hold SHOOT too long and your aim starts to wobble',
  'Lost? Tap the ? on your phone for the full cheat sheet',
];

/** Seconds each rotating tip stays up. */
export const TIP_ROTATE_MS = 7000;

/** One tip for this player based on their match stats (shown on their own phone only). */
export function personalTip(s: PlayerStat): string {
  if (s.shots === 0) return 'You didn’t take a shot! Tap SHOOT for a quick one, or hold it to aim.';
  if (s.shots >= 3 && s.perfects === 0)
    return `${s.shots} shots, no SKILL SHOTS. Hold SHOOT and let go while the fill is in the green band.`;
  if (s.steals === 0) return 'No steals yet. Get right next to the carrier, face them, and tap POKE.';
  if (s.oneTimers === 0) return 'Try a ONE-TIMER: hold SHOOT before a teammate’s pass reaches you.';
  if (s.catches === 0) return 'Try a CLEAN CATCH: tap POKE when the ring around you closes on a loose puck.';
  return 'You did a bit of everything. Nice game!';
}
