import type { BoardKind } from './boardSpec';

export type RGB = [number, number, number];

/** Linear-RGB albedos and finish (spec §4.5). */
export interface BoardLook {
  glass: RGB;
  deck: RGB;
  bottom: RGB;
  rail: RGB;
  /** 0–1: how strongly the rail colour bands the deck's edge (the step-up's tint). */
  railBand: number;
  /** The tail pad's length from the tail (m); 0 = none. */
  padLengthM: number;
  shininess: number;
}

const OLD_GLASS: RGB = [0.72, 0.68, 0.55];

export const DEFAULT_BOARD_LOOKS: Record<BoardKind, BoardLook> = {
  thruster: { glass: OLD_GLASS, deck: OLD_GLASS, bottom: OLD_GLASS, rail: OLD_GLASS, railBand: 0, padLengthM: 0.3, shininess: 90 },
  stepUp: { glass: OLD_GLASS, deck: OLD_GLASS, bottom: OLD_GLASS, rail: [0.1, 0.25, 0.32], railBand: 1, padLengthM: 0.3, shininess: 90 },
  bodyboard: { glass: [0.8, 0.82, 0.85], deck: [0.05, 0.22, 0.42], bottom: [0.8, 0.82, 0.85], rail: [0.04, 0.17, 0.33], railBand: 0, padLengthM: 0, shininess: 70 },
};
