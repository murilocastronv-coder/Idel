import type Phaser from "phaser";
import { UNARMED_HEROES } from "./UnarmedHeroes";
import { preloadCharacterAtlas, preloadCharacterManifest, characterAssetUrl, characterManifest, characterRotationFrameName, selectCharacterState } from "../shared/animation";

export const HEROES = [
  { name: "Cavaleiro", id: "a186e0b5-46cf-4259-b791-d06d5dece872", description: "Armadura carmesim · resistência e combate próximo" },
  { name: "Feiticeiro", id: "e15cb620-66b4-457e-af22-7357de16bbef", description: "Mago arcano · vestes azuis e poder mágico" },
  { name: "Arqueiro", id: "d3c19f60-17ec-49ef-8b75-586ace0a2413", description: "Elfa esmeralda · arco e armadura verde" },
  { name: "Gladiador", id: "9af51a54-5b5a-4c0f-af85-e60403f64df9", description: "Guerreiro violeta · espada e armadura pesada" },
  { name: "Lorde Sombrio", id: "3a46a0b9-fba0-476d-9085-06ad60a89811", description: "Armadura negra e dourada · presença imponente" },
] as const;
export type HeroClass = typeof HEROES[number]["name"];
/** Texturas de uma classe: com armadura e iniciante. */
export function heroAtlasIds(name: string): string[] {
  const hero = HEROES.find(h => h.name === name) ?? HEROES[0];
  return [hero.id, UNARMED_HEROES[hero.name]].filter(Boolean);
}
/** No início só a classe do personagem salvo neste aparelho (as outras carregam quando precisar). */
export function preloadHeroes(scene: Phaser.Scene, heroName: string): void {
  for (const hero of HEROES) for (const id of heroAtlasIds(hero.name)) preloadCharacterManifest(scene, id);
  for (const id of heroAtlasIds(heroName)) preloadCharacterAtlas(scene, id);
}
/** Classe do personagem escolhido neste aparelho (para carregar só ela no início). */
export function savedHeroName(): string {
  try {
    const slot = Number(localStorage.getItem("aether-slot")) || 0;
    const key = slot === 0 ? "aether-reborn-save-v2" : `aether-reborn-save-v2-s${slot}`;
    const hero = (JSON.parse(localStorage.getItem(key) || "null") as { hero?: string } | null)?.hero;
    return HEROES.some(h => h.name === hero) ? hero! : "Cavaleiro";
  } catch { return "Cavaleiro"; }
}
export function heroPreview(scene: Phaser.Scene, hero: typeof HEROES[number]): string {
  const id = UNARMED_HEROES[hero.name] ?? hero.id;
  const state = selectCharacterState(characterManifest(scene, id));
  return characterAssetUrl(id, `${characterRotationFrameName(state.stateFolder, "south")}.png`);
}
