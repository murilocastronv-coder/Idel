import Phaser from "phaser";
import type { PlayerController } from "../player/PlayerController";
import type { LoadedMap } from "../pixellab/types";
import { findPath, type Point } from "../shared/navigation";
import { isPositionClear } from "../shared/collision";

/** A click selects a walkable route; keyboard movement takes priority. */
export class ClickTravel {
  private path: Point[] = [];
  private controlled: boolean = false;
  constructor(private scene: Phaser.Scene, private player: PlayerController, private map: LoadedMap, private active: () => boolean) {
    scene.input.on("pointerdown", this.click);
    scene.events.once("shutdown", () => scene.input.off("pointerdown", this.click));
    (window as unknown as Record<string, unknown>).walkTo = (x: number, y: number) => this.route(x,y);
    (window as unknown as Record<string, unknown>).stopWalk = () => this.cancel();
  }
  private target: Point | null = null;
  private route(x: number,y: number): void {
    if (!this.active()) return;
    // Mesmo destino (AUTO chama a cada instante): mantém a rota atual, sem recomeçar e sem tremer.
    if (this.path.length && this.target && Math.hypot(this.target.x-x,this.target.y-y) < 14) return;
    const p = this.player.worldPosition;
    const path = findPath(this.map,p,{x,y},{width:6,height:4,footOffsetY:10}) ?? [];
    // O primeiro ponto da rota é o centro do bloco onde o herói já está: se ele fica para trás,
    // pula, para não dar meio passo para trás a cada nova rota.
    while (path.length > 1 && Math.hypot(path[1].x-p.x,path[1].y-p.y) <= Math.hypot(path[1].x-path[0].x,path[1].y-path[0].y) + 2) path.shift();
    this.path = path;
    this.target = path.length ? {x,y} : null;
  }
  private click = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.button !== 0) return;
    const p = this.scene.cameras.main.getWorldPoint(pointer.x,pointer.y);
    this.route(p.x,p.y);
  };
  private clearLine(a: Point, b: Point): boolean {
    const len=Math.hypot(b.x-a.x,b.y-a.y), steps=Math.ceil(len/4);
    for(let i=1;i<=steps;i++){const t=i/steps;if(!isPositionClear(this.map,a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,{width:8,height:4,footOffsetY:15}))return false;}
    return true;
  }
    get walking(): boolean { return this.path.length > 0; }
  cancel(): void { this.target=null; if(this.path.length||this.controlled){this.path=[];this.player.setTouchMovement(0,0);this.controlled=false;} }
  setMap(map: LoadedMap): void { this.map=map;this.path=[];this.player.setTouchMovement(0,0); }
  update(): void {
    const keyboard = this.scene.input.keyboard;
    const manual = ["W","A","S","D","UP","DOWN","LEFT","RIGHT"].some(k => keyboard?.addKey(k).isDown);
    if (!this.active() || manual) {this.path=[];this.target=null;}
    const p=this.player.worldPosition;
    while(this.path.length && Math.hypot(this.path[0].x-p.x,this.path[0].y-p.y)<4)this.path.shift();
    if(!this.path.length)this.target=null;
    // Rota suavizada: mira no ponto mais distante (até 6 à frente) que dá para alcançar em linha reta,
    // em vez de seguir o zigue-zague dos blocos — assim o herói anda reto e não fica virando.
    let ahead=0;
    for(let k=Math.min(this.path.length-1,6);k>0;k--){if(this.clearLine(p,this.path[k])){ahead=k;break;}}
    if(ahead>0)this.path.splice(0,ahead);
    const next=this.path[0];
    // Direção normalizada: antes cada eixo era cortado em ±1 e o herói andava em zigue-zague.
    if(next) {const dx=next.x-p.x,dy=next.y-p.y,len=Math.hypot(dx,dy)||1;this.player.setTouchMovement(dx/len,dy/len);this.controlled=true;}
    else if(this.controlled){this.player.setTouchMovement(0,0);this.controlled=false;}
  }
}
