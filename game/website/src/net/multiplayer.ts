/**
 * Cliente do multiplayer: uma sala por mapa no servidor do jogo (/room/:id).
 * Envia o estado público do herói (posição, nome, classe, nível, PvP, % de vida) e
 * golpes de PvP; recebe os outros jogadores, golpes recebidos e avisos de morte.
 */
import { workerWsBase } from "./workerOrigin";

export interface NetPlayer { id: string; pos: { x: number; y: number } | null; n?: string; h?: string; l?: number; p?: number; hp?: number; }
export interface RemoteEvent extends Partial<NetPlayer> {
  type: "snapshot" | "move" | "leave" | "hit" | "kill";
  you?: string;
  players?: NetPlayer[];
  from?: string; name?: string; d?: number;
  killer?: string; victim?: string;
}
export interface LocalState { x: number; y: number; n: string; h: string; l: number; p: 0 | 1; hp: number; }

export interface MultiplayerHandle {
  sendState: (state: LocalState) => void;
  sendHit: (to: string, damage: number) => void;
  sendDead: (by: string) => void;
  close: () => void;
}

export function connectMultiplayer(roomId: string, onEvent: (event: RemoteEvent) => void): MultiplayerHandle {
  const ws = new WebSocket(`${workerWsBase()}/room/${encodeURIComponent(roomId)}`);
  ws.onmessage = (ev) => {
    try { onEvent(JSON.parse(ev.data as string) as RemoteEvent); } catch { /* ignore malformed frames */ }
  };
  const send = (obj: object) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); };
  return {
    sendState: (s) => send(s),
    sendHit: (to, damage) => send({ t: "hit", to, d: Math.round(damage) }),
    sendDead: (by) => send({ t: "dead", by }),
    close: () => ws.close(),
  };
}
