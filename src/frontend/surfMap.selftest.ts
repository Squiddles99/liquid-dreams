// src/frontend/surfMap.selftest.ts: the surf chart, the map beat and the details page in the page (surf-map hub plan).
import { registerSelfTest } from '../dev/selfTest';
import { fakeHost, frames, memory, noSound, withRoot } from './frontEnd.selftest';
import { FrontEnd } from './frontEndPage';
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

registerSelfTest({
  name: 'frontend: the map beat shows the Womb panel, On/Fair/Off, the leader and the Local tag; no undefined',
  async run() {
    const host = document.createElement('div'); document.body.appendChild(host);
    const fe = new FrontEnd(fakeHost(), host, noSound, memory());
    try {
      fe.open();
      await frames(fe, 40);
      await new Promise((r) => setTimeout(r, 300)); // the chart's JSON
      await frames(fe, 5);
      const panel = host.querySelector('.fe-map-panel'), text = host.innerText;
      const problems: string[] = [];
      if (!panel?.textContent?.includes('The Womb')) problems.push('no Womb panel');
      if (!host.querySelector('.fe-map-verdict.is-on, .fe-map-verdict.is-fair, .fe-map-verdict.is-off')) problems.push('no verdict');
      if (!host.querySelector('.fe-map-leader path')) problems.push('no leader');
      if (!text.includes('LOCAL')) problems.push('no Local tag');
      if (/undefined|NaN/.test(text)) problems.push('undefined/NaN on screen');
      if (host.querySelectorAll('.fe-map-stat').length < 1) problems.push('no stats');
      return { pass: problems.length === 0, detail: problems.join('; ') || 'map beat renders' };
    } finally { fe.close(); host.remove(); }
  },
});

registerSelfTest({
  name: 'frontend: break details opens, shows only kept sections, scrolls and closes',
  async run() {
    const host = document.createElement('div'); document.body.appendChild(host);
    const fe = new FrontEnd(fakeHost(), host, noSound, memory());
    try {
      fe.open(); await frames(fe, 20);
      fe.act('details'); await frames(fe, 20);
      const open = host.querySelector('.fe-details.is-open');
      const secs = [...host.querySelectorAll('.fe-details-sec')];
      const empty = secs.filter((s) => s.querySelectorAll('p').length === 0).length;
      const inner = host.querySelector<HTMLElement>('.fe-details-inner')!;
      fe.act('down'); fe.act('down'); await frames(fe, 20);
      const moved = inner.style.transform;
      fe.act('back'); await frames(fe, 20);
      const closed = !host.querySelector('.fe-details.is-open') && fe.state?.beat === 'map';
      const ok = !!open && secs.length >= 3 && empty === 0 && closed && /translateY\(-?\d/.test(moved) && !/undefined|NaN/.test(host.innerText);
      return { pass: ok, detail: `open ${!!open}, sections ${secs.length}, empty ${empty}, scroll ${moved}, closed ${closed}` };
    } finally { fe.close(); host.remove(); }
  },
});

registerSelfTest({
  name: 'frontend: details scroll stops at the end (Up works at once after holding Down); its verdict matches the panel after a Custom edit',
  async run() {
    const host = document.createElement('div'); document.body.appendChild(host);
    const fe = new FrontEnd(fakeHost(), host, noSound, memory());
    const problems: string[] = [];
    try {
      fe.open(); await frames(fe, 20);
      fe.act('details'); await frames(fe, 10);
      for (let k = 0; k < 40; k++) { fe.act('down'); await frames(fe, 1); }
      await frames(fe, 5);
      const inner = host.querySelector<HTMLElement>('.fe-details-inner')!, bottom = inner.style.transform;
      fe.act('up'); await frames(fe, 5);
      if (inner.style.transform === bottom) problems.push(`Up after 40 Downs did nothing (${bottom})`);
      if ((fe.state?.detailsScroll ?? 99) > 20) problems.push(`scroll step ${fe.state?.detailsScroll}`);
      fe.act('back'); await frames(fe, 5);
      // Custom, Surf here, change the wind on Conditions, back to the map, open the details.
      fe.act('toggle'); fe.act('details'); await frames(fe, 5); fe.act('back'); await frames(fe, 5);
      fe.act('confirm'); await frames(fe, 120);
      for (let k = 0; k < 12 && (fe.state?.rowFocus ?? 'wind') !== 'wind'; k++) fe.act('down');
      fe.act('right'); fe.act('right'); fe.act('right'); fe.act('right'); await frames(fe, 3);
      fe.act('back'); await frames(fe, 120);
      fe.act('details'); await frames(fe, 10);
      const panel = host.querySelector('.fe-map-panel .fe-map-verdict-s')?.textContent, page = host.querySelector('.fe-details .fe-map-verdict-s')?.textContent;
      if (panel !== page) problems.push(`details "${page}" vs panel "${panel}"`);
      return { pass: problems.length === 0, detail: problems.join('; ') || `scroll bounded; verdict "${page}"` };
    } finally { fe.close(); host.remove(); }
  },
});

registerSelfTest({
  name: 'frontend: the map leader follows the pin after a resize',
  async run() {
    const host = document.createElement('div'); document.body.appendChild(host);
    const fe = new FrontEnd(fakeHost(), host, noSound, memory());
    try {
      fe.open(); fe.resize(1920, 1080); await frames(fe, 20);
      await new Promise((r) => setTimeout(r, 300)); await frames(fe, 5);
      fe.resize(1440, 1080); await frames(fe, 10);
      const map = host.querySelector<HTMLElement>('.fe-map')!, box = map.getBoundingClientRect(), sx = box.width / map.offsetWidth || 1;
      const dot = host.querySelector('.fe-chart-pin-dot')!.getBoundingClientRect(), pinY = (dot.top + dot.height / 2 - box.top) / sx;
      const d = host.querySelector('.fe-map-leader path')?.getAttribute('d') ?? '', y = Number(/,(-?[\d.]+) L/.exec(d)?.[1]);
      return { pass: Math.abs(y - pinY) < 3, detail: `leader y ${y}, pin y ${pinY.toFixed(1)}` };
    } finally { fe.close(); host.remove(); }
  },
});
