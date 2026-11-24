import type Phaser from "phaser";
import { AUREA_MOUNT } from "./MountCatalog";
import { publicAssetUrl } from "../pixellab/templateAssetPaths";
import type { Direction } from "../shared/direction";

/** Creature-only inspection stable. Does not fake a standing hero as a seated rider. */
export class MountPreview {
  private root: HTMLDivElement;
  private image: HTMLDivElement;
  private elapsed: number = 0;
  private frame: number = 0;
  private action: string = "idle";
  private facing: Direction = "south";
  private opened: boolean = false;
  constructor(_scene: Phaser.Scene) {
    this.root = document.createElement("div");
    this.root.className = "mount-preview"; this.root.style.cssText = "position:absolute;z-index:10000;right:12px;top:100px;pointer-events:none;color:#f2e0b4;font:13px Arial;max-width:calc(100% - 24px)";
    this.root.innerHTML = `<button data-stable style="pointer-events:auto;background:#202731;color:#f3dfa5;border:1px solid #8d7546;padding:8px;border-radius:6px">Montaria · Áurea</button><section hidden style="pointer-events:auto;background:#151d28ee;border:1px solid #8d7546;padding:12px;border-radius:8px;width:270px;max-width:100%;box-sizing:border-box"><strong>Montaria Taurina Áurea</strong><p>Prévia sem cavaleiro. Poses sentadas dos heróis: próxima etapa.</p><label>Movimento <select data-motion>${AUREA_MOUNT.actions.map(a=>`<option value="${a}">${({idle:"Respirar",walk:"Caminhar",run:"Correr",jump:"Saltar",attack:"Atacar",hurt:"Receber golpe"})[a]}</option>`).join("")}</select></label><br><label>Direção <select data-facing>${AUREA_MOUNT.directions.map(d=>`<option>${d}</option>`).join("")}</select></label><p style="margin-bottom:0">Clique em Montaria para fechar.</p></section>`;
    this.image=document.createElement("div");
    this.image.style.cssText="width:248px;height:248px;max-width:100%;image-rendering:pixelated;background-size:1984px 1984px;background-repeat:no-repeat";
    this.root.querySelector("section")!.append(this.image);
    document.getElementById("hud-root")!.append(this.root);
    this.root.querySelector("[data-stable]")!.addEventListener("click",()=>this.show(!this.opened));
    this.root.querySelector("[data-motion]")!.addEventListener("change",e=>this.play((e.target as HTMLSelectElement).value,this.facing));
    this.root.querySelector("[data-facing]")!.addEventListener("change",e=>this.play(this.action,(e.target as HTMLSelectElement).value as Direction));
    const hooks=window as unknown as Record<string,unknown>;
    hooks.mountPreview=(action="idle",direction:Direction="south")=>{this.show(true);this.play(action,direction);};
    hooks.mountState=()=>({opened:this.opened,action:this.action,direction:this.facing,frame:this.frame,riderReady:false,animations:AUREA_MOUNT.actions.map(name=>({name,directions:8,frames:8})) });
  }
  private show(open:boolean):void {this.opened=open;this.root.querySelector("section")!.hidden=!open;if(open)this.play(this.action,this.facing);}
  private play(action:string,direction:Direction):void {
    if(!AUREA_MOUNT.actions.some(a=>a===action)||!AUREA_MOUNT.directions.some(d=>d===direction))return;
    this.action=action;this.facing=direction;this.elapsed=0;this.frame=0;
    (this.root.querySelector("[data-motion]") as HTMLSelectElement).value=action;
    (this.root.querySelector("[data-facing]") as HTMLSelectElement).value=direction;
    this.draw();
  }
  private draw():void {
    const directions:Direction[]=["south","south-east","east","north-east","north","north-west","west","south-west"];
    this.image.style.backgroundImage=`url("${publicAssetUrl("mounts","aurea",this.action+".png")}")`;
    this.image.style.backgroundPosition=`${-this.frame*248}px ${-directions.indexOf(this.facing)*248}px`;
  }
  update(delta:number):void {if(!this.opened)return;this.elapsed+=delta;const f=Math.floor(this.elapsed/100);this.frame=["idle","walk","run"].includes(this.action)?f%8:Math.min(7,f);this.draw();}
  destroy():void {this.root.remove();}
}
