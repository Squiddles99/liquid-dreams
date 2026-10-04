// src/input/padButton.ts: whether a pad button is down. Andrew's Xbox Series pad on Bluetooth (045e:0b13, a standard
// mapping) left LB, RB and View dead in the menus while A worked (2026-10-04): some pads report a press in the button's
// value without its pressed flag, so either counts.
export const buttonDown = (b: { pressed: boolean; value: number }): boolean => b.pressed || b.value > 0.5;
