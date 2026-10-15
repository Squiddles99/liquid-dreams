import { energyGrid } from './energyMap';
import { PLANE_DRAG, type RideBody, speedOf } from './ridePhysics';
import { type RideContext, handDragAccel, stallKind } from './riderBody';
import type { WaterFn } from './water';

/** The planing drag on the rider at speed v (m/s²), by source: the board (with any tuck), the stall's tail and body, the hand. */
export function dragSplit(b: RideBody, v: number): { board: number; tail: number; body: number; hand: number } {
  const lin = PLANE_DRAG.lin * (1 - 0.15 * b.tuck), quad = PLANE_DRAG.quad * (1 - 0.3 * b.tuck);
  const tallW = b.stallW.tall + b.stallW.standBarrel;
  return {
    board: lin * v + quad * v * v,
    tail: lin * 4 * b.stall * v,
    body: quad * 0.5 * b.stall * tallW * v * v,
    hand: handDragAccel(v, b.hand, b.massKg),
  };
}

const CELL_PX = 5, HALF_M = 20, STEP_M = 1, EVERY_S = 0.25;
const f2 = (v: number): string => (Number.isFinite(v) ? v.toFixed(2) : '∞');

/**
 * Where the face pays, around the rider (ride-speed spec §6; dev UI only): trimAccel on a 41 × 41 m grid, the line left
 * to right and the shore down; the rider at the centre, the trim line a third of the face under the crest; and the load,
 * the pump, the drag by source and the stall's reading.
 */
export class EnergyPanel {
  private readonly root = document.createElement('div');
  private readonly canvas = document.createElement('canvas');
  private readonly text = document.createElement('pre');
  private lastT = -Infinity;
  private clock = 0;

  constructor(parent: HTMLElement) {
    const size = (2 * HALF_M / STEP_M + 1) * CELL_PX;
    this.canvas.width = size;
    this.canvas.height = size;
    Object.assign(this.root.style, {
      position: 'fixed', left: '8px', bottom: '8px', padding: '6px', background: 'rgba(4,18,32,0.7)', borderRadius: '4px',
      pointerEvents: 'none', zIndex: '9', display: 'none',
    });
    Object.assign(this.text.style, { margin: '4px 0 0', color: '#cfe3f2', font: '11px monospace', whiteSpace: 'pre' });
    this.root.append(this.canvas, this.text);
    parent.appendChild(this.root);
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  update(dt: number, water: WaterFn, b: RideBody, ctx: RideContext): void {
    this.clock += dt;
    if (this.clock - this.lastT < EVERY_S) return;
    this.lastT = this.clock;
    const w = water(b.x, b.z);
    const sign: 1 | -1 = b.vx * -w.dirZ + b.vz * w.dirX >= 0 ? 1 : -1;
    const g = energyGrid(water, b.x, b.z, sign, HALF_M, STEP_M);
    const c = this.canvas.getContext('2d');
    if (!c) return;
    for (let j = 0; j < g.size; j++) {
      for (let i = 0; i < g.size; i++) {
        const v = g.values[j * g.size + i];
        const k = Math.min(1, Math.max(0, v / 3));
        c.fillStyle = v < 0 ? '#5a2a3a' : `rgb(${Math.round(27 + k * 52)},${Math.round(36 + k * 173)},${Math.round(51 + k * 204)})`;
        // the line runs left to right; the travel (toward the shore) runs down
        c.fillRect(i * CELL_PX, j * CELL_PX, CELL_PX, CELL_PX);
      }
    }
    const mid = ((g.size - 1) / 2) * CELL_PX + CELL_PX / 2;
    if (ctx.faceHM > 0 && Number.isFinite(ctx.crestBehindM)) {
      // the trim line: a third of the face (2A ≈ 2·faceHM/1.3) under the crest behind the rider
      const tM = -ctx.crestBehindM + (2 * ctx.faceHM) / 1.3 / 3, y = mid + (tM / STEP_M) * CELL_PX;
      c.strokeStyle = '#ffffff';
      c.setLineDash([4, 4]);
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(this.canvas.width, y);
      c.stroke();
      c.setLineDash([]);
    }
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(mid, mid, 4, 0, 2 * Math.PI);
    c.fill();
    const v = Math.max(0, (b.vx - w.ux) * Math.sin((b.headingDeg * Math.PI) / 180) - (b.vz - w.uz) * Math.cos((b.headingDeg * Math.PI) / 180));
    const d = dragSplit(b, v), along = Math.abs(b.vx * -w.dirZ + b.vz * w.dirX);
    const kind = stallKind(ctx, along, b.standH, Math.hypot(w.slopeX, w.slopeZ));
    this.text.textContent = [
      `load ${f2(b.load)} g (rest ${f2(b.n0)})   speed ${f2(speedOf(b))} m/s`,
      `pump last ${b.pumpGain >= 0 ? '+' : ''}${f2(b.pumpGain)} J/kg  phase ${f2(b.pumpPhase)}  tuck ${f2(b.tuck)}`,
      `drag  board ${f2(d.board)}  body ${f2(d.body)}  tail ${f2(d.tail)}  hand ${f2(d.hand)} m/s²`,
      `stall ${f2(b.stall)} → ${kind} (cover ${f2(ctx.cover)} room ${f2(ctx.roomM)} m faceHigh ${f2(ctx.faceHigh)}`,
      `      crest ${f2(ctx.crestBehindM)} m curl ${f2(ctx.curlSpeed)} vs ${f2(along)} m/s${ctx.closeout ? ' closeout' : ''})`,
    ].join('\n');
  }
}
