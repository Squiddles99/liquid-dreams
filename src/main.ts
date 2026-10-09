import './style.css';
import { App, browserStorage } from './app/App';
import { LoadingScreen } from './app/loadingScreen';
import { showOverlay } from './app/overlay';
import { WEBGPU_HELP, checkWebGpuSupport } from './app/webgpuSupport';
import { momentFromHash, momentHashProblem } from './dev/momentLink';
import { frontEndWanted } from './frontend/entry';
import { TitleScreen } from './frontend/ui/titleScreen';
import { createRenderer } from './render/createRenderer';

async function main(): Promise<void> {
  const container = document.getElementById('app');
  if (!container) throw new Error('#app container missing');
  // The cover index.html painted first (loading screens spec): it reports each stage, then dissolves into the dune.
  const loading = LoadingScreen.adopt(document);
  // The title (surf-map hub spec §2) over the cover at once: the game boots behind it. A Surf pressed before the App
  // exists is kept and applied once it does (Review Focus 1).
  const wantFrontEnd = frontEndWanted(location.search, location.hash);
  let appRef: App | null = null, surfPressed = false;
  const title = wantFrontEnd ? new TitleScreen(document.body, {
    storage: browserStorage, electron: navigator.userAgent.includes('Electron'),
    soundOut: () => appRef?.soundOut() ?? null,
    onSurf: () => { if (appRef) appRef.titleSurf(); else surfPressed = true; },
  }) : null;
  if (title) { const tick = (t: number): void => { title.update(t); requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
  const fail = (heading: string, message: string, help = WEBGPU_HELP): void => {
    loading?.remove();
    title?.hide();
    showOverlay(heading, help ? `${message}

${help}` : message);
  };

  const support = await checkWebGpuSupport(navigator as unknown as Parameters<typeof checkWebGpuSupport>[0]);
  if (!support.ok) return fail('WebGPU is not available', support.reason);

  let renderer;
  try {
    renderer = await createRenderer(container);
  } catch (e) {
    return fail('WebGPU could not start', e instanceof Error ? e.message : String(e));
  }
  loading?.stageDone('gpu');

  const query = new URLSearchParams(location.search);
  if (query.has('selftest')) {
    loading?.remove();
    const { runSelfTests, renderSelfTestReport } = await import('./dev/selfTests');
    renderSelfTestReport(await runSelfTests(renderer, query.get('selftest') ?? ''));
    return;
  }

  const problem = momentHashProblem(location.hash);
  if (problem) console.warn(`Moment link ignored (${problem}); opening the saved or default moment.`);
  const frontEnd = wantFrontEnd;
  let app: App;
  try {
    // No link: the App opens the saved settings' moment (or the default one).
    app = new App(renderer, container, momentFromHash(location.hash));
    // __ldHoldCover (set in the console before a reload): the App ignores the cover, so it stays up to be looked at.
    app.attachLoading((globalThis as { __ldHoldCover?: boolean }).__ldHoldCover ? null : loading, frontEnd);
    appRef = app;
    if (title) app.attachTitle(title);
    loading?.stageDone('world');
    // Build what the first break would otherwise build mid-game, before the first frame.
    await app.prewarm();
    loading?.stageDone('reef');
  } catch (e) {
    fail('Liquid Dreams could not start', e instanceof Error ? e.message : String(e), '');
    throw e;
  }
  app.start();
  if (frontEnd) app.openFrontEnd();
  if (surfPressed) app.titleSurf();
  // The Electron probe (?probe): a Paddle out and a Back to the dune it can trigger (loading screens §7).
  if (query.has('probe')) (window as unknown as { ldProbe: unknown }).ldProbe = { paddleOut: () => app.probePaddleOut(), backToDune: () => app.backToDune() };
  // Dev builds only: scripted gallery captures (window.liquidDreams.captureFrame()) and the crest trace's timing
  // readout (window.liquidDreams.traceMs, ms per frame, a moving average).
  if (import.meta.env.DEV) {
    (window as unknown as { liquidDreams?: App }).liquidDreams = app;
    const { frontEndCheck } = await import('./dev/frontEndCheck');
    (app as unknown as { frontEndCheck: () => ReturnType<typeof frontEndCheck> }).frontEndCheck = () => frontEndCheck(app);
  }
  // Dev builds only: the species sheet (dune-up-close gate 1), each frame posted to the local snapshot receiver.
  if (import.meta.env.DEV && query.get('sheet') === 'species') {
    const { captureSpeciesSheet } = await import('./dev/speciesSheet');
    const post = (name: string, frame: Blob) => fetch(`http://127.0.0.1:5199/?name=${name}`, { method: 'POST', body: frame }).then(() => undefined);
    const names = await captureSpeciesSheet(app, post, query.get('kinds')?.split(','));
    document.title = `sheet done: ${names.length}`;
  }
}

void main();
