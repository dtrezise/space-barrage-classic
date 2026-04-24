const W = 1024;
const H = 768;
const SECTOR = 16;
const XS = W / SECTOR;
const YS = H / SECTOR;
const TOTAL_BARGES = 5;
const TOTAL_GUNS = 100;
const HUD_SCALE = 1.25;
const HUD_OPACITY = 0.75;
const HUD_TIMER_Y = H / 2 - 70;
const HUD_PREVIEW_Y = H / 2 + 90;

const ST = {
  NULL: -1,
  VACANT: 0,
  INSIDE: 1,
  INACTIVE_OBJECT: 2,
  ACTIVE_OBJECT: 3,
  OUT_OF_RANGE: 4,
  SHIELD: 5,
};

const DC = {
  WAIT: 0,
  ADVANCE: 1,
  RETREAT: 2,
  FLANK_LEFT: 3,
  FLANK_RIGHT: 4,
  REVERSE: 5,
  SHOOT: 6,
  EXPLODE: 7,
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const cosD = (deg) => Math.cos((deg * Math.PI) / 180);
const sinD = (deg) => Math.sin((deg * Math.PI) / 180);
const atanD = (x) => (Math.atan(x) * 180) / Math.PI;
const rgba = (r, g, b, a) =>
  `rgba(${Math.round(clamp(r, 0, 1) * 255)},${Math.round(clamp(g, 0, 1) * 255)},${Math.round(clamp(b, 0, 1) * 255)},${clamp(a, 0, 1)})`;

class RNG {
  constructor(seed = Date.now() >>> 0) {
    this.low = seed | 0;
    this.high = ~seed;
  }

  generateRaw() {
    this.high = ((this.high << 16) + (this.high >>> 16)) | 0;
    this.high = (this.high + this.low) | 0;
    this.low = (this.low + this.high) | 0;
    return this.high >>> 0;
  }

  generate(min, max) {
    if (min > max) [min, max] = [max, min];
    return (this.generateRaw() % (max - min + 1)) + min;
  }
}

class Circle {
  constructor(x = 0, y = 0, r = 1) {
    this.x = x;
    this.y = y;
    this.r = r;
  }

  set(x, y, r = this.r) {
    this.x = x;
    this.y = y;
    this.r = r;
  }

  moveTo(x, y) {
    this.x = x;
    this.y = y;
  }

  contactsCircle(other) {
    const dx = other.x - this.x;
    const dy = other.y - this.y;
    const r = other.r + this.r;
    return dx * dx + dy * dy < r * r;
  }

  contactsPoint(x, y) {
    const dx = x - this.x;
    const dy = y - this.y;
    return dx * dx + dy * dy < this.r * this.r;
  }
}

class AudioBus {
  constructor() {
    this.enabled = true;
    this.music = null;
    this.musicId = null;
    this.fx = new Map();
    this.paths = {
      title: "./assets/Title.ogg",
      battle: "./assets/Battle.ogg",
      countdown: "./assets/Countdown.ogg",
      levelComplete: "./assets/LevelComplete.ogg",
      gameover: "./assets/Gameover.ogg",
      buzz: "./assets/soundfx/buzz.wav",
      missileHit: "./assets/soundfx/missileHit.wav",
      missileBlast: "./assets/soundfx/missileBlast.wav",
      click: "./assets/soundfx/missileFail.wav",
      playerMissile: "./assets/soundfx/missile.wav",
      tactical1: "./assets/soundfx/SBTactical1.ogg",
      tactical2: "./assets/soundfx/SBTactical2.ogg",
      tactical3: "./assets/soundfx/SBTactical3.ogg",
      tactical4: "./assets/soundfx/SBTactical4.ogg",
      shieldSection: "./assets/soundfx/shieldSection.wav",
      shieldBarrier: "./assets/soundfx/shieldBarrier.wav",
    };
  }

  unlock() {
    for (const key of Object.keys(this.paths)) {
      if (!this.fx.has(key)) this.fx.set(key, new Audio(this.paths[key]));
    }
  }

  playMusic(id, loop = true) {
    if (!this.enabled || this.musicId === id) return;
    this.stopMusic();
    const audio = new Audio(this.paths[id]);
    audio.loop = loop;
    audio.volume = 0.72;
    this.music = audio;
    this.musicId = id;
    audio.play().catch(() => {});
  }

  playMusicOnce(id) {
    this.playMusic(id, false);
  }

  stopMusic() {
    if (this.music) {
      this.music.pause();
      this.music.currentTime = 0;
    }
    this.music = null;
    this.musicId = null;
  }

  fadeOut(ms = 900) {
    if (!this.music) return;
    const audio = this.music;
    const start = audio.volume;
    const started = performance.now();
    const tick = () => {
      if (this.music !== audio) return;
      const t = clamp((performance.now() - started) / ms, 0, 1);
      audio.volume = start * (1 - t);
      if (t < 1) requestAnimationFrame(tick);
      else this.stopMusic();
    };
    tick();
  }

  play(id) {
    if (!this.enabled) return;
    const base = this.fx.get(id) || new Audio(this.paths[id]);
    this.fx.set(id, base);
    const audio = base.cloneNode();
    audio.volume = 0.8;
    audio.play().catch(() => {});
  }
}

function setLine(ctx, color, width = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

function polyline(ctx, points, { x = 0, y = 0, rot = 0, scale = 1, color = "white", width = 2 } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.scale(scale, scale);
  setLine(ctx, color, width / scale);
  ctx.beginPath();
  for (let i = 0; i < points.length; i += 2) {
    const px = points[i];
    const py = points[i + 1];
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
}

function drawVectorText(ctx, text, x, y, sx, sy, color, glow = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sx, sy);
  ctx.font = "32px Verdana, Geneva, sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.7, 1.6 / Math.max(sx, 0.5));
  ctx.lineJoin = "round";
  if (glow > 0) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 20 * glow;
  }
  ctx.strokeText(text, 0, 0);
  ctx.restore();
}

function centeredVectorTextX(ctx, text, sx) {
  ctx.save();
  ctx.font = "32px Verdana, Geneva, sans-serif";
  const width = ctx.measureText(text).width * sx;
  ctx.restore();
  return (W - width) / 2;
}

function drawCenteredVectorText(ctx, text, y, sx, sy, color, glow = 0) {
  drawVectorText(ctx, text, centeredVectorTextX(ctx, text, sx), y, sx, sy, color, glow);
}

function drawPointer(ctx, x, y) {
  polyline(ctx, [0, 0, 0, 15, 4, 10, 12, 12, 0, 0], {
    x,
    y,
    color: rgba(1, 1, 0, 0.65),
    width: 2,
  });
}

const BARGE_POINTS = [
  4, -16, 8, -12, 8, -4, 12, -4, 12, -8, 16, -8, 16, 12, 12, 12, 12, 8, 8, 8, 8, 12, 6, 14, 4, 14, 4, 12, -4, 12, -4, 14, -6, 14, -8, 12, -8, 8, -12, 8, -12, 12, -16, 12, -16, -8, -12, -8, -12, -4, -8, -4, -8, -12, -4, -16, 4, -16,
];

const GUN_POINTS = [
  -0.3, -1.7, -0.3, -2.5, -1.5, -2.5, -2.5, -1.5, -2.5, -0.3, -1.7, -0.3, -1.7, 0.3, -2.5, 0.3, -2.5, 1.5, -1.5, 2.5, -0.3, 2.5, -0.3, 1.7, 0.3, 1.7, 0.3, 2.5, 1.5, 2.5, 2.5, 1.5, 2.5, 0.3, 1.7, 0.3, 1.7, -0.3, 2.5, -0.3, 2.5, -1.5, 1.5, -2.5, 0.3, -2.5, 0.3, -1.7, -0.3, -1.7,
];

const DESTROYER_POINTS = [
  -16, 0, -12, 4, -12, 8, -8, 8, -8, 12, -16, 12, -12, 16, -2, 16, 4, 6, 8, 6, 8, 16, 16, 8, 16, -8, 8, -16, 8, -6, 4, -6, -2, -16, -12, -16, -16, -12, -8, -12, -8, -8, -12, -8, -12, -4, -16, 0,
];

class ShieldGrid {
  constructor() {
    this.rng = new RNG(1);
    this.sparkles = Array.from({ length: 500 }, () => this.rng.generate(0, SECTOR) - SECTOR / 2);
    this.sparkleIndex = 0;
    this.reset();
  }

  reset(fill = ST.VACANT) {
    this.sector = new Array(XS * YS).fill(fill);
    this.color = { r: 0.2, g: 0.4, b: 1, a: 0.8 };
  }

  index(x, y) {
    return y * XS + x;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < XS && y < YS;
  }

  get(x, y) {
    return this.inBounds(x, y) ? this.sector[this.index(x, y)] : ST.NULL;
  }

  set(x, y, value) {
    if (this.inBounds(x, y)) this.sector[this.index(x, y)] = value;
  }

  setIndex(i, value) {
    if (i >= 0 && i < this.sector.length) this.sector[i] = value;
  }

  sectorOnDot(x, y) {
    const sx = Math.floor(x / SECTOR);
    const sy = Math.floor(y / SECTOR);
    return this.inBounds(sx, sy) ? this.index(sx, sy) : -1;
  }

  sectorPointOnDot(x, y) {
    const sx = Math.floor(x / SECTOR);
    const sy = Math.floor(y / SECTOR);
    return this.inBounds(sx, sy) ? { x: sx, y: sy } : { x: -1, y: -1 };
  }

  cornerClosestTo(x, y) {
    let sx = Math.floor(x / SECTOR);
    let sy = Math.floor(y / SECTOR);
    let cx = sx * SECTOR - SECTOR / 2;
    let cy = sy * SECTOR - SECTOR / 2;
    if (x >= cx + SECTOR / 2) cx += SECTOR;
    if (y >= cy + SECTOR / 2) cy += SECTOR;
    return { x: cx, y: cy };
  }

  cornerDiffFromDot(x, y) {
    const c = this.cornerClosestTo(x, y);
    return { dx: c.x - x, dy: c.y - y };
  }

  sparkle() {
    const value = this.sparkles[this.sparkleIndex];
    this.sparkleIndex = (this.sparkleIndex + 1) % this.sparkles.length;
    return value;
  }

  testForClosure() {
    const outside = Array.from({ length: XS + 2 }, () => new Array(YS + 2).fill(false));
    const stack = [[0, 0]];
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= XS + 2 || y >= YS + 2 || outside[x][y]) continue;
      if (x >= 1 && y >= 1 && x <= XS && y <= YS && this.get(x - 1, y - 1) === ST.SHIELD) continue;
      outside[x][y] = true;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx || dy) stack.push([x + dx, y + dy]);
        }
      }
    }

    let changed = false;
    let i = 0;
    for (let y = 1; y < YS + 1; y++) {
      for (let x = 1; x < XS + 1; x++) {
        if (!outside[x][y] && this.sector[i] === ST.VACANT) {
          this.sector[i] = ST.INSIDE;
          changed = true;
        }
        if (!outside[x][y] && this.sector[i] === ST.INACTIVE_OBJECT) {
          this.sector[i] = ST.ACTIVE_OBJECT;
          changed = true;
        }
        i++;
      }
    }
    return changed;
  }

  displayGrid(ctx, centerX = W / 2, centerY = H / 2, area = 100) {
    const left = clamp(centerX - area, 0, W);
    const right = clamp(centerX + area, 0, W);
    const top = clamp(centerY - area, 0, H);
    const bottom = clamp(centerY + area, 0, H);
    const steps = Math.max(1, area / SECTOR);
    setLine(ctx, rgba(0, 0, 1, 0.55), 1);

    for (let gx = Math.ceil(left / SECTOR) * SECTOR; gx <= right; gx += SECTOR) {
      const a = clamp(1 - Math.abs(gx - centerX) / (steps * SECTOR), 0, 1);
      ctx.strokeStyle = rgba(0, 0, 1, a * 0.75);
      ctx.beginPath();
      ctx.moveTo(gx, top);
      ctx.lineTo(gx, bottom);
      ctx.stroke();
    }
    for (let gy = Math.ceil(top / SECTOR) * SECTOR; gy <= bottom; gy += SECTOR) {
      const a = clamp(1 - Math.abs(gy - centerY) / (steps * SECTOR), 0, 1);
      ctx.strokeStyle = rgba(0, 0, 1, a * 0.75);
      ctx.beginPath();
      ctx.moveTo(left, gy);
      ctx.lineTo(right, gy);
      ctx.stroke();
    }
  }

  displayShields(ctx) {
    const c = this.color;
    ctx.save();
    ctx.fillStyle = rgba(0.3, 0.3, 1, clamp(c.a + 0.3, 0, 1));
    for (let y = 0; y < YS; y++) {
      for (let x = 0; x < XS; x++) {
        if (this.get(x, y) === ST.SHIELD) {
          ctx.fillRect(x * SECTOR + SECTOR / 2 + this.sparkle(), y * SECTOR + SECTOR / 2 + this.sparkle(), 2, 2);
        }
      }
    }

    setLine(ctx, rgba(clamp(c.r - 0.3, 0, 1), clamp(c.g - 0.3, 0, 1), 1, clamp(c.a - 0.3, 0, 1)), 1);
    for (let y = 0; y < YS; y++) {
      for (let x = 0; x < XS; x++) {
        if (this.get(x, y) === ST.INSIDE) {
          ctx.beginPath();
          ctx.moveTo(x * SECTOR, y * SECTOR);
          ctx.lineTo((x + 1) * SECTOR, (y + 1) * SECTOR);
          ctx.stroke();
        }
      }
    }

    setLine(ctx, rgba(c.r, c.g, c.b, c.a), 2);
    for (let y = 0; y < YS; y++) {
      for (let x = 0; x < XS; x++) {
        if (this.get(x, y) !== ST.SHIELD) continue;
        const px = x * SECTOR;
        const py = y * SECTOR;
        this.drawEdgeIf(ctx, x, y - 1, px, py, px + SECTOR, py);
        this.drawEdgeIf(ctx, x - 1, y, px, py, px, py + SECTOR);
        this.drawEdgeIf(ctx, x + 1, y, px + SECTOR, py, px + SECTOR, py + SECTOR);
        this.drawEdgeIf(ctx, x, y + 1, px, py + SECTOR, px + SECTOR, py + SECTOR);
      }
    }

    setLine(ctx, rgba(0.2, 0.4, 1, 0.35), 1);
    for (let y = 0; y < YS; y++) {
      for (let x = 0; x < XS; x++) {
        const here = this.get(x, y) === ST.OUT_OF_RANGE;
        if (x < XS - 1 && here !== (this.get(x + 1, y) === ST.OUT_OF_RANGE)) {
          ctx.beginPath();
          ctx.moveTo((x + 1) * SECTOR, y * SECTOR + 0.5);
          ctx.lineTo((x + 1) * SECTOR, (y + 1) * SECTOR - 0.5);
          ctx.stroke();
        }
        if (y < YS - 1 && here !== (this.get(x, y + 1) === ST.OUT_OF_RANGE)) {
          ctx.beginPath();
          ctx.moveTo(x * SECTOR + 0.5, (y + 1) * SECTOR - 0.5);
          ctx.lineTo((x + 1) * SECTOR - 0.5, (y + 1) * SECTOR - 0.5);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  drawEdgeIf(ctx, sx, sy, x1, y1, x2, y2) {
    if (this.get(sx, sy) !== ST.SHIELD) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }
}

class Barge {
  constructor(grid) {
    this.grid = grid;
    this.x = 0;
    this.y = 0;
    this.rotation = 0;
    this.active = false;
    this.color = { r: 1, g: 1, b: 1, a: 0.6 };
    this.rangeSector = [];
    this.buildRange();
  }

  buildRange() {
    const rows = [
      [0, -5, 2],
      [-2, -4, 6],
      [-3, -3, 8],
      [-4, -2, 10],
      [-4, -1, 10],
      [-5, 0, 12],
      [-5, 1, 12],
      [-4, 2, 10],
      [-4, 3, 10],
      [-3, 4, 8],
      [-2, 5, 6],
      [0, 6, 2],
    ];
    for (const [start, y, count] of rows) {
      for (let i = 0; i < count; i++) this.rangeSector.push({ dx: start + i, dy: y });
    }
  }

  moveTo(x, y) {
    this.x = x;
    this.y = y;
  }

  setRotation(deg) {
    this.rotation = deg;
  }

  pointIsInBarge(x, y) {
    return x > this.x - SECTOR && x < this.x + SECTOR && y > this.y - SECTOR && y < this.y + SECTOR;
  }

  fitIntoGrid(x = this.x, y = this.y) {
    this.moveTo(x, y);
    const corner = this.grid.sectorPointOnDot(this.x - 1, this.y - 1);
    if (corner.x === -1) return false;
    if (corner.x < 3 || corner.y < 3 || corner.x > XS - 5 || corner.y > YS - 5) return false;
    if ([this.grid.get(corner.x, corner.y), this.grid.get(corner.x + 1, corner.y), this.grid.get(corner.x, corner.y + 1), this.grid.get(corner.x + 1, corner.y + 1)].includes(ST.OUT_OF_RANGE)) return false;
    for (const r of this.rangeSector) {
      const v = this.grid.get(corner.x + r.dx, corner.y + r.dy);
      if (v === ST.ACTIVE_OBJECT || v === ST.INACTIVE_OBJECT) return false;
    }
    for (const r of this.rangeSector) this.grid.set(corner.x + r.dx, corner.y + r.dy, ST.VACANT);
    this.grid.set(corner.x, corner.y, ST.INACTIVE_OBJECT);
    this.grid.set(corner.x + 1, corner.y, ST.INACTIVE_OBJECT);
    this.grid.set(corner.x, corner.y + 1, ST.INACTIVE_OBJECT);
    this.grid.set(corner.x + 1, corner.y + 1, ST.INACTIVE_OBJECT);
    this.x = (corner.x + 1) * SECTOR;
    this.y = (corner.y + 1) * SECTOR;
    return true;
  }

  draw(ctx) {
    const { r, g, b, a } = this.color;
    const color = this.active ? rgba(r, g, b, a) : rgba(r, g, clamp(b + 0.3, 0, 1), clamp(a - 0.3, 0.1, 1));
    polyline(ctx, BARGE_POINTS, { x: this.x, y: this.y, rot: this.rotation, color, width: 2 });
  }
}

class Gun {
  constructor(grid) {
    this.grid = grid;
    this.reset();
  }

  reset() {
    this.x = 0;
    this.y = 0;
    this.rotation = 0;
    this.active = false;
    this.reloading = false;
    this.reloadTime = 3000;
    this.scale = 3;
  }

  moveTo(x, y) {
    this.x = x;
    this.y = y;
  }

  rotate(deg) {
    this.rotation = (this.rotation + deg + 360) % 360;
  }

  animate(ticks) {
    if (this.active && !this.reloading) this.rotate(0.1 * ticks);
    else if (this.active && this.reloading) {
      this.reloadTime -= ticks;
      if (this.reloadTime <= 0) {
        this.reloadTime = 0;
        this.reloading = false;
      }
    }
  }

  reload() {
    this.reloading = true;
    this.reloadTime = 3000;
  }

  fitIntoGrid() {
    const corner = this.grid.sectorPointOnDot(this.x - SECTOR * 0.5, this.y - SECTOR * 0.5);
    if (corner.x === -1) return false;
    if (corner.x < 1 || corner.y < 1 || corner.x > XS - 2 || corner.y > YS - 2) return false;
    if (this.grid.get(corner.x, corner.y) !== ST.INSIDE || this.grid.get(corner.x + 1, corner.y) !== ST.INSIDE || this.grid.get(corner.x, corner.y + 1) !== ST.INSIDE || this.grid.get(corner.x + 1, corner.y + 1) !== ST.INSIDE) return false;
    this.grid.set(corner.x, corner.y, ST.ACTIVE_OBJECT);
    this.grid.set(corner.x + 1, corner.y, ST.ACTIVE_OBJECT);
    this.grid.set(corner.x, corner.y + 1, ST.ACTIVE_OBJECT);
    this.grid.set(corner.x + 1, corner.y + 1, ST.ACTIVE_OBJECT);
    this.x = (corner.x + 1) * SECTOR;
    this.y = (corner.y + 1) * SECTOR;
    this.active = true;
    return true;
  }

  drawSquareInGrid(ctx) {
    const corner = this.grid.sectorPointOnDot(this.x - SECTOR * 0.5, this.y - SECTOR * 0.5);
    if (corner.x < 0) return;
    setLine(ctx, rgba(0.8, 0.8, 0.1, 0.4), 3);
    ctx.strokeRect(corner.x * SECTOR, corner.y * SECTOR, SECTOR * 2, SECTOR * 2);
  }

  draw(ctx, alpha = null, scaleMultiplier = 1) {
    const opacity = alpha ?? (this.active ? 0.6 : 0.4);
    const color = this.active ? rgba(1, 1, 0, opacity) : rgba(1, 1, 0.4, opacity);
    polyline(ctx, GUN_POINTS, { x: this.x, y: this.y, rot: this.rotation, scale: this.scale * scaleMultiplier, color, width: 2 });
  }
}

class Missile {
  constructor(color = { r: 1, g: 0.8, b: 0, a: 0.6 }) {
    this.color = color;
    this.active = false;
    this.blast = new Circle(0, 0, 1);
    this.trail = [];
  }

  makeInactive() {
    this.active = false;
  }

  moveTo(x, y) {
    this.x = x;
    this.y = y;
  }

  setRotation(r) {
    this.rotation = r;
  }

  launch(tx, ty) {
    this.targetX = tx;
    this.targetY = ty;
    this.forceX = 0;
    this.forceY = 0;
    this.active = true;
    this.exploding = false;
    this.fading = false;
    this.needSound = false;
    this.speed = 0.06;
    this.rotationSpeed = 0.2;
    this.time = 0;
    this.trail = [{ x: this.x, y: this.y }];
    this.trailAlpha = 0.1;
    this.trailFading = false;
    const near = new Circle(this.x, this.y, 200);
    if (near.contactsPoint(tx, ty)) {
      this.speed = 0.02;
      this.rotationSpeed = 0.3;
    }
    this.blast.set(this.x, this.y, 1);
  }

  rotate(deg) {
    this.rotation = (this.rotation + deg + 360) % 360;
  }

  angleToTarget() {
    let angle = atanD((this.targetY - this.y) / (this.targetX - this.x));
    if (this.targetX < this.x) angle += 180;
    return (angle + 360) % 360;
  }

  animate(ticks) {
    if (!this.active) return;
    this.time += ticks;
    if (this.trailFading) this.trailAlpha = Math.max(0, this.trailAlpha - 0.0001 * ticks);

    if (!this.exploding && !this.fading) {
      const target = this.angleToTarget();
      let rotated = true;
      if (this.rotation > target - 0.3 && this.rotation < target + 0.3) {
        this.rotation = target;
        rotated = false;
      } else if (this.rotation < 180) {
        const halfway = this.rotation + 180;
        this.rotate(target > this.rotation && target < halfway ? this.rotationSpeed * ticks : -this.rotationSpeed * ticks);
      } else {
        const halfway = this.rotation - 180;
        this.rotate(target < this.rotation && target > halfway ? -this.rotationSpeed * ticks : this.rotationSpeed * ticks);
      }

      const close = new Circle(this.x, this.y, 50);
      if (close.contactsPoint(this.targetX, this.targetY)) {
        this.speed = Math.max(0.03, this.speed - 0.0002 * ticks);
        this.rotationSpeed = 0.4;
      } else if (this.time > 1500 && this.time <= 3500) this.rotationSpeed = 0.4;

      this.blast.set(this.x, this.y, 4);
      if (this.blast.contactsPoint(this.targetX, this.targetY) || this.time > 6000) {
        this.exploding = true;
        this.x = this.targetX;
        this.y = this.targetY;
        this.trailFading = true;
        this.needSound = true;
      }
      if (this.time > 3500) {
        this.speed = 0.01;
        this.rotationSpeed = 0.4;
      }

      this.forceX *= 0.9;
      this.forceY *= 0.9;
      this.forceX += this.speed * ticks * cosD(this.rotation);
      this.forceY += this.speed * ticks * sinD(this.rotation);
      this.x += this.forceX;
      this.y += this.forceY;
      if (rotated || this.trail.length < 2) {
        if (this.trail.length < 100) this.trail.push({ x: this.x, y: this.y });
        else this.trailFading = true;
      }
    } else if (this.exploding) {
      this.blast.r += 0.1 * ticks;
      if (this.blast.r > 12) {
        this.blast.r = 12;
        this.exploding = false;
        this.fading = this.trailFading;
        if (!this.fading) this.active = false;
      }
    } else if (this.fading && this.trailAlpha <= 0) {
      this.active = false;
      this.fading = false;
    }
    this.blast.moveTo(this.x, this.y);
  }

  draw(ctx) {
    if (!this.active) return;
    setLine(ctx, rgba(1, 1, 1, this.trailAlpha), 3);
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    for (let i = this.trail.length - 1; i >= 0; i--) ctx.lineTo(this.trail[i].x, this.trail[i].y);
    ctx.stroke();

    const c = this.color;
    if (!this.exploding && !this.fading) {
      ctx.fillStyle = rgba(c.r, c.g, c.b, c.a);
      ctx.fillRect(this.targetX - 1, this.targetY - 1, 2, 2);
      polyline(ctx, [0, -2, 0, 2, 6, 0, 0, -2], { x: this.x, y: this.y, rot: this.rotation, color: rgba(c.r, c.g, c.b, c.a), width: 2 });
    } else if (this.exploding) {
      const r = this.blast.r;
      polyline(ctx, [-r, 0, 0, -r, r, 0, 0, r, -r, 0], { x: this.x, y: this.y, rot: this.rotation, color: rgba(c.r, c.g, c.b, c.a), width: 2 });
    }
  }
}

class MissileControl {
  constructor(color) {
    this.missiles = Array.from({ length: 50 }, () => new Missile(color));
  }

  reset() {
    this.missiles.forEach((m) => m.makeInactive());
  }

  launch(x, y, rotation, tx, ty) {
    const m = this.missiles.find((candidate) => !candidate.active);
    if (!m) return false;
    m.moveTo(x, y);
    m.setRotation(rotation);
    m.launch(tx, ty);
    return true;
  }

  animate(ticks) {
    this.missiles.forEach((m) => m.animate(ticks));
  }

  draw(ctx) {
    this.missiles.forEach((m) => m.draw(ctx));
  }

  anyCollisionWithCircle(circle) {
    return this.missiles.some((m) => m.exploding && m.blast.contactsCircle(circle));
  }

  anyCollisionWithPoint(x, y) {
    return this.missiles.some((m) => m.exploding && m.blast.contactsPoint(x, y));
  }

  allInactive() {
    return this.missiles.every((m) => !m.active);
  }

  explodeSound() {
    const m = this.missiles.find((candidate) => candidate.needSound);
    if (!m) return false;
    m.needSound = false;
    return true;
  }
}

class Destroyer {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = 0;
    this.y = 0;
    this.targetX = 0;
    this.targetY = 0;
    this.rotation = 0;
    this.targetRotation = 0;
    this.collision = new Circle(0, 0, 16);
    this.active = false;
    this.movementSpeed = 0.05;
    this.rotationSpeed = 0.2;
    this.delay = 0;
    this.wait = 1000;
    this.commandCompleted = true;
    this.commandStarted = false;
    this.moving = false;
    this.rotating = false;
    this.delaying = false;
    this.waiting = false;
    this.delayTime = 0;
    this.waitTime = 0;
    this.setDirectionOfAdvance({ dx: -1, dy: -1 });
  }

  setDirectionOfAdvance(v) {
    this.advance = v;
    this.retreat = { dx: -v.dx, dy: -v.dy };
    this.left = { dx: v.dy, dy: -v.dx };
    this.right = { dx: -v.dy, dy: v.dx };
    const angle = (vec) => {
      if (vec.dx === 1 && vec.dy === 0) return 0;
      if (vec.dx === 1 && vec.dy === 1) return 45;
      if (vec.dx === 0 && vec.dy === 1) return 90;
      if (vec.dx === -1 && vec.dy === 1) return 135;
      if (vec.dx === -1 && vec.dy === 0) return 180;
      if (vec.dx === -1 && vec.dy === -1) return 225;
      if (vec.dx === 0 && vec.dy === -1) return 270;
      return 315;
    };
    this.rotAdvance = angle(this.advance);
    this.rotRight = angle(this.right);
    this.rotRetreat = angle(this.retreat);
    this.rotLeft = angle(this.left);
  }

  moveTo(x, y) {
    this.x = x;
    this.y = y;
    this.collision.moveTo(x, y);
  }

  setRotationTowardsTarget() {
    this.rotation = this.rotAdvance;
  }

  rotate(deg) {
    this.rotation = (this.rotation + deg + 360) % 360;
  }

  rotateTowardsTarget(deg) {
    if (this.rotation > this.targetRotation - 1 && this.rotation < this.targetRotation + 1) {
      this.rotation = this.targetRotation;
      return true;
    }
    if (this.rotation < 180) {
      const halfway = this.rotation + 180;
      this.rotate(this.targetRotation > this.rotation && this.targetRotation < halfway ? deg : -deg);
    } else {
      const halfway = this.rotation - 180;
      this.rotate(this.targetRotation < this.rotation && this.targetRotation > halfway ? -deg : deg);
    }
    return false;
  }

  commandVector(command) {
    if (command === DC.ADVANCE) return [this.advance, this.rotAdvance];
    if (command === DC.RETREAT) return [this.retreat, this.rotRetreat];
    if (command === DC.FLANK_LEFT) return [this.left, this.rotLeft];
    if (command === DC.FLANK_RIGHT) return [this.right, this.rotRight];
    if (command === DC.REVERSE) return [this.retreat, this.rotAdvance];
    return [{ dx: 0, dy: 0 }, this.rotation];
  }

  destinationCircle(command = null) {
    if (command === null) return new Circle(this.targetX, this.targetY, this.collision.r);
    const [v] = this.commandVector(command);
    return new Circle(this.x + v.dx * 32, this.y + v.dy * 32, this.collision.r);
  }

  doCommand(command) {
    this.commandCompleted = false;
    this.commandStarted = false;
    if (command === DC.WAIT || command === DC.SHOOT) {
      this.waitTime = this.wait;
      this.delayTime = this.delay;
      this.rotating = false;
      this.moving = false;
      this.delaying = false;
      this.waiting = true;
      this.commandStarted = true;
      return;
    }
    if (command === DC.EXPLODE) {
      this.reset();
      this.active = false;
      return;
    }
    const [v, rot] = this.commandVector(command);
    this.dx = v.dx * this.movementSpeed;
    this.dy = v.dy * this.movementSpeed;
    this.targetX = this.x + v.dx * 32;
    this.targetY = this.y + v.dy * 32;
    this.targetRotation = rot;
    this.rotating = this.rotation !== rot;
    this.moving = !this.rotating;
    this.delaying = false;
    this.delayTime = this.delay;
    this.commandStarted = true;
  }

  animate(ticks) {
    if (!this.active || this.commandCompleted) return;
    if (this.rotating && this.rotateTowardsTarget(this.rotationSpeed * ticks)) {
      this.rotating = false;
      this.moving = true;
    }
    if (this.moving && this.moveTowardsTarget(ticks)) {
      this.moving = false;
      this.delaying = true;
    }
    if (this.waiting) {
      this.waitTime -= ticks;
      if (this.waitTime <= 0) {
        this.waiting = false;
        this.delaying = true;
      }
    }
    if (this.delaying) {
      this.delayTime -= ticks;
      if (this.delayTime <= 0) {
        this.delaying = false;
        this.commandCompleted = true;
        this.commandStarted = false;
      }
    }
  }

  moveTowardsTarget(ticks) {
    this.x += this.dx * ticks;
    this.y += this.dy * ticks;
    if (this.dx < 0 && this.x < this.targetX) this.x = this.targetX;
    if (this.dx > 0 && this.x > this.targetX) this.x = this.targetX;
    if (this.dy < 0 && this.y < this.targetY) this.y = this.targetY;
    if (this.dy > 0 && this.y > this.targetY) this.y = this.targetY;
    this.collision.moveTo(this.x, this.y);
    return this.x === this.targetX && this.y === this.targetY;
  }

  draw(ctx) {
    if (!this.active) return;
    polyline(ctx, DESTROYER_POINTS, { x: this.x, y: this.y, rot: this.rotation, color: rgba(1, 0, 0.1, 0.6), width: 2 });
  }
}

class DestroyerControl {
  constructor(grid, rng) {
    this.grid = grid;
    this.rng = rng;
    this.d = Array.from({ length: 30 }, () => new Destroyer());
    this.missiles = new MissileControl({ r: 1, g: 0, b: 0.1, a: 0.3 });
    this.reset();
  }

  reset() {
    this.d.forEach((destroyer) => destroyer.reset());
    this.currentDestroyer = 0;
    this.stopped = true;
    this.stopping = false;
    this.missiles.reset();
    this.enterBorder = { begin: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
    this.advanceVector = { dx: 1, dy: 0 };
  }

  init(border, vector) {
    this.enterBorder = {
      begin: { x: Math.min(border.begin.x, border.end.x), y: Math.min(border.begin.y, border.end.y) },
      end: { x: Math.max(border.begin.x, border.end.x), y: Math.max(border.begin.y, border.end.y) },
    };
    this.advanceVector = vector;
    this.d.forEach((destroyer) => destroyer.setDirectionOfAdvance(vector));
  }

  launch(numberToLaunch) {
    let availableIndex = 0;
    let unlaunched = 0;
    for (let i = 0; i < numberToLaunch; i++) {
      while (availableIndex < this.d.length && this.d[availableIndex].active) availableIndex++;
      if (availableIndex >= this.d.length) {
        unlaunched++;
        continue;
      }
      let tries = 0;
      do {
        tries++;
        const rx = this.rng.generate(this.enterBorder.begin.x | 0, this.enterBorder.end.x | 0);
        const ry = this.rng.generate(this.enterBorder.begin.y | 0, this.enterBorder.end.y | 0);
        const lx = Math.floor(rx / 32) * 32 + 16;
        const ly = Math.floor(ry / 32) * 32 + 16;
        this.d[availableIndex].moveTo(lx, ly);
      } while (this.collidesWithOthers(availableIndex) && tries <= 500);
      if (tries > 500) unlaunched++;
      else {
        this.d[availableIndex].active = true;
        this.d[availableIndex].setDirectionOfAdvance(this.advanceVector);
        this.d[availableIndex].setRotationTowardsTarget();
        this.d[availableIndex].targetX = this.d[availableIndex].x;
        this.d[availableIndex].targetY = this.d[availableIndex].y;
      }
      availableIndex++;
    }
    return unlaunched;
  }

  collidesWithOthers(index) {
    return this.d.some((other, i) => i !== index && other.active && other.collision.contactsCircle(this.d[index].collision));
  }

  go() {
    this.stopping = false;
    this.stopped = false;
  }

  stop() {
    this.stopping = true;
    this.stopped = false;
  }

  allInactive() {
    return this.d.every((destroyer) => !destroyer.active);
  }

  getNextCollisionCircle() {
    while (this.currentDestroyer < this.d.length && !this.d[this.currentDestroyer].active) this.currentDestroyer++;
    if (this.currentDestroyer >= this.d.length) {
      this.currentDestroyer = 0;
      return { id: -1, circle: new Circle(0, 0, 0) };
    }
    const id = this.currentDestroyer++;
    return { id, circle: this.d[id].collision };
  }

  damage(id) {
    if (id >= 0 && id < this.d.length) this.d[id].doCommand(DC.EXPLODE);
  }

  animate(ticks) {
    if (this.stopped) return;
    for (const destroyer of this.d) {
      if (!destroyer.active) continue;
      if (destroyer.x > W - SECTOR || destroyer.x < SECTOR || destroyer.y > H - SECTOR || destroyer.y < SECTOR) {
        destroyer.active = false;
        continue;
      }
      if (destroyer.commandCompleted && !this.stopping) {
        let command = this.rng.generate(0, 15);
        if (command > 6 && command <= 11) command = DC.ADVANCE;
        else if (command > 11) command = DC.SHOOT;

        if ([DC.ADVANCE, DC.RETREAT, DC.REVERSE, DC.FLANK_LEFT, DC.FLANK_RIGHT].includes(command)) {
          const circle = destroyer.destinationCircle(command);
          const blocked = circle.x > W - SECTOR || circle.x < SECTOR || circle.y > H - SECTOR || circle.y < SECTOR || this.d.some((other) => other !== destroyer && other.active && circle.contactsCircle(other.destinationCircle()));
          if (blocked) command = DC.WAIT;
        }

        if (command === DC.SHOOT) {
          const shields = [];
          for (let y = 0; y < YS; y++) for (let x = 0; x < XS; x++) if (this.grid.get(x, y) === ST.SHIELD) shields.push({ x, y });
          if (shields.length) {
            const target = shields[this.rng.generate(0, shields.length - 1)];
            this.missiles.launch(destroyer.x, destroyer.y, destroyer.rotation, target.x * SECTOR + 8, target.y * SECTOR + 8);
          } else command = DC.WAIT;
        }
        destroyer.doCommand(command);
      }
      destroyer.animate(ticks);
    }

    this.missiles.animate(ticks);
    for (let y = 0; y < YS; y++) {
      for (let x = 0; x < XS; x++) {
        if (this.grid.get(x, y) === ST.SHIELD && this.missiles.anyCollisionWithPoint(x * SECTOR + 8, y * SECTOR + 8)) {
          this.grid.set(x, y, ST.VACANT);
        }
      }
    }

    if (this.stopping) {
      this.stopped = this.d.every((destroyer) => !destroyer.active || destroyer.commandCompleted) && this.missiles.allInactive();
      this.stopping = !this.stopped;
    }
  }

  draw(ctx) {
    this.d.forEach((destroyer) => destroyer.draw(ctx));
    this.missiles.draw(ctx);
  }
}

class ShieldSection {
  constructor(grid, rng) {
    this.grid = grid;
    this.rng = rng;
    this.totalShapes = 11;
    this.color = { r: 1, g: 1, b: 0, a: 0.6 };
    this.centerX = 0;
    this.centerY = 0;
    this.rotation = 0;
    this.rotating = false;
    this.queue = 0;
    this.osGlow = 0;
    this.reshape(0);
  }

  move(x, y) {
    this.centerX = x;
    this.centerY = y;
  }

  reshape(shape) {
    this.shape = shape;
    this.sector = new Array(25).fill(ST.VACANT);
    this.offending = new Array(25).fill(ST.VACANT);
    const on = (...idx) => idx.forEach((i) => (this.sector[i] = ST.SHIELD));
    if (shape === 0) on(12);
    if (shape === 1) on(12, 13);
    if (shape === 2) on(12, 13, 7);
    if (shape === 3) on(12, 13, 7, 8);
    if (shape === 4) on(12, 7, 17, 18, 8);
    if (shape === 5) on(12, 7, 8, 17);
    if (shape === 6) on(12, 7, 6, 13);
    if (shape === 7) on(12, 7, 8, 11);
    if (shape === 8) on(12, 7, 8, 17, 16);
    if (shape === 9) on(12, 7, 6, 17, 18);
    if (shape === 10) on(12, 7, 8, 17, 18);
  }

  rotate() {
    if (this.rotating) this.queue++;
    this.rotating = true;
  }

  rotateFinish() {
    const out = new Array(25);
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) out[y * 5 + x] = this.sector[(4 - x) * 5 + y];
    }
    this.sector = out;
  }

  animate(ticks) {
    if (this.rotating) {
      this.rotation += 0.5 * ticks;
      if (this.rotation >= 90) {
        this.rotation = 0;
        this.rotating = false;
        this.rotateFinish();
        if (this.queue > 0) {
          this.queue--;
          this.rotate();
        }
      }
    }
    this.osGlow = Math.max(0, this.osGlow - 0.003 * ticks);
  }

  fitIntoGrid() {
    if (this.rotation !== 0) return false;
    const fill = [];
    let fits = true;
    this.offending = new Array(25).fill(ST.VACANT);
    const left = this.centerX - 2 * SECTOR;
    const top = this.centerY - 2 * SECTOR;
    for (let i = 0; i < 25; i++) {
      if (this.sector[i] !== ST.SHIELD) continue;
      const x = left + (i % 5) * SECTOR;
      const y = top + Math.floor(i / 5) * SECTOR;
      if (x >= 0 && x <= W && y >= 0 && y <= H) {
        const idx = this.grid.sectorOnDot(x, y);
        const value = this.grid.sector[idx];
        if (value === ST.VACANT || value === ST.INSIDE) fill.push(idx);
        else {
          this.offending[i] = ST.SHIELD;
          fits = false;
        }
      } else fits = false;
    }
    if (fits) fill.forEach((idx) => (this.grid.sector[idx] = ST.SHIELD));
    else this.osGlow = 1;
    return fits;
  }

  draw(ctx, aligned = false, scale = 1, alpha = null) {
    let cx = this.centerX;
    let cy = this.centerY;
    if (aligned) {
      const d = this.grid.cornerDiffFromDot(cx, cy);
      cx += d.dx;
      cy += d.dy;
    }
    const { r, g, b, a } = this.color;
    const opacity = alpha ?? a;
    const left = -2 * SECTOR - SECTOR / 2;
    const top = -2 * SECTOR - SECTOR / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.rotate((this.rotation * Math.PI) / 180);
    setLine(ctx, rgba(r, g, b, opacity), 2);
    for (let i = 0; i < 25; i++) {
      if (this.sector[i] !== ST.SHIELD) continue;
      const x = left + (i % 5) * SECTOR;
      const y = top + Math.floor(i / 5) * SECTOR;
      this.drawShapeCell(ctx, i, x, y, this.sector);
    }
    if (this.osGlow > 0) {
      ctx.fillStyle = rgba(this.osGlow, 0.1, 0.1, clamp(opacity + 0.2, 0, 1));
      for (let i = 0; i < 25; i++) {
        if (this.offending[i] === ST.SHIELD) ctx.fillRect(left + (i % 5) * SECTOR + 7, top + Math.floor(i / 5) * SECTOR + 7, 4, 4);
      }
    }
    ctx.restore();
  }

  drawShapeCell(ctx, i, x, y, arr) {
    const sx = i % 5;
    const sy = Math.floor(i / 5);
    const has = (dx, dy) => sx + dx >= 0 && sx + dx < 5 && sy + dy >= 0 && sy + dy < 5 && arr[(sy + dy) * 5 + sx + dx] === ST.SHIELD;
    const edge = (x1, y1, x2, y2) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    if (!has(0, -1)) edge(x, y, x + SECTOR, y);
    if (!has(-1, 0)) edge(x, y, x, y + SECTOR);
    if (!has(1, 0)) edge(x + SECTOR, y, x + SECTOR, y + SECTOR);
    if (!has(0, 1)) edge(x, y + SECTOR, x + SECTOR, y + SECTOR);
  }
}

class GameUtil {
  constructor(game) {
    this.game = game;
  }

  testForEnclosures() {
    const { game } = this;
    game.totalEnclosures = 0;
    for (const barge of game.barges) {
      const bx = Math.floor(barge.x / SECTOR);
      const by = Math.floor(barge.y / SECTOR);
      if (this.canGetToOutsideFrom(bx, by)) this.deactivateFrom(bx, by);
      else {
        this.activateFrom(bx, by);
        game.totalEnclosures++;
      }
    }
    for (const barge of game.barges) {
      const bx = Math.floor(barge.x / SECTOR);
      const by = Math.floor(barge.y / SECTOR);
      barge.active = game.grid.get(bx, by) === ST.ACTIVE_OBJECT;
    }
    for (const gun of game.guns) {
      const bx = Math.floor(gun.x / SECTOR);
      const by = Math.floor(gun.y / SECTOR);
      if (game.grid.get(bx, by) === ST.INACTIVE_OBJECT) gun.active = false;
      else if (game.grid.get(bx, by) === ST.ACTIVE_OBJECT) gun.active = true;
    }
  }

  flood(startX, startY, visit) {
    const touched = Array.from({ length: XS }, () => new Array(YS).fill(false));
    const stack = [[startX, startY]];
    let reachedOutside = false;
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || x >= XS || y < 0 || y >= YS) {
        reachedOutside = true;
        continue;
      }
      if (touched[x][y]) continue;
      const value = this.game.grid.get(x, y);
      if (value === ST.OUT_OF_RANGE) {
        reachedOutside = true;
        continue;
      }
      if (value === ST.SHIELD) continue;
      touched[x][y] = true;
      if (visit) visit(x, y, value);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) stack.push([x + dx, y + dy]);
    }
    return reachedOutside;
  }

  canGetToOutsideFrom(x, y) {
    return this.flood(x, y, null);
  }

  deactivateFrom(x, y) {
    this.flood(x, y, (sx, sy, value) => {
      if (value === ST.ACTIVE_OBJECT) this.game.grid.set(sx, sy, ST.INACTIVE_OBJECT);
      if (value === ST.INSIDE) this.game.grid.set(sx, sy, ST.VACANT);
    });
  }

  activateFrom(x, y) {
    this.flood(x, y, (sx, sy, value) => {
      if (value === ST.INACTIVE_OBJECT) this.game.grid.set(sx, sy, ST.ACTIVE_OBJECT);
      if (value === ST.VACANT) this.game.grid.set(sx, sy, ST.INSIDE);
    });
  }
}

class TitlePhase {
  constructor(game, isGameOver = false) {
    this.game = game;
    this.isGameOver = isGameOver;
  }

  start() {
    this.done = false;
    this.time = 0;
    this.showing = false;
    this.erasing = false;
    this.titleY = 300;
    this.titleAlpha = 0.8;
    this.titleScaleX = 50;
    this.titleScaleY = 8;
    this.titleGlow = 0;
    this.game.audio.playMusic(this.isGameOver ? "gameover" : "title");
  }

  pointerDown() {
    if (this.showing) {
      this.erasing = true;
      this.showing = false;
      this.timeEnded = this.time;
      this.game.audio.fadeOut(400);
    }
  }

  animate(ticks) {
    this.time += ticks;
    if (this.time > 500 && !this.erasing && !this.showing) {
      this.showing = true;
      this.timeStarted = 500;
    }
    if (this.showing) {
      const t = clamp((this.time - this.timeStarted) / 500, 0, 1);
      this.titleScaleX = 50 - 47 * t;
      this.titleGlow = this.time < this.timeStarted + 1000 && this.time > this.timeStarted + 500 ? 1 - (this.time - this.timeStarted - 500) / 500 : 0;
    }
    if (this.erasing) {
      const t = clamp((this.time - this.timeEnded) / 500, 0, 1);
      this.titleY = 300 - 200 * t;
      this.titleAlpha = 0.8 * (1 - t);
      this.titleScaleY = 8 + 30 * t;
      if (t >= 1) this.done = true;
    }
  }

  draw(ctx) {
    if (!this.showing && !this.erasing) return;
    const title = this.isGameOver ? "G A M E  O V E R" : "SPACE BARRAGE";
    const titleScaleX = this.titleScaleX / 3;
    const titleScaleY = this.titleScaleY / 3;
    if (this.isGameOver) this.game.drawWorld(ctx);
    drawCenteredVectorText(ctx, title, this.titleY, titleScaleX, titleScaleY, rgba(this.isGameOver ? 1 : 1, this.isGameOver ? 0.2 : 1, this.isGameOver ? 0.2 : 0.2, this.titleAlpha), this.titleGlow);
    if (!this.isGameOver) {
      drawCenteredVectorText(ctx, "CLICK TO BEGIN", 500, 1.5, 1.5, rgba(0.5, 0.5, 1, this.titleAlpha));
    } else {
      drawCenteredVectorText(ctx, `You made it to level ${this.game.currentLevel}.`, 700, 1.1, 1.1, rgba(1, 1, 1, this.titleAlpha));
    }
  }
}

class SetStagePhase {
  constructor(game) {
    this.game = game;
  }

  start() {
    this.done = false;
    this.time = 0;
    this.secondsLeft = 10;
    this.waitingForChoice = false;
    this.bargesShowing = 0;
    this.enemyShowing = false;
    this.shieldsBuilding = false;
    this.shieldRow = 0;
    this.game.currentWave = 1;
    this.title = new PhaseTitle(this.game, () => `STAGE ${this.game.currentLevel} WAVE ${this.game.currentWave}`);
    this.initStage();
  }

  initStage() {
    const g = this.game;
    g.grid.reset(ST.OUT_OF_RANGE);
    let startX, endX, startY, endY, changeStart, changeEnd;
    const layout = g.currentLevel === 1 ? g.rng.generate(1, 2) : g.currentLevel === 2 ? g.rng.generate(1, 4) : g.rng.generate(1, 8);
    g.stageLayout = layout;
    if (layout === 1) {
      startX = 0; endX = XS / 2 - 5; startY = 0; endY = YS - 1; changeStart = 0; changeEnd = 0; g.enemyAdvanceVector = { dx: -1, dy: 0 }; g.enemyBorder = { begin: { x: W - 32, y: 0 }, end: { x: W - 32, y: H - 32 } };
    } else if (layout === 2) {
      startX = XS / 2 + 5; endX = XS - 1; startY = 0; endY = YS - 1; changeStart = 0; changeEnd = 0; g.enemyAdvanceVector = { dx: 1, dy: 0 }; g.enemyBorder = { begin: { x: 0, y: 0 }, end: { x: 0, y: H - 32 } };
    } else if (layout === 3) {
      startX = 0; endX = XS - 1; startY = 0; endY = YS / 2 - 3; changeStart = 0; changeEnd = 0; g.enemyAdvanceVector = { dx: 0, dy: -1 }; g.enemyBorder = { begin: { x: 0, y: H - 32 }, end: { x: W - 32, y: H - 32 } };
    } else if (layout === 4) {
      startX = 0; endX = XS - 1; startY = YS / 2 + 3; endY = YS - 1; changeStart = 0; changeEnd = 0; g.enemyAdvanceVector = { dx: 0, dy: 1 }; g.enemyBorder = { begin: { x: 0, y: 0 }, end: { x: W - 32, y: 0 } };
    } else if (layout === 5) {
      startX = 0; endX = XS - 17; startY = 0; endY = YS - 1; changeStart = 0; changeEnd = -1; g.enemyAdvanceVector = { dx: -1, dy: -1 }; g.enemyBorder = { begin: { x: W - 32, y: 0 }, end: { x: W - 32, y: H - 32 } };
    } else if (layout === 6) {
      startX = XS - 2; endX = XS - 1; startY = 0; endY = YS - 1; changeStart = -1; changeEnd = 0; g.enemyAdvanceVector = { dx: 1, dy: 1 }; g.enemyBorder = { begin: { x: 0, y: 0 }, end: { x: 0, y: H - 32 } };
    } else if (layout === 7) {
      startX = 0; endX = 1; startY = 0; endY = YS - 1; changeStart = 0; changeEnd = 1; g.enemyAdvanceVector = { dx: -1, dy: 1 }; g.enemyBorder = { begin: { x: W - 32, y: 0 }, end: { x: W - 32, y: H - 32 } };
    } else {
      startX = 12; endX = XS - 1; startY = 0; endY = YS - 1; changeStart = 1; changeEnd = 0; g.enemyAdvanceVector = { dx: 1, dy: -1 }; g.enemyBorder = { begin: { x: 0, y: 0 }, end: { x: 0, y: H - 32 } };
    }
    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) g.grid.set(x, y, ST.VACANT);
      startX += changeStart;
      endX += changeEnd;
    }
    g.destroyers.reset();
    g.destroyers.init(g.enemyBorder, g.enemyAdvanceVector);
    g.destroyers.launch(Math.floor((20 + g.currentLevel * clamp(Math.floor(g.currentLevel / 4), 1, 200)) * 0.2));

    const rotation = g.rng.generate(0, 359);
    for (const barge of g.barges) {
      barge.active = false;
      barge.setRotation(rotation);
    }
    for (const barge of g.barges) {
      let tries = 1000;
      do {
        tries--;
      } while (!barge.fitIntoGrid(g.rng.generate(0, W), g.rng.generate(0, H)) && tries > 0);
    }
    g.guns.forEach((gun) => gun.reset());
    g.indexOfLastGun = -1;
  }

  pointerDown() {
    if (this.waitingForChoice) {
      for (let i = 0; i < this.game.barges.length; i++) {
        if (this.game.barges[i].pointIsInBarge(this.game.pointer.x, this.game.pointer.y)) {
          this.chosenBarge = i;
          this.waitingForChoice = false;
          this.shieldsBuilding = true;
          this.shieldRow = 0;
          this.timeChoiceEnded = this.time;
        }
      }
    } else if (this.time > 200) {
      this.waitingForChoice = true;
      this.timeChoiceStarted = this.time;
      this.bargesShowing = 5;
      this.enemyShowing = true;
      this.title.start(this.timeChoiceStarted);
    }
  }

  animate(ticks) {
    this.time += ticks;
    if (this.time > 500 && this.bargesShowing === 0) { this.bargesShowing = 1; this.game.audio.play("tactical1"); }
    if (this.time > 1500 && this.bargesShowing === 1) { this.bargesShowing = 2; this.game.audio.play("tactical1"); }
    if (this.time > 2500 && this.bargesShowing === 2) { this.bargesShowing = 3; this.game.audio.play("tactical1"); }
    if (this.time > 3500 && this.bargesShowing === 3) { this.bargesShowing = 4; this.game.audio.play("tactical2"); }
    if (this.time > 4500 && this.bargesShowing === 4) { this.bargesShowing = 5; this.game.audio.play("tactical3"); }
    if (this.time > 6000 && !this.enemyShowing) { this.enemyShowing = true; this.game.audio.play("tactical4"); }
    if (this.time > 6500 && this.enemyShowing && !this.shieldsBuilding && !this.waitingForChoice) {
      this.waitingForChoice = true;
      this.timeChoiceStarted = 6500;
      this.title.start(6500);
    }
    if (this.waitingForChoice) {
      this.title.animate(this.time, ticks);
      this.secondsLeft = 10 - Math.floor((this.time - this.timeChoiceStarted) / 1000);
      if (this.secondsLeft < 0) {
        this.chosenBarge = this.game.rng.generate(0, TOTAL_BARGES - 1);
        this.waitingForChoice = false;
        this.shieldsBuilding = true;
        this.shieldRow = 0;
        this.timeChoiceEnded = this.time;
      }
    }
    if (this.shieldsBuilding) this.animateShieldBuild();
  }

  animateShieldBuild() {
    const g = this.game;
    const b = g.barges[this.chosenBarge];
    if (this.shieldRow === 0) {
      const c = g.grid.sectorPointOnDot(b.x - SECTOR * 3 - 1, b.y - SECTOR * 3 - 1);
      this.shieldCorner = c;
      for (let i = 0; i < 8; i++) g.grid.set(c.x + i, c.y, ST.SHIELD);
      g.audio.play("shieldSection");
      this.shieldRow = 1;
    }
    const t = this.time - this.timeChoiceEnded;
    if (t > 300 && this.shieldRow === 1) {
      for (const y of [1, 2]) { g.grid.set(this.shieldCorner.x, this.shieldCorner.y + y, ST.SHIELD); g.grid.set(this.shieldCorner.x + 7, this.shieldCorner.y + y, ST.SHIELD); }
      g.audio.play("shieldSection"); this.shieldRow = 3;
    }
    if (t > 600 && this.shieldRow === 3) {
      for (const y of [3, 4]) { g.grid.set(this.shieldCorner.x, this.shieldCorner.y + y, ST.SHIELD); g.grid.set(this.shieldCorner.x + 7, this.shieldCorner.y + y, ST.SHIELD); }
      g.audio.play("shieldSection"); this.shieldRow = 5;
    }
    if (t > 900 && this.shieldRow === 5) {
      for (const y of [5, 6]) { g.grid.set(this.shieldCorner.x, this.shieldCorner.y + y, ST.SHIELD); g.grid.set(this.shieldCorner.x + 7, this.shieldCorner.y + y, ST.SHIELD); }
      g.audio.play("shieldSection"); this.shieldRow = 7;
    }
    if (t > 1300 && this.shieldRow === 7) {
      for (let i = 0; i < 8; i++) g.grid.set(this.shieldCorner.x + i, this.shieldCorner.y + 7, ST.SHIELD);
      g.audio.play("shieldSection"); g.audio.play("shieldBarrier");
      g.grid.testForClosure(); g.totalEnclosures = 1; g.barges[this.chosenBarge].active = true; this.shieldRow = 8;
    }
    if (t > 1800 && this.shieldRow === 8) this.done = true;
  }

  draw(ctx) {
    if (this.shieldsBuilding) {
      const b = this.game.barges[this.chosenBarge];
      this.game.grid.displayGrid(ctx, b.x, b.y, 100);
    }
    if (this.enemyShowing || this.waitingForChoice || this.shieldsBuilding) this.game.grid.displayShields(ctx);
    if (this.enemyShowing) this.game.destroyers.draw(ctx);
    for (let i = 0; i < this.bargesShowing; i++) this.game.barges[i].draw(ctx);
    if (this.waitingForChoice) {
      this.title.draw(ctx);
      drawTimer(ctx, this.secondsLeft);
      drawPointer(ctx, this.game.pointer.x, this.game.pointer.y);
    }
  }
}

class PhaseTitle {
  constructor(game, textFn) {
    this.game = game;
    this.textFn = textFn;
    this.x = 12;
    this.y = 745;
    this.alpha = 0.8;
    this.sx = 10;
    this.sy = 2;
    this.glow = 0;
  }

  start(time) {
    this.startTime = time;
    this.x = 12;
    this.y = 745;
    this.alpha = 0.8;
    this.sx = 10;
    this.sy = 2;
    this.glow = 0;
  }

  animate(time) {
    const t1 = clamp((time - this.startTime) / 500, 0, 1);
    this.sx = 10 - 9 * t1;
    if (time > this.startTime + 500 && time < this.startTime + 1000) this.glow = 1 - (time - this.startTime - 500) / 500;
    else this.glow = 0;
    if (time > this.startTime + 2500) {
      const t = clamp((time - this.startTime - 2500) / 500, 0, 1);
      this.y = 745 - 100 * t;
      this.alpha = 0.8 * (1 - t);
      this.sy = 2 + 10 * t;
    }
  }

  draw(ctx) {
    const text = this.textFn();
    if (this.y >= H - 80) {
      drawVectorText(ctx, text, this.x, this.y, this.sx, this.sy, rgba(1, 1, 1, this.alpha), this.glow);
    } else {
      drawCenteredVectorText(ctx, text, this.y, this.sx, this.sy, rgba(1, 1, 1, this.alpha), this.glow);
    }
  }
}

function drawTimer(ctx, seconds) {
  drawCenteredVectorText(ctx, String(Math.max(0, seconds)).padStart(2, "0"), HUD_TIMER_Y, 3.5 * HUD_SCALE, 3.5 * HUD_SCALE, rgba(1, 1, 1, HUD_OPACITY));
}

class PlaceGunsPhase {
  constructor(game) {
    this.game = game;
  }

  start() {
    this.done = false;
    this.time = 0;
    this.secondsLeft = 10;
    this.waitingForChoice = false;
    this.title = new PhaseTitle(this.game, () => "DEPLOY WEAPONS");
    let guns = this.game.barges.filter((b) => b.active).length * 2;
    if (this.game.currentLevel === 1) guns++;
    this.newGuns = guns - 1;
    this.indexOfGunPointer = this.game.indexOfLastGun + 1;
    if (this.indexOfGunPointer >= TOTAL_GUNS) this.done = true;
  }

  pointerDown(button) {
    if (!this.waitingForChoice) return;
    if (button === 2) {
      this.secondsLeft--;
      return;
    }
    const gun = this.game.guns[this.indexOfGunPointer];
    if (gun.fitIntoGrid()) {
      this.game.indexOfLastGun++;
      this.indexOfGunPointer = this.game.indexOfLastGun + 1;
      this.newGuns--;
      if (this.newGuns < 0 || this.indexOfGunPointer >= TOTAL_GUNS) this.done = true;
    } else this.game.audio.play("buzz");
  }

  keyDown(key) {
    if (key === " ") this.secondsLeft--;
  }

  animate(ticks) {
    if (this.done) return;
    this.time += ticks;
    const pointerGun = this.game.guns[this.indexOfGunPointer];
    pointerGun.moveTo(this.game.pointer.x, this.game.pointer.y);
    pointerGun.animate(ticks);
    for (let i = 0; i <= this.game.indexOfLastGun; i++) this.game.guns[i].animate(ticks);
    if (this.time > 500 && !this.waitingForChoice) {
      this.waitingForChoice = true;
      this.timeChoiceStarted = 500;
      this.title.start(500);
    }
    if (this.waitingForChoice) {
      this.title.animate(this.time);
      this.secondsLeft = Math.min(this.secondsLeft, 10 - Math.floor((this.time - this.timeChoiceStarted) / 1000));
      if (this.secondsLeft < 0) this.done = true;
    }
  }

  draw(ctx) {
    this.game.drawWorld(ctx);
    if (this.waitingForChoice && !this.done) {
      this.title.draw(ctx);
      drawTimer(ctx, this.secondsLeft);
      this.drawRemainingGuns(ctx);
      const gun = this.game.guns[this.indexOfGunPointer];
      gun.drawSquareInGrid(ctx);
      gun.draw(ctx);
    }
  }

  drawRemainingGuns(ctx) {
    const gun = this.game.guns[this.indexOfGunPointer];
    const ox = gun.x;
    const oy = gun.y;
    const count = Math.max(0, this.newGuns);
    const spacing = (SECTOR * 2 + 5) * HUD_SCALE;
    const startX = W / 2 - ((count - 1) * spacing) / 2;
    for (let i = this.newGuns; i > 0; i--) {
      gun.moveTo(startX + (this.newGuns - i) * spacing, HUD_PREVIEW_Y);
      gun.draw(ctx, HUD_OPACITY, HUD_SCALE);
    }
    gun.moveTo(ox, oy);
  }
}

class BattlePhase {
  constructor(game) {
    this.game = game;
  }

  start() {
    this.done = false;
    this.time = 0;
    this.secondsLeft = 15;
    this.battling = false;
    this.waitingForMissiles = false;
    this.title = new PhaseTitle(this.game, () => "OPEN FIRE!");
    this.game.audio.playMusic("battle");
  }

  pointerDown() {
    if (!this.battling) return;
    this.fire();
  }

  keyDown(key) {
    if (key === " ") this.fire();
  }

  fire() {
    if (!this.battling) return;
    let fired = false;
    for (let i = 0; i <= this.game.indexOfLastGun; i++) {
      const gun = this.game.guns[i];
      if (gun.active && !gun.reloading && this.game.playerMissiles.launch(gun.x, gun.y, gun.rotation, this.game.pointer.x, this.game.pointer.y)) {
        this.game.audio.play("playerMissile");
        gun.reload();
        fired = true;
        break;
      }
    }
    if (!fired) this.game.audio.play("click");
  }

  animate(ticks) {
    if (this.done) return;
    this.time += ticks;
    for (let i = 0; i <= this.game.indexOfLastGun; i++) this.game.guns[i].animate(ticks);
    this.game.playerMissiles.animate(ticks);
    if (this.game.playerMissiles.explodeSound()) this.game.audio.play("missileBlast");
    if (this.time > 500 && !this.battling && !this.waitingForMissiles) {
      this.battling = true;
      this.game.destroyers.go();
      this.timeBattleStarted = 500;
      this.title.start(500);
    }
    if (this.battling) {
      this.title.animate(this.time);
      this.secondsLeft = 15 - Math.floor((this.time - this.timeBattleStarted) / 1000);
      if (this.secondsLeft < 0) this.endBattle();
      this.game.destroyers.animate(ticks);
    }
    let next = this.game.destroyers.getNextCollisionCircle();
    while (next.id > -1) {
      if (this.game.playerMissiles.anyCollisionWithCircle(next.circle)) {
        this.game.destroyers.damage(next.id);
        this.game.audio.play("missileHit");
      }
      const gx = Math.floor(next.circle.x / SECTOR);
      const gy = Math.floor(next.circle.y / SECTOR);
      if (this.game.grid.get(gx, gy) !== ST.OUT_OF_RANGE) {
        this.game.gameover = true;
        this.done = true;
      }
      next = this.game.destroyers.getNextCollisionCircle();
    }
    if (this.battling && this.game.destroyers.allInactive()) this.endBattle();
    if (this.waitingForMissiles) {
      this.game.destroyers.animate(ticks);
      if (this.game.playerMissiles.allInactive() && this.game.destroyers.stopped) {
        this.waitingForMissiles = false;
        if (this.game.destroyers.allInactive() && this.game.currentWave >= 3) this.game.newWave = true;
        this.done = true;
      }
    }
  }

  endBattle() {
    this.secondsLeft = 0;
    this.battling = false;
    this.waitingForMissiles = true;
    this.game.destroyers.stop();
    this.game.audio.fadeOut();
  }

  draw(ctx) {
    this.game.drawWorld(ctx);
    this.game.playerMissiles.draw(ctx);
    if (this.battling) {
      this.title.draw(ctx);
      drawTimer(ctx, this.secondsLeft);
      drawPointer(ctx, this.game.pointer.x, this.game.pointer.y);
    }
  }
}

class PlaceShieldsPhase {
  constructor(game) {
    this.game = game;
    this.section = new ShieldSection(game.grid, game.rng);
    this.next = new ShieldSection(game.grid, game.rng);
    this.util = new GameUtil(game);
  }

  start() {
    this.done = false;
    this.time = 0;
    this.secondsLeft = 20;
    this.title = new PhaseTitle(this.game, () => "REPAIR SHIELDS");
    this.title.start(0);
    this.section.reshape(this.game.rng.generate(0, 10));
    this.section.move(0, 0);
    this.next.color = { r: 1, g: 1, b: 1, a: HUD_OPACITY };
    this.next.move(W / 2, HUD_PREVIEW_Y);
    this.nextShape = this.game.rng.generate(0, 10);
    this.next.reshape(this.nextShape);
    this.util.testForEnclosures();
    this.game.audio.playMusic("countdown");
  }

  pointerDown(button) {
    if (button === 2) {
      this.section.rotate();
      return;
    }
    if (this.section.fitIntoGrid()) {
      this.game.audio.play("shieldSection");
      this.section.reshape(this.nextShape);
      this.nextShape = this.game.rng.generate(0, 10);
      this.next.reshape(this.nextShape);
      const before = this.game.totalEnclosures;
      this.util.testForEnclosures();
      if (this.game.totalEnclosures > before) this.game.audio.play("shieldBarrier");
    } else this.game.audio.play("buzz");
  }

  keyDown(key) {
    if (key === " ") this.section.rotate();
  }

  animate(ticks) {
    this.time += ticks;
    this.section.move(this.game.pointer.x, this.game.pointer.y);
    this.section.animate(ticks);
    for (let i = 0; i <= this.game.indexOfLastGun; i++) this.game.guns[i].animate(ticks);
    this.title.animate(this.time);
    this.secondsLeft = 20 - Math.floor(this.time / 1000);
    if (this.secondsLeft < 0) {
      this.secondsLeft = 0;
      this.game.audio.stopMusic();
      this.done = true;
    }
  }

  draw(ctx) {
    this.title.draw(ctx);
    drawTimer(ctx, this.secondsLeft);
    this.game.grid.displayGrid(ctx, this.game.pointer.x, this.game.pointer.y, 100);
    this.game.drawWorld(ctx);
    this.section.draw(ctx, true);
    this.next.draw(ctx, false, HUD_SCALE, HUD_OPACITY);
  }
}

class NewWavePhase {
  constructor(game) {
    this.game = game;
    this.util = new GameUtil(game);
  }

  start() {
    this.done = false;
    this.time = 0;
    this.testing = true;
    this.showingTitle = false;
    this.addingEnemies = false;
    this.showingLevelComplete = false;
    this.title = new PhaseTitle(this.game, () => `WAVE ${this.game.currentWave}`);
    this.game.currentWave++;
    if (this.game.currentWave > 3 && this.game.destroyers.allInactive()) {
      this.showingLevelComplete = true;
      this.game.audio.playMusicOnce("levelComplete");
    } else {
      this.util.testForEnclosures();
      if (this.game.totalEnclosures <= 0) {
        this.game.gameover = true;
        this.done = true;
      }
    }
  }

  animate(ticks) {
    this.time += ticks;
    for (let i = 0; i <= this.game.indexOfLastGun; i++) this.game.guns[i].animate(ticks);
    if (this.time > 500 && this.testing && !this.showingLevelComplete) {
      this.showingTitle = true;
      this.testing = false;
      this.timeTitleStarted = 500;
      this.title.start(500);
    }
    if (this.showingTitle) {
      this.title.animate(this.time);
      if (this.time > this.timeTitleStarted + 3000) {
        this.showingTitle = false;
        this.addingEnemies = true;
        let count = 1;
        const total = 20 + this.game.currentLevel * clamp(Math.floor(this.game.currentLevel / 4), 1, 200);
        if (this.game.currentWave === 2) count = Math.floor(total * 0.3);
        if (this.game.currentWave === 3) count = Math.floor(total * 0.5);
        this.game.destroyers.launch(count);
        this.game.audio.play("tactical4");
      }
    }
    if (this.addingEnemies) this.done = true;
    if (this.showingLevelComplete && this.time > 3500) {
      this.game.currentLevel++;
      this.game.currentWave = 1;
      this.game.newStage = true;
      this.done = true;
    }
  }

  draw(ctx) {
    if (this.showingLevelComplete) {
      drawCenteredVectorText(ctx, `LEVEL ${this.game.currentLevel} COMPLETE`, 275, 3, 6, rgba(1, 1, 0.2, 0.5));
    } else {
      this.game.drawWorld(ctx);
      if (this.showingTitle) this.title.draw(ctx);
    }
  }
}

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.rng = new RNG(Date.now() >>> 0);
    this.audio = new AudioBus();
    this.pointer = { x: W / 2, y: H / 2 };
    this.grid = new ShieldGrid();
    this.barges = Array.from({ length: TOTAL_BARGES }, () => new Barge(this.grid));
    this.guns = Array.from({ length: TOTAL_GUNS }, () => new Gun(this.grid));
    this.playerMissiles = new MissileControl({ r: 1, g: 0.8, b: 0, a: 0.6 });
    this.destroyers = new DestroyerControl(this.grid, this.rng);
    this.phases = {
      title: new TitlePhase(this),
      setStage: new SetStagePhase(this),
      placeGuns: new PlaceGunsPhase(this),
      battle: new BattlePhase(this),
      placeShields: new PlaceShieldsPhase(this),
      newWave: new NewWavePhase(this),
      gameover: new TitlePhase(this, true),
    };
    this.reset();
    this.installInput();
    this.switchPhase("title");
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  reset() {
    this.gameover = false;
    this.newStage = false;
    this.newWave = false;
    this.currentWave = 1;
    this.currentLevel = 1;
    this.totalEnclosures = 0;
    this.indexOfLastGun = -1;
    this.grid.reset();
    this.playerMissiles.reset();
    this.destroyers.reset();
    this.guns.forEach((gun) => gun.reset());
  }

  switchPhase(name) {
    this.phaseName = name;
    this.phase = this.phases[name];
    this.phase.start();
  }

  nextPhase() {
    if (this.gameover) {
      this.gameover = false;
      this.switchPhase("gameover");
      return;
    }
    if (this.newStage) {
      this.newStage = false;
      this.switchPhase("setStage");
      return;
    }
    if (this.newWave) {
      this.newWave = false;
      this.switchPhase("newWave");
      return;
    }
    const map = {
      title: "setStage",
      setStage: "placeGuns",
      placeGuns: "battle",
      battle: "placeShields",
      placeShields: "newWave",
      newWave: "placeGuns",
      gameover: "title",
    };
    if (this.phaseName === "gameover") this.reset();
    this.switchPhase(map[this.phaseName]);
  }

  installInput() {
    const updatePointer = (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = clamp(((event.clientX - rect.left) / rect.width) * W, 0, W);
      this.pointer.y = clamp(((event.clientY - rect.top) / rect.height) * H, 0, H);
    };
    this.canvas.addEventListener("pointermove", updatePointer);
    this.canvas.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      updatePointer(event);
      this.audio.unlock();
      if (this.phase.pointerDown) this.phase.pointerDown(event.button === 2 ? 2 : 0);
    });
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    window.addEventListener("keydown", (event) => {
      if (event.key === " ") event.preventDefault();
      if (event.key.toLowerCase() === "m") {
        this.audio.enabled = !this.audio.enabled;
        if (!this.audio.enabled) this.audio.stopMusic();
      }
      this.audio.unlock();
      if (!event.repeat && this.phase.keyDown) this.phase.keyDown(event.key);
    });
  }

  frame(now) {
    const ticks = Math.min(50, now - this.last);
    this.last = now;
    this.phase.animate(ticks);
    if (this.phase.done) this.nextPhase();
    this.draw();
    requestAnimationFrame((t) => this.frame(t));
  }

  drawWorld(ctx) {
    this.grid.displayShields(ctx);
    this.destroyers.draw(ctx);
    this.barges.forEach((barge) => barge.draw(ctx));
    for (let i = 0; i <= this.indexOfLastGun; i++) this.guns[i].draw(ctx);
  }

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    this.phase.draw(ctx);
    ctx.globalCompositeOperation = "source-over";
  }
}

new Game(document.getElementById("game"));
