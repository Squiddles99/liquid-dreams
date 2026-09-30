import { describe, expect, it, vi } from 'vitest';
import { KeyedLoader } from './surferLoader';

const deferred = <T>() => {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};

describe('KeyedLoader', () => {
  it('shows only the preset asked for, never a stale one (Review Focus 4)', async () => {
    const f = deferred<string>(), m = deferred<string>();
    const loader = new KeyedLoader<string, string>((k) => (k === 'female' ? f.promise : m.promise), () => {});
    expect(loader.get('female')).toBeNull();
    expect(loader.get('male')).toBeNull();
    f.resolve('F');
    await f.promise;
    expect(loader.get('male')).toBeNull();
    m.resolve('M');
    await m.promise;
    expect(loader.get('male')).toBe('M');
    expect(loader.get('female')).toBe('F');
  });
  it('loads each key once, and after a failure warns once and never retries (Review Focus 1)', async () => {
    const load = vi.fn(() => Promise.reject(new Error('404')));
    const onError = vi.fn();
    const loader = new KeyedLoader<string, string>(load, onError);
    for (let i = 0; i < 5; i++) expect(loader.get('male')).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    for (let i = 0; i < 5; i++) expect(loader.get('male')).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
