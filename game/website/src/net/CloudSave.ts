/**
 * Cloud save against the game server (server/index.js on Render): log in with an
 * existing account (same accounts table as before) or create one, and keep the
 * hero's progress in PostgreSQL. Without login the game still saves locally.
 */
const TOKEN_KEY = "aether-cloud-token";
const USER_KEY = "aether-cloud-user";
const VIP_KEY = "aether-cloud-vip";
export type VipPlan = "ouro" | "diamante" | null;

export interface CloudResult<T> { ok: boolean; error?: string; data?: T; }
interface AuthReply { ok: boolean; username: string; token: string; save: Record<string, unknown> | null; vip?: VipPlan; vipUntil?: string | null; wings?: string[]; items?: string[]; error?: string; }

function read(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function write(key: string, value: string | null): void {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* storage disabled */ }
}

export class CloudSave {
  token: string | null = read(TOKEN_KEY);
  username: string | null = read(USER_KEY);
  vip: VipPlan = (read(VIP_KEY) === "ouro" || read(VIP_KEY) === "diamante") ? read(VIP_KEY) as VipPlan : null;
  status: string = "";
  /** Asas pagas com dinheiro real (vêm do servidor, nunca se perdem). */
  paidWings: string[] = [];
  /** Tudo que a conta comprou com dinheiro real (wing:..., set:..., glacial:all). */
  items: string[] = [];
  vipUntil: string | null = null;
  payEnabled: boolean = false;
  private pending: object | null = null;
  private timer: number | null = null;

  get loggedIn(): boolean { return !!this.token && !!this.username; }

  private async call<T>(path: string, init: RequestInit = {}): Promise<CloudResult<T>> {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (this.token) headers.Authorization = `Bearer ${this.token}`;
      const res = await fetch(path, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) } });
      const body = await res.json().catch(() => ({})) as T & { error?: string };
      if (res.status === 401 && this.token) this.forget();
      if (!res.ok) return { ok: false, error: body.error || `Erro ${res.status}` };
      return { ok: true, data: body };
    } catch {
      return { ok: false, error: "Sem conexão com o servidor." };
    }
  }

  private remember(reply: AuthReply): void {
    this.token = reply.token; this.username = reply.username;
    write(TOKEN_KEY, reply.token); write(USER_KEY, reply.username);
    this.setVip(reply.vip ?? null);
    this.paidWings = Array.isArray(reply.wings) ? reply.wings : [];
    this.items = Array.isArray(reply.items) ? reply.items : [];
    this.vipUntil = reply.vipUntil ?? null;
  }

  private setVip(vip: VipPlan): void { this.vip = vip === "ouro" || vip === "diamante" ? vip : null; write(VIP_KEY, this.vip); }

  private forget(): void {
    this.token = null; this.username = null; this.paidWings = []; this.items = []; this.vipUntil = null;
    write(TOKEN_KEY, null); write(USER_KEY, null); this.setVip(null);
  }

  async login(login: string, password: string): Promise<CloudResult<AuthReply>> {
    const r = await this.call<AuthReply>("/api/login", { method: "POST", body: JSON.stringify({ login, password }) });
    if (r.ok && r.data) this.remember(r.data);
    return r;
  }

  async register(username: string, email: string, password: string): Promise<CloudResult<AuthReply>> {
    const r = await this.call<AuthReply>("/api/register", { method: "POST", body: JSON.stringify({ username, email, password }) });
    if (r.ok && r.data) this.remember(r.data);
    return r;
  }

  async load(): Promise<Record<string, unknown> | null> {
    if (!this.loggedIn) return null;
    const r = await this.call<{ save: Record<string, unknown> | null; vip?: VipPlan; vipUntil?: string | null; wings?: string[]; items?: string[] }>("/api/save");
    if (r.ok) { this.setVip(r.data?.vip ?? null); this.paidWings = Array.isArray(r.data?.wings) ? r.data!.wings! : []; this.items = Array.isArray(r.data?.items) ? r.data!.items! : []; this.vipUntil = r.data?.vipUntil ?? null; }
    return r.ok ? r.data?.save ?? null : null;
  }

  /** Loja com dinheiro real: o servidor diz se o pagamento está ativo. */
  async shopInfo(): Promise<void> {
    const r = await this.call<{ enabled: boolean }>("/api/shop/wings");
    this.payEnabled = !!(r.ok && r.data?.enabled);
  }

  /** Abre o pagamento (Stripe) de uma asa e devolve o endereço da página de pagamento. */
  async checkout(item: string): Promise<CloudResult<{ url: string }>> {
    await this.flush();
    return this.call<{ url: string }>("/api/shop/checkout", { method: "POST", body: JSON.stringify({ item }) });
  }

  async logout(): Promise<void> {
    await this.flush();
    await this.call("/api/logout", { method: "POST" });
    this.forget();
  }

  /** Debounced upload: at most one request every few seconds while playing. */
  push(save: object): void {
    if (!this.loggedIn) return;
    this.pending = save;
    if (this.timer === null) this.timer = window.setTimeout(() => { void this.flush(); }, 4000);
  }

  async flush(): Promise<void> {
    if (this.timer !== null) { window.clearTimeout(this.timer); this.timer = null; }
    const save = this.pending; this.pending = null;
    if (!save || !this.loggedIn) return;
    const r = await this.call("/api/save", { method: "PUT", body: JSON.stringify({ save }) });
    this.status = r.ok ? "Salvo na nuvem" : `Falha ao salvar: ${r.error}`;
  }

  /** Best-effort save when the tab closes. */
  beacon(save: object): void {
    if (!this.loggedIn) return;
    try {
      void fetch("/api/save", { method: "PUT", keepalive: true, headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.token}` }, body: JSON.stringify({ save }) });
    } catch { /* ignore */ }
  }
}
