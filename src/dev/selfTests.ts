// Every *.selftest.ts module registers itself on import. Later tasks add imports here.
import '../sky/sky.selftest';

export { renderSelfTestReport, runSelfTests } from './selfTest';
