import { assetUrl } from '../pixellab/templateAssetPaths';
import { GLACIAL_ART } from './GlacialArt';
export interface GlacialSave { glacialOwned?: string[]; glacialEquipped?: Record<string,string>; hero: string; level: number; gold: number; gearEquipped?: Record<string,string>; }
const CLASSES=['Cavaleiro','Feiticeiro','Arqueiro','Gladiador','Lorde Sombrio'];
const SLOTS=['Elmo','Armadura','Calça','Luvas','Botas','Arma'];
const WEAPONS=['Lâmina Glacial','Cajado Coração de Inverno','Arco Aurora Boreal','Rúnica Gêmea','Cetro Trono Congelado'];
export const GLACIAL_ITEMS=CLASSES.flatMap((hero,c)=>SLOTS.map((slot,i)=>({id:`glacial:${c}:${i}`,hero,slot,name:i===5?WEAPONS[c]:`${slot} Dragão Glacial · ${hero}`,icon:GLACIAL_ART[c*6+i],defense:i===5?0:i===1?16:10,damage:i===5?45:0,hp:0,price:i===5?1800:900,level:1}))).concat(['Pendente do Dragão','Anel do Gelo Eterno','Anel da Escama Glacial'].map((name,i)=>({id:`glacial:jewel:${i}`,hero:'Todas',slot:['Pendente','Anel 1','Anel 2'][i],name,icon:GLACIAL_ART[30+i],defense:4,damage:i===1?8:4,hp:i===0?30:15,price:700,level:1})));
export function glacialState(save:GlacialSave){
 const owned=[...new Set((save.glacialOwned??[]).filter(id=>GLACIAL_ITEMS.some(i=>i.id===id)))];
 const equipped:Record<string,string>={};
 for(const i of GLACIAL_ITEMS)if(owned.includes(i.id)&&(i.hero==='Todas'||i.hero===save.hero)&&save.level>=i.level&&save.glacialEquipped?.[i.slot]===i.id)equipped[i.slot]=i.id;
 const pieces=GLACIAL_ITEMS.filter(i=>equipped[i.slot]===i.id),armor=pieces.filter(i=>SLOTS.slice(0,5).includes(i.slot)).length;
 const complete=armor===5,full=pieces.length===9;
 return {owned,equipped,pieces,complete,full,defense:pieces.reduce((v,i)=>v+i.defense,0)+(complete?20:0),damage:pieces.reduce((v,i)=>v+i.damage,0)+(complete?15:0)+(full?15:0),hp:pieces.reduce((v,i)=>v+i.hp,0)+(complete?100:0),weapon:!!equipped.Arma};
}
export function glacialAction(save:GlacialSave,action:string):boolean {
 const m=/^glacial:(claim|buy|equip|remove):(.+)$/.exec(action);if(!m)return false;
 if(m[1]==='claim'&&m[2]==='class'){save.glacialOwned=[...new Set([...(save.glacialOwned??[]),...GLACIAL_ITEMS.filter(i=>i.hero==='Todas'||i.hero===save.hero).map(i=>i.id)])];return true;}
 const item=GLACIAL_ITEMS.find(i=>i.id===m[2]);if(!item)return false;const state=glacialState(save);
 if(m[1]==='buy'&&!state.owned.includes(item.id)&&save.gold>=item.price){save.gold-=item.price;save.glacialOwned=[...state.owned,item.id];}
 if(m[1]==='equip'&&state.owned.includes(item.id)&&(item.hero==='Todas'||item.hero===save.hero)&&save.level>=item.level){save.glacialEquipped={...state.equipped,[item.slot]:item.id};if(save.gearEquipped)delete save.gearEquipped[item.slot];}
 if(m[1]==='remove'&&state.equipped[item.slot]===item.id){delete state.equipped[item.slot];save.glacialEquipped=state.equipped;}
 return true;
}
export function glacialHtml(save:GlacialSave):string {
 const s=glacialState(save);
 return `<h3>❄ Dragão Glacial · ${save.hero}</h3><p>33 itens originais: 5 peças + arma para cada classe, 1 pendente e 2 anéis universais. Sem novas aparências ou animações do herói.</p><p>${save.gold} ouro · Defesa +${s.defense} · Dano +${s.damage} · Vida +${s.hp}<br>5 armaduras: +20 defesa, +15 dano e +100 vida ${s.complete?'· ATIVO':''}<br>9 itens: +15 dano extra ${s.full?'· ATIVO':''}</p><button data-action="glacial:claim:class">Resgatar coleção da minha classe (grátis)</button><p>Resgate único por item; a coleção fica salva. Também disponíveis por ouro. Trocar de classe desativa peças incompatíveis. Cada peça ocupa seu próprio espaço, substituindo armaduras antigas somente ao equipar.</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">${GLACIAL_ITEMS.map(i=>{const own=s.owned.includes(i.id),eq=s.equipped[i.slot]===i.id,compatible=i.hero==='Todas'||i.hero===save.hero;return `<article style="border:1px solid #6ecfdb;border-radius:8px;padding:12px;background:rgba(70,180,210,.06)"><img src="${assetUrl(i.icon)}" alt="${i.name}" width="48" height="48" style="image-rendering:pixelated"><strong style="display:block;color:#a3f3ff">${i.name}</strong><small>${i.hero} · Especial · Nv.${i.level}<br>${i.slot} · DEF +${i.defense} · Dano +${i.damage} · Vida +${i.hp}<br>${eq?'Equipado':own?'Na mochila':i.price+' ouro'}</small><br><button data-action="glacial:${eq?'remove':own?'equip':'buy'}:${i.id}" ${(!compatible&&own)||(!own&&save.gold<i.price)?'disabled':''}>${eq?'Desequipar':own?compatible?'Equipar':'Outra classe':'Comprar'}</button></article>`;}).join('')}</div>`;
}
