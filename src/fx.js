// Partícules del tauler. Coordenades en píxels de món (les mateixes que el canvas
// sota la transformació de càmera). Amb sostre dur: mai no pot fer petar el frame.
const MAX = 420;
const pool = [];

const rnd = (a, b) => a + Math.random() * (b - a);

function add(p) {
  if (pool.length >= MAX) pool.shift();
  pool.push(p);
}

export function reset() { pool.length = 0; }
export const count = () => pool.length;

/** Espurnes curtes en una direcció: fogonada del canó. */
export function muzzle(x, y, angle, color, power = 1) {
  const n = Math.round(3 * power);
  for (let i = 0; i < n; i++) {
    const a = angle + rnd(-0.35, 0.35);
    const sp = rnd(70, 190) * power;
    add({
      t: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 1, decay: rnd(3.5, 6), color, w: rnd(1.2, 2.4), drag: 0.86,
    });
  }
  add({ t: 'flash', x, y, life: 1, decay: 14, color, r: 9 * power });
}

/** Explosió: espurnes radials + runa + fum. */
export function burst(x, y, color, power = 1) {
  const sparks = Math.round(rnd(6, 11) * power);
  for (let i = 0; i < sparks; i++) {
    const a = rnd(0, Math.PI * 2);
    const sp = rnd(50, 210) * power;
    add({
      t: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 1, decay: rnd(1.6, 3.2), color, w: rnd(1.3, 2.8), drag: 0.9,
    });
  }
  const bits = Math.round(rnd(2, 5) * power);
  for (let i = 0; i < bits; i++) {
    const a = rnd(0, Math.PI * 2);
    const sp = rnd(40, 130) * power;
    add({
      t: 'debris', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 1, decay: rnd(1.1, 1.9), color, r: rnd(2, 4.5) * power,
      rot: rnd(0, 6.28), spin: rnd(-9, 9), drag: 0.93,
    });
  }
  for (let i = 0; i < Math.round(2 * power); i++) {
    add({
      t: 'smoke', x: x + rnd(-6, 6), y: y + rnd(-6, 6), vx: rnd(-14, 14), vy: rnd(-26, -8),
      life: 1, decay: rnd(0.7, 1.2), color, r: rnd(7, 15) * power, drag: 0.97,
    });
  }
  add({ t: 'ring', x, y, life: 1, decay: 2.6, color, r: 6 * power, grow: 120 * power });
}

/** Guspires petites d'impacte, sense fum. */
export function impact(x, y, color) {
  for (let i = 0; i < 3; i++) {
    const a = rnd(0, Math.PI * 2);
    add({
      t: 'spark', x, y, vx: Math.cos(a) * rnd(30, 90), vy: Math.sin(a) * rnd(30, 90),
      life: 1, decay: rnd(4, 7), color, w: rnd(1, 1.8), drag: 0.88,
    });
  }
}

/** Rastre que deixen els enemics ràpids i els voladors. */
export function trail(x, y, color, r = 3) {
  add({ t: 'smoke', x, y, vx: 0, vy: 0, life: 1, decay: 3.4, color, r, drag: 1 });
}

/** Anell d'energia (mutació, fusió, desplegament). */
export function ring(x, y, color, r = 10, grow = 160, decay = 1.8) {
  add({ t: 'ring', x, y, life: 1, decay, color, r, grow });
}

/** Columna ascendent de guspires: mutacions i fusions. */
export function ascend(x, y, color, n = 14) {
  for (let i = 0; i < n; i++) {
    add({
      t: 'spark', x: x + rnd(-16, 16), y: y + rnd(-6, 10),
      vx: rnd(-14, 14), vy: rnd(-150, -60),
      life: 1, decay: rnd(1.0, 1.8), color, w: rnd(1.4, 2.6), drag: 0.97,
    });
  }
}

export function update(dt) {
  const d = Math.min(dt, 0.05);          // no s'esbandeix tot si hi ha un salt de frame
  for (let i = pool.length - 1; i >= 0; i--) {
    const p = pool[i];
    p.life -= p.decay * d;
    if (p.life <= 0) { pool.splice(i, 1); continue; }
    if (p.vx !== undefined) {
      p.x += p.vx * d;
      p.y += p.vy * d;
      if (p.drag !== undefined) {
        const f = Math.pow(p.drag, d * 60);
        p.vx *= f; p.vy *= f;
      }
      if (p.t === 'debris') p.vy += 120 * d;      // la runa cau
      if (p.t === 'smoke') p.r += 16 * d;
    }
    if (p.rot !== undefined) p.rot += p.spin * d;
    if (p.grow !== undefined) p.r += p.grow * d;
  }
}

export function draw(ctx, K = 1) {
  if (!pool.length) return;
  ctx.save();
  ctx.lineCap = 'round';
  for (const p of pool) {
    const a = Math.max(0, Math.min(1, p.life));
    ctx.globalAlpha = a;
    switch (p.t) {
      case 'spark': {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.w * K;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.022, p.y - p.vy * 0.022);
        ctx.stroke();
        break;
      }
      case 'debris': {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r);
        ctx.restore();
        break;
      }
      case 'smoke': {
        ctx.globalAlpha = a * 0.22;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'ring': {
        ctx.globalAlpha = a * 0.8;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = (1 + a * 2.5) * K;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'flash': {
        const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * (1 + (1 - a)));
        gr.addColorStop(0, p.color);
        gr.addColorStop(1, 'transparent');
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (1 + (1 - a)), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }
  }
  ctx.restore();
}
