/** A Chrome trace event (the fields the reader uses). */
export interface TraceEvent {
  ph: string;
  name: string;
  cat?: string;
  ts: number;
  dur?: number;
  pid: number;
  tid: number;
  args?: Record<string, unknown>;
}
export type TraceJson = { traceEvents: TraceEvent[] } | TraceEvent[];

export interface Slice {
  /** ms from the trace's earliest event. */
  startMs: number;
  durMs: number;
  process: string;
  thread: string;
  name: string;
  cat: string;
}

/** The earliest non-metadata ts (µs): the origin of every Slice.startMs. A loop: a riding trace has millions of events. */
export function traceT0(events: TraceEvent[]): number {
  let t0 = Infinity;
  for (const e of events) if (e.ph !== 'M' && e.ts < t0) t0 = e.ts;
  return t0;
}

/** The profiler's pass marker (performance.mark('ldStall:<performance.now()>'), category blink.user_timing): the page's
 * clock and the trace's at one instant, so a frame's t maps to trace ms exactly. Null when the trace has none. */
export function passMarker(trace: TraceJson): { nowMs: number; traceMs: number } | null {
  const events = Array.isArray(trace) ? trace : trace.traceEvents;
  const m = events.find((e) => e.name.startsWith('ldStall:'));
  return m ? { nowMs: Number(m.name.slice(8)), traceMs: (m.ts - traceT0(events)) / 1000 } : null;
}

/** Complete ('X') and begin/end ('B'/'E') events lasting at least minMs, named by process and thread, in time order. */
export function slices(trace: TraceJson, minMs: number): Slice[] {
  const events = Array.isArray(trace) ? trace : trace.traceEvents;
  const processes = new Map<number, string>(), threads = new Map<string, string>();
  for (const e of events) {
    if (e.ph !== 'M') continue;
    const name = String(e.args?.name ?? '');
    if (e.name === 'process_name') processes.set(e.pid, name);
    if (e.name === 'thread_name') threads.set(`${e.pid}:${e.tid}`, name);
  }
  const t0 = traceT0(events);
  const out: Slice[] = [];
  const push = (e: TraceEvent, durUs: number) => {
    if (durUs / 1000 < minMs) return;
    out.push({ startMs: (e.ts - t0) / 1000, durMs: durUs / 1000, process: processes.get(e.pid) ?? `pid ${e.pid}`,
      thread: threads.get(`${e.pid}:${e.tid}`) ?? `tid ${e.tid}`, name: e.name, cat: e.cat ?? '' });
  };
  const open = new Map<string, TraceEvent[]>();
  for (const e of events) {
    if (e.ph === 'X') push(e, e.dur ?? 0);
    else if (e.ph === 'B') { const k = `${e.pid}:${e.tid}`; (open.get(k) ?? open.set(k, []).get(k)!).push(e); }
    else if (e.ph === 'E') { const b = open.get(`${e.pid}:${e.tid}`)?.pop(); if (b) push(b, e.ts - b.ts); }
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}
