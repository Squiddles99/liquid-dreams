import { it } from 'vitest';
import { buildProfile } from './lipProfile';
import { peakLanding, peakStation } from './peakStation.fixture';
it('horn', () => {
  const psi = 0.035, tau = peakLanding(psi);
  for (const dt of [0, 0.1, 0.25, 0.5, 0.75]) {
    const st = peakStation(psi, tau + dt); const p = buildProfile(st.base, st.input, st.lip, st.frameBase), f = p.frame;
    let jm = 0; p.points.forEach((q, j) => { if (q[1] > p.points[jm][1]) jm = j; });
    console.log(`dt ${dt} K.y ${f.K[1].toFixed(2)} lift ${f.crestLift.toFixed(2)} weight ${f.weight.toFixed(2)} collapse ${f.collapse.toFixed(2)} max ${p.points[jm][1].toFixed(2)} at j ${jm} x ${p.points[jm][0].toFixed(2)} H ${st.input.H.toFixed(2)} lipH ${st.input.lipH?.toFixed(2)}`);
  }
}, 300000);
