import Phaser from "phaser";
import type { PlayerController } from "../player/PlayerController";
import { characterAtlasKey } from "../shared/animation";
import { HEROES, type HeroClass } from "./HeroRoster";
import { UNARMED_HEROES } from "./UnarmedHeroes";

/**
 * Equipamento visível no herói (estilo MU).
 *
 * O jogo tem um desenho por classe, sem arte separada para cada conjunto. Para o item aparecer,
 * as texturas do herói viram texturas de canvas e a ARMADURA é repintada na cor do conjunto
 * equipado: só os pixels do tom da armadura de cada classe mudam (pele, cabelo e contorno ficam).
 * Conjuntos raros (Excelente, Mítico, Dragão Glacial) ganham brilho pulsando em volta do corpo,
 * e a arma equipada solta faíscas na cor do elemento.
 */
export interface HeroLookState {
  /** Cor do conjunto que mais aparece no corpo (null = roupa original). */
  armorColor: string | null;
  /** Brilho de conjunto raro em volta do herói. */
  glowColor: string | null;
  /** Faíscas da arma (elemental/glacial). */
  weaponColor: string | null;
}

/** Faixas de tom (graus) da armadura de cada classe, medidas nos próprios desenhos. */
const ARMOR_BANDS: Record<HeroClass, { hues: [number, number][]; grays?: boolean }> = {
  Cavaleiro: { hues: [[300, 360], [0, 12]] },
  Feiticeiro: { hues: [[180, 245]] },
  Arqueiro: { hues: [[75, 195]] },
  Gladiador: { hues: [[240, 320]] },
  "Lorde Sombrio": { hues: [[290, 360]], grays: true },
};

interface Original { data: ImageData; canvas: HTMLCanvasElement; hero: HeroClass; applied: string; }
const originals = new Map<string, Original>();

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
}
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
const inBand = (h: number, bands: [number, number][]) => bands.some(([a, b]) => h >= a && h <= b);

/** Troca as texturas dos heróis por texturas de canvas (uma vez), guardando o desenho original. */
export function prepareHeroLooks(scene: Phaser.Scene): void {
  const all: [string, HeroClass][] = [
    ...HEROES.map((h) => [h.id, h.name] as [string, HeroClass]),
    ...Object.entries(UNARMED_HEROES).map(([name, id]) => [id, name as HeroClass] as [string, HeroClass]),
  ];
  for (const [id, hero] of all) {
    const key = characterAtlasKey(id);
    if (originals.has(key) || !scene.textures.exists(key)) continue;
    const tex = scene.textures.get(key);
    const img = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    if (!img || !img.width) continue;
    const frames = tex.getFrameNames().map((name) => { const f = tex.get(name); return { name, x: f.cutX, y: f.cutY, w: f.cutWidth, h: f.cutHeight }; });
    const canvas = document.createElement("canvas");
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    scene.textures.remove(key);
    const ct = scene.textures.addCanvas(key, canvas);
    if (!ct) continue;
    for (const f of frames) ct.add(f.name, 0, f.x, f.y, f.w, f.h);
    originals.set(key, { data, canvas, hero, applied: "" });
  }
}

/** Repinta a armadura de uma textura de herói na cor pedida (ou volta ao original). */
function paint(scene: Phaser.Scene, key: string, color: string | null): void {
  const o = originals.get(key);
  if (!o || o.applied === (color ?? "")) return;
  const ctx = o.canvas.getContext("2d", { willReadFrequently: true })!;
  if (!color) {
    ctx.putImageData(o.data, 0, 0);
  } else {
    const [th, ts, tl] = hexToHsl(color);
    const band = ARMOR_BANDS[o.hero];
    const out = new ImageData(new Uint8ClampedArray(o.data.data), o.data.width, o.data.height);
    const px = out.data;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 8) continue;
      const [h, s, l] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
      if (l < 0.1 || l > 0.93) continue;                      // contorno preto e brilhos brancos ficam
      const armor = (s >= 0.22 && inBand(h, band.hues)) || (band.grays === true && s < 0.22 && l > 0.16 && l < 0.78);
      if (!armor) continue;
      // Mantém a luz e a sombra do desenho; muda o tom e puxa a saturação para a cor do conjunto.
      const nl = Math.min(0.9, l * 0.75 + tl * 0.25);
      const [r, g, b] = hslToRgb(th, Math.max(0.35, (s + ts) / 2), nl);
      px[i] = r; px[i + 1] = g; px[i + 2] = b;
    }
    ctx.putImageData(out, 0, 0);
  }
  o.applied = color ?? "";
  (scene.textures.get(key) as Phaser.Textures.CanvasTexture).refresh();
}

export class HeroLook {
  private glow: Phaser.GameObjects.Sprite;
  private sparks: Phaser.GameObjects.Arc[] = [];
  private t = 0;
  private state: HeroLookState = { armorColor: null, glowColor: null, weaponColor: null };

  constructor(private scene: Phaser.Scene, private player: PlayerController) {
    prepareHeroLooks(scene);
    const s = player.sprite;
    this.glow = scene.add.sprite(s.x, s.y, s.texture.key, s.frame.name).setVisible(false).setAlpha(0.45);
    this.glow.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    for (let i = 0; i < 6; i++) this.sparks.push(scene.add.circle(s.x, s.y, 1.2, 0xffffff, 1).setVisible(false).setBlendMode(Phaser.BlendModes.ADD));
  }

  /** Aplica o visual do equipamento atual em todas as texturas do herói desta classe. */
  set(hero: HeroClass, look: HeroLookState): void {
    this.state = look;
    for (const [key, o] of originals) if (o.hero === hero) paint(this.scene, key, look.armorColor);
    if (look.glowColor) this.glow.setTint(parseInt(look.glowColor.slice(1), 16));
    for (const s of this.sparks) if (look.weaponColor) s.setFillStyle(parseInt(look.weaponColor.slice(1), 16), 1);
  }

  update(visible: boolean): void {
    const sprite = this.player.sprite;
    this.t += Math.min(100, this.scene.game.loop.delta) / 1000;
    const glowOn = visible && !!this.state.glowColor;
    this.glow.setVisible(glowOn);
    if (glowOn) {
      const pulse = 1.08 + Math.sin(this.t * 3) * 0.03;
      this.glow.setTexture(sprite.texture.key, sprite.frame.name)
        .setPosition(sprite.x, sprite.y).setOrigin(sprite.originX, sprite.originY)
        .setScale(sprite.scaleX * pulse, sprite.scaleY * pulse).setFlipX(sprite.flipX)
        .setAlpha(0.28 + Math.sin(this.t * 3) * 0.1).setDepth(sprite.depth - 0.3);
    }
    const sparksOn = visible && !!this.state.weaponColor;
    this.sparks.forEach((s, i) => {
      s.setVisible(sparksOn);
      if (!sparksOn) return;
      const a = this.t * 2.2 + i * (Math.PI * 2 / this.sparks.length);
      const r = 9 + Math.sin(this.t * 4 + i) * 2;
      s.setPosition(sprite.x + Math.cos(a) * r, sprite.y - 2 + Math.sin(a) * r * 0.45)
        .setAlpha(0.5 + 0.5 * Math.sin(this.t * 6 + i)).setDepth(sprite.depth + (Math.sin(a) > 0 ? 0.3 : -0.3));
    });
  }

  destroy(): void { this.glow.destroy(); for (const s of this.sparks) s.destroy(); }
}
