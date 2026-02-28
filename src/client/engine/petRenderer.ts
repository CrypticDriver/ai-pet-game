/**
 * Pet Canvas Renderer — inspired by OpenClaw-bot-review pixel-office engine
 * 
 * Key techniques adapted:
 * - Canvas 2D rendering with requestAnimationFrame
 * - Character animation state machine (idle/bounce/wave/spin)
 * - HSL color shifting for dynamic skin recoloring
 * - Offscreen canvas caching for performance
 */

// ── Types ──────────────────────────────────────────────────

export type PetAnimState = "idle" | "bounce" | "wave" | "spin" | "love" | "sleep" | "eat";

export interface PetCanvasConfig {
  width: number;
  height: number;
  pixelScale: number; // e.g. 4 = each "pixel" is 4x4 real pixels
}

export interface PetRenderState {
  animState: PetAnimState;
  frame: number;
  stateTime: number; // seconds in current state
  hueShift: number; // degrees, for skin color
  saturation: number; // 0-100
  brightness: number; // -100 to 100
  particles: Particle[];
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  emoji: string;
  size: number;
}

// ── Constants ──────────────────────────────────────────────

const BOUNCE_SPEED = 4; // Hz
const BOUNCE_HEIGHT = 8; // pixels
const WAVE_SPEED = 6;
const SPIN_SPEED = 2; // rotations per second
const PARTICLE_GRAVITY = 80;
const IDLE_BOB_SPEED = 1.5;
const IDLE_BOB_HEIGHT = 2;

// ── Color Utilities (from OpenClaw-bot-review colorize.ts) ──

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs(hp % 2 - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp < 1) { r1 = c; g1 = x; }
  else if (hp < 2) { r1 = x; g1 = c; }
  else if (hp < 3) { g1 = c; b1 = x; }
  else if (hp < 4) { g1 = x; b1 = c; }
  else if (hp < 5) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  const m = l - c / 2;
  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ];
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rf = r / 255, gf = g / 255, bf = b / 255;
  const max = Math.max(rf, gf, bf), min = Math.min(rf, gf, bf);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rf) h = ((gf - bf) / d + (gf < bf ? 6 : 0)) * 60;
  else if (max === gf) h = ((bf - rf) / d + 2) * 60;
  else h = ((rf - gf) / d + 4) * 60;
  return [h, s, l];
}

/**
 * Apply hue shift to an image on canvas (pixel-level manipulation)
 * Inspired by OpenClaw-bot-review's colorize.ts adjustSprite
 */
export function applyHueShift(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  hueShift: number,
  satShift = 0,
  brightShift = 0,
): void {
  if (hueShift === 0 && satShift === 0 && brightShift === 0) return;

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue; // skip transparent

    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    const newH = ((h + hueShift) % 360 + 360) % 360;
    const newS = Math.max(0, Math.min(1, s + satShift / 100));
    const newL = Math.max(0, Math.min(1, l + brightShift / 200));
    const [r, g, b] = hslToRgb(newH, newS, newL);

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }

  ctx.putImageData(imageData, 0, 0);
}

// ── Sprite Cache (from OpenClaw-bot-review spriteCache.ts) ──

const spriteCache = new Map<string, HTMLCanvasElement>();

export function getCachedSprite(
  key: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): HTMLCanvasElement {
  const cached = spriteCache.get(key);
  if (cached) return cached;

  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;
  const ctx = offscreen.getContext("2d")!;
  draw(ctx);
  spriteCache.set(key, offscreen);
  return offscreen;
}

export function clearSpriteCache(): void {
  spriteCache.clear();
}

// ── Particle System ──────────────────────────────────────

export function spawnParticles(
  state: PetRenderState,
  emoji: string,
  count: number,
  centerX: number,
  centerY: number,
): void {
  for (let i = 0; i < count; i++) {
    state.particles.push({
      x: centerX + (Math.random() - 0.5) * 40,
      y: centerY - 20,
      vx: (Math.random() - 0.5) * 60,
      vy: -(Math.random() * 40 + 30),
      life: 1.0,
      maxLife: 1.0 + Math.random() * 0.5,
      emoji,
      size: 12 + Math.random() * 8,
    });
  }
}

export function updateParticles(state: PetRenderState, dt: number): void {
  for (const p of state.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += PARTICLE_GRAVITY * dt;
    p.life -= dt / p.maxLife;
  }
  state.particles = state.particles.filter((p) => p.life > 0);
}

export function renderParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
): void {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.font = `${p.size}px sans-serif`;
    ctx.fillText(p.emoji, p.x, p.y);
  }
  ctx.globalAlpha = 1;
}

// ── Animation State Machine ──────────────────────────────

export function getAnimTransform(
  state: PetRenderState,
  centerX: number,
  centerY: number,
): { translateY: number; rotation: number; scaleX: number; scaleY: number } {
  const t = state.stateTime;
  switch (state.animState) {
    case "idle":
      return {
        translateY: Math.sin(t * IDLE_BOB_SPEED * Math.PI * 2) * IDLE_BOB_HEIGHT,
        rotation: 0,
        scaleX: 1,
        scaleY: 1 + Math.sin(t * IDLE_BOB_SPEED * Math.PI * 2) * 0.02,
      };
    case "bounce":
      return {
        translateY: -Math.abs(Math.sin(t * BOUNCE_SPEED * Math.PI)) * BOUNCE_HEIGHT,
        rotation: 0,
        scaleX: 1,
        scaleY: 1 + Math.sin(t * BOUNCE_SPEED * Math.PI * 2) * 0.05,
      };
    case "wave": {
      const wobble = Math.sin(t * WAVE_SPEED * Math.PI) * 8;
      return {
        translateY: 0,
        rotation: wobble * (Math.PI / 180),
        scaleX: 1,
        scaleY: 1,
      };
    }
    case "spin":
      return {
        translateY: 0,
        rotation: t * SPIN_SPEED * Math.PI * 2,
        scaleX: 1,
        scaleY: 1,
      };
    case "love":
      return {
        translateY: Math.sin(t * 3 * Math.PI) * 3,
        rotation: 0,
        scaleX: 1 + Math.sin(t * 4 * Math.PI) * 0.05,
        scaleY: 1 + Math.sin(t * 4 * Math.PI) * 0.05,
      };
    case "sleep":
      return {
        translateY: Math.sin(t * 0.8 * Math.PI * 2) * 2,
        rotation: Math.sin(t * 0.4 * Math.PI) * 3 * (Math.PI / 180),
        scaleX: 1,
        scaleY: 1,
      };
    case "eat":
      return {
        translateY: Math.abs(Math.sin(t * 6 * Math.PI)) * -4,
        rotation: 0,
        scaleX: 1,
        scaleY: 1 - Math.abs(Math.sin(t * 6 * Math.PI)) * 0.06,
      };
    default:
      return { translateY: 0, rotation: 0, scaleX: 1, scaleY: 1 };
  }
}

// ── Shadow Renderer ──────────────────────────────────────

export function renderShadow(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  baseY: number,
  width: number,
  bounceOffset: number,
): void {
  // Shadow shrinks as pet bounces up
  const shadowScale = 1 - Math.abs(bounceOffset) / (BOUNCE_HEIGHT * 2);
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
  ctx.beginPath();
  ctx.ellipse(
    centerX,
    baseY + 5,
    width * 0.4 * shadowScale,
    6 * shadowScale,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();
}

// ── Main Render Function ─────────────────────────────────

export function createPetRenderState(): PetRenderState {
  return {
    animState: "idle",
    frame: 0,
    stateTime: 0,
    hueShift: 0,
    saturation: 0,
    brightness: 0,
    particles: [],
  };
}

export function updatePetState(state: PetRenderState, dt: number): void {
  state.stateTime += dt;
  state.frame++;
  updateParticles(state, dt);
}
