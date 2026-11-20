import { useEffect, useRef } from 'react';
import type { Snapshot, SkaterSnap } from '../../shared/types';

// World constants (mirror server/simulation/config.ts; rendering only).
const W = 1200;
/** current rink bounds; updated from each snapshot's `rk` */
let RINK = { minX: 64, maxX: 1136, minY: 48, maxY: 632 };
const GOAL = { minY: 276, maxY: 404, depth: 34 };
const SK_R = 16;
const PUCK_R = 9;
const GOALIE_R = 18;
const SQUASH = 0.66;
const PERSP_FAR = 0.86;
const COLORS = {
  red: '#ef3b4a',
  redDark: '#9d1220',
  blue: '#2f86ff',
  blueDark: '#0d47a8',
};

export interface RosterInfo {
  [num: number]: { name: string; connected: boolean };
}

export interface SnapBuffer {
  items: { snap: Snapshot; at: number }[];
}

export interface Callout {
  text: string;
  color: string;
  x: number;
  y: number;
  born: number;
  big?: boolean;
}

/** Visual effects fed by match events (see Tv.tsx). */
export interface FxState {
  callouts: Callout[];
  /** easter-egg chat bubbles that follow a skater */
  quips: { n: number; text: string; born: number }[];
  shakeUntil: number;
}

const QUIP_SHOW_MS = 3500;

interface Props {
  buffer: React.MutableRefObject<SnapBuffer>;
  roster: React.MutableRefObject<RosterInfo>;
  fx: React.MutableRefObject<FxState>;
}

const INTERP_DELAY = 70;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function interpolated(buf: SnapBuffer, now: number): Snapshot | null {
  const items = buf.items;
  if (!items.length) return null;
  const target = now - INTERP_DELAY;
  let i = items.length - 1;
  while (i > 0 && items[i - 1].at > target) i--;
  const b = items[i];
  const a = items[i - 1];
  if (!a || b.at <= target) return b.snap;
  const t = Math.max(0, Math.min(1, (target - a.at) / (b.at - a.at)));
  const sa = a.snap;
  const sb = b.snap;
  const byN = new Map(sa.sk.map((s) => [s.n, s]));
  const jump = (ax: number, ay: number, bx: number, by: number) => Math.hypot(bx - ax, by - ay) > 120;
  const sk = sb.sk.map((s): SkaterSnap => {
    const p = byN.get(s.n);
    if (!p || jump(p.x, p.y, s.x, s.y)) return s;
    return { ...s, x: lerp(p.x, s.x, t), y: lerp(p.y, s.y, t) };
  });
  const [pax, pay] = sa.puck;
  const [pbx, pby, pc] = sb.puck;
  const puck: Snapshot['puck'] = jump(pax, pay, pbx, pby) ? sb.puck : [lerp(pax, pbx, t), lerp(pay, pby, t), pc];
  const gl = sb.gl.map((g, k) => ({ ...g, y: lerp(sa.gl[k].y, g.y, t) })) as Snapshot['gl'];
  return { ...sb, sk, puck, gl };
}

export function RinkCanvas({ buffer, roster, fx }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let lastCarrier = 0;
    let flashUntil = 0;
    const trail: { x: number; y: number }[] = [];

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = Math.floor(canvas.clientWidth * dpr);
      const ch = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      if (!cw || !ch) return;
      const now = performance.now();
      const snap = interpolated(buffer.current, now);

      // rink bounds for this match (smaller games use a smaller rink)
      if (snap?.rk) RINK = { minX: snap.rk[0], maxX: snap.rk[1], minY: snap.rk[2], maxY: snap.rk[3] };
      const CX = W / 2;
      const CY = (RINK.minY + RINK.maxY) / 2;
      const sxs = (RINK.maxX - CX) / (1136 - CX); // x scale vs full rink
      const sys = (RINK.maxY - CY) / (632 - 340);

      // projection: fit this rink (plus goals and labels) to the canvas
      const spanX = RINK.maxX - RINK.minX + 2 * GOAL.depth + 60;
      const top0 = RINK.minY - 40;
      const spanY = RINK.maxY + 60 - top0;
      const k = Math.min(cw / spanX, ch / (spanY * SQUASH + 30));
      const ox = cw / 2;
      const oy = (ch - spanY * SQUASH * k) / 2;
      const sc = (y: number) => lerp(PERSP_FAR, 1, (y - RINK.minY) / (RINK.maxY - RINK.minY));
      const P = (x: number, y: number): [number, number] => [ox + (x - CX) * k * sc(y), oy + (y - top0) * k * SQUASH];
      const S = (y: number) => k * sc(y); // size scale at depth y

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      // screen shake (goals)
      if (now < fx.current.shakeUntil) {
        const m = ((fx.current.shakeUntil - now) / 500) * 10 * k;
        ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
      }

      // ---- rink
      const rr = (x0: number, y0: number, x1: number, y1: number, r: number) => {
        const pts: [number, number][] = [];
        const arc = (cx: number, cy: number, a0: number) => {
          for (let i = 0; i <= 8; i++) {
            const a = a0 + (i / 8) * (Math.PI / 2);
            pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
          }
        };
        arc(x1 - r, y0 + r, -Math.PI / 2);
        arc(x1 - r, y1 - r, 0);
        arc(x0 + r, y1 - r, Math.PI / 2);
        arc(x0 + r, y0 + r, Math.PI);
        ctx.beginPath();
        pts.forEach(([x, y], i) => {
          const [px, py] = P(x, y);
          if (i) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        });
        ctx.closePath();
      };
      // board "height" (far wall visible face)
      ctx.save();
      ctx.translate(0, -14 * k);
      rr(RINK.minX - 14, RINK.minY - 14, RINK.maxX + 14, RINK.maxY + 14, 60);
      ctx.fillStyle = '#d9e4ee';
      ctx.fill();
      ctx.restore();
      rr(RINK.minX - 14, RINK.minY - 14, RINK.maxX + 14, RINK.maxY + 14, 60);
      ctx.fillStyle = '#ffd23f';
      ctx.fill();
      rr(RINK.minX - 8, RINK.minY - 8, RINK.maxX + 8, RINK.maxY + 8, 54);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      rr(RINK.minX, RINK.minY, RINK.maxX, RINK.maxY, 46);
      const [, top] = P(0, RINK.minY);
      const [, bot] = P(0, RINK.maxY);
      const g = ctx.createLinearGradient(0, top, 0, bot);
      g.addColorStop(0, '#dcefff');
      g.addColorStop(1, '#f7fcff');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.save();
      ctx.clip();
      // ice shine
      const [sx0, sy0] = P(CX - 300 * sxs, CY - 220 * sys);
      const shine = ctx.createRadialGradient(sx0, sy0, 0, sx0, sy0, 500 * k);
      shine.addColorStop(0, 'rgba(255,255,255,0.7)');
      shine.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = shine;
      ctx.fillRect(0, 0, cw, ch);

      const line = (x: number, color: string, w: number) => {
        const [ax, ay] = P(x, RINK.minY);
        const [bx, by] = P(x, RINK.maxY);
        ctx.strokeStyle = color;
        ctx.lineWidth = w * k;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      };
      // tinted defensive zones for orientation
      const zone = (x0: number, x1: number, color: string) => {
        const a = P(x0, RINK.minY);
        const b = P(x1, RINK.minY);
        const c = P(x1, RINK.maxY);
        const d = P(x0, RINK.maxY);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(...a);
        ctx.lineTo(...b);
        ctx.lineTo(...c);
        ctx.lineTo(...d);
        ctx.fill();
      };
      const blueL = CX - 200 * sxs;
      const blueR = CX + 200 * sxs;
      zone(0, blueL, 'rgba(239,59,74,0.07)');
      zone(blueR, W, 'rgba(47,134,255,0.08)');
      line(CX, 'rgba(220,30,50,0.75)', 6);
      line(blueL, 'rgba(30,100,230,0.7)', 6);
      line(blueR, 'rgba(30,100,230,0.7)', 6);
      line(RINK.minX + 2, 'rgba(220,30,50,0.6)', 2.5);
      line(RINK.maxX - 2, 'rgba(220,30,50,0.6)', 2.5);
      const ellipse = (x: number, y: number, r: number, stroke: string | null, fill: string | null, lw = 3) => {
        const [px, py] = P(x, y);
        ctx.beginPath();
        ctx.ellipse(px, py, r * S(y), r * S(y) * SQUASH, 0, 0, Math.PI * 2);
        if (fill) {
          ctx.fillStyle = fill;
          ctx.fill();
        }
        if (stroke) {
          ctx.strokeStyle = stroke;
          ctx.lineWidth = lw * k;
          ctx.stroke();
        }
      };
      ellipse(CX, CY, 80 * Math.min(1, sys), 'rgba(30,100,230,0.6)', null);
      ellipse(CX, CY, 6, null, 'rgba(30,100,230,0.8)');
      for (const [dx, dy] of [
        [-370, -160],
        [-370, 160],
        [370, -160],
        [370, 160],
      ]) {
        const fxp = CX + dx * sxs;
        const fyp = CY + dy * sys;
        ellipse(fxp, fyp, 50 * Math.min(1, sys), 'rgba(220,30,50,0.45)', null);
        ellipse(fxp, fyp, 6, null, 'rgba(220,30,50,0.7)');
      }
      // goal creases
      for (const left of [true, false]) {
        const x0 = left ? RINK.minX : RINK.maxX;
        const dir = left ? 1 : -1;
        ctx.beginPath();
        for (let i = 0; i <= 16; i++) {
          const a = -Math.PI / 2 + (i / 16) * Math.PI;
          const [px, py] = P(x0 + dir * Math.cos(a) * 60, 340 + Math.sin(a) * 64);
          if (i) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(80,160,255,0.25)';
        ctx.fill();
      }
      // center logo text
      ctx.fillStyle = 'rgba(11,29,51,0.08)';
      ctx.font = `900 ${60 * k}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const [lx, ly] = P(CX, CY);
      ctx.fillText('PARTY RINK', lx, ly);
      ctx.restore();

      // ---- goals
      const drawGoal = (left: boolean) => {
        const x0 = left ? RINK.minX : RINK.maxX;
        const xb = left ? RINK.minX - GOAL.depth : RINK.maxX + GOAL.depth;
        const h = 34;
        const color = left ? COLORS.red : COLORS.blue;
        const pt = (x: number, y: number, z: number): [number, number] => {
          const [px, py] = P(x, y);
          return [px, py - z * S(y)];
        };
        // net floor
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.moveTo(...pt(x0, GOAL.minY, 0));
        ctx.lineTo(...pt(xb, GOAL.minY + 8, 0));
        ctx.lineTo(...pt(xb, GOAL.maxY - 8, 0));
        ctx.lineTo(...pt(x0, GOAL.maxY, 0));
        ctx.fill();
        // back net
        ctx.fillStyle = 'rgba(230,240,250,0.65)';
        ctx.strokeStyle = 'rgba(120,140,160,0.6)';
        ctx.lineWidth = 1 * k;
        ctx.beginPath();
        ctx.moveTo(...pt(xb, GOAL.minY + 8, 0));
        ctx.lineTo(...pt(xb, GOAL.minY + 8, h));
        ctx.lineTo(...pt(xb, GOAL.maxY - 8, h));
        ctx.lineTo(...pt(xb, GOAL.maxY - 8, 0));
        ctx.closePath();
        ctx.fill();
        for (let i = 1; i < 8; i++) {
          const y = lerp(GOAL.minY + 8, GOAL.maxY - 8, i / 8);
          ctx.beginPath();
          ctx.moveTo(...pt(xb, y, 0));
          ctx.lineTo(...pt(xb, y, h));
          ctx.stroke();
        }
        // posts + crossbar
        ctx.strokeStyle = color;
        ctx.lineWidth = 5 * k;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(...pt(x0, GOAL.minY, 0));
        ctx.lineTo(...pt(x0, GOAL.minY, h));
        ctx.lineTo(...pt(x0, GOAL.maxY, h));
        ctx.lineTo(...pt(x0, GOAL.maxY, 0));
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(...pt(x0, GOAL.minY, h));
        ctx.lineTo(...pt(xb, GOAL.minY + 8, h));
        ctx.moveTo(...pt(x0, GOAL.maxY, h));
        ctx.lineTo(...pt(xb, GOAL.maxY - 8, h));
        ctx.stroke();
        ctx.lineCap = 'butt';
      };
      drawGoal(true);
      drawGoal(false);

      // side labels
      ctx.font = `800 ${20 * k}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.red;
      const [rlx, rly] = P(RINK.minX + 150, RINK.maxY + 34);
      ctx.fillText('◀ RED DEFENDS', rlx, rly);
      ctx.fillStyle = COLORS.blue;
      const [blx, bly] = P(RINK.maxX - 150, RINK.maxY + 34);
      ctx.fillText('BLUE DEFENDS ▶', blx, bly);

      if (!snap) return;

      // ---- entities sorted by depth
      type Ent = { y: number; draw: () => void };
      const ents: Ent[] = [];
      const carrier = snap.puck[2];
      if (carrier !== lastCarrier) {
        if (carrier) flashUntil = now + 350;
        lastCarrier = carrier;
      }

      const shadow = (x: number, y: number, r: number, a = 0.25) => {
        const [px, py] = P(x, y);
        ctx.fillStyle = `rgba(10,30,60,${a})`;
        ctx.beginPath();
        ctx.ellipse(px, py, r * S(y), r * S(y) * SQUASH * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
      };

      for (const s of snap.sk) {
        ents.push({
          y: s.y,
          draw: () => {
            const red = s.tm === 0;
            const base = red ? COLORS.red : COLORS.blue;
            const dark = red ? COLORS.redDark : COLORS.blueDark;
            const z = S(s.y);
            const [px, py] = P(s.x, s.y);
            const off = !s.c;
            ctx.globalAlpha = off ? 0.45 : 1;
            // ownership ring
            if (carrier === s.n) {
              const pulse = now < flashUntil ? 1 + (flashUntil - now) / 350 : 1;
              ctx.strokeStyle = '#ffd23f';
              ctx.lineWidth = 4 * k;
              ctx.beginPath();
              ctx.ellipse(px, py, 24 * z * pulse, 24 * z * SQUASH * pulse, 0, 0, Math.PI * 2);
              ctx.stroke();
            }
            // speed boost after a clean catch: cyan glow + speed streaks
            if (s.bo) {
              ctx.strokeStyle = 'rgba(80,230,255,0.8)';
              ctx.lineWidth = 3 * k;
              ctx.beginPath();
              ctx.ellipse(px, py, 28 * z, 28 * z * SQUASH, 0, 0, Math.PI * 2);
              ctx.stroke();
              for (let i = -1; i <= 1; i++) {
                const [bx, by] = P(s.x - s.fx * 30 + s.fy * i * 9, s.y - s.fy * 30 - s.fx * i * 9);
                const [cx2, cy2] = P(s.x - s.fx * 60 + s.fy * i * 9, s.y - s.fy * 60 - s.fx * i * 9);
                ctx.beginPath();
                ctx.moveTo(bx, by - 10 * z);
                ctx.lineTo(cx2, cy2 - 10 * z);
                ctx.stroke();
              }
            }
            shadow(s.x, s.y, 17);
            // charge / aim arrow on the ice — turns green in the PERFECT window, red when over-charged
            if (s.ch >= 0) {
              const c = Math.min(1, s.ch);
              const len = 50 + 110 * c;
              const [ex, ey] = P(s.x + s.ax * len, s.y + s.ay * len);
              const perfect = s.ch >= 0.8 && s.ch <= 0.95;
              ctx.strokeStyle = perfect
                ? 'rgba(60,255,140,1)'
                : s.ch > 1
                  ? 'rgba(255,40,40,0.95)'
                  : `rgba(255,${Math.round(210 - 120 * c)},0,0.95)`;
              ctx.lineWidth = (5 + 5 * c + (perfect ? 3 : 0)) * k;
              ctx.lineCap = 'round';
              ctx.beginPath();
              ctx.moveTo(px, py);
              ctx.lineTo(ex, ey);
              ctx.stroke();
              const ang = Math.atan2(ey - py, ex - px);
              ctx.beginPath();
              ctx.moveTo(ex, ey);
              ctx.lineTo(ex - Math.cos(ang - 0.5) * 16 * k, ey - Math.sin(ang - 0.5) * 16 * k);
              ctx.moveTo(ex, ey);
              ctx.lineTo(ex - Math.cos(ang + 0.5) * 16 * k, ey - Math.sin(ang + 0.5) * 16 * k);
              ctx.stroke();
              ctx.lineCap = 'butt';
            }
            // stick
            const stickLen = s.pk ? 46 : 26;
            const dx = s.ch >= 0 ? s.ax : s.fx;
            const dy = s.ch >= 0 ? s.ay : s.fy;
            const [hx, hy] = P(s.x + dx * 8, s.y + dy * 8);
            const [tx, ty] = P(s.x + dx * stickLen, s.y + dy * stickLen);
            ctx.strokeStyle = s.pk ? '#ffffff' : '#5b3a1a';
            ctx.lineWidth = 4 * k;
            ctx.beginPath();
            ctx.moveTo(hx, hy - 14 * z);
            ctx.lineTo(tx, ty);
            ctx.stroke();
            if (s.pk) {
              ctx.fillStyle = 'rgba(255,240,120,0.9)';
              ctx.beginPath();
              ctx.arc(tx, ty, 7 * k, 0, Math.PI * 2);
              ctx.fill();
            }
            // legs
            ctx.fillStyle = '#1b2433';
            ctx.fillRect(px - 9 * z, py - 14 * z, 7 * z, 14 * z);
            ctx.fillRect(px + 2 * z, py - 14 * z, 7 * z, 14 * z);
            // torso
            const tw = 30 * z;
            const th = 26 * z;
            const tyTop = py - 14 * z - th;
            const grad = ctx.createLinearGradient(px - tw / 2, 0, px + tw / 2, 0);
            grad.addColorStop(0, base);
            grad.addColorStop(1, dark);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.roundRect(px - tw / 2, tyTop, tw, th, 8 * z);
            ctx.fill();
            // number
            ctx.fillStyle = '#fff';
            ctx.font = `900 ${16 * z}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(s.n), px, tyTop + th / 2 + 1 * z);
            // head + helmet
            const hr = 10 * z;
            const hyc = tyTop - hr + 2 * z;
            ctx.fillStyle = '#f2c9a0';
            ctx.beginPath();
            ctx.arc(px, hyc, hr, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = dark;
            ctx.beginPath();
            ctx.arc(px, hyc - 1 * z, hr + 1 * z, Math.PI, 0);
            ctx.fill();
            // name label
            const info = roster.current[s.n];
            const label = (info?.name ?? `P${s.n}`).slice(0, 10);
            ctx.font = `800 ${15 * z}px system-ui, sans-serif`;
            const lw = ctx.measureText(label).width + 12 * z;
            const ly2 = hyc - hr - 14 * z;
            ctx.fillStyle = red ? 'rgba(157,18,32,0.9)' : 'rgba(13,71,168,0.9)';
            ctx.beginPath();
            ctx.roundRect(px - lw / 2, ly2 - 10 * z, lw, 20 * z, 6 * z);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.fillText(label, px, ly2 + 1 * z);
            if (off) {
              ctx.globalAlpha = 1;
              ctx.fillStyle = '#ffb020';
              ctx.font = `900 ${13 * z}px system-ui, sans-serif`;
              ctx.fillText('AWAY', px, ly2 - 20 * z);
            }
            // stumbling after a whiffed poke: dizzy stars circling the head
            if (s.st) {
              ctx.fillStyle = '#ffd23f';
              ctx.font = `900 ${12 * z}px system-ui, sans-serif`;
              for (let i = 0; i < 3; i++) {
                const a = now / 150 + (i * Math.PI * 2) / 3;
                ctx.fillText('★', px + Math.cos(a) * 14 * z, hyc - 4 * z + Math.sin(a) * 5 * z);
              }
            }
            ctx.globalAlpha = 1;
          },
        });
      }

      snap.gl.forEach((gk, i) => {
        ents.push({
          y: gk.y,
          draw: () => {
            const red = i === 0;
            const z = S(gk.y);
            const [px, py] = P(gk.x, gk.y);
            shadow(gk.x, gk.y, 22, 0.3);
            const base = red ? COLORS.redDark : COLORS.blueDark;
            // pads
            ctx.fillStyle = '#f5f7fa';
            ctx.fillRect(px - 15 * z, py - 18 * z, 12 * z, 18 * z);
            ctx.fillRect(px + 3 * z, py - 18 * z, 12 * z, 18 * z);
            // body (shield shape)
            const bw = 38 * z;
            const bh = 30 * z;
            const top = py - 18 * z - bh;
            ctx.fillStyle = base;
            ctx.strokeStyle = gk.s ? '#ffd23f' : '#ffffff';
            ctx.lineWidth = (gk.s ? 4 : 2.5) * z;
            ctx.beginPath();
            ctx.moveTo(px - bw / 2, top);
            ctx.lineTo(px + bw / 2, top);
            ctx.lineTo(px + bw / 2, top + bh * 0.7);
            ctx.lineTo(px, top + bh);
            ctx.lineTo(px - bw / 2, top + bh * 0.7);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = `900 ${15 * z}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('G', px, top + bh * 0.42);
            // mask
            const hr = 11 * z;
            ctx.fillStyle = '#e8edf3';
            ctx.beginPath();
            ctx.arc(px, top - hr + 3 * z, hr, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#7a8694';
            ctx.lineWidth = 1.5 * z;
            for (let j = -1; j <= 1; j++) {
              ctx.beginPath();
              ctx.moveTo(px - hr * 0.7, top - hr + 3 * z + j * 4 * z);
              ctx.lineTo(px + hr * 0.7, top - hr + 3 * z + j * 4 * z);
              ctx.stroke();
            }
            // glove + stick
            const out = red ? 1 : -1;
            ctx.fillStyle = gk.s ? '#ffd23f' : '#f5f7fa';
            ctx.beginPath();
            ctx.arc(px + out * 20 * z, top + 8 * z, 7 * z, 0, Math.PI * 2);
            ctx.fill();
            if (gk.s) {
              ctx.fillStyle = 'rgba(255,210,63,0.9)';
              ctx.font = `900 ${18 * z}px system-ui, sans-serif`;
              ctx.fillText('SAVE!', px + out * 10 * z, top - 34 * z);
            }
          },
        });
      });

      const [pxw, pyw] = snap.puck;
      // puck trail for fast, loose pucks (shots and passes)
      const lastT = trail[trail.length - 1];
      if (!lastT || Math.hypot(lastT.x - pxw, lastT.y - pyw) > 0.5) trail.push({ x: pxw, y: pyw });
      if (trail.length > 9) trail.shift();
      if (!snap.puck[2] && trail.length > 2) {
        const a = trail[0];
        const speedish = Math.hypot(pxw - a.x, pyw - a.y) / trail.length;
        if (speedish > 6 && speedish < 60) {
          for (let i = 1; i < trail.length; i++) {
            const [x0, y0] = P(trail[i - 1].x, trail[i - 1].y);
            const [x1, y1] = P(trail[i].x, trail[i].y);
            ctx.strokeStyle = `rgba(255,${speedish > 12 ? 120 : 200},40,${(i / trail.length) * 0.7})`;
            ctx.lineWidth = (2 + (i / trail.length) * 7) * k;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.stroke();
          }
          ctx.lineCap = 'butt';
        }
      }
      ents.push({
        y: pyw + 0.5,
        draw: () => {
          shadow(pxw, pyw + 2, PUCK_R + 2, 0.35);
          const [px, py] = P(pxw, pyw);
          const z = S(pyw);
          const r = PUCK_R * z * 1.4;
          // bright halo ring so the puck is visible from across the room
          ctx.fillStyle = 'rgba(255,230,80,0.35)';
          ctx.strokeStyle = 'rgba(255,190,0,0.9)';
          ctx.lineWidth = 2.5 * z;
          ctx.beginPath();
          ctx.ellipse(px, py - 3 * z, r + 9 * z, (r + 9 * z) * SQUASH, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#0d0f12';
          ctx.beginPath();
          ctx.ellipse(px, py, r, r * SQUASH, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillRect(px - r, py - 5 * z, r * 2, 5 * z);
          ctx.fillStyle = '#2b3038';
          ctx.beginPath();
          ctx.ellipse(px, py - 5 * z, r, r * SQUASH, 0, 0, Math.PI * 2);
          ctx.fill();
        },
      });

      ents.sort((a, b) => a.y - b.y);
      for (const e of ents) e.draw();

      // floating callouts (STOLEN!, PERFECT!, ONE-TIMER!, CLEAN!, whiff)
      const LIFE = 1100;
      fx.current.callouts = fx.current.callouts.filter((c) => now - c.born < LIFE);
      for (const c of fx.current.callouts) {
        const age = (now - c.born) / LIFE;
        const [cx2, cy2] = P(c.x, c.y);
        const rise = age * 50 * k;
        const pop = age < 0.15 ? 0.6 + (age / 0.15) * 0.4 : 1;
        const size = (c.big ? 34 : 22) * k * pop;
        ctx.globalAlpha = age > 0.7 ? 1 - (age - 0.7) / 0.3 : 1;
        ctx.font = `900 ${size}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 5 * k;
        ctx.strokeStyle = 'rgba(11,29,51,0.85)';
        ctx.strokeText(c.text, cx2, cy2 - 60 * k - rise);
        ctx.fillStyle = c.color;
        ctx.fillText(c.text, cx2, cy2 - 60 * k - rise);
        ctx.globalAlpha = 1;
      }
      // easter-egg chat bubbles over a (losing) skater
      fx.current.quips = fx.current.quips.filter((q) => now - q.born < QUIP_SHOW_MS);
      for (const q of fx.current.quips) {
        const sk = snap.sk.find((s) => s.n === q.n);
        if (!sk) continue;
        const z = S(sk.y);
        const [px, py] = P(sk.x, sk.y);
        const age = now - q.born;
        const pop = age < 150 ? 0.5 + (age / 150) * 0.5 : 1;
        ctx.globalAlpha = age > QUIP_SHOW_MS - 400 ? (QUIP_SHOW_MS - age) / 400 : 1;
        ctx.font = `900 ${18 * z * pop}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tw = ctx.measureText(q.text).width;
        const bw = tw + 24 * z;
        const bh = 34 * z * pop;
        const bx = px - bw / 2;
        const by = py - 120 * z - bh;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#0b1d33';
        ctx.lineWidth = 3 * z;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 12 * z);
        ctx.fill();
        ctx.stroke();
        // speech-bubble tail
        ctx.beginPath();
        ctx.moveTo(px - 8 * z, by + bh - 1);
        ctx.lineTo(px, by + bh + 14 * z);
        ctx.lineTo(px + 8 * z, by + bh - 1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillRect(px - 7 * z, by + bh - 3 * z, 14 * z, 4 * z);
        ctx.fillStyle = '#0b1d33';
        ctx.fillText(q.text, px, by + bh / 2 + 1);
        ctx.globalAlpha = 1;
      }
      void SK_R;
      void GOALIE_R;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [buffer, roster, fx]);

  return <canvas ref={ref} />;
}
