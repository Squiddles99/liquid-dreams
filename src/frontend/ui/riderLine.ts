// src/frontend/ui/riderLine.ts
/** What a rider says, in brush script with their name small above (spec §4.1). Fades in 140 ms, holds, fades out 180 ms. */
export class RiderLine {
  readonly el = document.createElement('div');
  private readonly name = document.createElement('span');
  private readonly text = document.createElement('span');
  private untilMs = 0;
  static readonly HOLD_MS = 3200;

  constructor() {
    this.el.className = 'fe-line';
    this.name.className = 'fe-line-name';
    this.el.append(this.name, this.text);
    Object.assign(this.el.style, { position: 'absolute', opacity: '0', transition: 'opacity 140ms linear', maxWidth: '760px' });
  }

  show(name: string, text: string, nowMs: number): void {
    this.name.textContent = name;
    this.text.textContent = text;
    this.el.style.transition = 'opacity 140ms linear';
    this.el.style.opacity = '1';
    this.untilMs = nowMs + RiderLine.HOLD_MS;
  }

  update(nowMs: number): void {
    if (this.untilMs && nowMs > this.untilMs) this.hide();
  }

  hide(): void {
    this.untilMs = 0;
    this.el.style.transition = 'opacity 180ms linear';
    this.el.style.opacity = '0';
  }
}
