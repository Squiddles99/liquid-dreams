import * as THREE from 'three/webgpu';
import {
  Fn, If, Loop, abs, clamp, cos, dot, exp, float, floor, int, ivec2, length, max, min, mix, select, sin, smoothstep, storage, tanh,
  textureLoad, uniform, vec2, vec3, vec4,
} from 'three/tsl';
import { REEF_GRID } from '../seabed/wombReef';
import { MAX_ACTIVE_WAVES, type WaveEvent } from '../swell/sets';
import { type BreakParams, DEFAULT_BREAK_PARAMS, MIN_BREAKING_HEIGHT_M, normalizeBreakParams } from './breaking';
import { breakPointNode, breakingRatioNode, breakingStageNode, createBreakUniforms, stageCurvesNode, steepeningNode, updateBreakUniforms } from './breakingNodes';
import { FAR_DX, FAR_X0, FAR_X1 } from './coastFarField';
import { MIN_DEPTH_M } from './dispersion';
import type { ReefField } from './reefField';
import {
  BREAKING_RATIO, CREST_MIN_CROSSING, CREST_STEPS, ENVELOPE_WIDTH, FOLD_LIMIT, PITCH_KA_CAP, PITCH_MAX, SEABED_CLEARANCE_M, STOKES_CAP,
  TAPER_FAR_M, TAPER_NEAR_M, fieldSteepeningHeight, toActiveWave,
} from './setWaveModel';

type N = any;

const FIELD_NX = REEF_GRID.nx / 2;
const FIELD_NZ = REEF_GRID.nz / 2;
const FAR_COUNT = Math.round((FAR_X1 - FAR_X0) / FAR_DX) + 1;
/** Envelope widths |ξ|/width beyond which a wave contributes nothing visible (exp(−3.5²) ≈ 5e-6). */
const ENVELOPE_CUTOFF = 3.5;
/** A wave is flagged "can break" once it is taller than this fraction of the field's steepening height: a 2% margin over
 * the exact bound, for the GPU's f32 field interpolation. */
const CAN_BREAK_MARGIN = 0.98;

function floatTexture(width: number, height: number): THREE.DataTexture {
  const data = new Float32Array(width * height * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 1;
  const t = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** Manual bilinear over a float texture (float32 textures need not be filterable). g is in texel units. */
function bilinearLoad(tex: THREE.Texture, g: N, maxIndex: N): N {
  const gc = clamp(g, vec2(0.0), maxIndex.sub(0.001));
  const base = floor(gc);
  const t = gc.sub(base);
  const i0 = ivec2(base);
  const load = (dx: number, dz: number): N => textureLoad(tex, i0.add(ivec2(dx, dz)), int(0));
  return mix(mix(load(0, 0), load(1, 0), t.x), mix(load(0, 1), load(1, 1), t.x), t.y);
}

/** Linear interpolation along row 0 of a width × 1 float texture. g is in texel units. */
function linearLoad1D(tex: THREE.Texture, g: N, maxIndex: N): N {
  const gc = clamp(g, 0.0, maxIndex.sub(0.001));
  const base = floor(gc);
  const i0 = int(base);
  return mix(textureLoad(tex, ivec2(i0, int(0)), int(0)), textureLoad(tex, ivec2(i0.add(1), int(0)), int(0)), gc.sub(base));
}

const safeNormalize = (v: N): N => v.div(max(length(v), 1e-6));

/** The set waves on the GPU: the reef field, the far field and the active waves; a TSL mirror of setWaveModel. */
export class SetWaves {
  hasField = false;
  private readonly fieldA = floatTexture(FIELD_NX, FIELD_NZ);
  private readonly fieldB = floatTexture(FIELD_NX, FIELD_NZ);
  private readonly farA = floatTexture(FAR_COUNT, 1);
  private readonly farB = floatTexture(FAR_COUNT, 1);
  private readonly origin = uniform(new THREE.Vector2(REEF_GRID.x0 + REEF_GRID.cellM / 2, REEF_GRID.z0 + REEF_GRID.cellM / 2));
  private readonly cell = uniform(REEF_GRID.cellM * 2);
  private readonly fieldMax = uniform(new THREE.Vector2(FIELD_NX - 1, FIELD_NZ - 1));
  private readonly farMax = uniform(FAR_COUNT - 1);
  private readonly farP = uniform(0);
  private readonly meanOmega = uniform(1);
  /** The field's mean swell travel direction (xz). */
  readonly meanTravel = uniform(new THREE.Vector2(1, 0));
  private readonly wavesAttr = new THREE.StorageBufferAttribute(new Float32Array(MAX_ACTIVE_WAVES * 8), 4);
  private readonly waves = storage(this.wavesAttr, 'vec4', MAX_ACTIVE_WAVES * 2).toReadOnly();
  /** How many wave slots are filled; 0 in a lull, when sum() skips the field fetches and the loop entirely. */
  readonly activeCount = uniform(0);
  /** The breaking shape's parameters (breakingNodes.ts), uploaded normalized. */
  private readonly brk = createBreakUniforms(DEFAULT_BREAK_PARAMS);
  private breakParams: BreakParams = { ...DEFAULT_BREAK_PARAMS };
  private field: ReefField | null = null;
  /** setWaveModel.fieldSteepeningHeight for the current field and params (Infinity with no field: nothing breaks). */
  private steepeningHeight = Infinity;
  private events: readonly WaveEvent[] = [];

  constructor(private readonly time: N) {
    this.setEvents([]);
  }

  setBreakParams(p: BreakParams): void {
    updateBreakUniforms(this.brk, p);
    this.breakParams = { ...p };
    normalizeBreakParams(this.breakParams);
    this.updateBreakingHeight();
  }

  /** Recomputes the field's steepening height and rewrites the waves' "can break" flags (field or params changed). */
  private updateBreakingHeight(): void {
    this.steepeningHeight = this.field ? fieldSteepeningHeight(this.field, this.breakParams) : Infinity;
    this.setEvents(this.events);
  }

  setField(f: ReefField): void {
    if (f.grid.nx !== FIELD_NX || f.grid.nz !== FIELD_NZ || f.far.count !== FAR_COUNT) throw new Error('Reef field grid does not match SetWaves');
    const a = this.fieldA.image.data as Float32Array, b = this.fieldB.image.data as Float32Array;
    for (let i = 0; i < f.tau.length; i++) {
      a[i * 4] = f.tau[i]; a[i * 4 + 1] = f.amp[i]; a[i * 4 + 2] = f.hmin[i]; a[i * 4 + 3] = f.k[i];
      b[i * 4] = f.dirX[i]; b[i * 4 + 1] = f.dirZ[i]; b[i * 4 + 2] = f.depth[i]; b[i * 4 + 3] = 0;
    }
    const fa = this.farA.image.data as Float32Array, fb = this.farB.image.data as Float32Array;
    for (let i = 0; i < f.far.count; i++) {
      fa[i * 4] = f.far.tau[i] - f.far.tauOffset; fa[i * 4 + 1] = f.far.amp[i]; fa[i * 4 + 2] = f.far.hmin[i]; fa[i * 4 + 3] = f.far.k[i];
      fb[i * 4] = f.far.dTauDx[i]; fb[i * 4 + 1] = f.far.depth[i]; fb[i * 4 + 2] = 0; fb[i * 4 + 3] = 0;
    }
    for (const t of [this.fieldA, this.fieldB, this.farA, this.farB]) t.needsUpdate = true;
    this.origin.value.set(f.grid.x0, f.grid.z0);
    this.cell.value = f.grid.cellM;
    this.farP.value = f.far.p;
    this.meanOmega.value = f.omega;
    this.meanTravel.value.set(f.far.dirX, f.far.dirZ);
    this.hasField = true;
    this.field = f;
    this.updateBreakingHeight();
  }

  /**
   * Uploads the active waves. Each slot's second vec4 carries, in w, a "can break" flag: 1 when the wave is taller than
   * CAN_BREAK_MARGIN × the field's steepening height (setWaveModel.fieldSteepeningHeight), so it may steepen or break
   * somewhere. The GPU skips the crest search and breaking for a flagged-0 wave; the model gives such a wave no
   * sharpening and stage 0 everywhere, so the result is Phase 1 either way.
   */
  setEvents(events: readonly WaveEvent[]): void {
    this.events = events;
    const d = this.wavesAttr.array as Float32Array;
    for (let i = 0; i < MAX_ACTIVE_WAVES; i++) {
      const e = events[i];
      const w = e ? toActiveWave(e) : null;
      const canBreak = w && w.heightM > CAN_BREAK_MARGIN * this.steepeningHeight ? 1 : 0;
      d.set(w ? [w.arrivalS, w.heightM, w.omega, w.crestLengthM] : [0, 0, 1, 1], i * 8);
      d.set(w ? [w.travelX, w.travelZ, w.crestOffsetM, canBreak] : [1, 0, 0, 0], i * 8 + 4);
    }
    this.activeCount.value = Math.min(events.length, MAX_ACTIVE_WAVES);
    this.wavesAttr.needsUpdate = true;
  }

  /** The "can break" flag uploaded for a wave slot (0 or 1; see setEvents). */
  canBreakFlag(slot: number): number {
    return (this.wavesAttr.array as Float32Array)[slot * 8 + 7];
  }

  /**
   * The field at world xz (TSL mirror of sampleField): bilinear inside the reef grid. Outside it, with c the point
   * clamped to the grid: on the inflow side the exact coast solution; on the outflow side the grid's edge sample at c,
   * with τ advanced along the edge's ray direction from c to xz, so the reef's delay and shadow continue past the map.
   * `hoist` (only inside an Fn) makes the texture reads vars first: each select() below becomes an if/else, and TSL
   * would otherwise emit the reads inside every branch that uses them (44 loads per sample instead of 12), and it loads
   * the far field only outside the grid (8 loads per sample inside it).
   */
  sample(xz: N, hoist = false): { tau: N; amp: N; hmin: N; k: N; dir: N; depth: N } {
    const v = (n: N): N => (hoist ? n.toVar() : n);
    const g = v(xz.sub(this.origin).div(this.cell));
    const inside = g.x.greaterThanEqual(0.0).and(g.y.greaterThanEqual(0.0)).and(g.x.lessThanEqual(this.fieldMax.x)).and(g.y.lessThanEqual(this.fieldMax.y));
    // bilinearLoad clamps g, so outside the grid a and b are already the edge sample at the clamped point.
    const a = v(bilinearLoad(this.fieldA, g, this.fieldMax));
    const b = v(bilinearLoad(this.fieldB, g, this.fieldMax));
    const fg = v(clamp(xz.x.sub(FAR_X0).div(FAR_DX), 0.0, this.farMax.sub(0.001)));
    // Hoisted, the far field's four loads run only outside the grid (inside, every value below takes the grid's side
    // of its select, and the zeros left in fa and fb are never read into the result).
    let fa: N, fb: N;
    if (hoist) {
      fa = vec4(0.0).toVar();
      fb = vec4(0.0).toVar();
      If(inside.not(), () => {
        fa.assign(linearLoad1D(this.farA, fg, this.farMax));
        fb.assign(linearLoad1D(this.farB, fg, this.farMax));
      });
    } else {
      fa = linearLoad1D(this.farA, fg, this.farMax);
      fb = linearLoad1D(this.farB, fg, this.farMax);
    }
    const xc = fg.mul(FAR_DX).add(FAR_X0);
    const farTau = fa.x.add(xz.x.sub(xc).mul(fb.x)).add(this.farP.mul(xz.y));
    const farDir = safeNormalize(vec2(fb.x, this.farP));
    // From the point clamped to the grid to the query (zero inside). Outflow: the far wave travels away from the grid.
    const toQuery = xz.sub(this.origin.add(clamp(g, vec2(0.0), this.fieldMax).mul(this.cell)));
    const outflow = farDir.x.mul(toQuery.x).add(farDir.y.mul(toQuery.y)).greaterThan(0.0);
    const useGrid = inside.or(outflow);
    const edgeDir = safeNormalize(b.xy);
    const edgeK = max(a.w, 1e-4);
    const edgeTau = a.x.add(edgeK.div(this.meanOmega).mul(edgeDir.x.mul(toQuery.x).add(edgeDir.y.mul(toQuery.y))));
    return {
      tau: select(inside, a.x, select(outflow, edgeTau, farTau)),
      amp: select(useGrid, a.y, fa.y),
      hmin: select(useGrid, a.z, fa.z),
      k: max(select(useGrid, a.w, fa.w), 1e-4),
      dir: select(useGrid, edgeDir, farDir),
      depth: select(useGrid, b.z, fb.y),
    };
  }

  /**
   * Σ over the active waves of the setWaveModel formulas, with breaking (setWaveModel.waveAtCrest, term by term): the one
   * set-wave surface, its analytic slope (Phase 1's plus what breaking adds along each wave's travel), foam and stage.
   * Must be called inside an Fn. With no active wave the field is not even sampled: zero waves sum to zero, as on the
   * CPU. The η sum is clamped to the seabed floor (setWaveModel.seabedFloor), with slope 0 where the clamp holds it.
   * With `frame` (the render) it also returns foamFrame: the point's coordinates in the frame of the wave with the
   * largest envelope there, vec2(metres behind its crest, ξ·c; metres along its crest). It moves with the crest, so
   * noise read in it is advected with the wave; the foam's noise uses it (render only, not part of the CPU model).
   */
  private sumBreaking(xz: N, frame: boolean): { eta: N; dh: N; slope: N; foam: N; stage: N; foamFrame: N } {
    const eta = float(0.0).toVar(), dh = vec2(0.0).toVar(), slope = vec2(0.0).toVar();
    const foam = float(0.0).toVar(), stage = float(0.0).toVar();
    const foamFrame = vec2(0.0).toVar(), frameEnv = float(0.0).toVar();
    If(this.activeCount.greaterThan(0.5), () => {
      // Everything that does not depend on the wave is made a var here, before the loop: the field sample, wFar, the
      // Stokes ratio per metre of amplitude, the local wave speed and dξ/ds. Left as expressions, TSL emits them where
      // they are first used, inside the loop body, and the field would be fetched once per slot.
      const s = this.sample(xz, true);
      const f = { tau: s.tau.toVar(), amp: s.amp.toVar(), hmin: s.hmin.toVar(), k: s.k.toVar(), dir: s.dir.toVar(), depth: s.depth.toVar() };
      const sigma = max(tanh(f.k.mul(f.depth)), 0.05);
      const stokesPerA = f.k.mul(float(3.0).sub(sigma.mul(sigma))).div(sigma.mul(sigma).mul(sigma).mul(4.0)).toVar();
      const cLocal = this.meanOmega.div(f.k).toVar();
      const dXiDs = f.k.negate().div(this.meanOmega).toVar();
      const wFar = smoothstep(TAPER_NEAR_M, TAPER_FAR_M, length(xz)).toVar();
      const brk = this.brk;
      Loop(MAX_ACTIVE_WAVES, ({ i }: N) => {
        const a = this.waves.element(i.mul(2));
        const b = this.waves.element(i.mul(2).add(1));
        const H: N = min(a.y.mul(f.amp), f.hmin.mul(BREAKING_RATIO));
        const A = H.mul(0.5);
        const width = float(ENVELOPE_WIDTH * 2 * Math.PI).div(a.z);
        const B = min(float(STOKES_CAP), stokesPerA.mul(A));
        /** Time since this wave's crest passed a point (negative: still to come), for field speed `cLoc` and arrival time `tau`. */
        const phaseXi = (p: N, tau: N, cLoc: N): N => {
          const dTau = b.x.sub(this.meanTravel.x).mul(p.x).add(b.y.sub(this.meanTravel.y).mul(p.y)).div(cLoc);
          return this.time.sub(a.x).sub(tau).sub(dTau);
        };
        // The Phase 1 wave here: waveAtCrest's first half.
        const xi = phaseXi(xz, f.tau, cLocal);
        const rEnv = xi.div(width);
        // Empty slots, and waves beyond ENVELOPE_CUTOFF widths (envelope < 5e-6), are skipped: most pixels are near one or two.
        If(a.y.greaterThan(0.0).and(abs(rEnv).lessThan(ENVELOPE_CUTOFF)), () => {
          // As vars: the breaking below reads them inside nested Ifs, and a TSL temp first assigned inside one If is
          // stale in the next. The Phase 1 sums are added now; breaking adds its difference.
          const env = exp(rEnv.mul(rEnv).negate()).toVar();
          const dEnv = xi.mul(-2.0).div(width.mul(width)).mul(env).toVar();
          const q = xz.x.negate().mul(b.y).add(xz.y.mul(b.x)).sub(b.z).mul(2.0).div(a.w);
          const q2 = q.mul(q);
          const lateral = mix(float(1.0), exp(q2.mul(q2).negate()), wFar).toVar();
          const theta = a.z.mul(xi).toVar();
          const aE = A.mul(env).mul(lateral);
          const shape = cos(theta).add(B.mul(cos(theta.mul(2.0))));
          const e = aE.mul(shape).toVar();
          const hAmp = min(aE, float(FOLD_LIMIT).div(f.k));
          const nearBreaking = smoothstep(0.3, BREAKING_RATIO, H.div(max(f.hmin, MIN_DEPTH_M)));
          const pitch = min(nearBreaking.mul(PITCH_MAX), float(PITCH_KA_CAP).div(max(f.k.mul(aE), 1e-4)));
          const d = hAmp.mul(sin(theta)).add(pitch.mul(e)).toVar();
          const dEtaDXi = A.mul(lateral).mul(dEnv.mul(shape).sub(env.mul(a.z).mul(sin(theta).add(B.mul(2.0).mul(sin(theta.mul(2.0)))))));
          const jacobian = max(float(1.0).add(hAmp.mul(a.z).mul(cos(theta)).add(pitch.mul(dEtaDXi)).mul(dXiDs)), 0.2);
          const along = dEtaDXi.mul(dXiDs).div(jacobian).toVar();
          // Per metre of the displaced surface along travel (ahead): Phase 1's derivatives along s, over its Jacobian.
          const perAhead = dXiDs.div(jacobian).toVar();
          eta.addAssign(e);
          dh.addAssign(f.dir.mul(d));
          slope.addAssign(f.dir.mul(along));
          if (frame) {
            const envLat = env.mul(lateral);
            If(envLat.greaterThan(frameEnv), () => {
              frameEnv.assign(envLat);
              foamFrame.assign(vec2(xi.mul(cLocal), dot(xz, vec2(b.y.negate(), b.x))));
            });
          }
          // Breaking on, and this wave flagged as able to steepen somewhere (setEvents): else it is Phase 1 exactly.
          If(brk.enabled.greaterThan(0.5).and(b.w.greaterThan(0.5)), () => {
            // crestAt: CREST_STEPS Newton steps toward ξ = 0 along the wave's own travel direction b.xy (the same at
            // every point, so the lookup has no seams), each at most half a wavelength, reading the field where the
            // crest lands, so every point of one cross-section shares its crest's ratio, stage and frame.
            const wm = float(1.0).sub(dot(this.meanTravel, b.xy)).toVar();
            const cPos = xz.toVar();
            const fc = { tau: f.tau.toVar(), amp: f.amp.toVar(), hmin: f.hmin.toVar(), k: f.k.toVar(), dir: f.dir.toVar(), depth: f.depth.toVar() };
            for (let step = 0; step < CREST_STEPS; step++) {
              const xiC = phaseXi(cPos, fc.tau, this.meanOmega.div(fc.k));
              const reach = float(Math.PI).div(fc.k);
              const crossing = max(dot(fc.dir, b.xy).add(wm), CREST_MIN_CROSSING);
              cPos.addAssign(b.xy.mul(clamp(xiC.mul(this.meanOmega).div(fc.k).div(crossing), reach.negate(), reach)));
              const sc = this.sample(cPos, true);
              fc.tau.assign(sc.tau); fc.amp.assign(sc.amp); fc.hmin.assign(sc.hmin);
              fc.k.assign(sc.k); fc.dir.assign(sc.dir); fc.depth.assign(sc.depth);
            }
            const rC = breakingRatioNode(a.y.mul(fc.amp), fc.hmin, brk).toVar();
            const sC = breakingStageNode(rC, brk).toVar();
            const steep = steepeningNode(rC, brk).toVar();
            // The readout's confidence in sC: 1 − smoothstep(T/8, T/4, |ξ left at the crest|).
            const quarterPeriod = float(Math.PI / 2).div(a.z);
            const confidence = float(1.0).sub(smoothstep(quarterPeriod.mul(0.5), quarterPeriod, abs(phaseXi(cPos, fc.tau, this.meanOmega.div(fc.k)))));
            // waveAtCrest returns nothing (no stage, no breaking) where the point's own height is 0.
            const here = H.greaterThan(0.0);
            stage.assign(max(stage, select(here, sC.mul(confidence), float(0.0))));
            If(sC.greaterThan(0.0).or(steep.greaterThan(0.0)).and(here), () => {
              // The crest's frame (height, Stokes ratio, lean, wavenumber, bore depth).
              const Hc = min(a.y.mul(fc.amp), fc.hmin.mul(BREAKING_RATIO));
              const Hl = Hc.mul(lateral).toVar();
              // breakPoint's gate, before any H-scaled smoothstep is evaluated.
              If(Hl.greaterThan(MIN_BREAKING_HEIGHT_M), () => {
                const sigmaC = max(tanh(fc.k.mul(fc.depth)), 0.05);
                const Bc = min(float(STOKES_CAP), fc.k.mul(Hc.mul(0.5)).mul(float(3.0).sub(sigmaC.mul(sigmaC))).div(sigmaC.mul(sigmaC).mul(sigmaC).mul(4.0)));
                const nearBreakingC = smoothstep(0.3, BREAKING_RATIO, Hc.div(max(fc.hmin, MIN_DEPTH_M)));
                const ac = Hc.mul(0.5).mul(lateral);
                const pitchC = min(nearBreakingC.mul(PITCH_MAX), float(PITCH_KA_CAP).div(max(fc.k.mul(ac), 1e-4)));
                const etaCrest = ac.mul(Bc.add(1.0));
                // Measured, not inferred from ξ: every point of the cross-section must agree on where its crest is.
                const v0 = dot(xz.sub(cPos), f.dir);
                const br = breakPointNode({
                  theta, env: env.mul(lateral), uUnbroken: v0.add(d), eta: e, uCrest: pitchC.mul(etaCrest), etaCrest, H: Hl, k: fc.k, hmin: fc.hmin,
                  slope: along, dThetaDAhead: a.z.mul(perAhead), dEnvDAhead: dEnv.mul(lateral).mul(perAhead),
                }, steep, brk, stageCurvesNode(sC, brk));
                eta.addAssign(br.eta.sub(e));
                slope.addAssign(f.dir.mul(br.dEtaDAhead));
                foam.assign(max(foam, br.foam));
              });
            });
          });
        });
      });
      // setWaveModel.sumWaves: the summed η stays SEABED_CLEARANCE_M above the bed, flat (slope 0) where held there.
      const floorY = float(SEABED_CLEARANCE_M).sub(f.depth).toVar();
      If(eta.lessThan(floorY), () => {
        eta.assign(floorY);
        slope.assign(vec2(0.0));
      });
    });
    return { eta, dh, slope, foam, stage, foamFrame };
  }

  /**
   * vec3(dx, η, dz) at undisplaced world xz: the one set-wave surface (Phase 1, the front sharpening, the drain and the
   * bore), which the render draws and the height probe reads. Compute-safe; WaterSurfaceModel.displacement() and so
   * HeightProbe read this.
   */
  displacementNode(xz: N): N {
    return Fn(() => {
      const s = this.sumBreaking(xz, false);
      return vec3(s.dh.x, s.eta, s.dh.y);
    })();
  }

  /**
   * Render path only, vertex stage: the same vec3 displacement as displacementNode, and into `out` (vec2/float/vec2
   * varyingProperty nodes) the set waves' analytic slope, the foam weight and the foam's wave frame (see sumBreaking).
   * Never use this in a compute shader: there are no varyings to write. Tests use breakSampleNode.
   */
  displacementWithSetFoamNode(xz: N, out: { slope: N; foam: N; foamFrame: N }): N {
    return Fn(() => {
      const s = this.sumBreaking(xz, true);
      out.slope.assign(s.slope);
      out.foam.assign(s.foam);
      out.foamFrame.assign(s.foamFrame);
      return vec3(s.dh.x, s.eta, s.dh.y);
    })();
  }

  /** The render path's values as nodes, for self-tests and diagnostics. Compute-safe; must be called inside an Fn. */
  breakSampleNode(xz: N): { disp: N; slope: N; foam: N; stage: N } {
    const s = this.sumBreaking(xz, true);
    return { disp: vec3(s.dh.x, s.eta, s.dh.y), slope: s.slope, foam: s.foam, stage: s.stage };
  }

  /** vec2(∂η/∂x, ∂η/∂z) of the set waves (Eulerian, Jacobian-corrected), breaking included. Self-test only. */
  slopeNode(xz: N): N {
    return Fn(() => this.sumBreaking(xz, false).slope)();
  }

  tauNode(xz: N): N {
    return this.sample(xz).tau;
  }
}
