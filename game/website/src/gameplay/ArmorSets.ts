import { assetUrl } from '../pixellab/templateAssetPaths';
import { ARMOR_ART } from './ArmorArt';
export interface GearSave { gearOwned?: string[]; gearEquipped?: Record<string,string>; }
const SLOTS = ['Elmo','Armadura','Calça','Luvas','Botas'];
export const ARMOR_SETS = [
  {id:'steel-guardian',name:'Guardião de Aço',rarity:'Raro',color:'#79baff',level:1,defense:2,price:0,bonusDefense:3,bonusHp:15,bonusDamage:2},
  {id:'solar-sovereign',name:'Soberano Solar',rarity:'Lendário',color:'#ffc968',level:5,defense:4,price:150,bonusDefense:5,bonusHp:30,bonusDamage:5},
  {id:'emerald-sentinel',name:'Sentinela Esmeralda',rarity:'Excelente',color:'#6fe5a3',level:10,defense:6,price:350,bonusDefense:8,bonusHp:50,bonusDamage:8},
  {id:'astral-herald',name:'Arauto Astral',rarity:'Mítico',color:'#c4a0ff',level:15,defense:9,price:700,bonusDefense:12,bonusHp:80,bonusDamage:12},
  // 7 conjuntos de QUEDA: mais fracos, só caem de monstros (raro) e bosses.
  {id:'wild-leather',name:'Couro Selvagem',rarity:'Comum',source:'drop',color:'#b98a5a',level:3,defense:3,price:0,bonusDefense:4,bonusHp:20,bonusDamage:2},
  {id:'ancient-bronze',name:'Bronze Antigo',rarity:'Comum',source:'drop',color:'#cd7f32',level:6,defense:3,price:0,bonusDefense:5,bonusHp:25,bonusDamage:3},
  {id:'hound-scale',name:'Escamas de Hound',rarity:'Incomum',source:'drop',color:'#8fae5b',level:9,defense:4,price:0,bonusDefense:6,bonusHp:35,bonusDamage:4},
  {id:'lich-bone',name:'Ossos do Lich',rarity:'Incomum',source:'drop',color:'#d9d2b6',level:12,defense:5,price:0,bonusDefense:7,bonusHp:40,bonusDamage:5},
  {id:'yeti-fur',name:'Pele de Yeti',rarity:'Incomum',source:'drop',color:'#dfeefc',level:18,defense:6,price:0,bonusDefense:8,bonusHp:55,bonusDamage:6},
  {id:'agon-ember',name:'Brasas de Agon',rarity:'Raro',source:'drop',color:'#ff7043',level:22,defense:7,price:0,bonusDefense:9,bonusHp:60,bonusDamage:8},
  {id:'assassin-shadow',name:'Sombra do Assassino',rarity:'Raro',source:'drop',color:'#7b68a6',level:26,defense:7,price:0,bonusDefense:10,bonusHp:65,bonusDamage:9},
  // 7 conjuntos PREMIUM: os mais fortes do jogo, só na Loja Premium (dinheiro real).
  {id:'crimson-dragon',name:'Dragão Carmesim',rarity:'Premium',source:'premium',color:'#ff3b3b',level:20,defense:11,price:0,bonusDefense:16,bonusHp:110,bonusDamage:16},
  {id:'golden-phoenix',name:'Fênix Dourada',rarity:'Premium',source:'premium',color:'#ffb300',level:25,defense:12,price:0,bonusDefense:19,bonusHp:135,bonusDamage:19},
  {id:'eternal-frost',name:'Titã do Gelo Eterno',rarity:'Premium',source:'premium',color:'#7fe7ff',level:30,defense:13,price:0,bonusDefense:22,bonusHp:160,bonusDamage:22},
  {id:'celestial-guard',name:'Guardião Celestial',rarity:'Premium',source:'premium',color:'#fff1a8',level:35,defense:15,price:0,bonusDefense:26,bonusHp:190,bonusDamage:26},
  {id:'abyss-lord',name:'Senhor do Abismo',rarity:'Premium',source:'premium',color:'#9b4dff',level:40,defense:16,price:0,bonusDefense:30,bonusHp:220,bonusDamage:30},
  {id:'thunder-emperor',name:'Imperador do Trovão',rarity:'Premium',source:'premium',color:'#4da6ff',level:45,defense:18,price:0,bonusDefense:34,bonusHp:260,bonusDamage:35},
  {id:'kundun-legend',name:'Lenda de Kundun',rarity:'Premium',source:'premium',color:'#ff4dd2',level:50,defense:20,price:0,bonusDefense:40,bonusHp:320,bonusDamage:42},
];
type ArmorSet = typeof ARMOR_SETS[number];
export const setSource = (set: ArmorSet): 'loja'|'drop'|'premium' => ('source' in set ? set.source : 'loja') as 'loja'|'drop'|'premium';
/** Desenho do ícone: drop usa o do Guardião de Aço, premium o do Arauto Astral; a cor vem de um filtro. */
const artBase = (set: ArmorSet, si: number) => setSource(set)==='drop' ? 0 : setSource(set)==='premium' ? 3 : si;
const ICON_HUE = [210, 42, 150, 270];
function hueOf(hex: string): number { const n=parseInt(hex.slice(1),16),r=(n>>16&255)/255,g=(n>>8&255)/255,b=(n&255)/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn; if(!d)return 0; const h=mx===r?((g-b)/d+(g<b?6:0)):mx===g?(b-r)/d+2:(r-g)/d+4; return h*60; }
export function iconFilter(set: ArmorSet, si: number): string { const base=artBase(set,si); if(base===si&&setSource(set)==='loja')return ''; return `filter:hue-rotate(${Math.round(hueOf(set.color)-ICON_HUE[base])}deg) saturate(1.4);`; }
export const ARMOR_ITEMS=ARMOR_SETS.flatMap((set,si)=>SLOTS.map((slot,i)=>({id:`armor:${set.id}:${i}`,name:`${slot} · ${set.name}`,slot,setId:set.id,rarity:set.rarity,color:set.color,level:set.level,defense:set.defense+(i===1?2:0),price:set.price,source:setSource(set),iconStyle:iconFilter(set,si),icon:ARMOR_ART[artBase(set,si)*5+i]})));
/** Peça de um conjunto de queda que o herói ainda não tem (até 3 níveis acima do dele). */
export function dropArmorFor(save:GearSave,level:number):typeof ARMOR_ITEMS[number]|null{const owned=save.gearOwned??[];const pool=ARMOR_ITEMS.filter(i=>i.source==='drop'&&i.level<=level+3&&!owned.includes(i.id));return pool.length?pool[Math.floor(Math.random()*pool.length)]:null;}
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
 return `<h3>Arsenal · 18 conjuntos</h3><p>${gold} ouro · Defesa +${state.defense} · Vida +${state.hp} · Dano +${state.damage}<br>Todos os heróis · requisitos de nível · a armadura aparece no herói na cor do conjunto do herói.<br>O Guardião de Aço é grátis; 3 se compram com ouro; <b>7 caem de monstros e bosses</b>; <b>7 Premium (os mais fortes) só na 💎 Loja Premium</b>.</p>`+ARMOR_SETS.map((set,si)=>`${si===0?'<h3>🛒 Loja (ouro)</h3>':si===4?'<h3>⚔ Conjuntos de queda · caem dos monstros</h3>':si===11?'<h3>💎 Conjuntos Premium · os mais fortes</h3>':''}<section style="border:1px solid ${set.color};border-radius:8px;padding:10px;margin:10px 0"><h3 style="color:${set.color}">${set.name} · ${set.rarity}</h3><p>5 peças: +${set.bonusDefense} defesa, +${set.bonusHp} vida, +${set.bonusDamage} dano ${state.complete.includes(set.name)?'· ATIVO':''}</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">${ARMOR_ITEMS.filter(i=>i.setId===set.id).map(item=>{const owned=state.owned.includes(item.id),equipped=state.equipped[item.slot]===item.id;return `<article style="background:rgba(255,255,255,.04);padding:10px;border-radius:6px"><img src="${assetUrl(item.icon)}" alt="${item.name}" width="48" height="48" style="image-rendering:pixelated;${item.iconStyle}"><strong style="display:block;color:${set.color}">${item.name}</strong><small>Nv.${item.level} · Defesa +${item.defense}<br>${equipped?'Equipado':owned?'Na mochila':item.source==='drop'?'Cai dos monstros':item.source==='premium'?'Loja Premium':item.price+' ouro'}</small>${!owned&&item.source==='drop'?'<button disabled>Cai dos monstros</button>':!owned&&item.source==='premium'?'<button data-action="premium" class="rpg-pay">💎 Loja Premium</button>':`<button data-action="gear:${equipped?'remove':owned?'equip':'buy'}:${item.id}" ${(!owned&&gold<item.price)||(owned&&!equipped&&level<item.level)?'disabled':''}>${equipped?'Desequipar':owned?'Equipar':item.price?'Comprar':'Resgatar'}</button>`}</article>`;}).join('')}</div></section>`).join('');
}
