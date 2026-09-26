import './style.css';
import { App } from './app/App';
import { showOverlay } from './app/overlay';
import { WEBGPU_HELP, checkWebGpuSupport } from './app/webgpuSupport';
import { momentFromHash, momentHashProblem } from './dev/momentLink';
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

  if (new URLSearchParams(location.search).has('selftest')) {
    const { runSelfTests, renderSelfTestReport } = await import('./dev/selfTests');
    renderSelfTestReport(await runSelfTests(renderer));
    return;
  }

  const problem = momentHashProblem(location.hash);
  if (problem) console.warn(`Moment link ignored (${problem}); opening the saved or default moment.`);
  // No link: the App opens the saved settings' moment (or the default one).
  new App(renderer, container, momentFromHash(location.hash)).start();
}

void main();
