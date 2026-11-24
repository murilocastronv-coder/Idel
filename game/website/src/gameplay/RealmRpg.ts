import { ELEMENTAL_WEAPONS, elementalState, elementalAction, elementalHtml, weaponImage, animateElementalImages, type ElementalSave } from './ElementalWeapons';
import { GLACIAL_ITEMS, glacialState, glacialHtml, glacialAction, type GlacialSave } from './GlacialSets';
import { KUNDUN_BOXES, grantBox, kundunAction, kundunHtml } from './KundunBoxes';
import { KundunOpening } from './KundunOpening';
import { ARMOR_ITEMS, gearState, gearHtml, dropArmorFor, type GearSave } from './ArmorSets';
import { insideTown, townName, monsterHomes, SAFE_POLYGON } from './TownLayout';
import Phaser from "phaser";
import type { LoadedMap } from "../pixellab/types";
import type { PlayerController } from "../player/PlayerController";
import { CharacterAgent } from "../npc/CharacterAgent";
import { WING_MASTER, MONSTERS } from "./WorldRoster";
import { CLASSIC_MONSTERS, type ClassicMonster } from "./ClassicMonsterRoster";
import { MonsterCombat } from "./MonsterCombat";
import { WING_CATALOG, wingCatalogHtml, FREE_WING_ID, wingPrice, ownedWings } from "./WingCatalog";
import { characterAtlasKey, characterManifest } from "../shared/animation";
import { nearestWalkable, findPath, type Point } from "../shared/navigation";
import { moveWithCollision } from "../shared/collision";
import { setYDepth } from "../shared/depth";
import { directionFromVector, vectorFromDirection } from "../shared/direction";
import type { Direction } from "../shared/direction";
import "./rpg.css";

import { WORLD_DESTINATIONS } from "./WorldDestinations";
import { HeroWings } from "./HeroWings";
import { HeroPowers, HERO_POWERS } from "./HeroPowers";
import { TouchMovement } from "./TouchMovement";
import { WeaponProjectiles } from "./WeaponProjectiles";
import { HEROES, heroPreview, type HeroClass } from "./HeroRoster";
import { UNARMED_HEROES } from "./UnarmedHeroes";
import { MobileHud } from "./MobileHud";
import { HeroLook } from "./HeroLook";
import { VIP_PLANS, VIP_PERKS, PREMIUM_PACKS, brlPrice } from "./PremiumShop";
import { xpToNext, hardKillXp, hardLabel } from "./HardMode";
import { CloudSave } from "../net/CloudSave";
interface Save extends GearSave, GlacialSave, ElementalSave { kundunBoxes?: Record<string,number>; kundunWelcome?: boolean; kundunLastReward?: string; wingId?: string; wingsOwned?: string[]; wings: boolean; name: string; hero: HeroClass; level: number; xp: number; gold: number; kills: number; quest: number; weapon: number; armor: number; potions: number; points: number; strength: number; vitality: number; items: number; }
interface Mob { classic?: ClassicMonster; attackMs: number; strikeAt: number; struck: boolean; hurtMs: number; facing: Direction; agent: CharacterAgent; health: number; max: number; boss: boolean; home: Point; path: Point[]; repath: number; cooldown: number; dead: number; label: Phaser.GameObjects.Text; bar: Phaser.GameObjects.Graphics; hitRadius: number; sprite: Phaser.GameObjects.Sprite; hit: (x: number,y: number,strength: number) => boolean; }
const COLLIDER = { width: 8, height: 4, footOffsetY: 15 };
/** v2: reset geral de 24/11/2026 — todo mundo começa do zero (o save v1 é ignorado). */
const SAVE_KEY = "aether-reborn-save-v2";
/** Até 5 personagens: cada espaço tem seu save (espaço 0 usa a chave antiga). */
const MAX_CHARS = 5;
const SLOT_KEY = "aether-slot";
const slotKey = (n: number): string => n === 0 ? SAVE_KEY : `${SAVE_KEY}-s${n}`;
function readSlot(): number { try { const n = Number(localStorage.getItem(SLOT_KEY)); return Number.isInteger(n) && n >= 0 && n < MAX_CHARS ? n : 0; } catch { return 0; } }
function localChar(n: number): { slot: number; name: string; hero: string; level: number } | null {
  try { const d = JSON.parse(localStorage.getItem(slotKey(n)) || "null"); return d && Number.isFinite(d.level) && typeof d.hero === "string" ? { slot: n, name: String(d.name ?? "Viajante"), hero: d.hero, level: d.level } : null; } catch { return null; }
}
export class RealmRpg {
  private root: HTMLDivElement;
  private panel: HTMLDivElement;
  private modal: HTMLDivElement;
  private messages: string[] = [];
  private mobs: Mob[] = [];
  private home: Point;
  private save: Save = { wings: false, name: "Viajante", hero: "Cavaleiro", level: 1, xp: 0, gold: 0, kills: 0, quest: 0, weapon: 0, armor: 0, potions: 5, points: 0, strength: 0, vitality: 0, items: 0 };
  private selected: HeroClass = "Cavaleiro";
  private slot: number = readSlot();
  private confirmDelete: boolean = false;
  private running: boolean = false;
  private kundunOpening = new KundunOpening();
  private wasSafe: boolean = true;
  private health: number = 120;
  private mana: number = 80;
  private elapsed: number = 0;
  private renderMs: number = 0;
  private powers: HeroPowers;
  private powerMultiplier: number = 1;
  private weaponShots: WeaponProjectiles;
  private monsterCombat: MonsterCombat;
  private spellHit: boolean = false;
  private stored: boolean = false;
  private keyboard: Phaser.Input.Keyboard.KeyboardPlugin | null;
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private touchMovement: TouchMovement;
  private wings: HeroWings;
  private heroLabel: Phaser.GameObjects.Text;
  private wingMaster!: CharacterAgent;
  private masterLabel!: Phaser.GameObjects.Text;
  private masterButton!: HTMLButtonElement;
  private hud: MobileHud;
  private look: HeroLook;
  private lookKey: string = "";
  private cloud = new CloudSave();
  private auto: boolean = false;
  private autoMs: number = 0;
  private autoWalkMs: number = 0;
  private autoTarget?: Mob;
  private hudMs: number = 0;
  private accountMessage: string = "";
  constructor(private scene: Phaser.Scene, private player: PlayerController, private map: LoadedMap) {
    this.weaponShots = new WeaponProjectiles(scene,map);
    this.monsterCombat=new MonsterCombat(scene,map);
    this.powers = new HeroPowers(scene);
    this.wings = new HeroWings(scene, player);
    this.look = new HeroLook(scene, player);
    this.touchMovement = new TouchMovement(player);
    this.touchMovement.setActive(false);
    this.home = { ...player.worldPosition };
    this.cloud.slot = this.slot;
    try { const data = JSON.parse(localStorage.getItem(slotKey(this.slot)) || "null") as Save | null; if (data && Number.isFinite(data.level) && data.level >= 1 && HEROES.some(hero => hero.name === data.hero)) { this.save = { ...this.save, ...data }; this.selected = data.hero; this.stored = true; } } catch { /* a new adventure remains available */ }
    this.root = document.createElement("div"); this.root.className = "rpg-ui";
    this.panel = document.createElement("div"); this.modal = document.createElement("div"); this.root.append(this.panel, this.modal); document.getElementById("hud-root")!.append(this.root);
    this.hud = new MobileHud(this.root, action => this.action(action));
    this.hud.setVisible(false);
    // Joystick/HUD above the modal layer order: modal last so windows cover the controls.
    this.root.append(this.modal);
    window.addEventListener("pagehide", this.onPageHide);
    void this.cloud.shopInfo();
    if (this.cloud.loggedIn) void this.cloud.load().then(save => { if (save) this.applyCloudSave(save, false); this.mergePaidWings(); if (!this.running && this.modal.dataset.view === "start") this.startScreen(); });
    this.checkPaymentReturn();
    this.keyboard = scene.input.keyboard;
    for (const key of ["Q", "E", "I", "C", "B", "R", "ONE", "TWO", "THREE", "FOUR"]) if (this.keyboard) this.keys[key] = this.keyboard.addKey(key);
    this.heroLabel = scene.add.text(player.sprite.x, player.sprite.y - 40, "", { fontFamily: "Arial", fontSize: "9px", color: "#ead398", stroke: "#11171c", strokeThickness: 3 }).setOrigin(.5).setDepth(200000);
    this.createMobs(); this.createWingMaster(); this.startScreen(); this.render();
    const hooks = window as unknown as Record<string, unknown>;
    hooks.rpgState = () => ({ auto: this.auto, account: this.cloud.username, elemental: elementalState(this.save), elementalCatalog: ELEMENTAL_WEAPONS, glacial: this.glacial, glacialCatalog: GLACIAL_ITEMS, kundunOpening: this.kundunOpening.state(), map: this.map.map.name, mapFolder: this.map.folder, destinations: WORLD_DESTINATIONS, attack: this.player.attackState, weaponProjectiles: {active:this.weaponShots.count,released:this.weaponShots.released,hits:this.weaponShots.hits}, powers: this.powers.state(this.save.hero,this.elapsed), gear: this.gear, gearCatalog: ARMOR_ITEMS, kundunCatalog: KUNDUN_BOXES, effectiveDamage:this.damage, started: this.running, modal: !!this.modal.innerHTML, ...this.save, wingsVisible: this.wings.visible, unarmed: this.unarmed, characterId: this.heroCharacterId, texture: this.player.sprite.texture.key, frame: this.player.sprite.frame.name, scale: this.player.sprite.scaleX, displayHeight: this.player.sprite.displayHeight, facing: this.player.facing, safeZone:this.inSafeZone(this.player.worldPosition), safeCenter:this.home, safeRadius:townName(this.map.folder)?null:64, safePolygon:townName(this.map.folder)?SAFE_POLYGON:null, health: Math.ceil(this.health), maxHealth: this.maxHealth, mana: Math.floor(this.mana), x: this.player.sprite.x, y: this.player.sprite.y, wingCount: WING_CATALOG.length, wingTexture: this.wings.texture, master: {x:this.wingMaster.sprite.x,y:this.wingMaster.sprite.y,near:this.nearMaster,frame:this.wingMaster.sprite.frame.name}, enemies: this.mobs.map((m,i) => ({ id:i, x:m.sprite.x, y:m.sprite.y, health:m.health, name:m.label.text, frame:m.sprite.frame.name, boss:m.boss, classic:!!m.classic, stats:m.classic, state:m.dead?"death":m.hurtMs>0?"hurt":m.attackMs>0?"attack":"move", attackMs:m.attackMs, strikeAt:m.strikeAt, struck:m.struck, respawnRemaining:m.dead, dead:m.dead > 0 })) });
    hooks.rpgReturnSafe=()=>{this.player.teleportTo(this.home.x,this.home.y);};
    hooks.rpgVisitMaster = () => { const p=nearestWalkable(this.map,{x:this.wingMaster.sprite.x,y:this.wingMaster.sprite.y+22},{width:6,height:4,footOffsetY:10},8);if(p)this.player.teleportTo(p.x,p.y); };
    hooks.rpgAction = (action: string) => this.action(action);
    hooks.rpgApproach = (id: number) => { const mob = this.mobs[id]; if (mob) { const p = nearestWalkable(this.map, {x:mob.sprite.x,y:mob.sprite.y+27}, {width:6,height:4,footOffsetY:10},8); if(p) this.player.teleportTo(p.x,p.y); } };
    this.root.addEventListener("click", (event) => { const filter = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-wing-filter]"); if(filter) { for(const card of this.modal.querySelectorAll<HTMLElement>("[data-wing-family]")) card.hidden = filter.dataset.wingFilter !== "Todas" && card.dataset.wingFamily !== filter.dataset.wingFilter; return; } const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]"); if (target) { this.action(target.dataset.action!); target.blur(); this.scene.game.canvas.focus(); } });
  }
  setMapData(map: LoadedMap): void {
    this.weaponShots.destroy(); this.weaponShots=new WeaponProjectiles(this.scene,map);
    this.monsterCombat.destroy();this.monsterCombat=new MonsterCombat(this.scene,map);
    for(const m of this.mobs){m.agent.destroy();m.label.destroy();m.bar.destroy();}
    this.mobs=[];this.wingMaster.destroy();this.masterLabel.destroy();this.masterButton.remove();
    this.map=map;this.home={...this.player.worldPosition};this.createMobs();this.createWingMaster();
    this.log(`Chegou em ${map.map.name}.`);this.render();
  }
  setTravelHandler(handler: (id: string) => Promise<void>): void { this.travelHandler=handler; }
  private travelHandler?: (id: string) => Promise<void>;
  private showMaps(): void {
    this.modal.dataset.view="maps";
    this.modal.innerHTML=`<div class="rpg-overlay"><section class="rpg-window"><button class="rpg-close" data-action="close">Fechar ×</button><div class="rpg-caption">VIAGEM LIVRE · 20 DESTINOS</div><h2>Mapas</h2><p>Escolha seu destino. Blood Castle e Devil Square: visita livre, sem regras de evento.</p><div class="rpg-map-grid">${WORLD_DESTINATIONS.map(d=>`<button data-action="travel:${d.id}" ${d.id===this.map.folder?"disabled":""}><strong>${d.name}</strong><small>${d.theme}${d.id===this.map.folder?" · Você está aqui":""}</small></button>`).join("")}</div></section></div>`;
  }
  get active(): boolean { return this.running && !this.modal.innerHTML; }
  get targets(): Mob[] { return this.active && !this.inSafeZone(this.player.worldPosition) ? this.mobs.filter(m => !m.dead&&!this.inSafeZone(m.sprite)) : []; }
  private get unarmed(): boolean { return this.save.weapon === 0 && !this.glacial.weapon && !elementalState(this.save).equipped; }
  /** Com qualquer peça de armadura equipada, o herói usa o desenho COM armadura (pintado na cor do conjunto). */
  private get armoredLook(): boolean { return Object.keys(this.gear.equipped).length>0 || Object.keys(this.glacial.equipped).some(k=>["Elmo","Armadura","Calça","Luvas","Botas"].includes(k)); }
  private get heroCharacterId(): string { return this.unarmed && !this.armoredLook ? UNARMED_HEROES[this.save.hero] : HEROES.find(h=>h.name===this.save.hero)!.id; }
  private visualId: string = "";
  private syncHero(): void { this.visualId=this.heroCharacterId; this.player.setCharacter(this.visualId, this.unarmed && !this.armoredLook); }
  /** Asa equipada: só vale se for da coleção do jogador; senão, a Angelical Nv.1 grátis. */
  private get equippedWing(): string { const owned=ownedWings(this.save.wingsOwned);return this.save.wingId&&owned.includes(this.save.wingId)?this.save.wingId:FREE_WING_ID; }
  private get glacial() { return glacialState(this.save); }
  private get gear() { return gearState(this.save,this.save.level); }
  get maxHealth(): number { return this.glacial.hp + this.gear.hp + 120 + (this.save.level-1)*18 + this.save.vitality*12 + (this.save.hero === "Cavaleiro" ? 30 : 0); }
  private get damage(): number { return elementalState(this.save).damage + this.glacial.damage + this.gear.damage + 16 + this.save.level*3 + this.save.weapon*9 + this.save.strength*3 + (this.save.hero === "Cavaleiro" ? 6 : 0); }
  private inSafeZone(point: Point): boolean { return townName(this.map.folder) ? insideTown(point) : Math.hypot(point.x-this.home.x,point.y-this.home.y)<=64; }
  private receiveMonsterDamage(damage:number):void {
    if(!this.active||this.inSafeZone(this.player.worldPosition))return;
    const value=Math.max(2,damage-this.save.armor*3-this.gear.defense-this.glacial.defense);this.health-=value;
    this.float(this.player.sprite.x,this.player.sprite.y-18,`−${value}`,"#fa8577");
    this.player.sprite.setTint(0xf89c99);this.scene.time.delayedCall(120,()=>this.player.sprite.clearTint());
    if(this.health<=0)this.defeat();
  }
  private updateClassicMob(m:Mob,delta:number):void {
    if(this.inSafeZone(m.sprite)){m.sprite.setPosition(m.home.x,m.home.y);m.path=[];m.attackMs=0;}
    const kind=m.classic!;m.agent.update(delta);m.cooldown-=delta;m.repath-=delta;
    const safe=this.inSafeZone(this.player.worldPosition);
    const distance=Math.hypot(m.sprite.x-this.player.sprite.x,m.sprite.y-this.player.sprite.y);
    if(safe){m.attackMs=0;m.path=[];}
    if(m.hurtMs>0){m.hurtMs-=delta;}
    else if(m.attackMs>0){
      m.attackMs=Math.max(0,m.attackMs-delta);
      if(!m.struck&&m.attackMs<=m.strikeAt){
        m.struck=true;
        if(!safe&&!this.inSafeZone(m.sprite)){
          if(kind.ranged)this.monsterCombat.cast(m.sprite,m.facing,kind.damage);
          else if(distance<38){const v=vectorFromDirection(m.facing);const dx=this.player.sprite.x-m.sprite.x,dy=this.player.sprite.y-m.sprite.y;if(dx*v.x+dy*v.y>-3)this.receiveMonsterDamage(kind.damage);}
        }
      }
    }else if(!m.agent.stunned){
      const homeDistance=Math.hypot(m.sprite.x-m.home.x,m.sprite.y-m.home.y);
      const chasing=!safe&&distance<175&&homeDistance<245;
      const range=kind.ranged?110:28;
      if(chasing&&distance<=range&&m.cooldown<=0){
        m.facing=directionFromVector(this.player.sprite.x-m.sprite.x,this.player.sprite.y-m.sprite.y);
        m.attackMs=m.agent.playControlled("attack",m.facing,true);m.strikeAt=m.attackMs*.5;m.struck=false;m.cooldown=m.attackMs+850;m.path=[];
      }else{
        const target=chasing?(distance>range?this.player.worldPosition:null):homeDistance>12?m.home:null;
        if(target){
          if(m.repath<=0){m.path=findPath(this.map,m.sprite,target,COLLIDER)??[];m.repath=600;}
          while(m.path.length&&Math.hypot(m.sprite.x-m.path[0].x,m.sprite.y-m.path[0].y)<5)m.path.shift();
          const next=m.path[0];let moving=false;
          if(next){const dx=next.x-m.sprite.x,dy=next.y-m.sprite.y,len=Math.hypot(dx,dy),step=Math.min(len,delta*(chasing?.052:.027));
            const moved=moveWithCollision(this.map,m.sprite.x,m.sprite.y,dx/len*step,dy/len*step,COLLIDER);
            if(!this.inSafeZone(moved)){const ax=moved.x-m.sprite.x,ay=moved.y-m.sprite.y;if(Math.hypot(ax,ay)>.01){m.sprite.setPosition(moved.x,moved.y);m.facing=directionFromVector(ax,ay);m.agent.playControlled(chasing?"run":"walk",m.facing);moving=true;}}
          }
          if(!moving)m.agent.playControlled("idle",m.facing);
        }else{m.path=[];m.agent.playControlled("idle",m.facing);}
      }
    }
    setYDepth(m.sprite,m.sprite.y+15);m.label.setPosition(m.sprite.x,m.sprite.y-32);setYDepth(m.label,m.sprite.y+15,2);
    m.bar.clear().fillStyle(0x090c10,.9).fillRect(m.sprite.x-16,m.sprite.y-25,32,3).fillStyle(0xac503e).fillRect(m.sprite.x-16,m.sprite.y-25,32*m.health/m.max,3);setYDepth(m.bar,m.sprite.y+15,3);
  }
  private createMobs(): void {

    const mapName = WORLD_DESTINATIONS.find(d=>d.id===this.map.folder)?.name;
    const roster=CLASSIC_MONSTERS.filter(m=>m.map===mapName).sort((a,b)=>Number(!!a.boss)-Number(!!b.boss));
    if(roster.length) {
      roster.flatMap((kind,i)=>{
        const homes=townName(this.map.folder)?monsterHomes(i):[{x:this.home.x+170,y:this.home.y+100},{x:this.home.x-170,y:this.home.y+100},{x:this.home.x+100,y:this.home.y-160}];
        return (kind.boss?homes.slice(0,1):homes).map(home=>({kind,home}));
      }).forEach(({kind,home:desired})=>{
        const home=nearestWalkable(this.map,desired,COLLIDER,14);
        if(!home||this.inSafeZone(home)||!findPath(this.map,this.home,home,COLLIDER))return;
        const agent=new CharacterAgent(this.scene,this.map,{atlasKey:characterAtlasKey(kind.id),manifest:characterManifest(this.scene,kind.id),id:`classic-${kind.name}`,role:"monster",x:home.x,y:home.y,footOffsetY:10,roaming:false});
        agent.sprite.setScale(kind.boss?.6:.5);
        const mob:Mob={classic:kind,attackMs:0,strikeAt:0,struck:false,hurtMs:0,facing:"south",agent,sprite:agent.sprite,home,health:kind.hp,max:kind.hp,boss:!!kind.boss,path:[],repath:0,cooldown:1200,dead:0,hitRadius:kind.boss?19:14,label:this.scene.add.text(home.x,home.y-32,`${kind.boss?'BOSS · ':''}${kind.name} · Nv.${kind.level}`,{fontFamily:"Arial",fontSize:kind.boss?"9px":"8px",color:kind.boss?"#ffd378":"#e0d5bd",stroke:"#101414",strokeThickness:3}).setOrigin(.5),bar:this.scene.add.graphics(),hit:(x,y,strength)=>this.hitMob(mob,x,y,strength)};
        this.mobs.push(mob);
      });
      if(townName(this.map.folder))return;
    }
    const offsets = [[70,60],[-65,100],[145,90],[-120,40],[100,175],[-100,190],[205,155]];
    offsets.forEach(([dx,dy],i) => {
      const home = nearestWalkable(this.map, {x:this.home.x+dx,y:this.home.y+dy}, COLLIDER,12); if (!home) return;
      const kind = MONSTERS[i % MONSTERS.length];
      const agent = new CharacterAgent(this.scene,this.map,{atlasKey:characterAtlasKey(kind.id),manifest:characterManifest(this.scene,kind.id),id:`rift-${i}`,role:"monster",x:home.x,y:home.y,footOffsetY:10,roaming:false,preferredClips:["walking-6-frames"]});
      const boss = i === offsets.length-1;
      agent.sprite.setScale(boss ? .6 : .5);
      const max = boss ? 240 : 60+i*8;
      const mob: Mob = { attackMs:0,strikeAt:0,struck:false,hurtMs:0,facing:"south",agent, sprite:agent.sprite, home, health:max, max, boss, path:[], repath:0, cooldown:1200, dead:0, hitRadius:boss?19:14, label:this.scene.add.text(home.x,home.y-32,boss?`${kind.name} · ELITE`:kind.name,{fontFamily:"Arial",fontSize:boss?"9px":"8px",color:boss?"#f7a6ba":"#e0d5bd",stroke:"#101414",strokeThickness:3}).setOrigin(.5), bar:this.scene.add.graphics(), hit:(x,y,strength) => this.hitMob(mob,x,y,strength) };
      this.mobs.push(mob);
    });
  }
  private get nearMaster(): boolean { return Phaser.Math.Distance.Between(this.player.sprite.x,this.player.sprite.y,this.wingMaster.sprite.x,this.wingMaster.sprite.y)<65; }
  private createWingMaster(): void {
    const p=nearestWalkable(this.map,{x:this.home.x-40,y:this.home.y-15},{width:6,height:4,footOffsetY:10},10) ?? this.home;
    this.wingMaster=new CharacterAgent(this.scene,this.map,{atlasKey:characterAtlasKey(WING_MASTER),manifest:characterManifest(this.scene,WING_MASTER),id:"wing-master",role:"wing-master",x:p.x,y:p.y,footOffsetY:10,roaming:false});
    this.wingMaster.sprite.setScale(.5);
    this.masterLabel=this.scene.add.text(p.x,p.y-27,"MESTRE DAS ASAS",{fontFamily:"Arial",fontSize:"8px",color:"#f4d78e",stroke:"#15151d",strokeThickness:3}).setOrigin(.5);setYDepth(this.masterLabel,p.y+10,2);
    this.masterButton=document.createElement("button");this.masterButton.dataset.action="master";this.masterButton.textContent="E · Conversar com Mestre das Asas";this.masterButton.style.cssText="position:absolute;left:50%;bottom:180px;transform:translateX(-50%);pointer-events:auto;padding:12px;border:1px solid #c8a56b;background:#171d29;color:#f4d78e;border-radius:8px;max-width:90%";this.masterButton.hidden=true;this.root.append(this.masterButton);
  }
  private hitMob(mob: Mob,x: number,y: number,strength: number): boolean {
    if (!this.active || this.inSafeZone(this.player.worldPosition) || this.inSafeZone(mob.sprite) || mob.dead || !mob.agent.hit(x,y,strength)) return false;
    const dmg = Math.max(1,Math.round((this.damage + (this.spellHit ? (this.save.hero === "Feiticeiro" ? 22 : 10) : 0))*this.powerMultiplier)-(mob.classic?.defense??0));
    mob.attackMs=0; mob.path=[];
    if(mob.classic)mob.hurtMs=mob.agent.playControlled("hurt",mob.facing,true);
    mob.health = Math.max(0,mob.health-dmg); this.float(mob.sprite.x,mob.sprite.y-18,`${dmg}`,"#f6d596");
    if (!mob.health) {
      mob.dead = mob.classic?.respawnMs ?? (mob.boss ? 22000 : 10000);
      mob.hurtMs=0;
      if(mob.classic){mob.sprite.clearTint();mob.agent.playControlled("death",mob.facing,true);}else mob.sprite.setVisible(false); mob.label.setVisible(false); mob.bar.clear();
      const xp = hardKillXp(mob.classic?.exp ?? (mob.boss ? 120 : 35), this.cloud.vip); const gold = Math.round((mob.classic?.zen ?? (mob.boss ? 100 : 20)) * (this.cloud.vip==="diamante"?1.5:this.cloud.vip==="ouro"?1.25:1));
      const drop=!mob.classic||Math.random()<mob.classic.dropChance;
      if(mob.boss){const eligible=ARMOR_ITEMS.filter(i=>i.source!=="premium"&&i.level<=this.save.level&&!this.gear.owned.includes(i.id));if(eligible.length){const item=Phaser.Utils.Array.GetRandom(eligible);this.save.gearOwned=[...this.gear.owned,item.id];this.log(`Encontrou: ${item.name}`);}}
      // Conjuntos de queda: 1,5% por monstro (VIP Ouro 2%, Diamante 2,5%), 25% nos bosses.
      const setChance=mob.boss?.25:this.cloud.vip==="diamante"?.025:this.cloud.vip==="ouro"?.02:.015;
      if(Math.random()<setChance){const piece=dropArmorFor(this.save,this.save.level);if(piece){this.save.gearOwned=[...this.gear.owned,piece.id];this.log(`Caiu: ${piece.name}!`);this.banner(`Caiu: ${piece.name}`);}}
      if(mob.boss||Math.random()<.12){const level=1+Math.floor(Math.random()*Math.min(7,1+Math.floor(this.save.level/3)));this.log(`Encontrou: ${grantBox(this.save,level)}`);}
      this.save.xp += xp; this.save.gold += gold; this.save.kills++; if(drop)this.save.items++;
      this.log(`${mob.boss?"Guardião derrotado":"Fera derrotada"} · +${xp} EXP · +${gold} ouro${drop?" · 1 fragmento":""}`);
      while(this.save.xp >= xpToNext(this.save.level)) { this.save.xp -= xpToNext(this.save.level); this.save.level++; this.save.points += 5; this.health=this.maxHealth; this.mana=80; this.log(`NÍVEL ${this.save.level}! +5 pontos de atributos`); this.banner(`Nível ${this.save.level}`); }
      this.persist();
    }
    this.render(); return true;
  }
  slash(origin: Point,direction: Direction): void {
    if (!this.active || this.inSafeZone(origin)) return;
    if (this.weaponRanged(origin,direction)) return;
    const vec = vectorFromDirection(direction);
    this.spellHit=false;
    this.targets.forEach(m => { const dx=m.sprite.x-origin.x,dy=m.sprite.y-origin.y; const forward=dx*vec.x+dy*vec.y; if(forward>=-8&&forward<52&&Math.abs(dx*vec.y-dy*vec.x)<29) m.hit(origin.x,origin.y,100); });
  }
  weaponRanged(origin: Point,direction: Direction): boolean {
    if(this.unarmed || (this.save.hero!=="Arqueiro"&&this.save.hero!=="Feiticeiro"))return false;
    if(this.active&&!this.inSafeZone(origin))this.weaponShots.cast(origin,direction,this.save.hero==="Arqueiro"?"arrow":"magic");
    return true;
  }
  allowSpell(): boolean {
    if (!this.active || this.inSafeZone(this.player.worldPosition) || this.mana<9) { if(this.active) this.log("Mana insuficiente. Ela se regenera com o tempo."); return false; }
    this.mana-=9; return true;
  }
  update(delta: number): void {
    animateElementalImages(this.root, this.scene.time.now);
    if (this.running) {
      for(const key of ["I","C","B"]) if(this.keys[key]&&Phaser.Input.Keyboard.JustDown(this.keys[key])) this.action(key);
      if(this.active) for(const key of ["Q","E","R"]) if(this.keys[key]&&Phaser.Input.Keyboard.JustDown(this.keys[key])) this.action(key);
    }
    if(this.active) ["ONE","TWO","THREE","FOUR"].forEach((key,i)=>{if(this.keys[key]&&Phaser.Input.Keyboard.JustDown(this.keys[key]))this.action(`power:${i}`);});
    if(this.active)this.weaponShots.update(delta,this.targets);
    this.touchMovement.setActive(this.active);
    this.hud.setVisible(this.active);
    if(this.touchMovement.engaged)(window as unknown as {stopWalk?:()=>void}).stopWalk?.();
    this.hudMs+=delta; if(this.hudMs>150){this.hudMs=0;this.updateHud();}
    this.wings.update(this.save.wings, this.running, this.equippedWing);
    this.refreshLook();
    this.look.update(this.running);
    this.masterButton.hidden = !this.running || !!this.modal.innerHTML || !this.nearMaster;
    if(this.active) this.wingMaster.update(delta);
    this.heroLabel.setPosition(this.player.sprite.x,this.player.sprite.y-24).setText(`${this.cloud.vip?"★ ":""}${this.save.name} · Nv.${this.save.level}`).setColor(this.cloud.vip==="diamante"?"#9fe0ff":this.cloud.vip==="ouro"?"#ffd36b":"#ead398");
    if (!this.active) return;
    const safeNow=this.inSafeZone(this.player.worldPosition);if(safeNow!==this.wasSafe){this.wasSafe=safeNow;this.banner(safeNow?"Você entrou em uma zona segura.":"Você saiu da zona segura.");this.log(safeNow?"Você entrou em uma zona segura.":"Você saiu da zona segura.");}
    this.monsterCombat.update(delta,this.player.worldPosition,p=>this.inSafeZone(p),damage=>this.receiveMonsterDamage(damage));
    if(!this.active)return;
    if(this.auto&&!this.touchMovement.engaged)this.autoHunt(delta);
    this.elapsed+=delta; this.mana=Math.min(80,this.mana+delta*.004); this.health=Math.min(this.maxHealth,this.health+delta*.0007);
    for(const m of this.mobs) {
      if(m.dead) { if(m.classic){m.agent.update(delta);if(m.dead<(m.classic.respawnMs-1200))m.sprite.setVisible(false);} m.dead-=delta; if(m.dead<=0) {m.dead=0;m.health=m.max;m.sprite.setPosition(m.home.x,m.home.y).setVisible(true);m.label.setVisible(true);m.path=[];m.attackMs=0;m.hurtMs=0;m.cooldown=1800;if(m.classic)m.agent.playControlled("idle",m.facing);} continue; }
      if(m.classic){this.updateClassicMob(m,delta);continue;}
      const beforeX=m.sprite.x,beforeY=m.sprite.y;
      m.agent.update(delta); m.cooldown-=delta; m.repath-=delta;
      const distance=Phaser.Math.Distance.Between(m.sprite.x,m.sprite.y,this.player.sprite.x,this.player.sprite.y);
      if(distance<105&&distance>24&&!m.agent.stunned&&Phaser.Math.Distance.Between(this.player.sprite.x,this.player.sprite.y,this.home.x,this.home.y)>64) {
        if(m.repath<=0) {m.path=findPath(this.map,{x:m.sprite.x,y:m.sprite.y},this.player.worldPosition,COLLIDER) ?? [];m.repath=700;}
        while(m.path.length&&Phaser.Math.Distance.Between(m.sprite.x,m.sprite.y,m.path[0].x,m.path[0].y)<6) m.path.shift();
        const target=m.path[0]; if(target) {const dx=target.x-m.sprite.x,dy=target.y-m.sprite.y,len=Math.hypot(dx,dy); const moved=moveWithCollision(this.map,m.sprite.x,m.sprite.y,dx/len*delta*.038,dy/len*delta*.038,COLLIDER);const actualX=moved.x-m.sprite.x,actualY=moved.y-m.sprite.y;m.sprite.setPosition(moved.x,moved.y); if(actualX||actualY) {const facing=directionFromVector(actualX,actualY);m.sprite.setData("facing",facing);m.agent.playControlled("walking-6-frames",facing);}}
      }
      if(Math.hypot(m.sprite.x-beforeX,m.sprite.y-beforeY)<.01&&!m.agent.stunned)m.agent.playControlled("breathing-idle",m.sprite.getData("facing") as Direction || "south");
      if(distance<31&&m.cooldown<=0&&Phaser.Math.Distance.Between(this.player.sprite.x,this.player.sprite.y,this.home.x,this.home.y)>64) {m.cooldown=m.boss?1300:1800;const dmg=Math.max(2,(m.boss?18:6)-this.save.armor*3);this.health-=dmg;this.float(this.player.sprite.x,this.player.sprite.y-18,`−${dmg}`,"#fa8577");this.player.sprite.setTint(0xf89c99);this.scene.time.delayedCall(120,()=>this.player.sprite.clearTint());if(this.health<=0){this.defeat();return;}}
      setYDepth(m.sprite,m.sprite.y+15);m.label.setPosition(m.sprite.x,m.sprite.y-32);setYDepth(m.label,m.sprite.y+15,2);m.bar.clear().fillStyle(0x090c10,.9).fillRect(m.sprite.x-16,m.sprite.y-25,32,3).fillStyle(m.boss?0xd284ab:0xac503e).fillRect(m.sprite.x-16,m.sprite.y-25,32*m.health/m.max,3);setYDepth(m.bar,m.sprite.y+15,3);
    }
    this.renderMs+=delta; if(this.renderMs>250){this.renderMs=0;this.render();}
  }
  private action(action: string): void {
    if(this.kundunOpening.busy)return;
    if(action.startsWith("class:")){const hero=HEROES.find(h=>h.name===action.slice(6));if(hero){this.selected=hero.name;this.startScreen();}return;}
    if(action==="start") {this.confirmDelete=false;const input=this.modal.querySelector<HTMLInputElement>("input.rpg-name");this.save.hero=this.selected;if(!this.stored){this.save.name=(input?.value.trim()||"Viajante").slice(0,18);this.save.wings=false;delete this.save.wingId;}this.stored=true;this.syncHero();this.health=this.maxHealth;this.mana=80;this.running=true;this.modal.innerHTML="";this.log("Bem-vindo! Clique no chão para andar ou abra Mapas para viajar.");this.persist();this.render();return;}
    if(action==="heroes"){this.confirmDelete=false;this.startScreen();return;}
    if(action.startsWith("slot:")){const n=Number(action.slice(5));if(!Number.isInteger(n)||n<0||n>=MAX_CHARS||n===this.slot)return;this.persistIfStored();void this.cloud.flush().finally(()=>{try{localStorage.setItem(SLOT_KEY,String(n));}catch{/* ignore */}location.reload();});return;}
    if(action==="delchar"){if(!this.stored)return;if(!this.confirmDelete){this.confirmDelete=true;this.startScreen();return;}
      const slot=this.slot;try{localStorage.removeItem(slotKey(slot));}catch{/* ignore */}
      void (this.cloud.loggedIn?this.cloud.deleteChar(slot):Promise.resolve(true)).finally(()=>location.reload());return;}
    if(action==="account"){this.showAccount();return;}
    if(action==="site"){this.persist();void this.cloud.flush().finally(()=>{location.href="/";});return;}
    if(action==="login"||action==="register"){void this.accountSubmit(action);return;}
    if(action==="logout"){void this.cloud.logout().then(()=>{this.accountMessage="Você saiu da conta. O progresso continua salvo neste aparelho.";this.showAccount();this.render();});return;}
    if(action==="cloud-save"){this.cloud.push(this.save);void this.cloud.flush().then(()=>{this.accountMessage=this.cloud.status;this.showAccount();});return;}
    if(action==="account-back"){if(this.running){this.modal.innerHTML="";}else this.startScreen();return;}
    if(!this.running) return;
    if(action==="maps"){this.showMaps();return;}
    if(action.startsWith("travel:")){
      const id=action.slice(7);if(!WORLD_DESTINATIONS.some(d=>d.id===id)||!this.travelHandler)return;
      this.modal.innerHTML='<div class="rpg-overlay"><section class="rpg-window"><h2>Viajando…</h2></section></div>';
      void this.travelHandler(id).then(()=>{this.modal.innerHTML="";this.banner(this.map.map.name);}).catch((error:unknown)=>{this.showMaps();this.banner("Não foi possível viajar. Tente novamente.");console.error(error);});return;
    }
    if(action==="master"){if(this.nearMaster)this.showWindow("W");else this.banner("Aproxime-se do Mestre das Asas no refúgio.");return;}
    if(action==="kundun"||action.startsWith("kundun:")){
      if(!this.running||this.health<=0)return;
      if(action!=="kundun"){const result=kundunAction(this.save,action);if(result){this.log(result);for(const toast of this.root.querySelectorAll('.rpg-toast'))toast.remove();this.persist();
        if(action.startsWith('kundun:open:')){this.showWindow('K');this.render();this.kundunOpening.play(this.root,Number(action.split(':')[2]),result,()=>{this.showWindow('K');this.render();});return;}
        this.banner(result);
      }}
      this.showWindow("K");this.render();return;
    }
    if(action==="arsenal"||action.startsWith("arsenal:")){
      if(this.health<=0)return;
      elementalAction(this.save,action);this.syncHero();this.persist();this.showWindow("A");this.render();return;
    }
    if(action==="glacial"||action.startsWith("glacial:")){
      if(this.health<=0)return;
      if(action!=="glacial")glacialAction(this.save,action);
      if(action.startsWith("glacial:equip:")&&this.glacial.weapon)delete this.save.elementalEquipped;
      this.syncHero();this.health=Math.min(this.health,this.maxHealth);this.persist();this.showWindow("G");this.render();return;
    }
    if(action==="sets"){if(this.running&&this.health>0)this.showWindow("S");return;}
    if(action.startsWith("gear:")){
      if(!this.running||this.health<=0)return;
      const [,_verb,...parts]=action.split(":"), id=parts.join(":"), item=ARMOR_ITEMS.find(i=>i.id===id);
      if(!item)return;
      const state=this.gear;
      if(_verb==="buy"&&item.source==="loja"&&!state.owned.includes(id)&&this.save.gold>=item.price){this.save.gold-=item.price;this.save.gearOwned=[...state.owned,id];}
      if(_verb==="equip"&&state.owned.includes(id)&&this.save.level>=item.level){this.save.gearEquipped={...state.equipped,[item.slot]:id};if(this.save.glacialEquipped)delete this.save.glacialEquipped[item.slot];}
      if(_verb==="remove"&&state.equipped[item.slot]===id){delete state.equipped[item.slot];this.save.gearEquipped=state.equipped;}
      this.health=Math.min(this.health,this.maxHealth);this.persist();this.showWindow("S");this.render();return;
    }
    if(action==="catalog"){this.showWindow("W");return;}
    if(action.startsWith("equip-wing:")){const wing=WING_CATALOG.find(w=>w.id===action.slice(11));if(wing&&ownedWings(this.save.wingsOwned).includes(wing.id)){this.save.wingId=wing.id;this.save.wings=true;this.persist();}else if(wing)this.banner("Compre esta asa na loja primeiro.");this.showWindow(this.modal.dataset.view==="B"?"B":"W");return;}
    if(action==="premium"){this.showWindow("P");return;}
    if(action.startsWith("pay:")){const item=action.slice(4);
      if(!this.cloud.loggedIn){this.accountMessage="Para comprar com dinheiro real, entre ou crie sua conta (a compra fica guardada nela).";this.showAccount();return;}
      if(!this.cloud.payEnabled){this.banner("Pagamento com dinheiro real em breve.");return;}
      this.banner("Abrindo pagamento…");
      void this.cloud.checkout(item).then(r=>{if(r.ok&&r.data?.url){this.persist();location.href=r.data.url;}else this.banner(r.error||"Não foi possível abrir o pagamento.");});return;}
    if(action.startsWith("pay-wing:")){const wing=WING_CATALOG.find(w=>w.id===action.slice(9));if(!wing)return;
      if(!this.cloud.loggedIn){this.accountMessage="Para comprar com dinheiro real, entre ou crie sua conta (a asa fica guardada nela).";this.showAccount();return;}
      if(!this.cloud.payEnabled){this.banner("Pagamento com dinheiro real em breve.");return;}
      this.banner("Abrindo pagamento…");
      void this.cloud.checkout(`wing:${wing.id}`).then(r=>{if(r.ok&&r.data?.url){this.persist();location.href=r.data.url;}else this.banner(r.error||"Não foi possível abrir o pagamento.");});return;}
    if(action.startsWith("buy-wing:")){const wing=WING_CATALOG.find(w=>w.id===action.slice(9));if(wing){const owned=ownedWings(this.save.wingsOwned),price=wingPrice(wing);if(owned.includes(wing.id))this.banner("Você já tem esta asa.");else if(this.save.gold<price)this.banner(`Faltam ${price-this.save.gold} ouro.`);else{this.save.gold-=price;this.save.wingsOwned=[...owned,wing.id];this.save.wingId=wing.id;this.save.wings=true;this.log(`Asa comprada: ${wing.family} Nv.${wing.level} (−${price} ouro)`);this.banner(`Asa ${wing.family} Nv.${wing.level}!`);this.persist();this.render();}}this.showWindow(this.modal.dataset.view==="B"?"B":"W");return;}
    if(action==="wings"){this.save.wings=!this.save.wings;this.persist();this.showWindow("I");return;}
    if(this.health<=0 && action!=="revive") return;
    if(action==="close"){this.modal.innerHTML="";return;}
    if(["I","C","B"].includes(action)){if(this.modal.dataset.view===action&&this.modal.innerHTML){this.modal.innerHTML="";return;}this.showWindow(action);return;}
    if(action==="revive"){this.health=this.maxHealth;this.mana=80;this.player.teleportTo(this.home.x,this.home.y);this.mobs.forEach(m=>{if(!m.dead)m.sprite.setPosition(m.home.x,m.home.y);m.path=[];m.cooldown=2000;});this.modal.innerHTML="";return;}
    if(!this.active && !["weapon","armor","buy","sell","strength","vitality"].includes(action))return;
    if(action==="Q"){if(this.save.potions&&this.health<this.maxHealth){this.save.potions--;this.health=Math.min(this.maxHealth,this.health+85);this.log("Poção utilizada · +85 vida");}}
    if(action==="R"){if(this.targets.some(m=>Phaser.Math.Distance.Between(m.sprite.x,m.sprite.y,this.player.sprite.x,this.player.sprite.y)<100)){this.log("Afaste-se dos monstros para retornar ao refúgio.");return;}this.player.teleportTo(this.home.x,this.home.y);this.health=this.maxHealth;this.mana=80;this.log("Refúgio: vida e mana recuperadas.");}
    if(action==="attack" && this.active && this.inSafeZone(this.player.worldPosition)){this.banner("Zona segura: saia da cidade para lutar.");return;}
    if(action==="attack" && this.active){const range=!this.unarmed&&(this.save.hero==="Arqueiro"||this.save.hero==="Feiticeiro")?260:52;const near=this.targets.filter(m=>Phaser.Math.Distance.Between(m.sprite.x,m.sprite.y,this.player.sprite.x,this.player.sprite.y)<range).sort((a,b)=>Phaser.Math.Distance.Between(a.sprite.x,a.sprite.y,this.player.sprite.x,this.player.sprite.y)-Phaser.Math.Distance.Between(b.sprite.x,b.sprite.y,this.player.sprite.x,this.player.sprite.y))[0];this.player.performAttack(near?directionFromVector(near.sprite.x-this.player.sprite.x,near.sprite.y-this.player.sprite.y):this.player.facing);}
    if(action==="auto"){this.auto=!this.auto;this.autoMs=0;if(!this.auto)(window as unknown as {stopWalk?:()=>void}).stopWalk?.();this.banner(this.auto?"Auto caça ligada":"Auto caça desligada");this.log(this.auto?"AUTO: atacando monstros próximos automaticamente.":"AUTO desligado.");this.render();return;}
    if(action==="spell" && this.active){if(this.inSafeZone(this.player.worldPosition)){this.banner("Combate desativado na zona segura.");return;}const near=this.nearestTarget(260);this.player.performSpell(near?directionFromVector(near.sprite.x-this.player.sprite.x,near.sprite.y-this.player.sprite.y):this.player.facing);return;}
    if(action==="E") {if(this.nearMaster)this.action("master");else this.castPower(1);return;}
    if(action.startsWith("power:")){if(this.inSafeZone(this.player.worldPosition)){this.banner("Combate desativado na zona segura.");return;}const slot=Number(action.slice(6));if(Number.isInteger(slot)&&slot>=0&&slot<4)this.castPower(slot);return;}
    if(action==="claim"){const required=(this.save.quest+1)*5;if(this.save.kills>=required){this.save.gold+=100;this.save.quest++;this.log("Contrato concluído · +100 ouro");this.banner("Contrato concluído");}}
    if(action==="weapon"||action==="armor"){const cost=80+(action==="weapon"?this.save.weapon:this.save.armor)*60;if(this.save.gold>=cost){this.save.gold-=cost;this.save[action]++;if(action==="weapon")this.syncHero();this.log(`${action==="weapon"?"Arma":"Armadura"} aprimorada para +${this.save[action]}`);}else this.log(`Você precisa de ${cost} ouro.`);this.showWindow("B");}
    if(action==="buy"){if(this.save.gold>=20){this.save.gold-=20;this.save.potions+=3;this.log("Compradas 3 poções.");}else this.log("Você precisa de 20 ouro.");this.showWindow("B");}
    if(action==="sell"){if(this.save.items){this.save.gold+=this.save.items*12;this.save.items=0;this.log("Fragmentos vendidos por 12 ouro cada.");}this.showWindow("I");}
    if(action==="strength"||action==="vitality"){if(this.save.points){this.save.points--;this.save[action]++;}this.showWindow("C");}
    this.persist();this.render();
  }
  private castPower(slot: number): void {
    if(!this.active||this.inSafeZone(this.player.worldPosition))return;
    const power=HERO_POWERS[this.save.hero][slot];
    if(!this.powers.ready(slot,this.elapsed)){this.log(`${power.name}: aguarde a recarga.`);return;}
    if(this.mana<power.cost){this.log(`${power.name}: precisa de ${power.cost} mana.`);return;}
    this.mana-=power.cost;
    const hitTimes=new Map<Mob,number>();
    this.powers.cast(this.save.hero,slot,{...this.player.worldPosition},vectorFromDirection(this.player.facing),this.targets,this.elapsed,(point,radius,multiplier)=>{
      if(!this.active)return;
      this.powerMultiplier=multiplier;
      for(const mob of this.targets){if(Phaser.Math.Distance.Between(point.x,point.y,mob.sprite.x,mob.sprite.y)<=radius+mob.hitRadius && this.elapsed-(hitTimes.get(mob)??-10000)>=180){if(mob.hit(point.x,point.y,100))hitTimes.set(mob,this.elapsed);}}
      this.powerMultiplier=1;
    });
    this.log(power.name);this.render();
  }
  private defeat():void {this.health=0;this.modal.dataset.view="defeat";this.save.gold=Math.floor(this.save.gold*.95);this.persist();this.modal.innerHTML=`<div class="rpg-overlay"><div class="rpg-window"><div class="rpg-caption">A FENDA COBROU SEU PREÇO</div><h2>Você caiu em batalha</h2><p>Você perdeu 5% do ouro. Seu nível e seus equipamentos foram preservados.</p><button data-action="revive" class="rpg-primary">Renascer no refúgio</button></div></div>`;this.render();}
  private persistIfStored():void{if(this.stored&&this.running)this.persist();}
  /** Lista dos 5 espaços: o que está no servidor (conta) e neste aparelho. */
  private charSlots(){
    const list:({slot:number;name:string;hero:string;level:number}|null)[]=[];
    for(let n=0;n<MAX_CHARS;n++){const c=this.cloud.loggedIn?this.cloud.chars.find(x=>x.slot===n):undefined;const l=localChar(n);list.push(c&&l?(c.level>=l.level?c:l):c??l);}
    if(this.stored)list[this.slot]={slot:this.slot,name:this.save.name,hero:this.save.hero,level:this.save.level};
    return list;
  }
  private startScreen():void {
    this.modal.dataset.view="start";
    const esc=(t:string)=>t.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
    const slots=this.charSlots();const used=slots.filter(Boolean).length;
    const cards=slots.map((c,n)=>{const hero=c?HEROES.find(h=>h.name===c.hero):undefined;const on=n===this.slot;
      return `<button class="rpg-slot ${on?"selected":""} ${c?"":"empty"}" data-action="slot:${n}">${hero?`<img class="rpg-hero-preview" src="${heroPreview(this.scene,hero)}" alt="">`:`<i>＋</i>`}<b>${c?esc(c.name):"Vazio"}</b><span>${c?`${esc(c.hero)} · Nv.${c.level}`:"Criar personagem"}</span></button>`;}).join("");
    const body=this.stored
      ?`<p>Personagem selecionado: <b>${esc(this.save.name)}</b> · ${this.save.hero} · Nível ${this.save.level}</p><button data-action="start" class="rpg-primary">⚔ Jogar com ${esc(this.save.name)} →</button> <button data-action="delchar" class="${this.confirmDelete?"rpg-danger":""}">${this.confirmDelete?"Toque de novo para EXCLUIR para sempre":"🗑 Excluir personagem"}</button>`
      :`<p><b>Espaço ${this.slot+1} vazio</b> · escolha a classe e o nome do novo personagem.</p><div class="rpg-classes">${HEROES.map(hero=>`<button class="rpg-class ${this.selected===hero.name?"selected":""}" data-action="class:${hero.name}"><img class="rpg-hero-preview" src="${heroPreview(this.scene,hero)}" alt="${hero.name}"><b>${hero.name}</b><span>${hero.description}</span></button>`).join("")}</div><input class="rpg-name" aria-label="Nome do herói" maxlength="18" placeholder="Nome do herói" value="Viajante"><button data-action="start" class="rpg-primary">Criar personagem →</button>`;
    this.modal.innerHTML=`<div class="rpg-overlay"><section class="rpg-window"><div class="rpg-caption">PERSONAGENS · ${used}/${MAX_CHARS}</div><h2>AETHER REBORN</h2><div class="rpg-slots">${cards}</div>${body} <button data-action="account">${this.cloud.loggedIn?`👤 ${esc(this.cloud.username!)}`:"👤 Entrar / criar conta"}</button><p style="font-size:10px;margin-bottom:0">Até 5 personagens por conta. ${this.cloud.loggedIn?"Todos salvos na nuvem.":"Salvos neste aparelho — entre na conta para guardar na nuvem."}<br>WASD mover · J atacar · L magia · 1–4 poderes · Q poção</p></section></div>`;
  }
  private showWindow(view:string):void {this.modal.dataset.view=view;const s=this.save;const item=(name:string,desc:string,action:string,label:string)=>`<div class="rpg-item"><strong>${name}</strong><span>${desc}</span><br><button data-action="${action}">${label}</button></div>`;let body="";
    if(view==="I")body=`<p>${s.gold} ouro · Equipamentos ativos abaixo</p><div class="rpg-items">${item("Conjuntos equipáveis · 20 peças","Raro · Lendário · Excelente · Mítico","sets","Abrir arsenal")}${item(this.unarmed?"Mãos vazias · sem arma":`Arma +${s.weapon}`,`${this.damage} dano efetivo${this.unarmed?" · J socos alternados / L soco forte":""}`,"B",this.unarmed?"Obter arma":"Aprimorar")}${item(`Armadura +${s.armor}`,`Reduz ${s.armor*3} dano`,"B","Aprimorar")}${item(`Poções ×${s.potions}`,"Recuperam 85 vida", "close","Voltar · Q para usar")}${item(`Fragmentos ×${s.items}`,"12 ouro por fragmento","sell","Vender todos")}${item("Asas equipáveis",s.wings?"Equipadas · cosméticas, sem voo":"Cosméticas · todas as cinco classes","wings",s.wings?"Retirar asas":"Equipar asas")}${item(`Asas · ${ownedWings(s.wingsOwned).length}/30`,"Angelical Nv.1 grátis · as outras na loja","catalog","Loja de asas")}</div>`;
    if(view==="A")body=elementalHtml(s);
    if(view==="G")body=glacialHtml(s);
    if(view==="I")body+=`<div class="rpg-items">${item("❄ Dragão Glacial · Especial","5 classes · 5 armas · pendente e 2 anéis","glacial","Abrir coleção glacial")}</div>`;
    if(view==="K")body=kundunHtml(s);
    if(view==="I")body+=`<div class="rpg-items">${item("Boxes de Kundun · +1 a +7","Sete visuais · abrir, comprar e resgatar presente","kundun","Abrir caixas de Kundun")}</div>`;
    if(view==="S")body=gearHtml(s,s.level,s.gold);
    if(view==="P")body=this.premiumHtml();
    if(view==="W")body=wingCatalogHtml(this.equippedWing,s.wings,s.wingsOwned,s.gold,this.cloud.payEnabled);
    if(view==="C")body=`<p>${s.hero} · Nível ${s.level} · ${s.xp}/${xpToNext(s.level)} EXP<br>${hardLabel(this.cloud.vip)}<br>Vida máxima ${this.maxHealth} · Dano ${this.damage}<br><b>${s.points} pontos disponíveis</b></p><div class="rpg-items">${item(`Força ${s.strength}`,"+3 dano por ponto","strength","Adicionar +1")}${item(`Vitalidade ${s.vitality}`,"+12 vida por ponto","vitality","Adicionar +1")}${item("Personagens","Até 5 personagens por conta","heroes","Trocar personagem")}</div>`;
    if(view==="B")body=`<p>Loja do refúgio · você tem <b>${s.gold} ouro</b>. Ferreiro, poções e asas.</p><button class="rpg-primary" data-action="premium">💎 Loja Premium · VIP, melhores sets e asas com dinheiro real</button><div class="rpg-items">${item(`Arma +${s.weapon} → +${s.weapon+1}`,"+9 dano. Sucesso garantido.","weapon",`${80+s.weapon*60} ouro`)}${item(`Armadura +${s.armor} → +${s.armor+1}`,"−3 dano recebido.","armor",`${80+s.armor*60} ouro`)}${item("3 poções","Recupere a vida durante a caçada.","buy","20 ouro")}</div><h3 style="font-family:Cinzel,serif;color:#e3c78f;margin:18px 0 6px">🪽 Asas</h3>${wingCatalogHtml(this.equippedWing,s.wings,s.wingsOwned,s.gold,this.cloud.payEnabled)}`;
    if(view==="I")body=`<button data-action="arsenal">⚔ Abrir coleção de armas animadas</button>`+body;
    const elemental=elementalState(s).equipped;
    if(elemental&&(view==="I"||view==="C"))body=`<section style="padding:12px;border:1px solid #82d3e6;border-radius:8px"><h3>Arma equipada</h3>${weaponImage(elemental,96)}<strong>${elemental.name}</strong><p>${elemental.effect} · Dano +${elemental.damage}</p><button data-action="arsenal">Ver arsenal</button></section>`+body;
    this.modal.innerHTML=`<div class="rpg-overlay"><section class="rpg-window"><button class="rpg-close" data-action="close">Fechar ×</button><div class="rpg-caption">AETHER REBORN</div><h2>${view==="I"?"Inventário":view==="C"?"Personagem":view==="W"?"Mestre das Asas":view==="S"?"Conjuntos equipáveis":view==="K"?"Boxes de Kundun":view==="G"?"Dragão Glacial":view==="A"?"Arsenal Elemental":view==="P"?"💎 Loja Premium":"Loja"}</h2>${body}<p style="font-size:10px">O combate fica pausado enquanto este painel estiver aberto.</p></section></div>`;}
  private render():void {const s=this.save;this.panel.innerHTML=`<header class="rpg-brand"><h1>AETHER</h1><small>R E B O R N</small></header><div class="rpg-region"><strong>${this.map.map.name.toUpperCase()}</strong><div>${this.inSafeZone(this.player.worldPosition)?"🛡 Zona segura":"⚔ Área de combate"}</div><div class="rpg-hard">⚠ ${hardLabel(this.cloud.vip)}</div></div><nav class="rpg-menu"><button data-action="I">Mochila [I]</button><button data-action="C">Herói [C]</button><button data-action="B">Loja [B]</button></nav><div class="rpg-help">WASD · mover / Shift · correr<br>${this.unarmed?"J · socos / L · soco forte":"J · golpe / L · magia"}<br>1–4 · poderes exclusivos / E · mestre próximo / poder 2<br>R · retornar ao refúgio</div><div class="rpg-feed">${this.messages.map(m=>`<div>${m}</div>`).join("")}</div><footer class="rpg-bottom"><div class="rpg-orb"><b>${Math.max(0,Math.ceil(this.health))}</b><span>VIDA / ${this.maxHealth}</span></div><div class="rpg-bars"><div class="rpg-character-line"><span>Nv.${s.level} · ${s.hero}</span><span>${s.gold} OURO</span></div><div class="rpg-xp"><i style="width:${Math.min(100,s.xp/xpToNext(s.level)*100)}%"></i></div><div class="rpg-powers">${this.powers.state(s.hero,this.elapsed).skills.map((p,i)=>`<button data-action="power:${i}" style="--power:#${HERO_POWERS[s.hero][i].color.toString(16).padStart(6,"0")}" title="${p.name} · ${p.cost} mana" ${p.remaining||this.mana<p.cost?"disabled":""}><em>${i+1}</em><span>${p.name}</span><small>${p.remaining?`${p.remaining}s`:`${p.cost} MP`}</small></button>`).join("")}</div><div class="rpg-actions"><button data-action="maps">🌍 Mapas</button><button data-action="attack"><em>J</em> Golpe</button><button data-action="Q"><em>Q</em> Poção ×${s.potions}</button></div></div><div class="rpg-orb mana"><b>${Math.floor(this.mana)}</b><span>MANA / 80</span></div></footer>`;if(s.hero==="Arqueiro"&&this.active)this.mana=Math.min(80,this.mana+.5);}
  private float(x:number,y:number,text:string,color:string):void {const label=this.scene.add.text(x,y,text,{fontFamily:"Arial",fontSize:"14px",fontStyle:"bold",color,stroke:"#121318",strokeThickness:3}).setOrigin(.5).setDepth(200000);this.scene.tweens.add({targets:label,y:y-26,alpha:0,duration:800,onComplete:()=>label.destroy()});}
  private banner(text:string):void {const el=document.createElement("div");el.className="rpg-toast";el.textContent=text;this.root.append(el);this.scene.time.delayedCall(2500,()=>el.remove());}
  private log(text:string):void {this.messages.unshift(text);this.messages=this.messages.slice(0,4);}
  private persist():void {if(!this.stored)return;try{localStorage.setItem(slotKey(this.slot),JSON.stringify(this.save));}catch{/* Storage disabled by the browser. */}this.cloud.push(this.save);}
  private onPageHide = (): void => { if(this.running) this.cloud.beacon(this.save); };
  private nearestTarget(range:number):Mob|undefined{const p=this.player.sprite;return this.targets.filter(m=>Phaser.Math.Distance.Between(m.sprite.x,m.sprite.y,p.x,p.y)<range).sort((a,b)=>Phaser.Math.Distance.Between(a.sprite.x,a.sprite.y,p.x,p.y)-Phaser.Math.Distance.Between(b.sprite.x,b.sprite.y,p.x,p.y))[0];}
  /** AUTO: walk to the nearest monster, use ready skills, then normal attacks; drink a potion at low life. */
  private autoHunt(delta:number):void{
    this.autoMs-=delta;this.autoWalkMs-=delta;if(this.autoMs>0)return;this.autoMs=140;
    if(this.health<this.maxHealth*.35&&this.save.potions>0){this.action("Q");}
    const p=this.player.worldPosition;
    // Alvo fixo: continua no mesmo monstro até ele morrer (ou fugir para longe), sem ficar trocando.
    const cur=this.autoTarget&&!this.autoTarget.dead&&!this.inSafeZone(this.autoTarget.sprite)?this.autoTarget:null;
    const curD=cur?Math.hypot(cur.sprite.x-p.x,cur.sprite.y-p.y):Infinity;
    const prey=cur&&curD<1100?{m:cur,d:curD}:this.mobs.filter(m=>!m.dead&&!this.inSafeZone(m.sprite)).map(m=>({m,d:Math.hypot(m.sprite.x-p.x,m.sprite.y-p.y)})).filter(o=>o.d<1100).sort((a,b)=>a.d-b.d)[0];
    this.autoTarget=prey?.m;
    const walk=window as unknown as {walkTo?:(x:number,y:number)=>void;stopWalk?:()=>void};
    if(!prey){walk.stopWalk?.();return;}
    const ranged=!this.unarmed&&(this.save.hero==="Arqueiro"||this.save.hero==="Feiticeiro");
    const range=ranged?190:30;
    const safe=this.inSafeZone(p);
    if(prey.d>range||safe){if(this.autoWalkMs<=0){this.autoWalkMs=450;walk.walkTo?.(prey.m.sprite.x,prey.m.sprite.y+(ranged?0:8));}return;}
    walk.stopWalk?.();
    const dir=directionFromVector(prey.m.sprite.x-p.x,prey.m.sprite.y-p.y);
    this.player.face(dir);
    const skills=this.powers.state(this.save.hero,this.elapsed).skills;
    for(let slot=3;slot>=0;slot--){const power=HERO_POWERS[this.save.hero][slot];if(!skills[slot]?.remaining&&this.mana>=power.cost+6&&prey.d<=Math.max(40,power.range*.8)&&!this.player.attackState.active){this.castPower(slot);return;}}
    this.player.performAttack(dir);
  }
  /** Junta as asas pagas (servidor) à coleção do herói. */
  private mergePaidWings():void{
    // Conjuntos e Dragão Glacial comprados com dinheiro real.
    let gotGear=false;
    for(const it of this.cloud.items){
      if(it.startsWith("set:")){const ids=ARMOR_ITEMS.filter(i=>i.setId===it.slice(4)).map(i=>i.id);const cur=this.save.gearOwned??[];const add=ids.filter(id=>!cur.includes(id));if(add.length){this.save.gearOwned=[...cur,...add];gotGear=true;}}
      if(it==="glacial:all"){const cur=this.save.glacialOwned??[];const add=GLACIAL_ITEMS.map(i=>i.id).filter(id=>!cur.includes(id));if(add.length){this.save.glacialOwned=[...cur,...add];gotGear=true;}}
    }
    if(gotGear){try{localStorage.setItem(slotKey(this.slot),JSON.stringify(this.save));}catch{/* ignore */}this.banner("Compra entregue! Veja em Sets / Glacial.");this.render();}
    const paid=this.cloud.paidWings.filter(id=>WING_CATALOG.some(w=>w.id===id));
    const owned=ownedWings(this.save.wingsOwned);const fresh=paid.filter(id=>!owned.includes(id));
    if(fresh.length){this.save.wingsOwned=[...owned,...fresh];this.save.wingId=fresh[fresh.length-1];this.save.wings=true;try{localStorage.setItem(slotKey(this.slot),JSON.stringify(this.save));}catch{/* ignore */}this.banner("Asa comprada entregue!");this.render();}
    return;
  }
  /** Volta do pagamento (?asa=ok): espera o servidor confirmar e entrega a asa. */
  private checkPaymentReturn():void{
    const params=new URLSearchParams(location.search);const q=params.get("compra")??params.get("asa");if(!q)return;
    history.replaceState(null,"",location.pathname);
    if(q!=="ok"){this.banner("Pagamento cancelado.");return;}
    this.banner("Pagamento recebido! Entregando sua compra…");
    let tries=0;const before=this.cloud.items.length+(this.cloud.vipUntil??"");
    const poll=()=>{tries++;void this.cloud.load().then(()=>{if(this.cloud.items.length+(this.cloud.vipUntil??"")!==before||tries>=12){if(this.cloud.vip)this.banner(`★ ${this.cloud.vip==="ouro"?"VIP Ouro":"VIP Diamante"} ativo!`);this.render();this.mergePaidWings();}else window.setTimeout(poll,2500);});};
    window.setTimeout(poll,1500);
  }
  private applyCloudSave(data:Record<string,unknown>,force:boolean):void{
    const save=data as unknown as Save;
    if(!save||!Number.isFinite(save.level)||save.level<1||!HEROES.some(h=>h.name===save.hero))return;
    const better=force||save.level>this.save.level||(save.level===this.save.level&&(save.xp??0)>=(this.save.xp??0))||!this.stored;
    if(!better){this.cloud.push(this.save);return;}
    this.save={...this.save,...save};this.selected=save.hero;this.stored=true;
    try{localStorage.setItem(slotKey(this.slot),JSON.stringify(this.save));}catch{/* ignore */}
    if(this.running){this.syncHero();this.health=this.maxHealth;this.mana=80;this.render();}
    else if(this.modal.dataset.view==="start")this.startScreen();
  }
  private showAccount():void{
    this.modal.dataset.view="account";
    const esc=(t:string)=>t.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
    const msg=this.accountMessage?`<p class="rpg-account-msg">${esc(this.accountMessage)}</p>`:"";
    const body=this.cloud.loggedIn
      ?`<p>Conectado como <b>${esc(this.cloud.username!)}</b>. Seu herói (nível ${this.save.level}) é salvo automaticamente na nuvem e pode ser continuado em qualquer aparelho.</p>${msg}<div class="rpg-account-actions"><button class="rpg-primary" data-action="cloud-save">☁ Salvar agora</button><button data-action="logout">Sair da conta</button><button data-action="account-back">Voltar</button></div>`
      :`<p>Entre com a mesma conta do jogo antigo (usuário ou e-mail) ou crie uma nova. Sem conta, o progresso fica salvo só neste aparelho.</p>${msg}
        <div class="rpg-account-forms"><form data-form="login"><h3>Entrar</h3><input name="login" autocomplete="username" placeholder="Usuário ou e-mail" maxlength="254"><input name="password" type="password" autocomplete="current-password" placeholder="Senha" maxlength="128"><button class="rpg-primary" data-action="login">Entrar</button></form>
        <form data-form="register"><h3>Criar conta</h3><input name="username" autocomplete="username" placeholder="Usuário (4-16, letras/números)" maxlength="16"><input name="email" type="email" autocomplete="email" placeholder="E-mail" maxlength="254"><input name="password" type="password" autocomplete="new-password" placeholder="Senha (8+, letras e números)" maxlength="128"><button data-action="register">Criar conta</button></form></div>
        <button data-action="account-back">Voltar</button>`;
    this.modal.innerHTML=`<div class="rpg-overlay"><section class="rpg-window"><button class="rpg-close" data-action="account-back">Fechar ×</button><div class="rpg-caption">CONTA · SALVAMENTO NA NUVEM</div><h2>Conta</h2>${body}</section></div>`;
    for(const form of this.modal.querySelectorAll("form"))form.addEventListener("submit",e=>{e.preventDefault();});
  }
  private async accountSubmit(kind:"login"|"register"):Promise<void>{
    const form=this.modal.querySelector<HTMLFormElement>(`form[data-form="${kind}"]`);if(!form)return;
    const v=(n:string)=>(form.elements.namedItem(n) as HTMLInputElement|null)?.value.trim()??"";
    const password=(form.elements.namedItem("password") as HTMLInputElement|null)?.value??"";
    this.accountMessage="Conectando…";this.showAccount();
    const r=kind==="login"?await this.cloud.login(v("login"),password):await this.cloud.register(v("username"),v("email"),password);
    if(!r.ok){this.accountMessage=r.error||"Não foi possível entrar.";this.showAccount();return;}
    this.accountMessage=kind==="login"?"Bem-vindo de volta!":"Conta criada!";if(kind==="register"){this.save.wings=false;delete this.save.wingId;if(this.stored)this.persist();}
    if(r.data?.save)this.applyCloudSave(r.data.save,false);else if(this.stored){this.cloud.push(this.save);await this.cloud.flush();}
    this.mergePaidWings();
    if(!this.running)this.startScreen();else this.showAccount();
    this.render();
  }
  private premiumHtml():string{
    const owned=this.cloud.items, vip=this.cloud.vip, until=this.cloud.vipUntil?new Date(this.cloud.vipUntil).toLocaleDateString("pt-BR"):"";
    const pay=(item:string,label:string,disabled=false)=>`<button class="rpg-pay" data-action="pay:${item}" ${disabled?"disabled":""}>${label}</button>`;
    const note=!this.cloud.loggedIn?`<p class="rpg-account-msg">Entre na sua conta para comprar: a compra fica guardada nela, em qualquer aparelho. <button data-action="account">👤 Entrar / criar conta</button></p>`:!this.cloud.payEnabled?`<p class="rpg-account-msg">Pagamento com dinheiro real em breve.</p>`:"";
    const vipCard=(plan:"ouro"|"diamante")=>{const name=plan==="ouro"?"VIP Ouro":"VIP Diamante";const plans=VIP_PLANS.filter(p=>p.plan===plan);
      return `<div class="rpg-item rpg-vip ${plan}"><strong>★ ${name}</strong><span>${VIP_PERKS[plan].join("<br>")}</span><br>${plans.map(p=>pay(p.id,`💳 ${p.days} dias · ${brlPrice(p.cents)}`)).join(" ")}</div>`;};
    const packs=PREMIUM_PACKS.filter(p=>!("hidden" in p&&p.hidden)).map(p=>{const has=owned.includes(p.id);return `<div class="rpg-item" style="border-color:${p.color}"><strong style="color:${p.color}">${p.name}</strong><span>${p.rarity} · ${p.desc}</span><br>${has?`<button disabled>Comprado ✓</button>`:pay(p.id,`💳 ${brlPrice(p.cents)}`)}</div>`;}).join("");
    return `<p>Compras com dinheiro real (cartão, pelo Stripe). Tudo fica na sua conta para sempre — o VIP vale pelos dias comprados e soma se você comprar de novo.</p>${note}
      <h3 style="font-family:Cinzel,serif;color:#e3c78f;margin:14px 0 4px">★ VIP</h3><p style="margin:0">${vip?`Seu VIP: <b>${vip==="ouro"?"Ouro":"Diamante"}</b> até ${until}.`:"Você ainda não é VIP."} No servidor HARD o EXP continua baixo para todos; o VIP ajuda um pouco.</p>
      <div class="rpg-items">${vipCard("ouro")}${vipCard("diamante")}</div>
      <h3 style="font-family:Cinzel,serif;color:#e3c78f;margin:14px 0 4px">🛡 Os 7 conjuntos mais fortes + Dragão Glacial</h3><div class="rpg-items">${packs}</div>
      <h3 style="font-family:Cinzel,serif;color:#e3c78f;margin:14px 0 4px">🪽 Asas</h3><p style="margin:0">As 29 asas pagas também saem por dinheiro real.</p><button data-action="catalog">Ver asas e preços</button>`;
  }
  /** Equipamento visível: cor do conjunto dominante no corpo, brilho de conjunto raro e faíscas da arma. */
  private refreshLook():void{
    const pieces:{color:string;rarity:string}[]=[];
    for(const id of Object.values(this.gear.equipped)){const it=ARMOR_ITEMS.find(i=>i.id===id);if(it)pieces.push({color:it.color,rarity:it.rarity});}
    for(const [slot,id] of Object.entries(this.glacial.equipped)){if(["Elmo","Armadura","Calça","Luvas","Botas"].includes(slot)&&id)pieces.push({color:"#9fe0ff",rarity:"Especial"});}
    const count=new Map<string,{n:number;rarity:string}>();
    for(const p of pieces){const c=count.get(p.color)??{n:0,rarity:p.rarity};c.n++;count.set(p.color,c);}
    const order=["Comum","Incomum","Raro","Lendário","Excelente","Mítico","Especial","Premium"];
    const best=[...count.entries()].sort((a,b)=>b[1].n-a[1].n||order.indexOf(b[1].rarity)-order.indexOf(a[1].rarity))[0];
    // No corpo, o Guardião de Aço aparece como aço prateado (o azul do ícone sumiria no Feiticeiro).
    const armorColor=best?(best[0]==="#79baff"?"#b4c2d0":best[0]):null;
    if(this.running&&this.heroCharacterId!==this.visualId)this.syncHero();
    const glowColor=best&&best[1].n>=3&&["Excelente","Mítico","Especial","Premium"].includes(best[1].rarity)?best[0]:null;
    const el=elementalState(this.save).equipped;
    const fx=el?.effect??"";
    const weaponColor=this.glacial.weapon?"#9fe0ff":el?(/gelo|ciano/i.test(fx)?"#8fe8ff":/chama|brasa|rubra/i.test(fx)?"#ff7a3a":/violeta/i.test(fx)?"#c79bff":/verde|natureza|folha/i.test(fx)?"#7dff8a":/prata/i.test(fx)?"#e8eef5":"#ffd36b"):null;
    const key=`${this.save.hero}|${armorColor}|${glowColor}|${weaponColor}`;
    if(key===this.lookKey)return;
    this.lookKey=key;
    this.look.set(this.save.hero,{armorColor,glowColor,weaponColor});
  }
  private updateHud():void{
    const st=this.powers.state(this.save.hero,this.elapsed).skills;
    this.hud.update({skills:st.map((p,i)=>({name:p.name,cost:p.cost,remaining:p.remaining,color:HERO_POWERS[this.save.hero][i].color})),mana:this.mana,potions:this.save.potions,auto:this.auto,unarmed:this.unarmed,safe:this.inSafeZone(this.player.worldPosition),account:this.cloud.username,nearMaster:this.running&&this.nearMaster});
  }
  destroy():void {window.removeEventListener("pagehide",this.onPageHide);void this.cloud.flush();this.hud.destroy();this.look.destroy();this.kundunOpening.destroy();this.monsterCombat.destroy();this.weaponShots.destroy();this.powers.destroy();this.touchMovement.destroy();this.wings.destroy();this.persist();this.root.remove();this.heroLabel.destroy();this.wingMaster.destroy();this.masterLabel.destroy();for(const m of this.mobs){m.agent.destroy();m.label.destroy();m.bar.destroy();}const hooks=window as unknown as Record<string,unknown>;delete hooks.rpgState;delete hooks.rpgAction;delete hooks.rpgApproach;delete hooks.rpgVisitMaster;}
}
