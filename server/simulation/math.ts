export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const hypot = Math.hypot;
export const finite = (...vals: number[]) => vals.every((v) => Number.isFinite(v));

export function norm(x: number, y: number): [number, number] {
  const l = Math.hypot(x, y);
  return l > 1e-9 ? [x / l, y / l] : [0, 0];
}

/** Angle in degrees between two vectors (0..180). Zero vectors → 180. */
export function angleBetween(ax: number, ay: number, bx: number, by: number): number {
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  if (la < 1e-9 || lb < 1e-9) return 180;
  const c = clamp((ax * bx + ay * by) / (la * lb), -1, 1);
  return (Math.acos(c) * 180) / Math.PI;
}

/** Small deterministic PRNG (mulberry32). Returns floats in [0,1). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
