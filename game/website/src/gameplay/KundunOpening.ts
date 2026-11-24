import { assetUrl } from '../pixellab/templateAssetPaths';
import { KUNDUN_OPENING_FRAMES } from './KundunOpeningArt';

/** One-shot DOM animation; rewards are committed before this cosmetic sequence. */
export class KundunOpening {
  private overlay: HTMLDivElement | null = null;
  private timer: number | undefined;
  private serial: number = 0;
  private frame: number = 0;
  private level: number = 0;
  private finished: boolean = false;
  get busy(): boolean { return this.overlay !== null; }
  state(): object { return { active: this.busy, level: this.level, frame: this.frame, finished: this.finished }; }
  play(root: HTMLElement, level: number, reward: string, done: () => void): void {
    this.destroy();
    const serial = this.serial;
    this.level = level; this.frame = 0; this.finished = false;
    const overlay = document.createElement('div');
    overlay.className = 'kundun-opening';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(6,8,20,.92);display:flex;align-items:center;justify-content:center;pointer-events:auto;padding:18px;box-sizing:border-box';
    overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', `Abrindo Box de Kundun +${level}`);
    const panel = document.createElement('section');
    panel.style.cssText = 'color:#eee4ff;text-align:center;max-width:460px;width:100%;border:1px solid #9d83c4;border-radius:16px;padding:24px;background:rgba(32,25,51,.95);box-sizing:border-box';
    const title = document.createElement('h2'); title.textContent = `Box de Kundun +${level}`;
    const image = document.createElement('img'); image.width = 192; image.height = 192;
    image.alt = 'Caixa abrindo'; image.style.cssText = 'image-rendering:pixelated;object-fit:contain;max-width:100%;filter:drop-shadow(0 0 18px #9575cd)';
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.textContent = 'Preparando abertura…';
    const button = document.createElement('button'); button.textContent = 'Continuar'; button.disabled = true;
    button.style.cssText = 'pointer-events:auto;background:#6c488e;color:white;border:1px solid #cdb4ed;border-radius:8px;padding:12px 24px;cursor:pointer';
    button.onclick = () => { this.destroy(); done(); };
    panel.append(title, image, status, button); overlay.append(panel); root.append(overlay); this.overlay = overlay;
    const urls = (KUNDUN_OPENING_FRAMES[level - 1] ?? []).map(path => assetUrl(path));
    const finish = (): void => { if(serial !== this.serial) return; this.finished = true; status.textContent = reward; image.alt = 'Caixa aberta'; button.disabled = false; button.focus(); };
    // Load together so a slow connection cannot skip the opening frames.
    void Promise.all(urls.map(url => new Promise<void>(resolve => { const img = new Image(); img.onload = () => resolve(); img.onerror = () => resolve(); img.src = url; }))).then(() => {
      if(serial !== this.serial) return;
      if(!urls.length) { finish(); return; }
      status.textContent = 'Abrindo…';
      const step = (): void => { if(serial !== this.serial) return; image.src = urls[this.frame]; if(this.frame === urls.length - 1) { this.timer = window.setTimeout(finish, 350); return; } this.timer = window.setTimeout(() => { this.frame++; step(); }, 145); };
      step();
    });
  }
  destroy(): void { this.serial++; window.clearTimeout(this.timer); this.overlay?.remove(); this.overlay = null; }
}
