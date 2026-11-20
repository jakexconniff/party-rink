// Shared skater body drawing (TV rink + phone preview). Pure Canvas 2D, original simple shapes.
import { ACCENTS, BODIES, FACES, HEADS, SKIN_TONES, isCharacterHead, type Look } from '../../shared/appearance';
import { drawCharacterHead } from './characterHeads';

export const TEAM_COLORS = {
  red: '#ef3b4a',
  redDark: '#9d1220',
  blue: '#2f86ff',
  blueDark: '#0d47a8',
};

export const DEFAULT_LOOK: Look = { skin: 1, head: 0, face: 0, body: 1, accent: 0 };

export function accentColor(look?: Look) {
  return ACCENTS[look?.accent ?? 0]?.color ?? '#ffd23f';
}

/**
 * Draws legs, torso (with accent stripe + number), gloves, head, hair/hat and face.
 * (px, py) = feet on the ice; z = pixels per world unit at that depth; fx = facing x (for eyes).
 * Returns the y of the top of the head/hat so callers can place a name label above it.
 */
export function drawSkaterBody(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  z: number,
  team: 0 | 1,
  number: number,
  look: Look = DEFAULT_LOOK,
  fx = 0,
): number {
  const red = team === 0;
  const base = red ? TEAM_COLORS.red : TEAM_COLORS.blue;
  const dark = red ? TEAM_COLORS.redDark : TEAM_COLORS.blueDark;
  const body = BODIES[look.body] ?? BODIES[1];
  const skin = SKIN_TONES[look.skin] ?? SKIN_TONES[1];
  const accent = accentColor(look);
  const head = HEADS[look.head]?.id ?? 'helmet';
  const face = FACES[look.face]?.id ?? 'none';
  const bw = body.w;
  const bh = body.h;

  // legs
  ctx.fillStyle = '#1b2433';
  const legH = 14 * z * bh;
  ctx.fillRect(px - 9 * z * bw, py - legH, 7 * z * bw, legH);
  ctx.fillRect(px + 2 * z * bw, py - legH, 7 * z * bw, legH);
  // skates
  ctx.fillStyle = '#cfd8e3';
  ctx.fillRect(px - 10 * z * bw, py - 2 * z, 9 * z * bw, 2.5 * z);
  ctx.fillRect(px + 1 * z * bw, py - 2 * z, 9 * z * bw, 2.5 * z);

  // torso
  const tw = 30 * z * bw;
  const th = 26 * z * bh;
  const tTop = py - legH - th;
  const grad = ctx.createLinearGradient(px - tw / 2, 0, px + tw / 2, 0);
  grad.addColorStop(0, base);
  grad.addColorStop(1, dark);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(px - tw / 2, tTop, tw, th, 8 * z);
  ctx.fill();
  // accent stripe across the jersey
  ctx.fillStyle = accent;
  ctx.fillRect(px - tw / 2 + 2 * z, tTop + th * 0.68, tw - 4 * z, 4 * z);
  // gloves
  ctx.beginPath();
  ctx.arc(px - tw / 2 - 1 * z, tTop + th * 0.6, 4.5 * z, 0, Math.PI * 2);
  ctx.arc(px + tw / 2 + 1 * z, tTop + th * 0.6, 4.5 * z, 0, Math.PI * 2);
  ctx.fill();
  // number
  ctx.fillStyle = '#fff';
  ctx.font = `900 ${15 * z}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), px, tTop + th * 0.38);

  // head
  const hr = 10 * z;
  const hx = px;
  const hy = tTop - hr + 3 * z;
  let top = hy - hr;

  if (isCharacterHead(look.head)) {
    return drawCharacterHead(ctx, hx, hy, hr * 1.12, z, head, accent, base, Math.max(-1, Math.min(1, fx)));
  }

  // things drawn behind the head
  if (head === 'afro') {
    ctx.fillStyle = '#1d1209';
    ctx.beginPath();
    ctx.arc(hx, hy - 4 * z, hr * 1.75, 0, Math.PI * 2);
    ctx.fill();
    top = hy - 4 * z - hr * 1.75;
  }

  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.fill();

  // eyes (look slightly toward facing direction)
  const ex = Math.max(-1, Math.min(1, fx)) * 2 * z;
  if (face !== 'shades') {
    // white eyes with dark pupils read on every skin tone
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(hx - 3.5 * z + ex * 0.5, hy - 1 * z, 2.2 * z, 0, Math.PI * 2);
    ctx.arc(hx + 3.5 * z + ex * 0.5, hy - 1 * z, 2.2 * z, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(hx - 3.5 * z + ex, hy - 1 * z, 1.2 * z, 0, Math.PI * 2);
    ctx.arc(hx + 3.5 * z + ex, hy - 1 * z, 1.2 * z, 0, Math.PI * 2);
    ctx.fill();
  }

  // face extras
  if (face === 'mustache') {
    ctx.fillStyle = '#3a2414';
    ctx.beginPath();
    ctx.ellipse(hx - 2.6 * z + ex, hy + 3.4 * z, 3.2 * z, 1.6 * z, -0.25, 0, Math.PI * 2);
    ctx.ellipse(hx + 2.6 * z + ex, hy + 3.4 * z, 3.2 * z, 1.6 * z, 0.25, 0, Math.PI * 2);
    ctx.fill();
  } else if (face === 'beard') {
    ctx.fillStyle = '#4a2d18';
    ctx.beginPath();
    ctx.arc(hx, hy + 2 * z, hr * 0.95, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.lineTo(hx - hr * 0.6, hy + 2 * z);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(hx, hy + 6.5 * z, hr * 0.75, hr * 0.55, 0, 0, Math.PI);
    ctx.fill();
  } else if (face === 'shades') {
    ctx.fillStyle = '#0c0c0c';
    ctx.beginPath();
    ctx.roundRect(hx - 8 * z + ex, hy - 3.2 * z, 7 * z, 4.2 * z, 1.5 * z);
    ctx.roundRect(hx + 1 * z + ex, hy - 3.2 * z, 7 * z, 4.2 * z, 1.5 * z);
    ctx.fill();
    ctx.fillRect(hx - 1.5 * z + ex, hy - 2.4 * z, 3 * z, 1.2 * z);
  }

  // hair / hats on top
  switch (head) {
    case 'helmet': {
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.arc(hx, hy - 1 * z, hr + 1.5 * z, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.fillRect(hx - 1.5 * z, hy - hr - 2.5 * z, 3 * z, hr);
      top = hy - hr - 2.5 * z;
      break;
    }
    case 'bald': {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.ellipse(hx - 3 * z, hy - 5.5 * z, 3 * z, 1.8 * z, -0.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'spiky': {
      ctx.fillStyle = '#f2c94c';
      ctx.beginPath();
      ctx.moveTo(hx - hr, hy - 2 * z);
      for (let i = 0; i <= 5; i++) {
        const x = hx - hr + (i * 2 * hr) / 5;
        ctx.lineTo(x, i % 2 === 0 ? hy - hr - 7 * z : hy - hr + 1 * z);
      }
      ctx.lineTo(hx + hr, hy - 2 * z);
      ctx.closePath();
      ctx.fill();
      top = hy - hr - 7 * z;
      break;
    }
    case 'afro':
      break; // drawn behind
    case 'mohawk': {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(hx - 3 * z, hy - hr + 2 * z);
      ctx.lineTo(hx - 2 * z, hy - hr - 10 * z);
      ctx.lineTo(hx + 2 * z, hy - hr - 10 * z);
      ctx.lineTo(hx + 3 * z, hy - hr + 2 * z);
      ctx.closePath();
      ctx.fill();
      top = hy - hr - 10 * z;
      break;
    }
    case 'beanie': {
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(hx, hy - 2 * z, hr + 1 * z, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(hx - hr - 1 * z, hy - 3 * z, 2 * hr + 2 * z, 3 * z);
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(hx, hy - hr - 4 * z, 4 * z, 0, Math.PI * 2);
      ctx.fill();
      top = hy - hr - 8 * z;
      break;
    }
    case 'viking': {
      ctx.fillStyle = '#f3ecd8';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(hx + s * (hr - 1 * z), hy - 4 * z);
        ctx.quadraticCurveTo(hx + s * (hr + 9 * z), hy - 6 * z, hx + s * (hr + 6 * z), hy - hr - 9 * z);
        ctx.quadraticCurveTo(hx + s * (hr + 3 * z), hy - 7 * z, hx + s * (hr - 3 * z), hy - 7 * z);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#8e99a6';
      ctx.beginPath();
      ctx.arc(hx, hy - 1 * z, hr + 1.5 * z, Math.PI, 0);
      ctx.fill();
      top = hy - hr - 9 * z;
      break;
    }
    case 'crown': {
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      const cy = hy - hr + 2 * z;
      ctx.moveTo(hx - 7 * z, cy);
      ctx.lineTo(hx - 8 * z, cy - 9 * z);
      ctx.lineTo(hx - 3.5 * z, cy - 4 * z);
      ctx.lineTo(hx, cy - 10 * z);
      ctx.lineTo(hx + 3.5 * z, cy - 4 * z);
      ctx.lineTo(hx + 8 * z, cy - 9 * z);
      ctx.lineTo(hx + 7 * z, cy);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff3d6e';
      ctx.beginPath();
      ctx.arc(hx, cy - 3 * z, 1.6 * z, 0, Math.PI * 2);
      ctx.fill();
      top = cy - 10 * z;
      break;
    }
    case 'cowboy': {
      ctx.fillStyle = '#8a5a2b';
      ctx.beginPath();
      ctx.ellipse(hx, hy - hr + 2 * z, hr * 1.8, 3 * z, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(hx - hr * 0.8, hy - hr - 8 * z, hr * 1.6, 10 * z, 3 * z);
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.fillRect(hx - hr * 0.8, hy - hr - 1 * z, hr * 1.6, 2 * z);
      top = hy - hr - 8 * z;
      break;
    }
  }
  return top;
}
