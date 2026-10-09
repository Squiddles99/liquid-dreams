// src/frontend/surfMap.selftest.ts: the surf chart, the map beat and the details page in the page (surf-map hub plan).
import { registerSelfTest } from '../dev/selfTest';
import { withRoot } from './frontEnd.selftest';
import { capesToChart } from './capesGeom';
import { CapesChart } from './ui/capesChart';

registerSelfTest({
  name: 'frontend: surf chart covers the window at 16:9, 21:9 and 4:3, with the Womb pin on screen',
  async run() {
    const problems: string[] = [];
    for (const [w, h] of [[1920, 1080], [2560, 1080], [1440, 1080]] as const) {
      await withRoot(w, h, async (root) => {
        const c = new CapesChart({ view: 'full' });
        root.appendChild(c.el);
        await c.load();
        c.setConditions({ swellFromDeg: 247, periodS: 14, swellFt: 6, windFromDeg: 90, windMs: 4 });
        c.setPins([{ id: 'womb', name: 'The Womb', lonLat: [114.982, -33.8952] }], 'womb');
        const svg = c.el.querySelector('svg')!.getBoundingClientRect(), box = root.getBoundingClientRect();
        if (svg.width + 1 < box.width || svg.height + 1 < box.height) problems.push(`${w}x${h}: chart ${svg.width}x${svg.height} under root ${box.width}x${box.height}`);
        const pin = c.el.querySelector('.fe-chart-pin-dot')!.getBoundingClientRect();
        if (pin.left < box.left || pin.right > box.right || pin.top < box.top || pin.bottom > box.bottom) problems.push(`${w}x${h}: Womb pin off screen`);
        if (!c.pinPoint('womb')) problems.push('no pinPoint');
        const p = capesToChart(114.982, -33.8952);
        if (Math.abs(c.pinPoint('womb')![0] - p[0]) > 0.01) problems.push('pinPoint mismatch');
      });
    }
    return { pass: problems.length === 0, detail: problems.join('; ') || 'covers, pin on screen' };
  },
});

registerSelfTest({
  name: 'frontend: surf chart glassy wind draws no arrows; swell lines roll',
  async run() {
    return withRoot(1920, 1080, async (root) => {
      const c = new CapesChart({ view: 'full' });
      root.appendChild(c.el);
      await c.load();
      c.setConditions({ swellFromDeg: 247, periodS: 14, swellFt: 6, windFromDeg: null, windMs: 0.5 });
      const arrows = c.el.querySelectorAll('.fe-chart-wind').length;
      const swell = [...c.el.querySelectorAll('svg > g')].find((g) => g.querySelector('line'))!;
      c.update(0); const a = swell.getAttribute('transform');
      c.update(1600); const b = swell.getAttribute('transform');
      const ok = arrows === 0 && a !== b;
      return { pass: ok, detail: `arrows ${arrows}, transform ${a} → ${b}` };
    });
  },
});
