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
  { id: "set:crimson-dragon", name: "Conjunto Dragão Carmesim", rarity: "Premium", color: "#ff3b3b", cents: 1990, desc: "5 peças · requer nível 20 · completo: +16 defesa, +110 vida, +16 dano" },
  { id: "set:golden-phoenix", name: "Conjunto Fênix Dourada", rarity: "Premium", color: "#ffb300", cents: 2490, desc: "5 peças · requer nível 25 · completo: +19 defesa, +135 vida, +19 dano" },
  { id: "set:eternal-frost", name: "Conjunto Titã do Gelo Eterno", rarity: "Premium", color: "#7fe7ff", cents: 2990, desc: "5 peças · requer nível 30 · completo: +22 defesa, +160 vida, +22 dano" },
  { id: "set:celestial-guard", name: "Conjunto Guardião Celestial", rarity: "Premium", color: "#fff1a8", cents: 3490, desc: "5 peças · requer nível 35 · completo: +26 defesa, +190 vida, +26 dano" },
  { id: "set:abyss-lord", name: "Conjunto Senhor do Abismo", rarity: "Premium", color: "#9b4dff", cents: 3990, desc: "5 peças · requer nível 40 · completo: +30 defesa, +220 vida, +30 dano" },
  { id: "set:thunder-emperor", name: "Conjunto Imperador do Trovão", rarity: "Premium", color: "#4da6ff", cents: 4990, desc: "5 peças · requer nível 45 · completo: +34 defesa, +260 vida, +35 dano" },
  { id: "set:kundun-legend", name: "Conjunto Lenda de Kundun", rarity: "Premium", color: "#ff4dd2", cents: 5990, desc: "5 peças · requer nível 50 · O MAIS FORTE: +40 defesa, +320 vida, +42 dano" },
  // Antigos (não aparecem mais na loja; mantidos para pagamentos já iniciados).
  { id: "set:astral-herald", hidden: true, name: "Conjunto Arauto Astral", rarity: "Mítico", color: "#c4a0ff", cents: 2490, desc: "5 peças Míticas (elmo, armadura, calça, luvas e botas) · requer nível 15" },
  { id: "set:emerald-sentinel", hidden: true, name: "Conjunto Sentinela Esmeralda", rarity: "Excelente", color: "#6fe5a3", cents: 1490, desc: "5 peças Excelentes · requer nível 10" },
  { id: "glacial:all", name: "Dragão Glacial Completo", rarity: "Especial", color: "#9fe0ff", cents: 4990, desc: "As 33 peças: 5 peças + arma de todas as classes, pendente e 2 anéis" },
];

export function brlPrice(cents: number): string { return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`; }
