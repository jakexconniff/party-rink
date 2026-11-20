import { useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { ACCENTS, BODIES, FACES, HEADS, LOOK_FIELDS, SKIN_TONES, randomLook, type Look } from '../../shared/appearance';
import type { PublicPlayer } from '../../shared/types';
import { drawSkaterBody } from './drawSkater';

/** Small canvas showing a skater exactly as the TV draws it. */
export function SkaterPreview({ look, team, number, size = 110 }: { look: Look; team: 0 | 1; number: number; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    c.width = size * dpr;
    c.height = size * 1.25 * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size * 1.25);
    // ice + shadow
    ctx.fillStyle = 'rgba(220,239,255,0.18)';
    ctx.beginPath();
    ctx.ellipse(size / 2, size * 1.12, size * 0.38, size * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    const z = size / 60;
    drawSkaterBody(ctx, size / 2, size * 1.12, z, team, number, look, 0.4);
  }, [look, team, number, size]);
  return <canvas ref={ref} style={{ width: size, height: size * 1.25, display: 'block' }} />;
}

const ROWS: { key: keyof Look; label: string; name: (i: number) => string }[] = [
  { key: 'head', label: 'Head', name: (i) => HEADS[i].label },
  { key: 'face', label: 'Face', name: (i) => FACES[i].label },
  { key: 'body', label: 'Body', name: (i) => BODIES[i].label },
  { key: 'skin', label: 'Skin', name: (i) => `Tone ${i + 1}` },
];

export function LookEditor({ socket, self, players }: { socket: Socket; self: PublicPlayer; players: PublicPlayer[] }) {
  const look = self.look;
  const set = (next: Look) => socket.emit('player:look', { look: next });
  const step = (key: keyof Look, d: number) => {
    const n = LOOK_FIELDS[key];
    set({ ...look, [key]: (look[key] + d + n) % n });
  };
  const takenByTeammate = new Set(
    players.filter((p) => p.id !== self.id && self.team && p.team === self.team).map((p) => p.look.accent),
  );
  return (
    <div className="card look-editor">
      <div className="look-preview">
        <SkaterPreview look={look} team={self.team === 'BLUE' ? 1 : 0} number={self.number} />
        <button className="btn secondary shuffle" onClick={() => set(randomLook())}>
          🎲 Shuffle
        </button>
      </div>
      <div className="look-rows">
        <div className="look-title">Your look</div>
        {ROWS.map((r) => (
          <div className="look-row" key={r.key}>
            <span className="look-label">{r.label}</span>
            <button className="arrow" onClick={() => step(r.key, -1)} aria-label={`Previous ${r.label}`}>
              ◀
            </button>
            <span className="look-value">
              {r.key === 'skin' ? (
                <span className="swatch" style={{ background: SKIN_TONES[look.skin] }} />
              ) : (
                r.name(look[r.key])
              )}
            </span>
            <button className="arrow" onClick={() => step(r.key, 1)} aria-label={`Next ${r.label}`}>
              ▶
            </button>
          </div>
        ))}
        <div className="look-row">
          <span className="look-label">Color</span>
          <span className="swatches">
            {ACCENTS.map((a, i) => (
              <button
                key={a.color}
                className={`swatch-btn ${look.accent === i ? 'on' : ''}`}
                style={{ background: a.color }}
                disabled={takenByTeammate.has(i)}
                aria-label={a.label}
                onClick={() => set({ ...look, accent: i })}
              />
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
