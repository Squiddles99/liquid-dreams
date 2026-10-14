import { describe, expect, it } from 'vitest';
import { ACTION_LABELS, DEFAULT_BINDINGS, PAD_ACTIONS, KEY_ACTIONS, buttonLabel, keyLabel } from '../ride/bindings';
import { controllerArt, keyboardArt } from './controlsArt';

describe('controls art', () => {
  it('the keyboard drawing calls out every bound key action, stall and pump included', () => {
    const texts = keyboardArt(DEFAULT_BINDINGS).callouts.map((c) => c.text);
    for (const a of KEY_ACTIONS) expect(texts).toContain(ACTION_LABELS[a]);
  });

  it('the stall and pump callouts name the keys they are bound to, after a remap too', () => {
    const b = { ...DEFAULT_BINDINGS, keys: { ...DEFAULT_BINDINGS.keys, stall: 'KeyF', pump: 'KeyQ' } };
    const callouts = keyboardArt(b).callouts;
    expect(callouts.find((c) => c.text === ACTION_LABELS.stall)?.sub).toBe(keyLabel('KeyF'));
    expect(callouts.find((c) => c.text === ACTION_LABELS.pump)?.sub).toBe(keyLabel('KeyQ'));
    expect(keyboardArt(b).svg).toContain('>F<');
  });

  it('the controller drawing calls out every pad action on its button', () => {
    const callouts = controllerArt(DEFAULT_BINDINGS).callouts;
    for (const a of PAD_ACTIONS) {
      expect(callouts.find((c) => c.text === ACTION_LABELS[a])?.sub).toBe(buttonLabel(DEFAULT_BINDINGS.pad[a]));
    }
  });
});
