// Easter-egg chat bubbles: occasionally shown over a player on a team that's getting blown out.
// Add more lines here — one is picked at random each time. Keep them short (they show on the TV).
export const LOSING_QUIPS: readonly string[] = ['IM NEW TO THIS!!'];

/** How the easter egg is rationed (rare on purpose). */
export const QUIP_RULES = {
  /** the losing team must already be down by at least this many goals when the other team scores again */
  minDeficit: 3,
  /** chance a qualifying goal triggers a quip */
  chance: 0.35,
  /** at most one quip per this long, across all matches while the server runs */
  cooldownMs: 10 * 60 * 1000,
  /** how long the bubble stays on screen */
  showMs: 3500,
} as const;
