import { it } from 'vitest';
import { profileFrame } from './lipProfile';
import { peakLanding, peakStation } from './peakStation.fixture';
it('grow', () => {
  for (const psi of [0.035, 0.065, 0.09]) {
    const tau = peakLanding(psi); const rows: string[] = [];
    for (const k of [0.25, 0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1]) {
      const st = peakStation(psi, k * tau); const f = profileFrame(st.frameBase, st.input, st.lip);
      rows.push(`k ${k} H ${st.input.H.toFixed(2)} lipH ${st.input.lipH?.toFixed(2)} HI ${f.HI.toFixed(2)} L ${f.tube.L.toFixed(2)} shapeL ${f.shape.L.toFixed(2)} prog ${f.prog.toFixed(2)} lift ${f.crestLift.toFixed(2)}`);
    }
    console.log(`psi ${psi} tau ${tau.toFixed(2)}\n${rows.join('\n')}`);
  }
}, 300000);
