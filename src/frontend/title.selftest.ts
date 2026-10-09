// src/frontend/title.selftest.ts
import { registerSelfTest } from '../dev/selfTest';
import { fakeHost, frames, memory, noSound, press } from './frontEnd.selftest';
import { FrontEnd } from './frontEndPage';
import { TitleScreen } from './ui/titleScreen';

registerSelfTest({
  name: 'frontend: title menu: Surf hides it and calls onSurf once; Online toasts; no Quit in the browser',
  async run() {
    let surf = 0;
    const t = new TitleScreen(document.body, { storage: null, soundOut: () => null, electron: false, onSurf: () => { surf++; } });
    try {
      await new Promise((r) => setTimeout(r, 300));
      const labels = [...document.querySelectorAll('.fe-title-row')].map((r) => r.textContent ?? '');
      t.act('down'); t.act('confirm');
      const toast = document.querySelector('.fe-title-screen .fe-toast.is-on')?.textContent ?? '';
      t.act('up'); t.act('confirm'); t.act('confirm');
      const ok = labels.length === 3 && !labels.some((l) => /Quit/.test(l)) && toast.includes('coming soon') && surf === 1 && !t.isOpen;
      return { pass: ok, detail: `rows ${labels.join('|')}, toast "${toast}", surf ${surf}, open ${t.isOpen}` };
    } finally { document.querySelector('.fe-title-screen')?.remove(); }
  },
});

registerSelfTest({
  name: 'frontend: one Enter on the title leaves it for the map and does not also press Surf here; Esc on the map brings it back clean',
  async run() {
    let fe: FrontEnd | null = null;
    const host = document.createElement('div'); document.body.appendChild(host);
    const t = new TitleScreen(document.body, { storage: null, soundOut: () => null, electron: false, onSurf: () => fe?.dropInput() });
    fe = new FrontEnd(fakeHost(() => t.show()), host, noSound, memory());
    try {
      fe.open();
      await frames(fe, 5);
      // One press, then the title's frame before the front end's (the order the two rAF loops may run in).
      press('Enter');
      t.update(performance.now());
      fe.inputHeld = t.isOpen;
      await frames(fe, 30);
      const afterSurf = fe.state?.beat;
      press('Escape');
      await frames(fe, 5);
      const back = t.isOpen;
      t.update(performance.now()); // the Esc that brought the title back must not act on it
      fe.inputHeld = t.isOpen;
      const ok = afterSurf === 'map' && back && t.isOpen;
      return { pass: ok, detail: `after Enter: ${afterSurf}; Esc showed the title ${back}; still open ${t.isOpen}` };
    } finally { fe.close(); host.remove(); document.querySelector('.fe-title-screen')?.remove(); }
  },
});
