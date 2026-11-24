import { TownExplorer } from '../gameplay/TownExplorer';
import { MountPreview } from '../gameplay/MountPreview';
import Phaser from "phaser";
import { GAME_CONFIG } from "../config";
import { HudOverlay } from "../hud/HudOverlay";
import { renderMap } from "../pixellab/renderMap";
import { resolveMapEntryPoint, resolvePlayerSpawnPoint } from "../pixellab/spawns";
import type { LoadedMap } from "../pixellab/types";
import { PlayerController } from "../player/PlayerController";
import { spawnNpcs } from "../npc/spawnNpcs";
import type { CharacterAgent } from "../npc/CharacterAgent";
import { MAP_DATA_REGISTRY_KEY } from "./BootScene";
import { MultiplayerSystem } from "../net/MultiplayerSystem";
import { RealmRpg } from "../gameplay/RealmRpg";
import { mapMonsterIds } from "../gameplay/WorldRoster";
import { ensureCharacterAtlases, releaseCharacterAtlases } from "../shared/animation";
import { FireProjectileSystem } from "../gameplay/FireProjectileSystem";
import { ClickTravel } from "../gameplay/ClickTravel";
import { WORLD_DESTINATIONS } from "../gameplay/WorldDestinations";
import { switchPlayerToMap } from "../pixellab/mapHelpers";
import { type Direction } from "../shared/direction";

export class GameScene extends Phaser.Scene {
  private mapData!: LoadedMap;
  private player!: PlayerController;
  private agents: CharacterAgent[] = [];
  private hud!: HudOverlay;
  private multiplayer!: MultiplayerSystem;
  private fireProjectiles!: FireProjectileSystem;
  private rpg!: RealmRpg;
  private clickTravel!: ClickTravel;
  private towns!: TownExplorer;
  private mountPreview!: MountPreview;

  constructor() {
    super("GameScene");
  }

  create(): void {
    this.mapData = this.registry.get(MAP_DATA_REGISTRY_KEY) as LoadedMap;
    renderMap(this, this.mapData);
    const spawn = WORLD_DESTINATIONS.some(d=>d.id===this.mapData.folder) ? resolveMapEntryPoint(this.mapData) : resolvePlayerSpawnPoint(this.mapData);
    this.fireProjectiles = new FireProjectileSystem(this);
    this.player = new PlayerController(this, this.mapData, spawn.x, spawn.y, {
      onSpellCast: (origin, direction) => { if (this.rpg?.allowSpell() && !this.rpg.weaponRanged(origin, direction)) this.fireProjectiles.cast(origin, direction); },
      onSlashSwing: (origin, direction) => this.checkSlashHits(origin, direction),
    });
    this.agents = spawnNpcs(this, this.mapData);
    this.agents = this.agents.filter(agent => { if (agent.role === "bear") { agent.destroy(); return false; } return true; });

    this.startGameplayCamera();

    this.hud = new HudOverlay();
    this.hud.setText([]);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.mountPreview.destroy();
      this.towns.destroy();
      this.rpg.destroy();
      this.hud.destroy();
      this.multiplayer.destroy();
    });

    // === NEW SYSTEMS (add new module instances here) ===
    this.rpg = new RealmRpg(this, this.player, this.mapData);
    this.mountPreview = new MountPreview(this);
    this.clickTravel = new ClickTravel(this,this.player,this.mapData,()=>this.rpg.active);
    this.towns = new TownExplorer(this,this.player,this.mapData,()=>this.rpg.active,id=>(window as unknown as {rpgAction:(a:string)=>void}).rpgAction(`travel:${id}`));
    this.rpg.setTravelHandler(async id => {
      // Carrega só os monstros do novo mapa e libera os do mapa anterior (memória do celular).
      const before=mapMonsterIds(this.mapData.folder), next=mapMonsterIds(id);
      await ensureCharacterAtlases(this,next);
      const result=await switchPlayerToMap(this,id,this.player);
      this.mapData=result.mapData;
      this.registry.set(MAP_DATA_REGISTRY_KEY,this.mapData);
      for(const agent of this.agents)agent.destroy();this.agents=[];
      this.fireProjectiles.destroy();this.fireProjectiles=new FireProjectileSystem(this);
      this.rpg.setMapData(this.mapData);
      releaseCharacterAtlases(this,before.filter(m=>!next.includes(m)));this.clickTravel.setMap(this.mapData);this.towns.setMap(this.mapData);
      this.multiplayer.destroy();
      this.multiplayer=new MultiplayerSystem(this,()=>this.rpg.netState(),this.mapData.map.name);
      this.rpg.setNet(this.multiplayer);
      this.startGameplayCamera();
    });
    (window as unknown as Record<string,unknown>).travelTo = (name: string) => {
      const d=WORLD_DESTINATIONS.find(d=>d.name===name||d.id===name);
      if(d)(window as unknown as {rpgAction:(a:string)=>void}).rpgAction(`travel:${d.id}`);
    };

    // Real-time multiplayer: stream this player's position to the project worker and
    // render other connected players. Room = the current map name (one room per map).
    this.multiplayer = new MultiplayerSystem(this, () => this.rpg.netState(), this.mapData.map.name);
    this.rpg.setNet(this.multiplayer);

    // EXAMPLE of persistent SERVER state (delete to remove): a global jump counter
    // shared by all players, stored in a Durable Object via /api/jumps.


    // Focus canvas to ensure keyboard input and full frame rate from start.
    // tabIndex is required for canvas to be focusable (especially in iframes).
    this.game.canvas.tabIndex = 1;
    this.game.canvas.style.outline = "none";
    this.game.canvas.focus();

    // Signal to smoke test that game is fully loaded
    (window as unknown as Record<string, unknown>).gameReady = true;
  }

  private startGameplayCamera(): void {
    const camera = this.cameras.main;
    camera.setZoom(GAME_CONFIG.camera.zoom);
    camera.startFollow(this.player.sprite, true, GAME_CONFIG.camera.followLerp, GAME_CONFIG.camera.followLerp);
    // Celular em pé: os controles ficam embaixo, então o herói aparece mais para cima.
    const portrait = this.scale.height > this.scale.width * 1.2;
    camera.setFollowOffset(0, portrait ? -this.scale.height * 0.12 / camera.zoom : 0);
  }

  private checkSlashHits(origin: { x: number; y: number }, direction: Direction): void {
    this.rpg?.slash(origin, direction);
  }

  update(_time: number, deltaMs: number): void {
    // Skip frame entirely if delta is too large (tab switch, initial load)
    // rather than clamping which makes characters move slowly
    if (deltaMs > 200) {
      return;
    }
    this.clickTravel.update();
    if (this.rpg.active) this.player.update(deltaMs);
    if (this.rpg.active) this.fireProjectiles.update(deltaMs, this.rpg.targets, this.mapData);
    for (const agent of this.agents) {
      agent.update(deltaMs);
    }
    this.rpg.update(deltaMs);
    this.towns.update();
    this.mountPreview.update(deltaMs);
    // === NEW UPDATES (add new update calls here) ===
    this.multiplayer.update(deltaMs);
  }

}
