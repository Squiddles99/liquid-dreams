// src/frontend/capesGeom.test.ts
import { describe, expect, it } from 'vitest';
import { CHART, CHART_LABELS, TITLE_VIEW, capesToChart, chartSwellLines, chartWindArrows, compass16, compassArc } from './capesGeom';

describe('capesToChart', () => {
  it('puts the frame origin at the top-left', () => {
    const [x, y] = capesToChart(CHART.lon0, CHART.lat0);
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(0, 6);
  });
  it('frames Cape Naturaliste near the top and Cape Leeuwin near the bottom', () => {
    const [, yN] = capesToChart(115.012, -33.533), [, yL] = capesToChart(115.136, -34.374);
    expect(yN).toBeGreaterThan(60); expect(yN).toBeLessThan(160);
    expect(yL).toBeGreaterThan(940); expect(yL).toBeLessThan(1040);
  });
  it('puts the Womb on the left half of the chart, west of Margaret River', () => {
    const [xW] = capesToChart(114.982, -33.8952), [xM] = capesToChart(115.075, -33.955);
    expect(xW).toBeGreaterThan(500); expect(xW).toBeLessThan(720); expect(xM).toBeGreaterThan(xW);
  });
});

describe('labels', () => {
  it('names both capes, Geographe Bay and the towns (no Dunsborough: no waves break there, Andrew 2026-10-10)', () => {
    const t = CHART_LABELS.map((l) => l.text);
    for (const n of ['Cape Naturaliste', 'Cape Leeuwin', 'GEOGRAPHE BAY', 'INDIAN OCEAN', 'YALLINGUP', 'BUSSELTON', 'GRACETOWN', 'MARGARET RIVER', 'HAMELIN BAY', 'AUGUSTA'])
      expect(t).toContain(n);
    expect(t).not.toContain('DUNSBOROUGH');
  });
});

describe('chartSwellLines', () => {
  it('travels away from where the swell comes from (WSW swell runs east-north-east)', () => {
    const s = chartSwellLines(247, 14, 6);
    expect(s.travel[0]).toBeGreaterThan(0.85);   // east
    expect(s.travel[1]).toBeLessThan(0);         // north (y down is south)
  });
  it('spaces crests by the period and thickens them with size', () => {
    expect(chartSwellLines(247, 16, 6).spacing).toBeGreaterThan(chartSwellLines(247, 10, 6).spacing);
    expect(chartSwellLines(247, 14, 10).width).toBeGreaterThan(chartSwellLines(247, 14, 3).width);
  });
  it('draws each crest square to the travel', () => {
    const s = chartSwellLines(225, 12, 5), [[x1, y1], [x2, y2]] = s.lines[0];
    const dx = x2 - x1, dy = y2 - y1, dot = (dx * s.travel[0] + dy * s.travel[1]) / Math.hypot(dx, dy);
    expect(Math.abs(dot)).toBeLessThan(1e-6);
  });
});

describe('chartWindArrows', () => {
  it('draws nothing when glassy (null direction or under 1 m/s)', () => {
    expect(chartWindArrows(null, 0.5)).toEqual({ arrows: [], glassy: true });
    expect(chartWindArrows(90, 0.4).glassy).toBe(true);
  });
  it('points an easterly west (rotation 180°) and a northerly south (90°)', () => {
    expect(chartWindArrows(90, 5).arrows[0].angleDeg).toBe(180);
    expect(chartWindArrows(0, 5).arrows[0].angleDeg).toBe(90);
  });
});

describe('compass16', () => {
  it('names the sixteen points', () => {
    expect(compass16(247)).toBe('WSW'); expect(compass16(90)).toBe('E'); expect(compass16(359)).toBe('N'); expect(compass16(202)).toBe('SSW');
  });
});

describe('compassArc', () => {
  it('names an arc by its ends, once when both ends share a point', () => {
    expect(compassArc([225, 248])).toBe('SW – WSW'); expect(compassArc([240, 255])).toBe('WSW');
  });
});

describe('TITLE_VIEW', () => {
  it('is a 16:9 window inside the chart, around the Womb', () => {
    expect(TITLE_VIEW.w / TITLE_VIEW.h).toBeCloseTo(16 / 9, 3);
    const [x, y] = capesToChart(114.982, -33.8952);
    expect(x).toBeGreaterThan(TITLE_VIEW.x); expect(x).toBeLessThan(TITLE_VIEW.x + TITLE_VIEW.w);
    expect(y).toBeGreaterThan(TITLE_VIEW.y); expect(y).toBeLessThan(TITLE_VIEW.y + TITLE_VIEW.h);
  });
});
