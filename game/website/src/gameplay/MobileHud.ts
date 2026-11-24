/**
 * Touch-first action HUD (also works with a mouse): quick menu (loja, mapas,
 * mochila...), a big attack button that repeats while held, four skill buttons,
 * the class spell, potion and AUTO hunt toggle.
 *
 * The DOM is built once and only its text/classes change, so a held press keeps
 * its pointer capture (the main panel re-renders its innerHTML every 250 ms).
 */
export interface HudSkill { name: string; cost: number; color: number; remaining: number; }
export interface HudState {
  skills: HudSkill[];
  mana: number;
  potions: number;
  auto: boolean;
  unarmed: boolean;
  safe: boolean;
  account: string | null;
  nearMaster: boolean;
}

const MENU: [action: string, icon: string, label: string][] = [
  ["B", "🛒", "Loja"],
  ["maps", "🌍", "Mapas"],
  ["I", "🎒", "Mochila"],
  ["C", "🧝", "Herói"],
  ["catalog", "🪽", "Asas"],
  ["arsenal", "🗡️", "Armas"],
  ["sets", "🛡️", "Sets"],
  ["glacial", "❄️", "Glacial"],
  ["kundun", "📦", "Kundun"],
  ["R", "🏰", "Refúgio"],
  ["account", "👤", "Conta"],
];

export class MobileHud {
  private readonly menu: HTMLDivElement;
  private readonly combat: HTMLDivElement;
  private readonly skillButtons: HTMLButtonElement[] = [];
  private readonly autoButton: HTMLButtonElement;
  private readonly potionButton: HTMLButtonElement;
  private readonly spellButton: HTMLButtonElement;
  private readonly attackButton: HTMLButtonElement;
  private readonly accountButton: HTMLButtonElement;
  private readonly masterButton: HTMLButtonElement;
  private repeat: number | null = null;

  constructor(root: HTMLElement, private readonly onAction: (action: string) => void) {
    this.menu = document.createElement("div");
    this.menu.className = "rpg-quickmenu";
    for (const [action, icon, label] of MENU) {
      const b = this.button(action, `<i>${icon}</i><span>${label}</span>`);
      this.menu.append(b);
    }
    this.accountButton = this.menu.querySelector<HTMLButtonElement>('[data-hud="account"]')!;

    this.combat = document.createElement("div");
    this.combat.className = "rpg-combat";
    this.attackButton = this.button("attack", `<i>⚔️</i><span>ATACAR</span>`, "rpg-attack");
    this.attackButton.setAttribute("aria-label", "Ataque normal (segure para repetir)");
    for (let i = 0; i < 4; i++) {
      const b = this.button(`power:${i}`, `<em>${i + 1}</em><span></span><small></small>`, `rpg-skill rpg-skill-${i}`);
      this.skillButtons.push(b);
    }
    this.spellButton = this.button("spell", `<i>✨</i><span>Magia</span>`, "rpg-mini rpg-spell");
    this.potionButton = this.button("Q", `<i>🧪</i><span>×0</span>`, "rpg-mini rpg-potion");
    this.autoButton = this.button("auto", `<i>🤖</i><span>AUTO</span>`, "rpg-mini rpg-auto");
    this.masterButton = this.button("master", `<i>🪽</i><span>Mestre</span>`, "rpg-mini rpg-master");
    this.combat.append(this.attackButton, ...this.skillButtons, this.spellButton, this.potionButton, this.autoButton, this.masterButton);
    root.append(this.menu, this.combat);
  }

  private button(action: string, html: string, className = ""): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.hud = action;
    b.className = className;
    b.innerHTML = html;
    b.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (b.disabled) return;
      b.classList.add("pressed");
      this.onAction(action);
      if (action === "attack") {
        try { b.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
        this.stopRepeat();
        this.repeat = window.setInterval(() => this.onAction("attack"), 160);
      }
    });
    const release = () => { b.classList.remove("pressed"); if (action === "attack") this.stopRepeat(); };
    b.addEventListener("pointerup", release);
    b.addEventListener("pointercancel", release);
    b.addEventListener("lostpointercapture", release);
    b.addEventListener("pointerleave", () => { if (action !== "attack") b.classList.remove("pressed"); });
    // Keyboard users (Enter/Space) still get a click event.
    b.addEventListener("click", (event) => { if (event.detail === 0) this.onAction(action); });
    return b;
  }

  private stopRepeat(): void {
    if (this.repeat !== null) { window.clearInterval(this.repeat); this.repeat = null; }
  }

  update(s: HudState): void {
    s.skills.forEach((skill, i) => {
      const b = this.skillButtons[i];
      if (!b) return;
      const color = `#${skill.color.toString(16).padStart(6, "0")}`;
      b.style.setProperty("--power", color);
      b.querySelector("span")!.textContent = skill.name;
      b.querySelector("small")!.textContent = skill.remaining ? `${skill.remaining}s` : `${skill.cost} MP`;
      b.title = `${skill.name} · ${skill.cost} mana`;
      b.classList.toggle("cooldown", skill.remaining > 0);
      b.classList.toggle("nomana", !skill.remaining && s.mana < skill.cost);
    });
    this.potionButton.querySelector("span")!.textContent = `×${s.potions}`;
    this.autoButton.classList.toggle("on", s.auto);
    this.autoButton.querySelector("span")!.textContent = s.auto ? "AUTO ON" : "AUTO";
    this.spellButton.querySelector("span")!.textContent = s.unarmed ? "Soco forte" : "Magia";
    this.attackButton.querySelector("span")!.textContent = s.unarmed ? "SOCO" : "ATACAR";
    this.combat.classList.toggle("safe", s.safe);
    this.accountButton.querySelector("span")!.textContent = s.account ? s.account.slice(0, 9) : "Conta";
    this.accountButton.classList.toggle("on", !!s.account);
    this.masterButton.hidden = !s.nearMaster;
  }

  setVisible(visible: boolean): void {
    this.menu.hidden = !visible;
    this.combat.hidden = !visible;
    if (!visible) this.stopRepeat();
  }

  destroy(): void {
    this.stopRepeat();
    this.menu.remove();
    this.combat.remove();
  }
}
