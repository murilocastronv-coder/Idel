import { assetUrl } from '../pixellab/templateAssetPaths';
import { ARMOR_ART } from './ArmorArt';
export interface GearSave { gearOwned?: string[]; gearEquipped?: Record<string,string>; }
const SLOTS = ['Elmo','Armadura','Calça','Luvas','Botas'];
export const ARMOR_SETS = [
  {id:'steel-guardian',name:'Guardião de Aço',rarity:'Raro',color:'#79baff',level:1,defense:2,price:0,bonusDefense:3,bonusHp:15,bonusDamage:2},
  {id:'solar-sovereign',name:'Soberano Solar',rarity:'Lendário',color:'#ffc968',level:5,defense:4,price:150,bonusDefense:5,bonusHp:30,bonusDamage:5},
  {id:'emerald-sentinel',name:'Sentinela Esmeralda',rarity:'Excelente',color:'#6fe5a3',level:10,defense:6,price:350,bonusDefense:8,bonusHp:50,bonusDamage:8},
  {id:'astral-herald',name:'Arauto Astral',rarity:'Mítico',color:'#c4a0ff',level:15,defense:9,price:700,bonusDefense:12,bonusHp:80,bonusDamage:12},
];
export const ARMOR_ITEMS=ARMOR_SETS.flatMap((set,si)=>SLOTS.map((slot,i)=>({id:`armor:${set.id}:${i}`,name:`${slot} · ${set.name}`,slot,setId:set.id,rarity:set.rarity,color:set.color,level:set.level,defense:set.defense+(i===1?2:0),price:set.price,icon:ARMOR_ART[si*5+i]})));
export function gearState(save:GearSave,level:number){
  const owned=[...new Set((save.gearOwned??[]).filter(id=>ARMOR_ITEMS.some(i=>i.id===id)))];
  const equipped:Record<string,string>={};
  for(const item of ARMOR_ITEMS)if(owned.includes(item.id)&&item.level<=level&&save.gearEquipped?.[item.slot]===item.id)equipped[item.slot]=item.id;
  const pieces=ARMOR_ITEMS.filter(i=>equipped[i.slot]===i.id);
  const complete=ARMOR_SETS.filter(set=>pieces.filter(i=>i.setId===set.id).length===5);
  return {owned,equipped,complete:complete.map(s=>s.name),defense:pieces.reduce((v,i)=>v+i.defense,0)+complete.reduce((v,s)=>v+s.bonusDefense,0),hp:complete.reduce((v,s)=>v+s.bonusHp,0),damage:complete.reduce((v,s)=>v+s.bonusDamage,0)};
}
export function gearHtml(save:GearSave,level:number,gold:number):string {
 const state=gearState(save,level);
 return `<h3>Arsenal · 4 conjuntos originais</h3><p>${gold} ouro · Defesa +${state.defense} · Vida +${state.hp} · Dano +${state.damage}<br>Todos os heróis · requisitos de nível · a armadura aparece no herói na cor do conjunto do herói.<br>O Guardião de Aço pode ser resgatado gratuitamente, uma vez por peça. Os demais são comprados ou encontrados em bosses.</p>`+ARMOR_SETS.map(set=>`<section style="border:1px solid ${set.color};border-radius:8px;padding:10px;margin:10px 0"><h3 style="color:${set.color}">${set.name} · ${set.rarity}</h3><p>5 peças: +${set.bonusDefense} defesa, +${set.bonusHp} vida, +${set.bonusDamage} dano ${state.complete.includes(set.name)?'· ATIVO':''}</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">${ARMOR_ITEMS.filter(i=>i.setId===set.id).map(item=>{const owned=state.owned.includes(item.id),equipped=state.equipped[item.slot]===item.id;return `<article style="background:rgba(255,255,255,.04);padding:10px;border-radius:6px"><img src="${assetUrl(item.icon)}" alt="${item.name}" width="48" height="48" style="image-rendering:pixelated"><strong style="display:block;color:${set.color}">${item.name}</strong><small>Nv.${item.level} · Defesa +${item.defense}<br>${equipped?'Equipado':owned?'Na mochila':item.price+' ouro'}</small><button data-action="gear:${equipped?'remove':owned?'equip':'buy'}:${item.id}" ${(!owned&&gold<item.price)||(owned&&!equipped&&level<item.level)?'disabled':''}>${equipped?'Desequipar':owned?'Equipar':item.price?'Comprar':'Resgatar'}</button></article>`;}).join('')}</div></section>`).join('');
}
