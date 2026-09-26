export interface PolarGridOptions {
  segments: number;
  innerRadiusM: number;
  outerRadiusM: number;
}

export const DEFAULT_POLAR_GRID: PolarGridOptions = { segments: 384, innerRadiusM: 0.25, outerRadiusM: 20000 };

export interface PolarGrid {
  positions: Float32Array;
  indices: Uint32Array;
  ringRadii: number[];
}

/** Camera-centred disc: centre fan + rings whose spacing matches the angular spacing (square-ish cells). */
export function buildPolarGrid(o: PolarGridOptions = DEFAULT_POLAR_GRID): PolarGrid {
  const growth = 1 + (2 * Math.PI) / o.segments;
  const ringRadii: number[] = [];
  for (let r = o.innerRadiusM; ; r *= growth) {
    ringRadii.push(r);
    if (r >= o.outerRadiusM) break;
  }
  const seg = o.segments;
  const positions = new Float32Array((1 + ringRadii.length * seg) * 3);
  ringRadii.forEach((r, i) => {
    for (let j = 0; j < seg; j++) {
      const a = (2 * Math.PI * j) / seg;
      const v = (1 + i * seg + j) * 3;
      positions[v] = r * Math.cos(a);
      positions[v + 2] = r * Math.sin(a);
    }
  });
  const indices = new Uint32Array((seg + (ringRadii.length - 1) * seg * 2) * 3);
  let k = 0;
  for (let j = 0; j < seg; j++) {
    indices[k++] = 0;
    indices[k++] = 1 + ((j + 1) % seg);
    indices[k++] = 1 + j;
  }
  for (let i = 0; i < ringRadii.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = 1 + i * seg + j;
      const b = 1 + i * seg + ((j + 1) % seg);
      const c = 1 + (i + 1) * seg + j;
      const d = 1 + (i + 1) * seg + ((j + 1) % seg);
      indices[k++] = a; indices[k++] = b; indices[k++] = c;
      indices[k++] = b; indices[k++] = d; indices[k++] = c;
    }
  }
  return { positions, indices, ringRadii };
}
