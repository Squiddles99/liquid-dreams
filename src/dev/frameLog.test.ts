import { describe, expect, it } from 'vitest';
import { FRAME_LOG_CAP, FrameLog, type FrameRecord } from './frameLog';

const rec = (t: number): FrameRecord => ({ t, dt: 16, sim: t / 1000, gpu: 3, foam: 0, spray: 0, impact: 0, kelp: 0, under: 0, ribbon: 0, pending: 0, building: '' });

describe('FrameLog', () => {
  it('records nothing while off', () => {
    const l = new FrameLog();
    l.record(rec(1));
    expect(l.drain()).toEqual([]);
  });
  it('keeps the last FRAME_LOG_CAP records in order and drains them', () => {
    const l = new FrameLog();
    l.on = true;
    for (let i = 0; i < FRAME_LOG_CAP + 10; i++) l.record(rec(i));
    const out = l.drain();
    expect(out).toHaveLength(FRAME_LOG_CAP);
    expect(out[0].t).toBe(10);
    expect(out[out.length - 1].t).toBe(FRAME_LOG_CAP + 9);
    expect(l.drain()).toEqual([]);
  });
});
