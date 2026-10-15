import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS } from './bindings';
import { PadEdges, type PadState, rideControls } from './rideInput';

const keysDown = (...down: string[]) => {
  const pressed = new Set(down);
  return { isDown: (c: string) => down.includes(c), consumePressed: (c: string) => pressed.delete(c) };
};
const pad = (buttons: number[], axes: number[] = [0, 0]): PadState => {
  const pressed = Array.from({ length: 17 }, (_, i) => buttons.includes(i));
  return { axes, pressed, values: pressed.map((p) => (p ? 1 : 0)) };
};

describe('the ride reads the player’s bindings', () => {
  it('the defaults: W paddles, A and D turn, Space pops up; the arrow keys too', () => {
    expect(rideControls(keysDown('KeyW', 'KeyD'), null, new PadEdges(), DEFAULT_BINDINGS)).toMatchObject({ paddle: true, steer: 1 });
    expect(rideControls(keysDown('ArrowUp', 'ArrowLeft'), null, new PadEdges(), DEFAULT_BINDINGS)).toMatchObject({ paddle: true, steer: -1 });
    expect(rideControls(keysDown('Space'), null, new PadEdges(), DEFAULT_BINDINGS).popup).toBe(true);
  });

  it('remapped keys and buttons take over, and the old ones stop', () => {
    const b = { keys: { ...DEFAULT_BINDINGS.keys, popup: 'KeyJ', paddle: 'KeyI' }, pad: { ...DEFAULT_BINDINGS.pad, popup: 3, paddle: 5 } };
    expect(rideControls(keysDown('KeyJ', 'KeyI'), null, new PadEdges(), b)).toMatchObject({ popup: true, paddle: true });
    expect(rideControls(keysDown('Space', 'KeyW'), null, new PadEdges(), b)).toMatchObject({ popup: false, paddle: false });
    expect(rideControls(keysDown('ArrowUp'), null, new PadEdges(), b).paddle).toBe(true);
    expect(rideControls(keysDown(), pad([3, 5]), new PadEdges(), b)).toMatchObject({ popup: true, paddle: true });
    expect(rideControls(keysDown(), pad([0, 7]), new PadEdges(), b)).toMatchObject({ popup: false, paddle: false });
  });
});

describe('stall and pump (ride-speed spec §3)', () => {
  it('Shift and E, LB and RB, read as stall and pump', () => {
    const c = rideControls(keysDown('ShiftLeft', 'KeyE'), null, new PadEdges(), DEFAULT_BINDINGS);
    expect(c.stall).toBe(true);
    expect(c.pump).toBe(true);
    const p = rideControls(keysDown(), pad([4, 5]), new PadEdges(), DEFAULT_BINDINGS);
    expect(p.stall).toBe(true);
    expect(p.pump).toBe(true);
    const none = rideControls(keysDown(), pad([]), new PadEdges(), DEFAULT_BINDINGS);
    expect(none.stall).toBe(false);
    expect(none.pump).toBe(false);
  });
});
