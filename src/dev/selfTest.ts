import type * as THREE from 'three/webgpu';
import { showOverlay } from '../app/overlay';

export interface SelfTestResult {
  name: string;
  pass: boolean;
  detail: string;
}

export interface SelfTest {
  name: string;
  run(renderer: THREE.WebGPURenderer): Promise<{ pass: boolean; detail: string }>;
}

const tests: SelfTest[] = [];

export function registerSelfTest(t: SelfTest): void {
  tests.push(t);
}

export async function runSelfTests(renderer: THREE.WebGPURenderer): Promise<SelfTestResult[]> {
  const results: SelfTestResult[] = [];
  for (const t of tests) {
    let r: SelfTestResult;
    try {
      r = { name: t.name, ...(await t.run(renderer)) };
    } catch (e) {
      r = { name: t.name, pass: false, detail: `threw: ${e instanceof Error ? e.message : String(e)}` };
    }
    console.log(`[selftest] ${r.pass ? 'PASS' : 'FAIL'} ${r.name}: ${r.detail}`);
    results.push(r);
  }
  const passed = results.filter((r) => r.pass).length;
  console.log(`[selftest] SUMMARY ${passed}/${results.length} passed`);
  return results;
}

export function renderSelfTestReport(results: SelfTestResult[]): void {
  const passed = results.filter((r) => r.pass).length;
  showOverlay(
    `GPU self-tests: ${passed}/${results.length} passed`,
    results.map((r) => `${r.pass ? 'PASS' : 'FAIL'}  ${r.name}: ${r.detail}`).join('\n'),
  );
}

export const fmt = (v: ArrayLike<number>, n = 3): string => `[${Array.from(v).map((x) => x.toFixed(4)).slice(0, n).join(', ')}]`;
