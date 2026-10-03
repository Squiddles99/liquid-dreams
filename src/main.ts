import './style.css';
import { App } from './app/App';
import { showOverlay } from './app/overlay';
import { WEBGPU_HELP, checkWebGpuSupport } from './app/webgpuSupport';
import { momentFromHash, momentHashProblem } from './dev/momentLink';
import { frontEndWanted } from './frontend/entry';
import { createRenderer } from './render/createRenderer';

async function main(): Promise<void> {
  const container = document.getElementById('app');
  if (!container) throw new Error('#app container missing');

  const support = await checkWebGpuSupport(navigator as unknown as Parameters<typeof checkWebGpuSupport>[0]);
  if (!support.ok) {
    showOverlay('WebGPU is not available', `${support.reason}\n\n${WEBGPU_HELP}`);
    return;
  }

  let renderer;
  try {
    renderer = await createRenderer(container);
  } catch (e) {
    showOverlay('WebGPU could not start', `${e instanceof Error ? e.message : String(e)}\n\n${WEBGPU_HELP}`);
    return;
  }

  const query = new URLSearchParams(location.search);
  if (query.has('selftest')) {
    const { runSelfTests, renderSelfTestReport } = await import('./dev/selfTests');
    renderSelfTestReport(await runSelfTests(renderer, query.get('selftest') ?? ''));
    return;
  }

  const problem = momentHashProblem(location.hash);
  if (problem) console.warn(`Moment link ignored (${problem}); opening the saved or default moment.`);
  // No link: the App opens the saved settings' moment (or the default one).
  const app = new App(renderer, container, momentFromHash(location.hash));
  // Build what the first break would otherwise build mid-game, before the first frame.
  await app.prewarm();
  app.start();
  if (frontEndWanted(location.search, location.hash)) app.openFrontEnd();
  // Dev builds only: scripted gallery captures (window.liquidDreams.captureFrame()) and the crest trace's timing
  // readout (window.liquidDreams.traceMs, ms per frame, a moving average).
  if (import.meta.env.DEV) (window as unknown as { liquidDreams?: App }).liquidDreams = app;
  // Dev builds only: the species sheet (dune-up-close gate 1), each frame posted to the local snapshot receiver.
  if (import.meta.env.DEV && query.get('sheet') === 'species') {
    const { captureSpeciesSheet } = await import('./dev/speciesSheet');
    const post = (name: string, frame: Blob) => fetch(`http://127.0.0.1:5199/?name=${name}`, { method: 'POST', body: frame }).then(() => undefined);
    const names = await captureSpeciesSheet(app, post, query.get('kinds')?.split(','));
    document.title = `sheet done: ${names.length}`;
  }
}

void main();
