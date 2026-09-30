import type { SurferManifest } from './rig';

type V3 = [number, number, number];
/**
 * Where the skin's detail gathers, in the body's geometry space (metres, glTF axes, rest pose): Grommet's freckles,
 * sunburn and pimples (grommet spec §5), and every rider's blush, eye shadow, stubble, pores and eyes (closeup spec
 * §4.2).
 */
export interface SkinZones {
  cheeks: [V3, V3];
  bridge: V3;
  forehead: V3;
  earTops: [V3, V3];
  shoulders: [V3, V3];
  /** Elbow → wrist, each side. */
  forearms: [[V3, V3], [V3, V3]];
  pimples: [number, number, number, number][];
  /** The eyeballs' centres (left, right) and radius. */
  eyes: [V3, V3];
  eyeRadius: number;
  nose: V3;
  mouth: V3;
  lipFront: V3;
  /** The outermost points of the ears (left, right). */
  ears: [V3, V3];
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** The zones, or null when the build wrote no landmarks (an older build: no skin detail, nothing breaks). */
export function skinZones(m: SurferManifest): SkinZones | null {
  const L = m.landmarks;
  if (!L) return null;
  const bone = (n: string): V3 => m.bones.find((b) => b.name === n)!.head as V3;
  const side = (i: 0 | 1): number => (i === 0 ? 1 : -1);
  const r = L.eyeRadius ?? 0.0115;
  // The cheek's apple: below and a little outside each eye, on the skin (the eye's centre sits a radius behind it).
  const cheek = (i: 0 | 1): V3 => add(L.eyes[i], [0.012 * side(i), -0.025 - 0.4 * (r - 0.0115), 0.004 + (r - 0.0115)]);
  return {
    cheeks: [cheek(0), cheek(1)],
    bridge: add([(L.eyes[0][0] + L.eyes[1][0]) / 2, (L.eyes[0][1] + L.nose[1]) / 2, (L.eyes[0][2] + L.nose[2]) / 2], [0, 0, 0.004]),
    forehead: [0, L.eyes[0][1] + 0.045, L.eyes[0][2] - 0.004],
    earTops: [add(L.ears[0], [0, 0.015, 0]), add(L.ears[1], [0, 0.015, 0])],
    shoulders: [bone('upperarm_l'), bone('upperarm_r')],
    forearms: [[bone('forearm_l'), bone('hand_l')], [bone('forearm_r'), bone('hand_r')]],
    pimples: m.skin?.pimples ?? [],
    eyes: L.eyes,
    eyeRadius: r,
    nose: L.nose,
    mouth: L.mouth,
    lipFront: L.lipFront,
    ears: L.ears,
  };
}
