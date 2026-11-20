import { useEffect, useRef } from 'react';
import type { Snapshot, SkaterSnap } from '../../shared/types';

// World constants (mirror server/simulation/config.ts; rendering only).
const W = 1200;
const RINK = { minX: 64, maxX: 1136, minY: 48, maxY: 632 };
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

interface Props {
  buffer: React.MutableRefObject<SnapBuffer>;
  roster: React.MutableRefObject<RosterInfo>;
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

export function RinkCanvas({ buffer, roster }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let lastCarrier = 0;
    let flashUntil = 0;

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

      // projection
      const worldH = 680;
      const k = Math.min(cw / (W * 0.98), ch / (worldH * SQUASH + 70));
      const ox = cw / 2;
      const oy = (ch - worldH * SQUASH * k) / 2 + 20 * k;
      const sc = (y: number) => lerp(PERSP_FAR, 1, y / worldH);
      const P = (x: number, y: number): [number, number] => [ox + (x - W / 2) * k * sc(y), oy + y * k * SQUASH];
      const S = (y: number) => k * sc(y); // size scale at depth y

      ctx.clearRect(0, 0, cw, ch);

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
      const [sx0, sy0] = P(300, 120);
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
      zone(0, 400, 'rgba(239,59,74,0.07)');
      zone(800, W, 'rgba(47,134,255,0.08)');
      line(600, 'rgba(220,30,50,0.75)', 6);
      line(400, 'rgba(30,100,230,0.7)', 6);
      line(800, 'rgba(30,100,230,0.7)', 6);
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
      ellipse(600, 340, 80, 'rgba(30,100,230,0.6)', null);
      ellipse(600, 340, 6, null, 'rgba(30,100,230,0.8)');
      for (const [fx, fy] of [
        [230, 180],
        [230, 500],
        [970, 180],
        [970, 500],
      ])
        ellipse(fx, fy, 50, 'rgba(220,30,50,0.45)', null), ellipse(fx, fy, 6, null, 'rgba(220,30,50,0.7)');
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
      const [lx, ly] = P(600, 340);
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
      const [rlx, rly] = P(210, RINK.maxY + 34);
      ctx.fillText('◀ RED DEFENDS', rlx, rly);
      ctx.fillStyle = COLORS.blue;
      const [blx, bly] = P(990, RINK.maxY + 34);
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
            shadow(s.x, s.y, 17);
            // charge / aim arrow on the ice
            if (s.ch >= 0) {
              const len = 50 + 110 * s.ch;
              const [ex, ey] = P(s.x + s.ax * len, s.y + s.ay * len);
              ctx.strokeStyle = `rgba(255,${Math.round(200 - 170 * s.ch)},0,0.95)`;
              ctx.lineWidth = (5 + 5 * s.ch) * k;
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
      ents.push({
        y: pyw + 0.5,
        draw: () => {
          shadow(pxw, pyw + 2, PUCK_R + 2, 0.35);
          const [px, py] = P(pxw, pyw);
          const z = S(pyw);
          const r = PUCK_R * z * 1.15;
          // glow halo so the puck is visible from across the room
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.beginPath();
          ctx.ellipse(px, py - 2 * z, r + 5 * z, (r + 5 * z) * SQUASH, 0, 0, Math.PI * 2);
          ctx.fill();
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
      void SK_R;
      void GOALIE_R;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [buffer, roster]);

  return <canvas ref={ref} />;
}
