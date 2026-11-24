import type Phaser from "phaser";
import { preloadCharacterAtlas } from "../shared/animation";
import { CLASSIC_MONSTERS } from "./ClassicMonsterRoster";
import { WORLD_DESTINATIONS } from "./WorldDestinations";
import { townName } from "./TownLayout";
export const WING_MASTER = "886cef61-2e1b-4383-83c1-1336588c3261";
export const MONSTERS = [
  { id: "765a1ab1-0538-4101-9520-bae405d3cbd4", name: "Goblin Saqueador" },
  { id: "298c63d1-7fe8-4b3a-b9ec-dc7b3650aa30", name: "Guerreiro Esqueleto" },
  { id: "6446a239-4e41-4526-89f2-763f6ea9c9a6", name: "Demônio das Brasas" },
] as const;
/** Monstros que aparecem num mapa (só esses são carregados). */
export function mapMonsterIds(folder: string): string[] {
  const name = WORLD_DESTINATIONS.find(d => d.id === folder)?.name;
  const classic = CLASSIC_MONSTERS.filter(m => m.map === name).map(m => m.id);
  return [...new Set([...classic, ...(townName(folder) ? [] : MONSTERS.map(m => m.id))])];
}
/** Todos os monstros do jogo (para liberar os que não são do mapa atual). */
export const ALL_MONSTER_IDS = [...new Set([...MONSTERS.map(m => m.id), ...CLASSIC_MONSTERS.map(m => m.id)])];
/** No início: só o Mestre das Asas e os monstros do mapa inicial. */
export function preloadWorldRoster(scene: Phaser.Scene, folder: string): void {
  for (const id of [WING_MASTER, ...mapMonsterIds(folder)]) preloadCharacterAtlas(scene, id);
}
