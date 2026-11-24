/**
 * MODO HARD: subir de nível é difícil para todo mundo.
 *  - EXP por monstro reduzido: Normal ×0,30 · VIP Ouro ×0,36 · VIP Diamante ×0,40
 *  - Barra de EXP cresce mais rápido que antes: 100 × nível × (1 + 0,12 × nível)
 *    (nível 1 → 112 · nível 10 → 2.200 · nível 30 → 13.800 · nível 60 → 49.200)
 */
export type VipPlan = "ouro" | "diamante" | null;
export const HARD_RATES: Record<"normal" | "ouro" | "diamante", number> = { normal: 0.3, ouro: 0.36, diamante: 0.4 };

export function xpRate(vip: VipPlan): number { return HARD_RATES[vip ?? "normal"]; }
export function xpToNext(level: number): number { return Math.round(100 * level * (1 + 0.12 * level)); }
/** EXP de um abate já com o corte do modo HARD (mínimo 1). */
export function hardKillXp(baseXp: number, vip: VipPlan): number { return Math.max(1, Math.round(baseXp * xpRate(vip))); }
export function hardLabel(vip: VipPlan): string {
  const pct = (xpRate(vip)).toFixed(2).replace(".", ",");
  return vip ? `HARD · VIP ${vip === "ouro" ? "Ouro" : "Diamante"} · EXP ×${pct}` : `HARD · EXP ×${pct}`;
}
