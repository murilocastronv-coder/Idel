import Phaser from "phaser";
import { characterAtlasKey, characterManifest, characterRotationFrameName, ensureCharacterAtlases, selectCharacterState } from "../shared/animation";
import { PLAYER_CHARACTER_ID } from "../pixellab/templateAssetPaths";
import { setYDepth } from "../shared/depth";
import { directionFromVector, type Direction } from "../shared/direction";
import { HEROES } from "../gameplay/HeroRoster";
import { connectMultiplayer, type LocalState, type MultiplayerHandle, type NetPlayer, type RemoteEvent } from "./multiplayer";

export interface RemotePlayer {
  id: string; name: string; hero: string; level: number; pvp: boolean; hp: number;
  sprite: Phaser.GameObjects.Sprite; label: Phaser.GameObjects.Text; bar: Phaser.GameObjects.Graphics;
  facing: Direction;
}

/**
 * Outros jogadores no mesmo mapa: aparecem com o desenho da classe, nome e nível
 * (vermelho com ⚔ quando o PvP deles está ligado) e barra de vida.
 */
export class MultiplayerSystem {
  private handle: MultiplayerHandle;
  readonly remotes = new Map<string, RemotePlayer>();
  private myId: string | null = null;
  private sinceSend = 0;
  /** Golpe de PvP recebido: (id de quem bateu, nome, dano). */
  onHit?: (fromId: string, fromName: string, damage: number) => void;
  /** Aviso de morte em PvP na sala. */
  onKill?: (killer: string, victim: string) => void;

  constructor(private scene: Phaser.Scene, private getState: () => LocalState, roomId = "lobby") {
    this.handle = connectMultiplayer(roomId, (e) => this.onEvent(e));
  }

  private onEvent(e: RemoteEvent): void {
    if (e.type === "snapshot") {
      this.myId = e.you ?? null;
      for (const p of e.players ?? []) this.upsert(p);
    } else if (e.type === "move" && e.id) {
      this.upsert(e as NetPlayer);
    } else if (e.type === "leave" && e.id) {
      const r = this.remotes.get(e.id);
      if (r) { r.sprite.destroy(); r.label.destroy(); r.bar.destroy(); }
      this.remotes.delete(e.id);
    } else if (e.type === "hit" && e.from && typeof e.d === "number") {
      this.onHit?.(e.from, e.name ?? "Jogador", e.d);
    } else if (e.type === "kill" && e.killer && e.victim) {
      this.onKill?.(e.killer, e.victim);
    }
  }

  private loading = new Set<string>();
  private heroFrame(hero: string, facing: Direction): { key: string; frame: string } {
    let id: string = (HEROES.find((h) => h.name === hero) ?? HEROES[0]).id;
    // Classe ainda não carregada neste aparelho: carrega e, enquanto isso, mostra o desenho padrão.
    if (!this.scene.textures.exists(characterAtlasKey(id))) {
      if (!this.loading.has(id)) { this.loading.add(id); void ensureCharacterAtlases(this.scene, [id]).finally(() => this.loading.delete(id)); }
      id = PLAYER_CHARACTER_ID;
    }
    const state = selectCharacterState(characterManifest(this.scene, id));
    return { key: characterAtlasKey(id), frame: characterRotationFrameName(state.stateFolder, facing) };
  }

  private upsert(p: NetPlayer): void {
    if (!p.pos || p.id === this.myId) return;
    let r = this.remotes.get(p.id);
    const hero = p.h ?? "Cavaleiro";
    if (!r) {
      const f = this.heroFrame(hero, "south");
      const sprite = this.scene.add.sprite(p.pos.x, p.pos.y, f.key, f.frame).setScale(0.5);
      const label = this.scene.add.text(p.pos.x, p.pos.y - 24, "", { fontFamily: "Arial, sans-serif", fontSize: "10px", fontStyle: "bold", color: "#cfe6ff", stroke: "#0b0e12", strokeThickness: 3 }).setOrigin(0.5);
      r = { id: p.id, name: "", hero, level: 1, pvp: false, hp: 100, sprite, label, bar: this.scene.add.graphics(), facing: "south" };
      this.remotes.set(p.id, r);
    }
    const dx = p.pos.x - r.sprite.x, dy = p.pos.y - r.sprite.y;
    if (Math.hypot(dx, dy) > 0.5) r.facing = directionFromVector(dx, dy);
    r.name = p.n ?? "Jogador"; r.hero = hero; r.level = p.l ?? 1; r.pvp = p.p === 1; r.hp = p.hp ?? 100;
    const f = this.heroFrame(hero, r.facing);
    r.sprite.setTexture(f.key, f.frame).setPosition(p.pos.x, p.pos.y);
    r.label.setText(`${r.pvp ? "⚔ " : ""}${r.name} · Nv.${r.level}`).setColor(r.pvp ? "#ff8a7a" : "#cfe6ff").setPosition(p.pos.x, p.pos.y - 24);
    setYDepth(r.sprite, p.pos.y + 15);
    setYDepth(r.label, p.pos.y + 15, 2);
    r.bar.clear();
    if (r.pvp) r.bar.fillStyle(0x090c10, 0.9).fillRect(p.pos.x - 14, p.pos.y - 18, 28, 3).fillStyle(0xd84a3a).fillRect(p.pos.x - 14, p.pos.y - 18, 28 * r.hp / 100, 3);
    setYDepth(r.bar, p.pos.y + 15, 3);
  }

  /** Jogadores com PvP ligado (alvos possíveis). */
  pvpTargets(): RemotePlayer[] { return [...this.remotes.values()].filter((r) => r.pvp && r.hp > 0); }
  hit(id: string, damage: number): void { this.handle.sendHit(id, damage); }
  dead(by: string): void { this.handle.sendDead(by); }

  update(deltaMs: number): void {
    this.sinceSend += deltaMs;
    if (this.sinceSend >= 80) {
      this.sinceSend = 0;
      this.handle.sendState(this.getState());
    }
  }

  destroy(): void {
    this.handle.close();
    for (const r of this.remotes.values()) { r.sprite.destroy(); r.label.destroy(); r.bar.destroy(); }
    this.remotes.clear();
  }
}
