/**
 * Canvas-backed text and glow helpers. Everything Lull shows is drawn here so
 * the experience ships with zero external art or font assets.
 */
import {
  CanvasTexture,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Texture,
} from '@iwsdk/core';

const FONT_STACK =
  '"Avenir Next", "Segoe UI", "Helvetica Neue", system-ui, sans-serif';

export interface LabelOptions {
  /** World height of one text line in meters. */
  lineHeight?: number;
  color?: string;
  weight?: number;
  maxWidthChars?: number;
  /** Soft backing pill behind the text for legibility over passthrough. */
  backing?: boolean;
  align?: 'center' | 'left';
}

export class Label {
  readonly mesh: Mesh;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: CanvasTexture;
  private material: MeshBasicMaterial;
  private opts: Required<LabelOptions>;
  private current = '';
  private pxPerLine = 64;

  constructor(text: string, opts: LabelOptions = {}) {
    this.opts = {
      lineHeight: opts.lineHeight ?? 0.022,
      color: opts.color ?? '#fff6e8',
      weight: opts.weight ?? 500,
      maxWidthChars: opts.maxWidthChars ?? 34,
      backing: opts.backing ?? true,
      align: opts.align ?? 'center',
    };
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.material = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
    });
    this.mesh = new Mesh(new PlaneGeometry(1, 1), this.material);
    this.mesh.renderOrder = 10;
    this.set(text);
  }

  set opacity(v: number) {
    this.material.opacity = v;
    this.mesh.visible = v > 0.01;
  }

  get opacity(): number {
    return this.material.opacity;
  }

  set(text: string): void {
    if (text === this.current) return;
    this.current = text;
    const { ctx, canvas, opts } = this;
    const px = this.pxPerLine;
    const font = `${opts.weight} ${Math.round(px * 0.62)}px ${FONT_STACK}`;
    ctx.font = font;
    const lines = wrap(text, opts.maxWidthChars);
    let maxW = 0;
    for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width);
    const padX = px * 0.55;
    const padY = px * 0.28;
    const w = Math.ceil(maxW + padX * 2);
    const hpx = Math.ceil(lines.length * px + padY * 2);
    if (w !== canvas.width || hpx !== canvas.height) {
      // GPU textures are immutable in size once uploaded: swap in a new one.
      canvas.width = w;
      canvas.height = hpx;
      this.texture.dispose();
      this.texture = new CanvasTexture(canvas);
      this.texture.colorSpace = SRGBColorSpace;
      this.texture.anisotropy = 4;
      this.material.map = this.texture;
      this.material.needsUpdate = true;
    }
    ctx.font = font;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (opts.backing) {
      ctx.fillStyle = 'rgba(14, 12, 24, 0.62)';
      roundRect(ctx, 0, 0, canvas.width, canvas.height, Math.min(px * 0.6, canvas.height / 2));
      ctx.fill();
    }
    ctx.fillStyle = opts.color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = opts.align === 'center' ? 'center' : 'left';
    const x = opts.align === 'center' ? canvas.width / 2 : padX;
    lines.forEach((l, i) => ctx.fillText(l, x, padY + px * (i + 0.5)));
    this.texture.needsUpdate = true;
    const h = (canvas.height / px) * opts.lineHeight;
    this.mesh.scale.set((canvas.width / canvas.height) * h, h, 1);
  }
}

function wrap(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      if ((line + ' ' + word).trim().length > maxChars && line) {
        out.push(line);
        line = word;
      } else {
        line = (line + ' ' + word).trim();
      }
    }
    out.push(line);
  }
  return out;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

let glowTexture: Texture | null = null;

/** Shared radial-falloff texture used for every glow, star and firefly. */
export function getGlowTexture(): Texture {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowTexture = new CanvasTexture(c);
  glowTexture.colorSpace = SRGBColorSpace;
  return glowTexture;
}

/** Every glow, so the system can turn them all to face the viewer each frame. */
export const glows: Mesh[] = [];
const glowGeometry = new PlaneGeometry(1, 1);

/**
 * A soft camera-facing glow. (Plain meshes instead of THREE.Sprite: sprites
 * did not render in the immersive session and break XR pointer raycasts.)
 */
export function makeGlow(color: number, size: number, opacity = 1): Mesh {
  const m = new Mesh(
    glowGeometry,
    new MeshBasicMaterial({
      map: getGlowTexture(),
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  m.scale.setScalar(size);
  m.renderOrder = 5;
  m.raycast = () => {};
  glows.push(m);
  return m;
}
