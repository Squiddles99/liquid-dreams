import type * as THREE from 'three/webgpu';

type RenderObject = object;
interface Pipelines {
  getForRender(renderObject: RenderObject, promises?: Promise<unknown>[] | null): unknown;
}

/**
 * Builds render pipelines in the background (createRenderPipelineAsync) for the renders run inside `run`. three builds a
 * new render pipeline with the blocking createRenderPipeline on the frame that first draws it, and on the GPU process
 * the page's frames queue behind that compile: at start-up, hundreds of them froze the loading cover for up to 7 s. Here
 * an object whose pipeline is still building is skipped (three draws only ready pipelines), so use it only where the
 * picture is hidden: the prewarm's throwaway renders and the frames behind the opaque cover. Renders outside `run` (and
 * one-off bakes, which must not lose a draw) build as three always did.
 *
 * It wraps the renderer's own pipeline cache (Renderer._pipelines, three r186): a render takes the pipeline the same way,
 * through the same render context, so what builds here is what the game draws later (unlike renderer.compileAsync,
 * which misses the picture's nested scene pass).
 */
export class AsyncPipelines {
  private readonly building = new Set<Promise<unknown>>();
  private depth = 0;
  /** The builds started by the innermost build() call running now. */
  private started: Promise<unknown>[] | null = null;

  constructor(renderer: THREE.WebGPURenderer) {
    const pipelines = (renderer as unknown as { _pipelines: Pipelines })._pipelines;
    const getForRender = pipelines.getForRender.bind(pipelines);
    pipelines.getForRender = (renderObject, promises = null) => {
      if (promises !== null || this.depth === 0) return getForRender(renderObject, promises);
      const started: Promise<unknown>[] = [];
      const pipeline = getForRender(renderObject, started);
      for (const p of started) {
        this.started?.push(p);
        this.building.add(p);
        void p.finally(() => this.building.delete(p));
      }
      return pipeline;
    };
  }

  /** Runs `render` with new render pipelines built in the background. */
  run<T>(render: () => T): T {
    this.depth++;
    try {
      return render();
    } finally {
      this.depth--;
    }
  }

  /**
   * Runs `render` as run does (synchronously); the promise resolves once the pipelines it started are built (not those
   * started elsewhere: the frames behind the cover keep starting their own).
   */
  build(render: () => void): Promise<void> {
    const outer = this.started;
    const mine: Promise<unknown>[] = [];
    this.started = mine;
    try {
      this.run(render);
    } finally {
      this.started = outer;
    }
    return Promise.all(mine).then(() => undefined);
  }

  /** How many render pipelines are still building. */
  get pending(): number {
    return this.building.size;
  }
}
