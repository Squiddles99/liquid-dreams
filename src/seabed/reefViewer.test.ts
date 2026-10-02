import { describe, it } from 'vitest';
import { computeReefField } from '../breaker/reefField';
import { psiStateLabel } from '../breaker/overturn';
import { TIDES, type Tide, evaluateReef, firstBreak, formatCard, peakPsi, rayProfile, setWaveHeight } from '../breaker/reefReport';
import { bedMaterialAt, buildBathymetry, downsample } from './bathymetry';
import { NORTH_LEDGE } from './wombReef';

const BASELINE_OUT: string = import.meta.env.VITE_REEF_BASELINE_OUT ?? '';
// node:fs through a computed specifier: the project's typecheck has no Node types, and this only runs under Vitest.
const nodeFs = (): Promise<{ writeFileSync(p: string, d: string): void; readFileSync(p: string, e: 'utf8'): string }> => import(/* @vite-ignore */ ['node', 'fs'].join(':'));

/** The point 40 m up the north ledge from the peak: the second drawn ray starts here. */
export const NORTH_RAY_START: readonly [number, number] = (() => {
  const [a, b] = NORTH_LEDGE, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [a[0] + ((b[0] - a[0]) * 40) / len, a[1] + ((b[1] - a[1]) * 40) / len] as const;
})();

/** The reef as built now: depth along the two rays and its scorecard (the drawing's "before"). */
export function reefSnapshot() {
  const bathy = buildBathymetry(), bed = downsample(bathy, 2);
  const fields = Object.fromEntries((Object.keys(TIDES) as Tide[]).map((t) => [t, computeReefField({ bed, periodS: 15, fromDeg: 225, tideM: TIDES[t] })])) as Record<Tide, ReturnType<typeof computeReefField>>;
  const card = evaluateReef(fields);
  return { peakRay: rayProfile(bathy, fields.mid, 0, 0), northRay: rayProfile(bathy, fields.mid, NORTH_RAY_START[0], NORTH_RAY_START[1]), card, text: formatCard(card) };
}

describe.skipIf(!BASELINE_OUT)('the reef before build A (plan 2026-10-02 Task 1)', () => {
  it('dumps the softened ramp’s rays and scorecard', { timeout: 600_000 }, async () => {
    const fs = await nodeFs();
    fs.writeFileSync(BASELINE_OUT, JSON.stringify(reefSnapshot()));
  });
});

const VIEW_OUT: string = import.meta.env.VITE_REEF_VIEW_OUT ?? '';
const VIEW_BASELINE: string = import.meta.env.VITE_REEF_BASELINE ?? '';
const TIDE_COLOUR: Record<Tide, string> = { low: '#c0392b', mid: '#1f6fb2', high: '#2e8b57' };

/** One side view, true scale ×3 across, ×12 down: depth along a ray, old dashed grey, new filled, still water at 0. */
function sideView(title: string, before: [number, number][], after: [number, number][], marks: { s: number; label: string; colour: string }[]): string {
  const S0 = -60, S1 = 300, D1 = 26, PX = 3, PY = 12, W = (S1 - S0) * PX, H = D1 * PY + 40;
  const X = (s: number) => ((s - S0) * PX).toFixed(1), Y = (d: number) => (20 + d * PY).toFixed(1);
  const line = (q: [number, number][]) => 'M' + q.filter(([s]) => s >= S0 && s <= S1).map(([s, d]) => `${X(s)},${Y(d)}`).join('L');
  const ticks = [0, 30, 100, 200, 300].map((s) => `<line x1="${X(s)}" y1="${Y(0)}" x2="${X(s)}" y2="${Y(D1)}" stroke="#ccd" stroke-width="0.7"/><text x="${X(s)}" y="${H - 4}" font-size="11" text-anchor="middle">${s} m</text>`).join('');
  const depthTicks = [6, 12, 20].map((d) => `<text x="2" y="${Y(d)}" font-size="11">${d} m</text>`).join('');
  const m = marks.map((k, i) => `<circle cx="${X(k.s)}" cy="${Y(0)}" r="4" fill="${k.colour}"/><text x="${X(k.s)}" y="${(+Y(0) - 6 - (i % 5) * 11).toFixed(1)}" font-size="10" fill="${k.colour}" text-anchor="middle">${k.label}</text>`).join('');
  return `<figure><figcaption><b>${title}</b> (left: inshore; right: out to sea; the peak's take-off at 0)</figcaption>
  <svg viewBox="0 0 ${W} ${H}" width="${W}" style="max-width:100%;height:auto;background:#eef3f8">${ticks}${depthTicks}
  <path d="${line(after)}L${X(S1)},${Y(D1)}L${X(S0)},${Y(D1)}Z" fill="#5b5446"/>
  <path d="${line(before)}" fill="none" stroke="#999" stroke-width="2" stroke-dasharray="6 4"/>
  <line x1="0" y1="${Y(0)}" x2="${W}" y2="${Y(0)}" stroke="#2a6fdb" stroke-width="1.5"/>${m}</svg></figure>`;
}

describe.skipIf(!VIEW_OUT || !VIEW_BASELINE)('the reef build, drawn for Andrew (plan 2026-10-02 Task 5)', () => {
  it('draws the two rays old against new, with where each size first breaks and its tube', { timeout: 600_000 }, async () => {
    const fs = await nodeFs();
    const before = JSON.parse(fs.readFileSync(VIEW_BASELINE, 'utf8')) as ReturnType<typeof reefSnapshot>;
    const now = reefSnapshot();
    const bed = downsample(buildBathymetry(), 2);
    const marks: { s: number; label: string; colour: string }[] = [];
    for (const t of Object.keys(TIDES) as Tide[]) {
      const f = computeReefField({ bed, periodS: 15, fromDeg: 225, tideM: TIDES[t] });
      for (const ft of [4, 6, 8, 12]) {
        const H = setWaveHeight(ft), at = firstBreak(f, H);
        if (at) marks.push({ s: at.d, label: `${ft}′ ${t}: ${psiStateLabel(peakPsi(f, H, t === now.card.ideal12.tide && ft === 12))}`, colour: TIDE_COLOUR[t] });
      }
    }
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Womb Reef Profile</title>
<body style="font:14px system-ui;margin:16px;color:#123">
<h2>The Womb's reef, build A: before (dashed) and after</h2>
<p>Dots: where each size's biggest set wave first breaks on the peak's line (red low tide, blue mid, green high), with its tube. 12 ft is read after a lull on its best tide (${now.card.ideal12.tide}).</p>
${sideView('Along the peak’s line, out to the south-west', before.peakRay, now.peakRay, marks)}
${sideView('Along the line 40 m up the north ledge', before.northRay, now.northRay, [])}
<h3>The numbers</h3><pre style="white-space:pre-wrap">BEFORE
${before.text}

AFTER
${now.text}</pre></body></html>`;
    fs.writeFileSync(VIEW_OUT, html);
  });
});

const MATERIAL_OUT: string = import.meta.env.VITE_REEF_MATERIAL_OUT ?? '';

/**
 * The bed's material over Andrew's top-down satellite view (plan 2026-10-02 Task 6): the image's frame is x ∈ [−370, 450],
 * z ∈ [−202, 215] at 0.41 m/px with the peak at pixel (902, 572); every 2 m cell is painted rock grey, weed olive or sand
 * pale at half opacity. Drawn on a canvas (thousands of cells) for html2png; the image must sit beside the html.
 */
describe.skipIf(!MATERIAL_OUT)('the reef’s rock and sand over the satellite view (plan 2026-10-02 Task 6)', () => {
  it('writes the overlay', { timeout: 120_000 }, async () => {
    const fs = await nodeFs();
    const bathy = buildBathymetry(), M = 0.41, PX0 = 902, PZ0 = 572, S = 2;
    const cells: number[] = [];
    for (let z = -202; z < 215; z += S) for (let x = -370; x < 450; x += S) {
      const [s, w] = bedMaterialAt(bathy, x, z);
      cells.push(Math.round(s * 100), Math.round(w * 100));
    }
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Womb Reef Material</title>
<body style="margin:0;background:#000"><canvas id="c"></canvas>
<script>const d=${JSON.stringify(cells)},img=new Image();img.onload=()=>{const cv=document.getElementById('c');
// The photo at the scale its pixel coordinates were traced at (2000 px wide), our cells painted in the same pixels.
const k0=2000/img.naturalWidth;cv.width=2000;cv.height=Math.round(img.naturalHeight*k0);cv.style.width='2000px';
const g=cv.getContext('2d');g.drawImage(img,0,0,cv.width,cv.height);let k=0;
for(let z=-202;z<215;z+=${S})for(let x=-370;x<450;x+=${S}){const s=d[k++]/100,w=d[k++]/100,r=1-s-w;
const c=[141*r+61*w+217*s,138*r+74*w+207*s,126*r+38*w+174*s].map(Math.round);g.fillStyle='rgba('+c+',0.45)';
g.fillRect(${PX0}+x/${M},${PZ0}+z/${M},${S}/${M}+0.5,${S}/${M}+0.5);}
g.strokeStyle='#ff3';g.lineWidth=3;g.beginPath();g.arc(${PX0},${PZ0},8,0,7);g.stroke();};
img.src='womb-correct-topdown-peak-189m-offshore.webp';</script></body></html>`;
    fs.writeFileSync(MATERIAL_OUT, html);
  });
});
