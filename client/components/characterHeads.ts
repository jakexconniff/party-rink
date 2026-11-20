// Whole-head characters. Each is a bold silhouette plus one signature feature so it reads at ~30px on a TV.

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function eyes(ctx: CanvasRenderingContext2D, x: number, y: number, gap: number, r: number, ex: number) {
  circle(ctx, x - gap, y, r, '#ffffff');
  circle(ctx, x + gap, y, r, '#ffffff');
  circle(ctx, x - gap + ex * r * 0.4, y, r * 0.5, '#151515');
  circle(ctx, x + gap + ex * r * 0.4, y, r * 0.5, '#151515');
}

/**
 * Draws a character head centred at (hx, hy) with radius r. `z` is pixels per world unit,
 * `ex` is facing (-1..1). Returns the top y of the drawn head (for placing the name label).
 */
export function drawCharacterHead(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  r: number,
  z: number,
  id: string,
  accent: string,
  team: string,
  ex: number,
): number {
  const e = ex * 1.5 * z;
  switch (id) {
    case 'monster': {
      ctx.fillStyle = '#e9e2c8';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(hx + s * r * 0.55, hy - r * 0.7);
        ctx.lineTo(hx + s * r * 0.85, hy - r * 1.55);
        ctx.lineTo(hx + s * r * 0.95, hy - r * 0.5);
        ctx.closePath();
        ctx.fill();
      }
      circle(ctx, hx, hy, r, '#5fcf4a');
      circle(ctx, hx + e * 0.5, hy - r * 0.15, r * 0.48, '#ffffff');
      circle(ctx, hx + e, hy - r * 0.15, r * 0.24, '#151515');
      ctx.strokeStyle = '#1e5a17';
      ctx.lineWidth = 1.6 * z;
      ctx.beginPath();
      ctx.arc(hx, hy + r * 0.35, r * 0.4, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      return hy - r * 1.55;
    }
    case 'clown': {
      const puff = ['#ff3d6e', '#ffd23f', '#3cff8c', '#50e6ff', '#b48cff'];
      puff.forEach((c, i) => circle(ctx, hx + (i - 2) * r * 0.55, hy - r * 0.75 + Math.abs(i - 2) * r * 0.2, r * 0.45, c));
      circle(ctx, hx, hy, r, '#ffffff');
      eyes(ctx, hx, hy - r * 0.2, r * 0.38, r * 0.2, ex);
      circle(ctx, hx + e * 0.3, hy + r * 0.18, r * 0.3, '#ff2a2a');
      ctx.strokeStyle = '#ff2a2a';
      ctx.lineWidth = 2 * z;
      ctx.beginPath();
      ctx.arc(hx, hy + r * 0.3, r * 0.45, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
      return hy - r * 1.2;
    }
    case 'bear':
    case 'panda': {
      const panda = id === 'panda';
      const fur = panda ? '#f6f6f2' : '#8b5a2b';
      const ears = panda ? '#1b1b1b' : '#6b4320';
      circle(ctx, hx - r * 0.75, hy - r * 0.75, r * 0.38, ears);
      circle(ctx, hx + r * 0.75, hy - r * 0.75, r * 0.38, ears);
      circle(ctx, hx, hy, r, fur);
      if (panda) {
        ctx.fillStyle = '#1b1b1b';
        ctx.beginPath();
        ctx.ellipse(hx - r * 0.38, hy - r * 0.1, r * 0.26, r * 0.32, -0.4, 0, Math.PI * 2);
        ctx.ellipse(hx + r * 0.38, hy - r * 0.1, r * 0.26, r * 0.32, 0.4, 0, Math.PI * 2);
        ctx.fill();
        circle(ctx, hx - r * 0.36 + e * 0.3, hy - r * 0.1, r * 0.1, '#ffffff');
        circle(ctx, hx + r * 0.36 + e * 0.3, hy - r * 0.1, r * 0.1, '#ffffff');
      } else {
        circle(ctx, hx - r * 0.35 + e * 0.3, hy - r * 0.2, r * 0.12, '#151515');
        circle(ctx, hx + r * 0.35 + e * 0.3, hy - r * 0.2, r * 0.12, '#151515');
      }
      ctx.fillStyle = panda ? '#ffffff' : '#d9b48a';
      ctx.beginPath();
      ctx.ellipse(hx + e * 0.3, hy + r * 0.35, r * 0.4, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      circle(ctx, hx + e * 0.3, hy + r * 0.22, r * 0.13, '#151515');
      return hy - r * 1.13;
    }
    case 'robot': {
      ctx.strokeStyle = '#8e99a6';
      ctx.lineWidth = 1.6 * z;
      ctx.beginPath();
      ctx.moveTo(hx, hy - r);
      ctx.lineTo(hx, hy - r * 1.55);
      ctx.stroke();
      const on = Math.floor(Date.now() / 400) % 2 === 0;
      circle(ctx, hx, hy - r * 1.6, r * 0.18, on ? '#ff3d3d' : '#7a1f1f');
      ctx.fillStyle = '#b8c2cc';
      ctx.beginPath();
      ctx.roundRect(hx - r, hy - r, r * 2, r * 1.9, r * 0.3);
      ctx.fill();
      ctx.fillStyle = '#0d1720';
      ctx.beginPath();
      ctx.roundRect(hx - r * 0.75, hy - r * 0.45, r * 1.5, r * 0.55, r * 0.2);
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.fillRect(hx - r * 0.55 + e, hy - r * 0.3, r * 0.35, r * 0.25);
      ctx.fillRect(hx + r * 0.2 + e, hy - r * 0.3, r * 0.35, r * 0.25);
      ctx.fillStyle = '#6c7884';
      for (let i = -1; i <= 1; i++) ctx.fillRect(hx + i * r * 0.35 - r * 0.1, hy + r * 0.4, r * 0.2, r * 0.25);
      return hy - r * 1.75;
    }
    case 'alien': {
      ctx.strokeStyle = '#7bd94a';
      ctx.lineWidth = 1.5 * z;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(hx + s * r * 0.3, hy - r * 0.9);
        ctx.lineTo(hx + s * r * 0.75, hy - r * 1.7);
        ctx.stroke();
        circle(ctx, hx + s * r * 0.75, hy - r * 1.7, r * 0.17, '#c6ff6a');
      }
      ctx.fillStyle = '#9be35a';
      ctx.beginPath();
      ctx.ellipse(hx, hy - r * 0.1, r * 1.05, r * 1.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0c0c0c';
      ctx.beginPath();
      ctx.ellipse(hx - r * 0.42 + e * 0.3, hy - r * 0.05, r * 0.3, r * 0.45, 0.5, 0, Math.PI * 2);
      ctx.ellipse(hx + r * 0.42 + e * 0.3, hy - r * 0.05, r * 0.3, r * 0.45, -0.5, 0, Math.PI * 2);
      ctx.fill();
      return hy - r * 1.85;
    }
    case 'frog': {
      circle(ctx, hx - r * 0.5, hy - r * 0.7, r * 0.42, '#4cc35a');
      circle(ctx, hx + r * 0.5, hy - r * 0.7, r * 0.42, '#4cc35a');
      ctx.fillStyle = '#4cc35a';
      ctx.beginPath();
      ctx.ellipse(hx, hy + r * 0.05, r * 1.1, r * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      eyes(ctx, hx, hy - r * 0.75, r * 0.5, r * 0.28, ex);
      ctx.strokeStyle = '#1f5a26';
      ctx.lineWidth = 1.8 * z;
      ctx.beginPath();
      ctx.arc(hx, hy + r * 0.05, r * 0.7, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      return hy - r * 1.15;
    }
    case 'pumpkin': {
      ctx.fillStyle = '#3e7d2a';
      ctx.fillRect(hx - r * 0.12, hy - r * 1.35, r * 0.24, r * 0.45);
      ctx.fillStyle = '#ff8a1e';
      for (const dx of [-0.45, 0.45, 0]) {
        ctx.beginPath();
        ctx.ellipse(hx + dx * r, hy, r * 0.62, r * 0.95, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#3a1d00';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(hx + s * r * 0.45 + e * 0.3, hy - r * 0.45);
        ctx.lineTo(hx + s * r * 0.2 + e * 0.3, hy - r * 0.05);
        ctx.lineTo(hx + s * r * 0.7 + e * 0.3, hy - r * 0.05);
        ctx.closePath();
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.6, hy + r * 0.25);
      for (let i = 0; i <= 6; i++) ctx.lineTo(hx - r * 0.6 + (i * r * 1.2) / 6, hy + r * (i % 2 ? 0.35 : 0.55));
      ctx.lineTo(hx + r * 0.6, hy + r * 0.25);
      ctx.closePath();
      ctx.fill();
      return hy - r * 1.35;
    }
    case 'ninja': {
      circle(ctx, hx, hy, r, '#1a1d24');
      ctx.fillStyle = '#e8c4a0';
      ctx.beginPath();
      ctx.roundRect(hx - r * 0.8, hy - r * 0.35, r * 1.6, r * 0.45, r * 0.2);
      ctx.fill();
      circle(ctx, hx - r * 0.32 + e * 0.4, hy - r * 0.12, r * 0.11, '#151515');
      circle(ctx, hx + r * 0.32 + e * 0.4, hy - r * 0.12, r * 0.11, '#151515');
      ctx.fillStyle = accent;
      ctx.fillRect(hx - r, hy - r * 0.62, r * 2, r * 0.22);
      ctx.beginPath();
      ctx.moveTo(hx + r * 0.9, hy - r * 0.55);
      ctx.lineTo(hx + r * 1.6, hy - r * 0.3);
      ctx.lineTo(hx + r * 1.45, hy - r * 0.05);
      ctx.closePath();
      ctx.fill();
      return hy - r;
    }
    case 'astronaut': {
      circle(ctx, hx, hy, r * 0.62, '#f2c9a0');
      eyes(ctx, hx, hy - r * 0.1, r * 0.22, r * 0.13, ex);
      ctx.fillStyle = 'rgba(190,230,255,0.35)';
      ctx.strokeStyle = '#e8edf3';
      ctx.lineWidth = 2.4 * z;
      ctx.beginPath();
      ctx.arc(hx, hy, r * 1.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.ellipse(hx - r * 0.45, hy - r * 0.5, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = team;
      ctx.fillRect(hx - r * 0.7, hy + r * 0.92, r * 1.4, r * 0.25);
      return hy - r * 1.1;
    }
    case 'shark': {
      ctx.fillStyle = '#6f8597';
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.35, hy - r * 0.8);
      ctx.lineTo(hx + r * 0.15, hy - r * 1.8);
      ctx.lineTo(hx + r * 0.45, hy - r * 0.75);
      ctx.closePath();
      ctx.fill();
      circle(ctx, hx, hy, r, '#7d93a6');
      ctx.fillStyle = '#e9eef2';
      ctx.beginPath();
      ctx.ellipse(hx, hy + r * 0.45, r * 0.8, r * 0.5, 0, 0, Math.PI);
      ctx.fill();
      circle(ctx, hx - r * 0.42 + e * 0.3, hy - r * 0.2, r * 0.13, '#151515');
      circle(ctx, hx + r * 0.42 + e * 0.3, hy - r * 0.2, r * 0.13, '#151515');
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#3a4a57';
      ctx.lineWidth = 1 * z;
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.6, hy + r * 0.3);
      for (let i = 0; i <= 6; i++) ctx.lineTo(hx - r * 0.6 + (i * r * 1.2) / 6, hy + r * (i % 2 ? 0.55 : 0.3));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      return hy - r * 1.8;
    }
    case 'chicken': {
      for (let i = -1; i <= 1; i++) circle(ctx, hx + i * r * 0.32, hy - r * 1.0 - (i === 0 ? r * 0.12 : 0), r * 0.26, '#ff2a3a');
      circle(ctx, hx, hy, r, '#fbfbf5');
      eyes(ctx, hx, hy - r * 0.2, r * 0.4, r * 0.16, ex);
      ctx.fillStyle = '#ffb21e';
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.25 + e, hy + r * 0.05);
      ctx.lineTo(hx + r * 0.25 + e, hy + r * 0.05);
      ctx.lineTo(hx + e, hy + r * 0.5);
      ctx.closePath();
      ctx.fill();
      circle(ctx, hx + e * 0.5, hy + r * 0.62, r * 0.14, '#ff2a3a');
      return hy - r * 1.35;
    }
    case 'unicorn': {
      const mane = ['#ff5fd2', '#b48cff', '#50e6ff', '#3cff8c'];
      mane.forEach((c, i) => circle(ctx, hx - r * 0.85 + i * r * 0.12, hy - r * 0.55 + i * r * 0.35, r * 0.32, c));
      circle(ctx, hx, hy, r, '#fbf7ff');
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.18, hy - r * 0.85);
      ctx.lineTo(hx + r * 0.05, hy - r * 1.9);
      ctx.lineTo(hx + r * 0.25, hy - r * 0.85);
      ctx.closePath();
      ctx.fill();
      eyes(ctx, hx, hy - r * 0.05, r * 0.36, r * 0.17, ex);
      circle(ctx, hx - r * 0.6, hy + r * 0.35, r * 0.15, 'rgba(255,120,180,0.6)');
      circle(ctx, hx + r * 0.6, hy + r * 0.35, r * 0.15, 'rgba(255,120,180,0.6)');
      return hy - r * 1.9;
    }
    default:
      circle(ctx, hx, hy, r, '#cccccc');
      return hy - r;
  }
}
