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
    case 'fishfolk': {
      // spiky fin crest behind the head
      ctx.fillStyle = '#1f7f86';
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.75, hy - r * 0.55);
      const spikes = 5;
      for (let i = 0; i < spikes; i++) {
        const a = Math.PI * (1.15 + (i / (spikes - 1)) * 0.7);
        const b = Math.PI * (1.15 + ((i + 0.5) / (spikes - 1)) * 0.7);
        ctx.lineTo(hx + Math.cos(a) * r * 1.65, hy - r * 0.15 + Math.sin(a) * r * 1.5);
        if (i < spikes - 1) ctx.lineTo(hx + Math.cos(b) * r * 1.05, hy - r * 0.15 + Math.sin(b) * r * 1.0);
      }
      ctx.lineTo(hx + r * 0.75, hy - r * 0.55);
      ctx.closePath();
      ctx.fill();
      // head
      ctx.fillStyle = '#3fb58f';
      ctx.beginPath();
      ctx.ellipse(hx, hy, r * 0.95, r * 1.05, 0, 0, Math.PI * 2);
      ctx.fill();
      // scales
      ctx.strokeStyle = '#257a62';
      ctx.lineWidth = 1 * z;
      for (const [sx, sy] of [[-0.45, -0.6], [0, -0.75], [0.45, -0.6], [-0.22, -0.4], [0.22, -0.4]]) {
        ctx.beginPath();
        ctx.arc(hx + sx * r, hy + sy * r, r * 0.16, 0, Math.PI);
        ctx.stroke();
      }
      // bulging side eyes poking out of the silhouette
      for (const s of [-1, 1]) {
        circle(ctx, hx + s * r * 0.88, hy - r * 0.3, r * 0.36, '#3fb58f');
        circle(ctx, hx + s * r * 0.92, hy - r * 0.3, r * 0.27, '#ffe14d');
        ctx.fillStyle = '#151515';
        ctx.beginPath();
        ctx.ellipse(hx + s * r * 0.92 + e * 0.25, hy - r * 0.3, r * 0.07, r * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // gaping mouth with rows of tiny teeth
      const my = hy + r * 0.38;
      ctx.fillStyle = '#5a0f1e';
      ctx.beginPath();
      ctx.ellipse(hx + e * 0.2, my, r * 0.58, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      const n = 6;
      for (const row of [-1, 1]) {
        const ty = my + row * r * 0.36;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x0 = hx + e * 0.2 - r * 0.42 + (i * r * 0.84) / n;
          const shrink = Math.abs(i + 0.5 - n / 2) / (n / 2); // teeth follow the mouth curve
          const yy = ty - row * shrink * r * 0.12;
          ctx.moveTo(x0, yy);
          ctx.lineTo(x0 + r * 0.14, yy);
          ctx.lineTo(x0 + r * 0.07, yy - row * r * 0.15);
          ctx.closePath();
        }
        ctx.fill();
      }
      return hy - r * 1.65;
    }
    case 'ogre': {
      const skin = '#a7a35a';
      // small round ears
      circle(ctx, hx - r * 1.05, hy, r * 0.25, '#8f8b48');
      circle(ctx, hx + r * 1.05, hy, r * 0.25, '#8f8b48');
      // big lumpy bald dome
      circle(ctx, hx, hy, r * 1.08, skin);
      circle(ctx, hx - r * 0.5, hy - r * 0.75, r * 0.45, skin);
      circle(ctx, hx + r * 0.35, hy - r * 0.85, r * 0.5, skin);
      circle(ctx, hx + r * 0.85, hy - r * 0.35, r * 0.35, skin);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.ellipse(hx + r * 0.2, hy - r * 1.05, r * 0.22, r * 0.1, -0.3, 0, Math.PI * 2);
      ctx.fill();
      // heavy brow + tiny eyes
      ctx.fillStyle = '#7f7b3c';
      ctx.beginPath();
      ctx.ellipse(hx, hy - r * 0.32, r * 0.75, r * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      circle(ctx, hx - r * 0.3 + e * 0.3, hy - r * 0.12, r * 0.08, '#151515');
      circle(ctx, hx + r * 0.3 + e * 0.3, hy - r * 0.12, r * 0.08, '#151515');
      // blob nose
      circle(ctx, hx + e * 0.3, hy + r * 0.1, r * 0.17, '#8f8b48');
      // jutting underbite jaw
      ctx.fillStyle = '#8f8b48';
      ctx.beginPath();
      ctx.ellipse(hx, hy + r * 0.62, r * 0.85, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a1a10';
      ctx.beginPath();
      ctx.ellipse(hx, hy + r * 0.5, r * 0.55, r * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      // two upward tusks
      ctx.fillStyle = '#f3ecd8';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(hx + s * r * 0.55, hy + r * 0.55);
        ctx.lineTo(hx + s * r * 0.25, hy + r * 0.55);
        ctx.lineTo(hx + s * r * 0.48, hy + r * 0.0);
        ctx.closePath();
        ctx.fill();
      }
      return hy - r * 1.35;
    }
    case 'orc': {
      const skin = '#4f8a36';
      // black topknot (behind the head so the band sits on the crown)
      ctx.fillStyle = '#121212';
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.2, hy - r * 1.2);
      ctx.quadraticCurveTo(hx - r * 0.05, hy - r * 2.0, hx + r * 0.45, hy - r * 2.05);
      ctx.quadraticCurveTo(hx + r * 0.15, hy - r * 1.6, hx + r * 0.22, hy - r * 1.2);
      ctx.closePath();
      ctx.fill();
      circle(ctx, hx, hy - r * 1.2, r * 0.32, '#121212');
      // small swept ears, tight to the head
      ctx.fillStyle = '#3f7329';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(hx + s * r * 0.85, hy - r * 0.25);
        ctx.lineTo(hx + s * r * 1.3, hy - r * 0.55);
        ctx.lineTo(hx + s * r * 0.9, hy + r * 0.2);
        ctx.closePath();
        ctx.fill();
      }
      // squarish head with wide jaw
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.roundRect(hx - r * 0.95, hy - r, r * 1.9, r * 1.95, [r * 0.9, r * 0.9, r * 0.45, r * 0.45]);
      ctx.fill();
      // hair band
      ctx.fillStyle = '#8a4a22';
      ctx.fillRect(hx - r * 0.2, hy - r * 1.1, r * 0.4, r * 0.14);
      // heavy brow ridge
      ctx.fillStyle = '#2f5a1f';
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.85, hy - r * 0.45);
      ctx.lineTo(hx, hy - r * 0.2);
      ctx.lineTo(hx + r * 0.85, hy - r * 0.45);
      ctx.lineTo(hx + r * 0.85, hy - r * 0.2);
      ctx.lineTo(hx, hy + r * 0.02);
      ctx.lineTo(hx - r * 0.85, hy - r * 0.2);
      ctx.closePath();
      ctx.fill();
      // angry red eyes
      circle(ctx, hx - r * 0.38 + e * 0.3, hy - r * 0.05, r * 0.12, '#ff4a2a');
      circle(ctx, hx + r * 0.38 + e * 0.3, hy - r * 0.05, r * 0.12, '#ff4a2a');
      // mouth + lower tusks
      ctx.strokeStyle = '#1d3612';
      ctx.lineWidth = 1.6 * z;
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.5, hy + r * 0.55);
      ctx.lineTo(hx + r * 0.5, hy + r * 0.55);
      ctx.stroke();
      ctx.fillStyle = '#f3ecd8';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(hx + s * r * 0.48, hy + r * 0.6);
        ctx.lineTo(hx + s * r * 0.24, hy + r * 0.6);
        ctx.lineTo(hx + s * r * 0.4, hy + r * 0.2);
        ctx.closePath();
        ctx.fill();
      }
      return hy - r * 2.05;
    }
    case 'troll': {
      const skin = '#3f86d8';
      // tall swept-back red hair
      ctx.fillStyle = '#ff3b2f';
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.75, hy - r * 0.5);
      ctx.quadraticCurveTo(hx - r * 0.8, hy - r * 1.7, hx - r * 0.1, hy - r * 2.5);
      ctx.quadraticCurveTo(hx - r * 0.05, hy - r * 1.9, hx + r * 0.3, hy - r * 2.25);
      ctx.quadraticCurveTo(hx + r * 0.3, hy - r * 1.6, hx + r * 0.8, hy - r * 0.5);
      ctx.closePath();
      ctx.fill();
      // long pointed ears straight out sideways
      ctx.fillStyle = '#2f6fbb';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(hx + s * r * 0.8, hy - r * 0.35);
        ctx.lineTo(hx + s * r * 2.1, hy - r * 0.6);
        ctx.lineTo(hx + s * r * 0.8, hy + r * 0.15);
        ctx.closePath();
        ctx.fill();
      }
      // head, a bit long in the face
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.ellipse(hx, hy + r * 0.05, r * 0.9, r * 1.05, 0, 0, Math.PI * 2);
      ctx.fill();
      // hair fringe over the forehead
      ctx.fillStyle = '#ff3b2f';
      ctx.beginPath();
      ctx.ellipse(hx, hy - r * 0.8, r * 0.72, r * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      eyes(ctx, hx, hy - r * 0.25, r * 0.33, r * 0.16, ex);
      // long nose
      ctx.fillStyle = '#2f6fbb';
      ctx.beginPath();
      ctx.ellipse(hx + e * 0.3, hy + r * 0.12, r * 0.13, r * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      // mouth + long tusks curling up past the cheeks
      ctx.fillStyle = '#10264a';
      ctx.beginPath();
      ctx.ellipse(hx, hy + r * 0.6, r * 0.42, r * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff6dc';
      ctx.strokeStyle = '#10264a';
      ctx.lineWidth = 0.8 * z;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(hx + s * r * 0.22, hy + r * 0.76);
        ctx.quadraticCurveTo(hx + s * r * 1.3, hy + r * 0.8, hx + s * r * 1.2, hy - r * 0.4);
        ctx.quadraticCurveTo(hx + s * r * 1.08, hy + r * 0.55, hx + s * r * 0.42, hy + r * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      return hy - r * 2.5;
    }
    case 'undead': {
      // a few stringy hairs
      ctx.strokeStyle = '#3c3f36';
      ctx.lineWidth = 1.2 * z;
      ctx.beginPath();
      for (const [x0, x1] of [[-0.5, -0.75], [-0.15, -0.25], [0.25, 0.4]]) {
        ctx.moveTo(hx + x0 * r, hy - r * 0.85);
        ctx.lineTo(hx + x1 * r, hy - r * 1.35);
      }
      ctx.stroke();
      circle(ctx, hx, hy, r, '#8fa58a');
      // exposed jaw/teeth on the right side
      ctx.fillStyle = '#ece3c8';
      ctx.beginPath();
      ctx.moveTo(hx + r * 0.05, hy + r * 0.3);
      ctx.lineTo(hx + r * 0.85, hy + r * 0.05);
      ctx.lineTo(hx + r * 0.75, hy + r * 0.75);
      ctx.lineTo(hx + r * 0.05, hy + r * 0.85);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#2a1a1a';
      ctx.fillRect(hx - r * 0.45, hy + r * 0.48, r * 1.2, r * 0.12);
      ctx.strokeStyle = '#6b6450';
      ctx.lineWidth = 0.8 * z;
      ctx.beginPath();
      for (let i = 1; i <= 4; i++) {
        const x = hx + r * 0.05 + i * r * 0.15;
        ctx.moveTo(x, hy + r * 0.3);
        ctx.lineTo(x, hy + r * 0.8);
      }
      ctx.stroke();
      // stitches on the left cheek
      ctx.strokeStyle = '#3c3f36';
      ctx.lineWidth = 1 * z;
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.75, hy + r * 0.15);
      ctx.lineTo(hx - r * 0.3, hy + r * 0.4);
      for (let i = 0; i < 3; i++) {
        const t = (i + 0.5) / 3;
        const x = hx - r * 0.75 + t * r * 0.45;
        const y = hy + r * 0.15 + t * r * 0.25;
        ctx.moveTo(x - r * 0.05, y + r * 0.1);
        ctx.lineTo(x + r * 0.05, y - r * 0.1);
      }
      ctx.stroke();
      // dark sockets + glowing eyes in the accent color
      circle(ctx, hx - r * 0.38, hy - r * 0.2, r * 0.27, '#2b3329');
      circle(ctx, hx + r * 0.38, hy - r * 0.2, r * 0.27, '#2b3329');
      ctx.save();
      ctx.shadowColor = accent;
      ctx.shadowBlur = 6 * z;
      circle(ctx, hx - r * 0.38 + e * 0.3, hy - r * 0.2, r * 0.15, accent);
      circle(ctx, hx + r * 0.38 + e * 0.3, hy - r * 0.2, r * 0.15, accent);
      ctx.restore();
      return hy - r * 1.35;
    }
    case 'gnome': {
      const R = r * 1.2; // oversized head
      const gy = hy - r * 0.15;
      // wild spiky white hair around the top and sides
      ctx.fillStyle = '#f4f4f0';
      ctx.beginPath();
      const tips = 10;
      for (let i = 0; i <= tips; i++) {
        const a = Math.PI * (0.85 + (i / tips) * 1.3);
        const rr = i % 2 === 0 ? R * 1.55 : R * 1.05;
        const x = hx + Math.cos(a) * rr;
        const y = gy + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineTo(hx, gy);
      ctx.closePath();
      ctx.fill();
      circle(ctx, hx, gy, R, '#f4c39b');
      // goggles pushed up on the forehead (accent lenses)
      ctx.fillStyle = '#4a3020';
      ctx.fillRect(hx - R, gy - R * 0.62, R * 2, R * 0.16);
      for (const s of [-1, 1]) {
        circle(ctx, hx + s * R * 0.32, gy - R * 0.55, R * 0.27, '#8a5a2b');
        circle(ctx, hx + s * R * 0.32, gy - R * 0.55, R * 0.18, accent);
        circle(ctx, hx + s * R * 0.36 - R * 0.06, gy - R * 0.6, R * 0.06, 'rgba(255,255,255,0.8)');
      }
      // small eyes, huge nose
      circle(ctx, hx - R * 0.38 + e * 0.3, gy - R * 0.08, R * 0.09, '#151515');
      circle(ctx, hx + R * 0.38 + e * 0.3, gy - R * 0.08, R * 0.09, '#151515');
      circle(ctx, hx + e * 0.4, gy + R * 0.2, R * 0.33, '#ef8a78');
      circle(ctx, hx + e * 0.4 - R * 0.1, gy + R * 0.1, R * 0.09, 'rgba(255,255,255,0.55)');
      // little smile under the nose
      ctx.strokeStyle = '#7a3b2a';
      ctx.lineWidth = 1.3 * z;
      ctx.beginPath();
      ctx.arc(hx + e * 0.3, gy + R * 0.5, R * 0.22, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
      return gy - R * 1.55;
    }
    case 'goblin': {
      const skin = '#9ccc3a';
      // very big pointy ears, up and out
      for (const s of [-1, 1]) {
        ctx.fillStyle = skin;
        ctx.beginPath();
        ctx.moveTo(hx + s * r * 0.7, hy - r * 0.55);
        ctx.lineTo(hx + s * r * 2.2, hy - r * 1.35);
        ctx.lineTo(hx + s * r * 0.8, hy + r * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#e88aa0';
        ctx.beginPath();
        ctx.moveTo(hx + s * r * 0.9, hy - r * 0.35);
        ctx.lineTo(hx + s * r * 1.85, hy - r * 1.1);
        ctx.lineTo(hx + s * r * 0.95, hy + r * 0.1);
        ctx.closePath();
        ctx.fill();
      }
      circle(ctx, hx, hy, r * 0.95, skin);
      // big yellow eyes
      for (const s of [-1, 1]) {
        circle(ctx, hx + s * r * 0.36, hy - r * 0.35, r * 0.22, '#ffe14d');
        circle(ctx, hx + s * r * 0.36 + e * 0.35, hy - r * 0.35, r * 0.1, '#151515');
      }
      // huge toothy grin
      ctx.fillStyle = '#3a0f14';
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.75, hy + r * 0.15);
      ctx.quadraticCurveTo(hx, hy + r * 1.15, hx + r * 0.75, hy + r * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      const n = 6;
      for (let i = 0; i < n; i++) {
        const x0 = hx - r * 0.66 + (i * r * 1.32) / n;
        ctx.moveTo(x0, hy + r * 0.17);
        ctx.lineTo(x0 + (r * 1.32) / n, hy + r * 0.17);
        ctx.lineTo(x0 + (r * 0.66) / n, hy + r * 0.42);
        ctx.closePath();
      }
      ctx.fill();
      // long pointed nose, angled toward facing
      ctx.fillStyle = '#7fae24';
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.13, hy - r * 0.25);
      ctx.lineTo(hx + r * 0.13, hy - r * 0.25);
      ctx.lineTo(hx + e * 0.8 + r * 0.05, hy + r * 0.35);
      ctx.closePath();
      ctx.fill();
      return hy - r * 1.35;
    }
    case 'pirate': {
      const skin = '#e9b98f';
      circle(ctx, hx, hy, r, skin);
      // scruffy beard with a jagged edge
      ctx.fillStyle = '#3b2414';
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.98, hy);
      ctx.lineTo(hx - r * 0.6, hy + r * 0.2);
      ctx.lineTo(hx + r * 0.6, hy + r * 0.2);
      ctx.lineTo(hx + r * 0.98, hy);
      const jag = 7;
      for (let i = 0; i <= jag; i++) {
        const a = (i / jag) * Math.PI;
        const rr = i % 2 === 0 ? r * 1.2 : r * 0.95;
        ctx.lineTo(hx + Math.cos(a) * rr, hy + r * 0.05 + Math.sin(a) * rr * 0.95);
      }
      ctx.closePath();
      ctx.fill();
      // mouth
      ctx.fillStyle = '#7a2a1e';
      ctx.beginPath();
      ctx.ellipse(hx + e * 0.3, hy + r * 0.42, r * 0.25, r * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      // eyepatch over the left eye, one good eye
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 1.2 * z;
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.95, hy - r * 0.45);
      ctx.lineTo(hx + r * 0.9, hy + r * 0.05);
      ctx.stroke();
      ctx.fillStyle = '#111111';
      ctx.beginPath();
      ctx.ellipse(hx - r * 0.36, hy - r * 0.18, r * 0.24, r * 0.2, 0.25, 0, Math.PI * 2);
      ctx.fill();
      circle(ctx, hx + r * 0.36, hy - r * 0.2, r * 0.17, '#ffffff');
      circle(ctx, hx + r * 0.36 + e * 0.35, hy - r * 0.2, r * 0.09, '#151515');
      // tricorn hat: wide upturned brim with a point on each side, accent trim
      const by = hy - r * 0.48;
      const hat = () => {
        ctx.beginPath();
        ctx.moveTo(hx - r * 1.45, by - r * 0.25);
        ctx.quadraticCurveTo(hx - r * 0.7, by + r * 0.2, hx, by + r * 0.12);
        ctx.quadraticCurveTo(hx + r * 0.7, by + r * 0.2, hx + r * 1.45, by - r * 0.25);
        ctx.quadraticCurveTo(hx + r * 0.9, by - r * 0.6, hx + r * 0.55, by - r * 1.05);
        ctx.quadraticCurveTo(hx, by - r * 1.25, hx - r * 0.55, by - r * 1.05);
        ctx.quadraticCurveTo(hx - r * 0.9, by - r * 0.6, hx - r * 1.45, by - r * 0.25);
        ctx.closePath();
      };
      ctx.fillStyle = '#1e1a22';
      hat();
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.6 * z;
      hat();
      ctx.stroke();
      // little white skull badge
      circle(ctx, hx, by - r * 0.45, r * 0.17, '#f3f3f3');
      ctx.fillStyle = '#1e1a22';
      circle(ctx, hx - r * 0.06, by - r * 0.47, r * 0.04, '#1e1a22');
      circle(ctx, hx + r * 0.06, by - r * 0.47, r * 0.04, '#1e1a22');
      return by - r * 1.25;
    }
    default:
      circle(ctx, hx, hy, r, '#cccccc');
      return hy - r;
  }
}
