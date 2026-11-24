import type { PlayerController } from "../player/PlayerController";

/**
 * Analog virtual joystick (mobile). Touch anywhere in the joystick zone: the base
 * re-centres under the finger and the knob follows it. Pushing the knob to the
 * edge runs; a light push walks.
 */
export class TouchMovement {
  private readonly zone: HTMLDivElement;
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private pointerId: number | null = null;
  private originX = 0;
  private originY = 0;
  private readonly radius = 52;
  /** True while the player's finger is on the joystick (auto-hunt yields to it). */
  engaged: boolean = false;

  constructor(private readonly player: PlayerController) {
    this.zone = document.createElement("div");
    this.zone.className = "rpg-joystick-zone";
    this.zone.setAttribute("aria-label", "Joystick: mover personagem");
    this.base = document.createElement("div");
    this.base.className = "rpg-joystick";
    this.knob = document.createElement("div");
    this.knob.className = "rpg-joystick-knob";
    this.base.append(this.knob);
    this.zone.append(this.base);

    this.zone.addEventListener("pointerdown", this.down);
    this.zone.addEventListener("pointermove", this.move);
    this.zone.addEventListener("pointerup", this.up);
    this.zone.addEventListener("pointercancel", this.up);
    this.zone.addEventListener("lostpointercapture", this.up);
    document.getElementById("hud-root")!.append(this.zone);
    window.addEventListener("blur", this.clear);
  }

  private down = (event: PointerEvent): void => {
    if (this.pointerId !== null) return;
    event.preventDefault();
    this.pointerId = event.pointerId;
    try { this.zone.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
    const rect = this.zone.getBoundingClientRect();
    // Re-centre the base under the thumb (kept fully inside the zone).
    const x = Math.min(rect.width - this.radius - 8, Math.max(this.radius + 8, event.clientX - rect.left));
    const y = Math.min(rect.height - this.radius - 8, Math.max(this.radius + 8, event.clientY - rect.top));
    this.base.style.left = `${x}px`;
    this.base.style.top = `${y}px`;
    this.base.classList.add("active");
    this.originX = rect.left + x;
    this.originY = rect.top + y;
    this.engaged = true;
    this.apply(event.clientX, event.clientY);
  };

  private move = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    event.preventDefault();
    this.apply(event.clientX, event.clientY);
  };

  private up = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.clear();
  };

  private apply(clientX: number, clientY: number): void {
    let dx = clientX - this.originX;
    let dy = clientY - this.originY;
    const len = Math.hypot(dx, dy);
    if (len > this.radius) { dx = dx / len * this.radius; dy = dy / len * this.radius; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const magnitude = Math.min(1, len / this.radius);
    if (magnitude < 0.18) { this.player.setTouchMovement(0, 0); return; }
    this.player.setTouchMovement(dx / this.radius, dy / this.radius, magnitude > 0.85);
  }

  private clear = (): void => {
    const was = this.engaged || this.pointerId !== null;
    this.pointerId = null;
    this.engaged = false;
    this.knob.style.transform = "";
    this.base.classList.remove("active");
    this.base.style.left = "";
    this.base.style.top = "";
    if (was) this.player.setTouchMovement(0, 0);
  };

  setActive(active: boolean): void {
    this.zone.hidden = !active;
    if (!active && this.engaged) this.clear();
  }

  destroy(): void {
    this.clear();
    window.removeEventListener("blur", this.clear);
    this.zone.remove();
  }
}
