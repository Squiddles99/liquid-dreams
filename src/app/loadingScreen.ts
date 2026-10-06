// The loading cover (loading screens spec): adopts index.html's #ld-cover, runs the start-up bar and its dissolve, and
// covers Paddle out and Back to the dune. The cover is the same element throughout: hidden between uses, never rebuilt.
import { BarFollower, BootProgress, type StageId } from './loadingProgress';
import { SmoothFramesGate, holdMet } from './smoothFrames';

export interface CoverOptions {
  line: string;
  minHoldMs: number;
  calm: boolean;
  /** Called once when the dissolve starts. */
  onDissolve?: () => void;
  logo?: 'hero' | 'corner';
}

const COVER_IN_MS = 400;
const DISSOLVE_MS = 1200;
const DISSOLVE_CALM_MS = 300;

type Phase = 'boot' | 'coming-in' | 'in' | 'out' | 'gone';
type State = 'boot' | 'covering' | 'dissolving' | 'done';

export class LoadingScreen {
  private phase: Phase = 'boot';
  private calm = false;
  private readonly progress: BootProgress;
  private readonly bar = new BarFollower();
  private gate: SmoothFramesGate | null = null;
  private coverInAt: number | null;
  private minHoldMs = 0;
  private outAt = 0;
  private onDissolve: (() => void) | null = null;
  private comingIn: ((ok: boolean) => void) | null = null;
  private comingInAt = 0;
  private released = false;
  private raf = 0;
  private lastTick: number;
  private readonly bootAt: number;

  /** Adopts index.html's #ld-cover in boot mode (null if the page has none). */
  static adopt(doc: Document, now: () => number = () => performance.now()): LoadingScreen | null {
    const el = doc.getElementById('ld-cover');
    return el ? new LoadingScreen(doc, el, now) : null;
  }

  private constructor(private readonly doc: Document, private readonly el: HTMLElement, private readonly now: () => number) {
    const t = now();
    this.progress = new BootProgress(t);
    this.coverInAt = t;
    this.lastTick = t;
    this.bootAt = t;
    this.showLine(this.progress.current?.line ?? '');
    this.setState('boot');
    this.loop();
  }

  /** Boot: a stage ended. */
  stageDone(id: StageId): void {
    if (this.phase !== 'boot') return;
    if (!this.progress.isDone(id)) console.info(`[loading] ${id} done at ${(this.now() - this.bootAt).toFixed(0)} ms`);
    this.progress.done(id, this.now());
    this.showLine(this.progress.current?.line ?? '');
    if (this.progress.allDone) this.gate ??= new SmoothFramesGate(this.now());
  }

  /** Boot: called once when the dissolve starts (sound, input). */
  onBootDissolve(cb: () => void): void {
    this.onDissolve = cb;
  }

  setCalm(calm: boolean): void {
    this.calm = calm;
    this.el.classList.toggle('is-calm', calm);
  }

  /** Every drawn frame (App.frame): feeds the gate. */
  frameDrawn(dtMs: number): void {
    if (this.gate) this.gate.frame(dtMs, this.now());
    this.tick(0);
  }

  /**
   * Transitions: fades the cover in; resolves true once it is opaque, false if a cover is already up (refused). A cover
   * still dissolving is taken back over, fading in from where it is: its menu's keys were already let go, so a refusal
   * then would close the menu into nothing.
   */
  cover(opts: CoverOptions): Promise<boolean> {
    if (this.phase !== 'gone' && this.phase !== 'out') return Promise.resolve(false);
    const fromOut = this.phase === 'out';
    this.setCalm(opts.calm);
    this.el.dataset.mode = 'cover';
    this.el.dataset.logo = opts.logo ?? 'hero';
    this.showLine(opts.line);
    this.el.classList.remove('is-out');
    if (!fromOut) this.el.classList.remove('is-in');
    this.el.hidden = false;
    this.minHoldMs = opts.minHoldMs;
    this.onDissolve = opts.onDissolve ?? null;
    this.gate = null;
    this.released = false;
    this.coverInAt = null;
    this.phase = 'coming-in';
    this.comingInAt = this.now();
    this.setState('covering');
    this.el.classList.add('is-blocking');
    if (!fromOut) {
      // Style the unhidden cover at opacity 0 first, or the browser has nothing to transition from and it pops in.
      void this.el.getBoundingClientRect();
      this.el.classList.add('is-in');
    }
    this.loop();
    return new Promise((resolve) => {
      this.comingIn = resolve;
    });
  }

  /** Transitions: the work behind the cover is done; dissolve once the gate and the hold allow. */
  release(): void {
    if (this.phase !== 'coming-in' && this.phase !== 'in') return;
    this.released = true;
    if (this.phase === 'in') this.gate ??= new SmoothFramesGate(this.now());
  }

  /** Whether the cover blocks the player (in or fading in, and not yet halfway out). */
  get blocking(): boolean {
    if (this.phase === 'gone') return false;
    if (this.phase === 'out') return this.now() - this.outAt < this.dissolveMs() / 2;
    return true;
  }

  /** Whether the cover is opaque (boot, or fully in): nothing behind it is seen. */
  get hidesPicture(): boolean {
    return this.phase === 'boot' || this.phase === 'in';
  }

  /** Takes the cover away at once (errors, selftests). */
  remove(): void {
    cancelAnimationFrame(this.raf);
    this.comingIn?.(false);
    this.comingIn = null;
    this.el.hidden = true;
    this.el.classList.remove('is-in', 'is-out', 'is-blocking');
    this.phase = 'gone';
    this.setState('done');
  }

  /** One step of the cover's clock (its own animation loop runs it; public for the selftests). */
  tick(_dtMs: number): void {
    const now = this.now(), dt = now - this.lastTick;
    this.lastTick = now;
    if (this.phase === 'boot') {
      const shown = this.bar.step(this.progress.target(now), dt);
      (this.el.querySelector('.ld-bar-fill') as HTMLElement).style.width = `${(shown * 100).toFixed(2)}%`;
    }
    if (this.phase === 'coming-in' && now - this.comingInAt >= COVER_IN_MS) {
      this.phase = 'in';
      this.coverInAt = now;
      if (this.released) this.gate ??= new SmoothFramesGate(now);
      this.comingIn?.(true);
      this.comingIn = null;
    }
    const ready = this.phase === 'boot' || this.phase === 'in';
    if (ready && this.gate?.open && holdMet(this.coverInAt, now, this.phase === 'boot' ? 0 : this.minHoldMs)) this.dissolve(now);
    this.el.classList.toggle('is-blocking', this.blocking);
    if (this.phase === 'out' && now - this.outAt >= this.dissolveMs() + 50) {
      this.el.hidden = true;
      this.el.classList.remove('is-in', 'is-out');
      this.phase = 'gone';
      this.setState('done');
    }
  }

  private dissolveMs(): number {
    return this.calm ? DISSOLVE_CALM_MS : DISSOLVE_MS;
  }

  private dissolve(now: number): void {
    this.phase = 'out';
    this.outAt = now;
    this.el.classList.add('is-out');
    this.setState('dissolving');
    const cb = this.onDissolve;
    this.onDissolve = null;
    cb?.();
  }

  private loop(): void {
    cancelAnimationFrame(this.raf);
    const step = (): void => {
      this.tick(0);
      if (this.phase !== 'gone') this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  private showLine(text: string): void {
    (this.el.querySelector('.ld-line') as HTMLElement).textContent = text;
  }

  private setState(s: State): void {
    this.doc.documentElement.dataset.ldLoading = s;
    if (this.doc !== document) document.documentElement.dataset.ldLoading = s;
  }
}
