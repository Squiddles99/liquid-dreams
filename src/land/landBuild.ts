import { decodeLandFile } from './landData';
import { type BeachProfile, LandHeight } from './landHeight';
import { type LandMeshData, buildLandMesh } from './landMesh';
import { buildMarchHeights } from './sunlight';

/** What the land takes to build from its composed height: the mesh and the sunlight map's march heights. */
export interface LandBuild {
  mesh: LandMeshData;
  march: Float32Array;
}

/** The land's build, on whichever thread calls it (the mesh alone is 0.5–1.6 s of CPU in the game). */
export function buildLand(height: LandHeight): LandBuild {
  return { mesh: buildLandMesh(height), march: buildMarchHeights((x, z) => height.heightAt(x, z)) };
}

/** Builds the land from the file's bytes and the beach profile (Land.load's builder). */
export type LandBuilder = (bytes: Uint8Array, profile: BeachProfile) => Promise<LandBuild>;

export const buildInThread: LandBuilder = async (bytes, profile) => buildLand(new LandHeight(decodeLandFile(bytes), profile));

/**
 * Builds the land in a one-shot worker (landWorker.ts), so the frame the land arrives on doesn't freeze building it;
 * on the main thread instead where there are no workers or the worker fails.
 */
export function offThreadBuilder(makeWorker: () => Worker): LandBuilder {
  return (bytes, profile) => {
    let worker: Worker;
    try {
      worker = makeWorker();
    } catch {
      return buildInThread(bytes, profile);
    }
    return new Promise<LandBuild>((resolve) => {
      worker.onmessage = (e: MessageEvent<LandBuild>) => {
        worker.terminate();
        resolve(e.data);
      };
      worker.onerror = (e) => {
        worker.terminate();
        console.warn(`The land worker failed (${e.message}); building the land on the main thread.`);
        resolve(buildInThread(bytes, profile));
      };
      worker.postMessage({ bytes, profile });
    });
  };
}

export const buildOffThread = offThreadBuilder(() => new Worker(new URL('./landWorker.ts', import.meta.url), { type: 'module' }));
