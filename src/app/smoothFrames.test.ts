import { describe, expect, it } from 'vitest';
import { BOOT_BUILD_CAP_MS, SMOOTH, SmoothFramesGate, holdMet } from './smoothFrames';

describe('SmoothFramesGate', () => {
  it('opens after 10 frames in a row under 33 ms', () => {
    const g = new SmoothFramesGate(0);
    for (let i = 1; i <= 9; i++) expect(g.frame(16, i * 16)).toBe(false);
    expect(g.frame(16, 160)).toBe(true);
    expect(g.open).toBe(true);
  });
  it('one slow frame starts the count again', () => {
    const g = new SmoothFramesGate(0);
    for (let i = 1; i <= 9; i++) g.frame(16, i * 16);
    expect(g.frame(80, 224)).toBe(false);
    for (let i = 1; i <= 9; i++) expect(g.frame(16, 224 + i * 16)).toBe(false);
    expect(g.frame(16, 400)).toBe(true);
  });
  it('a frame of exactly 33 ms is slow', () => {
    const g = new SmoothFramesGate(0);
    for (let i = 1; i <= 20; i++) g.frame(SMOOTH.underMs, i * 33);
    expect(g.open).toBe(false);
  });
  it('opens anyway 4 s after the work is done (a slow machine still gets in)', () => {
    const g = new SmoothFramesGate(1000);
    expect(g.frame(200, 4999)).toBe(false);
    expect(g.frame(200, 5000)).toBe(true);
  });
  it('stays open once open', () => {
    const g = new SmoothFramesGate(0);
    for (let i = 1; i <= 10; i++) g.frame(16, i * 16);
    expect(g.frame(500, 700)).toBe(true);
  });
});

describe('SmoothFramesGate while pipeline builds are pending (one-curl Task 0)', () => {
  it('does not give up while blocked: 6 s of blocked frames leaves it closed', () => {
    const g = new SmoothFramesGate(0);
    for (let t = 33; t <= 6000; t += 33) expect(g.frame(16, t, true), `t ${t}`).toBe(false);
  });
  it('blocked frames never count as smooth', () => {
    const g = new SmoothFramesGate(0);
    for (let i = 1; i <= 30; i++) g.frame(16, i * 16, true);
    expect(g.open).toBe(false);
  });
  it('gives up after 4 s of unblocked time', () => {
    const g = new SmoothFramesGate(0);
    for (let t = 50; t <= 3000; t += 50) g.frame(50, t, true);
    for (let t = 3050; t < 7000; t += 50) expect(g.frame(50, t, false), `t ${t}`).toBe(false);
    expect(g.frame(50, 7000, false)).toBe(true);
  });
  it('opens anyway BOOT_BUILD_CAP_MS after the start, blocked throughout', () => {
    const g = new SmoothFramesGate(0);
    let openedAt = -1;
    for (let t = 50; t <= 20_000 && openedAt < 0; t += 50) if (g.frame(50, t, true)) openedAt = t;
    expect(openedAt).toBe(BOOT_BUILD_CAP_MS);
  });
});

describe('holdMet', () => {
  it('waits 1.5 s from when the cover is fully in (transitions)', () => {
    expect(holdMet(null, 9999, 1500)).toBe(false);
    expect(holdMet(1000, 2499, 1500)).toBe(false);
    expect(holdMet(1000, 2500, 1500)).toBe(true);
  });
  it('0.6 s with calm menus, none at start-up', () => {
    expect(holdMet(0, 600, 600)).toBe(true);
    expect(holdMet(0, 0, 0)).toBe(true);
  });
});
