// Where the main thread waited: idle runs >= --min (default 200) ms and the biggest sample gaps, per .cpuprofile.
// node tools/_stallScan.mjs [--min=200] <file>...   (ride-stall Task 1; the finding is in the spec's §2)
import { readFileSync } from 'node:fs';
import { gaps, idleRuns } from '../src/dev/cpuprofileIdle.ts';
const min = Number(process.argv.find((a) => a.startsWith('--min='))?.slice(6) ?? 200);
for (const file of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
  const p = JSON.parse(readFileSync(file, 'utf8'));
  console.log(`\n######## ${file.split(/[\\/]/).pop()}  ${p.samples.length} samples over ${((p.endTime - p.startTime) / 1000).toFixed(0)} ms`);
  console.log(`-- idle runs >= ${min} ms`);
  for (const r of idleRuns(p, min)) {
    console.log(`${r.durationMs.toFixed(0).padStart(5)} ms @ +${r.startMs.toFixed(0)} ms  [${r.firstIndex}..${r.lastIndex}]`);
    console.log(`   before: ${r.before.join(' < ') || '(start)'}`);
    console.log(`   after : ${r.after.join(' < ') || '(end)'}`);
  }
  console.log('-- biggest single sample gaps');
  for (const g of gaps(p, 3)) console.log(`${g.ms.toFixed(1).padStart(7)} ms @ +${g.atMs.toFixed(0)} ms  ${g.stack.join(' < ')}`);
}
