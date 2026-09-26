// Every *.selftest.ts module registers itself on import. Later tasks add imports here.
import '../sky/sky.selftest';
import '../ocean/fft.selftest';
import '../ocean/ocean.selftest';
import '../ocean/probe.selftest';
import '../seabed/seabed.selftest';

export { renderSelfTestReport, runSelfTests } from './selfTest';
