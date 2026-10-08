import type * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { AsyncPipelines } from './asyncPipelines';

/** A stand-in for three's pipeline cache: records what each call was given; with an array, starts a build there. */
function fakeRenderer() {
  const given: (unknown[] | null)[] = [];
  const builds: (() => void)[] = [];
  const pipelines = {
    getForRender(_ro: object, promises: Promise<unknown>[] | null = null) {
      given.push(promises);
      if (promises) promises.push(new Promise<void>((resolve) => builds.push(resolve)));
      return 'pipeline';
    },
  };
  return { renderer: { _pipelines: pipelines } as unknown as THREE.WebGPURenderer, pipelines, given, builds };
}

describe('AsyncPipelines', () => {
  it('names the builds still in flight (material, object, target) and counts the builds started, only inside run', async () => {
    const { renderer, pipelines, builds } = fakeRenderer();
    const ap = new AsyncPipelines(renderer);
    pipelines.getForRender({ material: { name: 'Outside' }, context: {} });
    expect(ap.inflight()).toEqual([]);
    expect(ap.started).toBe(0);
    ap.run(() => pipelines.getForRender({ material: { name: 'Foo' }, context: {} }));
    expect(ap.inflight()).toEqual(['Foo (canvas)']);
    expect(ap.started).toBe(1);
    builds[0]();
    await Promise.resolve();
    await Promise.resolve();
    expect(ap.inflight()).toEqual([]);
    expect(ap.started).toBe(1);
  });

  it('labels a build by material type, object name and render target when they are there', () => {
    const { renderer, pipelines } = fakeRenderer();
    const ap = new AsyncPipelines(renderer);
    ap.run(() => pipelines.getForRender({ material: { name: '', type: 'MeshBasicNodeMaterial' }, object: { name: 'hair' }, context: { renderTarget: { texture: { name: 'capture' } } } }));
    expect(ap.inflight()).toEqual(['MeshBasicNodeMaterial hair (capture)']);
  });

  it('builds in the background only inside run, and counts the builds until they land', async () => {
    const { renderer, pipelines, given, builds } = fakeRenderer();
    const ap = new AsyncPipelines(renderer);
    expect(pipelines.getForRender({})).toBe('pipeline');
    expect(given[0]).toBeNull();
    expect(ap.run(() => pipelines.getForRender({}))).toBe('pipeline');
    expect(Array.isArray(given[1])).toBe(true);
    expect(ap.pending).toBe(1);
    builds[0]();
    await Promise.resolve();
    await Promise.resolve();
    expect(ap.pending).toBe(0);
    pipelines.getForRender({});
    expect(given[2]).toBeNull();
  });

  it("build waits for the pipelines its own render started, not for those started elsewhere", async () => {
    const { renderer, pipelines, builds } = fakeRenderer();
    const ap = new AsyncPipelines(renderer);
    ap.run(() => pipelines.getForRender({}));
    let done = false;
    const built = ap.build(() => pipelines.getForRender({})).then(() => { done = true; });
    expect(ap.pending).toBe(2);
    await Promise.resolve();
    expect(done).toBe(false);
    builds[1]();
    await built;
    expect(done).toBe(true);
    expect(ap.pending).toBe(1);
  });

  it("leaves compileAsync's own builds to it (they come with their array)", () => {
    const { renderer, pipelines, given } = fakeRenderer();
    const ap = new AsyncPipelines(renderer);
    const own: Promise<unknown>[] = [];
    ap.run(() => pipelines.getForRender({}, own));
    expect(given[0]).toBe(own);
    expect(ap.pending).toBe(0);
  });

  it('is back to blocking builds after a render that throws', () => {
    const { renderer, pipelines, given } = fakeRenderer();
    const ap = new AsyncPipelines(renderer);
    expect(() => ap.run(() => { throw new Error('boom'); })).toThrow('boom');
    pipelines.getForRender({});
    expect(given[0]).toBeNull();
  });
});
