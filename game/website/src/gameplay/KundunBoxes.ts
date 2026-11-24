import { assetUrl } from '../pixellab/templateAssetPaths';
import { ARMOR_ITEMS } from './ArmorSets';
import { KUNDUN_ART } from './KundunArt';
export interface KundunSave { kundunBoxes?: Record<string,number>; kundunWelcome?: boolean; kundunLastReward?: string; gold:number; potions:number; gearOwned?:string[]; }
const THEMES=['Aço','Esmeralda','Safira Glacial','Rubi Infernal','Sol Dourado','Runas Sombrias','Astral Celestial'];
export const KUNDUN_BOXES=THEMES.map((theme,i)=>({id:`kundun:${i+1}`,level:i+1,name:`Box de Kundun +${i+1}`,theme,price:(i+1)*(i+1)*100,icon:KUNDUN_ART[i]}));
export function boxCount(save:KundunSave,id:string):number { const n=save.kundunBoxes?.[id];return Number.isSafeInteger(n)&&n!>0?Math.min(n!,999999):0; }
export function grantBox(save:KundunSave,level:number):string { const box=KUNDUN_BOXES[Math.max(0,Math.min(6,Math.floor(level)-1))];save.kundunBoxes={...save.kundunBoxes,[box.id]:boxCount(save,box.id)+1};return box.name; }
export function kundunAction(save:KundunSave,action:string):string|null {
 if(action==='kundun:welcome') {if(save.kundunWelcome)return null;save.kundunWelcome=true;KUNDUN_BOXES.forEach(b=>grantBox(save,b.level));return 'Recebeu uma Box de Kundun de cada nível!';}
 const match=/^kundun:(buy|open):([1-7])$/.exec(action);if(!match)return null;
 const box=KUNDUN_BOXES[Number(match[2])-1];
 if(match[1]==='buy'){if(save.gold<box.price)return null;save.gold-=box.price;grantBox(save,box.level);return `${box.name} comprada.`;}
 if(!boxCount(save,box.id))return null;
 save.kundunBoxes={...save.kundunBoxes,[box.id]:boxCount(save,box.id)-1};
 const gold=box.level*40+Math.floor(Math.random()*box.level*20),potions=Math.ceil(box.level/2);
 save.gold+=gold;save.potions+=potions;
 const tier=[0,0,1,1,2,2,3][box.level-1];
 const pool=ARMOR_ITEMS.filter(i=>i.setId===['steel-guardian','solar-sovereign','emerald-sentinel','astral-herald'][tier]&&!(save.gearOwned??[]).includes(i.id));
 let extra='';if(pool.length){const item=pool[Math.floor(Math.random()*pool.length)];save.gearOwned=[...new Set([...(save.gearOwned??[]),item.id])];extra=` · ${item.name} (${item.rarity}, requisito Nv.${item.level})`;}else{const bonus=box.level*70;save.gold+=bonus;extra=` · +${bonus} ouro extra (conjunto já completo)`;}
 const reward=`${box.name}: +${gold} ouro · +${potions} poções${extra}`;save.kundunLastReward=reward;return reward;
}
export function kundunHtml(save:KundunSave):string {return `<section><h3>Boxes de Kundun · +1 a +7</h3><p>Compre com ouro ou encontre em monstros (elites sempre deixam uma caixa). Níveis maiores de herói liberam drops maiores. Cada abertura consome 1 caixa e concede ouro, poções e 1 peça ainda não possuída do conjunto indicado. Conjunto completo: ouro extra. Requisitos para equipar continuam valendo.</p>${!save.kundunWelcome?'<button data-action="kundun:welcome">Resgatar presente: 1 caixa de cada nível</button>':''}${save.kundunLastReward?`<p role="status" style="color:#81e6d9">Última recompensa: ${save.kundunLastReward}</p>`:''}<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px">${KUNDUN_BOXES.map(b=>`<article style="border:1px solid #6e608c;border-radius:8px;padding:12px;background:rgba(255,255,255,.04)"><img src="${assetUrl(b.icon)}" alt="${b.name} · ${b.theme}" width="64" height="64" style="image-rendering:pixelated"><strong style="display:block">${b.name}</strong><small>${b.theme} · Quantidade: ${boxCount(save,b.id)}<br>Conjunto: ${['Guardião de Aço','Guardião de Aço','Soberano Solar','Soberano Solar','Sentinela Esmeralda','Sentinela Esmeralda','Arauto Astral'][b.level-1]}<br>${b.price} ouro</small><div><button data-action="kundun:open:${b.level}" ${boxCount(save,b.id)?'':'disabled'}>Abrir +${b.level}</button><button data-action="kundun:buy:${b.level}" ${save.gold>=b.price?'':'disabled'}>Comprar +${b.level}</button></div></article>`).join('')}</div></section>`;}
