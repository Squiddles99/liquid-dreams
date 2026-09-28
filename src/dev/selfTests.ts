// Every *.selftest.ts module registers itself on import. Later tasks add imports here.
import '../sky/sky.selftest';
import '../ocean/fft.selftest';
import '../ocean/ocean.selftest';
import '../ocean/probe.selftest';
import '../ocean/underwater.selftest';
import '../seabed/seabed.selftest';
import '../seabed/seabedShading.selftest';
import '../breaker/breaker.selftest';
import '../breaker/ribbon.selftest';
import '../whitewater/foamField.selftest';
import '../whitewater/spray.selftest';
import '../land/land.selftest';
import '../surf/surf.selftest';

export { renderSelfTestReport, runSelfTests } from './selfTest';
