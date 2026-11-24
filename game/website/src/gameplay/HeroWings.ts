import Phaser from "phaser";
import { assetUrl } from "../pixellab/templateAssetPaths";
import type { PlayerController } from "../player/PlayerController";
import { vectorFromDirection } from "../shared/direction";
import { WING_CATALOG } from "./WingCatalog";

export const WINGS_FILE = "objects/b02a85e2-8a92-4b70-8d4b-8dcb9f3eb4f7/base/rotations/unknown.png";

/**
 * Wings fixed to the hero's back, MU-style.
 *
 * Each wing texture is split at the spine into a left and a right half. Both halves
 * pivot on the spine and are drawn on the shoulders, so the pair always stays
 * glued to the back and follows the hero's 8 facings:
 *  - frente (sul): asas atrás do corpo, abertas dos dois lados;
 *  - costas (norte): asas por cima do corpo, totalmente visíveis;
 *  - lados (leste/oeste): asas em perfil, encurtadas e deslocadas para as costas.
 * The halves beat continuously (open ↔ closed), faster while walking/attacking.
 */
export class HeroWings {
  private phase: number = 0;
  private readonly left: Phaser.GameObjects.Image;
  private readonly right: Phaser.GameObjects.Image;
  private textureKey: string = "";
  private lastX: number = 0;
  private lastY: number = 0;

  static preload(scene: Phaser.Scene): void {
    scene.load.image("hero-golden-wings", assetUrl(WINGS_FILE));
    for (const wing of WING_CATALOG) scene.load.image(`wing-${wing.id}`, assetUrl(wing.file));
  }

  constructor(private scene: Phaser.Scene, private player: PlayerController) {
    this.left = scene.add.image(player.sprite.x, player.sprite.y, "hero-golden-wings").setVisible(false);
    this.right = scene.add.image(player.sprite.x, player.sprite.y, "hero-golden-wings").setVisible(false);
    this.lastX = player.sprite.x; this.lastY = player.sprite.y;
  }

  /** Split a wing texture into spine-pivoted halves once. */
  private useTexture(key: string): void {
    if (this.textureKey === key) return;
    const texture = this.scene.textures.get(key);
    const src = texture.getSourceImage() as { width: number; height: number };
    const half = Math.floor(src.width / 2);
    if (!texture.has("wing-left")) texture.add("wing-left", 0, 0, 0, half, src.height);
    if (!texture.has("wing-right")) texture.add("wing-right", 0, half, 0, src.width - half, src.height);
    this.left.setTexture(key, "wing-left").setOrigin(1, 0.5);
    this.right.setTexture(key, "wing-right").setOrigin(0, 0.5);
    this.textureKey = key;
  }

  update(equipped: boolean, started: boolean, wingId?: string): void {
    const wing = WING_CATALOG.find(w => w.id === wingId);
    this.useTexture(wing ? `wing-${wing.id}` : "hero-golden-wings");
    const visible = equipped && started;
    this.left.setVisible(visible);
    this.right.setVisible(visible);
    if (!visible) return;

    const sprite = this.player.sprite;
    const delta = Math.min(100, this.scene.game.loop.delta);
    const moved = Math.hypot(sprite.x - this.lastX, sprite.y - this.lastY);
    this.lastX = sprite.x; this.lastY = sprite.y;
    const busy = moved > 0.05 || this.player.attackState.active;
    // Bater de asas: devagar parado, rápido andando/atacando.
    this.phase += delta / 1000 * (busy ? 7.5 : 2.6);
    const open = 0.5 + 0.5 * Math.sin(this.phase);          // 0 fechada · 1 aberta
    const spreadFlap = 0.5 + 0.5 * open;                      // largura da batida
    const lift = (open - 0.5) * 0.32;                         // pontas sobem ao abrir

    const v = vectorFromDirection(this.player.facing);
    const vx = Math.abs(v.x) < 0.01 ? 0 : Math.sign(v.x) * Math.min(1, Math.abs(v.x) * 1.4);
    const back = v.y < -0.01;                                // de costas para a câmera
    const s = sprite.scaleX;
    // Perfil: a asa do lado das costas fica mais aberta, a outra se esconde atrás do corpo.
    const leftSpread = 1 - 0.3 * Math.abs(vx) - 0.4 * Math.max(0, -vx);
    const rightSpread = 1 - 0.3 * Math.abs(vx) - 0.4 * Math.max(0, vx);
    // Ombros: um pouco acima do centro do sprite, deslocado para as costas em perfil.
    const x = sprite.x - vx * 3.5 * s * 2;
    const y = sprite.y - sprite.displayHeight * 0.13 + (back ? 1 : 0);
    const depth = sprite.depth + (back ? 0.2 : -0.2);

    this.left.setPosition(x, y).setScale(s * leftSpread * spreadFlap, s * (0.96 + 0.04 * open)).setRotation(lift).setDepth(depth);
    this.right.setPosition(x, y).setScale(s * rightSpread * spreadFlap, s * (0.96 + 0.04 * open)).setRotation(-lift).setDepth(depth);
  }

  get visible(): boolean { return this.left.visible; }
  get texture(): string { return this.textureKey; }
  destroy(): void { this.left.destroy(); this.right.destroy(); }
}
