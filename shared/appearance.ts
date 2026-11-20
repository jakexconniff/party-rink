// Player appearance: purely cosmetic (hitboxes never change). Indices into the option lists below,
// so the wire format stays tiny. Add options at the END of a list to keep existing looks stable.

export const SKIN_TONES = ['#f8d8bd', '#eebf96', '#d39a6a', '#a86f45', '#7b4b2c', '#4e2f1c'] as const;

/** `character: true` heads replace the whole head, so Skin and Face don't apply to them. */
export const HEADS = [
  { id: 'helmet', label: 'Helmet', character: false },
  { id: 'bald', label: 'Bald', character: false },
  { id: 'spiky', label: 'Spiky hair', character: false },
  { id: 'afro', label: 'Afro', character: false },
  { id: 'mohawk', label: 'Mohawk', character: false },
  { id: 'beanie', label: 'Beanie', character: false },
  { id: 'viking', label: 'Viking', character: false },
  { id: 'crown', label: 'Crown', character: false },
  { id: 'cowboy', label: 'Cowboy hat', character: false },
  // whole-head characters
  { id: 'monster', label: 'Monster', character: true },
  { id: 'clown', label: 'Clown', character: true },
  { id: 'bear', label: 'Bear', character: true },
  { id: 'panda', label: 'Panda', character: true },
  { id: 'robot', label: 'Robot', character: true },
  { id: 'alien', label: 'Alien', character: true },
  { id: 'frog', label: 'Frog', character: true },
  { id: 'pumpkin', label: 'Pumpkin', character: true },
  { id: 'ninja', label: 'Ninja', character: true },
  { id: 'astronaut', label: 'Astronaut', character: true },
  { id: 'shark', label: 'Shark', character: true },
  { id: 'chicken', label: 'Chicken', character: true },
  { id: 'unicorn', label: 'Unicorn', character: true },
] as const;

export const isCharacterHead = (head: number) => !!HEADS[head]?.character;
/** chance a random look uses a whole-head character */
export const RANDOM_CHARACTER_CHANCE = 0.33;

export const FACES = [
  { id: 'none', label: 'Plain' },
  { id: 'mustache', label: 'Mustache' },
  { id: 'beard', label: 'Beard' },
  { id: 'shades', label: 'Sunglasses' },
] as const;

export const BODIES = [
  { id: 'small', label: 'Small', w: 0.82, h: 0.86 },
  { id: 'medium', label: 'Medium', w: 1, h: 1 },
  { id: 'big', label: 'Big', w: 1.25, h: 1.1 },
] as const;

/** Accent = gloves, stick and jersey stripe. Unique within a team so teammates are easy to tell apart. */
export const ACCENTS = [
  { color: '#ffd23f', label: 'Yellow' },
  { color: '#3cff8c', label: 'Green' },
  { color: '#ff5fd2', label: 'Pink' },
  { color: '#50e6ff', label: 'Cyan' },
  { color: '#ff8a3d', label: 'Orange' },
  { color: '#b48cff', label: 'Purple' },
] as const;

export interface Look {
  skin: number;
  head: number;
  face: number;
  body: number;
  accent: number;
}

export const LOOK_FIELDS = {
  skin: SKIN_TONES.length,
  head: HEADS.length,
  face: FACES.length,
  body: BODIES.length,
  accent: ACCENTS.length,
} as const;

export function randomLook(rand: () => number = Math.random): Look {
  const pick = (n: number) => Math.floor(rand() * n);
  const normal = HEADS.map((h, i) => (h.character ? -1 : i)).filter((i) => i >= 0);
  const chars = HEADS.map((h, i) => (h.character ? i : -1)).filter((i) => i >= 0);
  const pool = rand() < RANDOM_CHARACTER_CHANCE ? chars : normal;
  return {
    skin: pick(LOOK_FIELDS.skin),
    head: pool[pick(pool.length)],
    face: pick(LOOK_FIELDS.face),
    body: pick(LOOK_FIELDS.body),
    accent: pick(LOOK_FIELDS.accent),
  };
}

/** Validate an untrusted look from a phone. Returns null if anything is out of range. */
export function sanitizeLook(raw: unknown): Look | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const out = {} as Look;
  for (const [k, n] of Object.entries(LOOK_FIELDS) as [keyof Look, number][]) {
    const v = r[k];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= n) return null;
    out[k] = v;
  }
  return out;
}

/** "the Pink one with the Afro" — used on the phone during the countdown. */
export function describeLook(l: Look): string {
  const color = ACCENTS[l.accent]?.label.toLowerCase();
  if (isCharacterHead(l.head)) return `the ${color} ${HEADS[l.head].label.toLowerCase()}`;
  const head = HEADS[l.head]?.label.toLowerCase() ?? '';
  const face = l.face ? ` and ${FACES[l.face].label.toLowerCase()}` : '';
  return `the ${color} one with the ${head}${face}`;
}
