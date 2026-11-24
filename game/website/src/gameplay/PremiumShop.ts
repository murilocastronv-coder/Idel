/**
 * Loja Premium (dinheiro real, cobrado pelo Stripe no servidor).
 * O servidor lê estas mesmas listas (scripts/game-data.js), então o preço mostrado no jogo
 * é o preço cobrado. Valores em centavos de R$.
 */
export const VIP_PLANS = [
  { id: "vip:vip1:15", plan: "ouro", name: "VIP Ouro", days: 15, cents: 1300 },
  { id: "vip:vip1:30", plan: "ouro", name: "VIP Ouro", days: 30, cents: 2340 },
  { id: "vip:vip2:15", plan: "diamante", name: "VIP Diamante", days: 15, cents: 2600 },
  { id: "vip:vip2:30", plan: "diamante", name: "VIP Diamante", days: 30, cents: 4680 },
];

/** Vantagens do VIP no servidor HARD (o EXP continua baixo para todos). */
export const VIP_PERKS = {
  ouro: ["EXP ×0,36 (Normal ×0,30)", "Ouro dos monstros +25%", "Selo ★ VIP Ouro no nome"],
  diamante: ["EXP ×0,40 (Normal ×0,30)", "Ouro dos monstros +50%", "Selo ★ VIP Diamante no nome"],
};

/** Os melhores conjuntos do jogo, entregues completos na conta. */
export const PREMIUM_PACKS = [
  { id: "set:astral-herald", name: "Conjunto Arauto Astral", rarity: "Mítico", color: "#c4a0ff", cents: 2490, desc: "5 peças Míticas (elmo, armadura, calça, luvas e botas) · requer nível 15" },
  { id: "set:emerald-sentinel", name: "Conjunto Sentinela Esmeralda", rarity: "Excelente", color: "#6fe5a3", cents: 1490, desc: "5 peças Excelentes · requer nível 10" },
  { id: "glacial:all", name: "Dragão Glacial Completo", rarity: "Especial", color: "#9fe0ff", cents: 4990, desc: "As 33 peças: 5 peças + arma de todas as classes, pendente e 2 anéis" },
];

export function brlPrice(cents: number): string { return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`; }
