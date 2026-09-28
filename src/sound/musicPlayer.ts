/** The album player (Phase 5 spec §3.4): the playlist from the files under music/, in order, crossfading, looping. */

export interface Track {
  /** The folder under music/ ('' for files at the top). */
  album: string;
  /** The number the file name starts with, or null. */
  number: number | null;
  title: string;
  url: string;
}

const AUDIO_EXT = /\.(mp3|m4a|ogg|flac|wav)$/i;

/** "1. Morning of the Earth.mp3" → 1, "Morning of the Earth"; a name that is only a number keeps it as the title. */
export function parseTrackName(fileName: string): { number: number | null; title: string } {
  const stem = fileName.replace(AUDIO_EXT, '');
  const m = /^\s*(\d+)\s*[.\-_)]?\s*(.*)$/.exec(stem);
  if (m && m[2].trim().length > 0) return { number: Number(m[1]), title: m[2].trim() };
  return { number: null, title: stem.trim() };
}

/**
 * The glob's files ('/music/<album>/<file>' → url) as one playlist: albums by folder name, then tracks by their number
 * (names aren't zero-padded: "10." must follow "9."), unnumbered ones after by title.
 */
export function buildPlaylist(files: Readonly<Record<string, string>>): Track[] {
  const out: Track[] = [];
  for (const [path, url] of Object.entries(files)) {
    if (!AUDIO_EXT.test(path)) continue;
    const rel = path.replace(/^.*?\/music\//, '');
    const slash = rel.lastIndexOf('/');
    out.push({ album: slash < 0 ? '' : rel.slice(0, slash), ...parseTrackName(rel.slice(slash + 1)), url });
  }
  const byNumber = (a: Track, b: Track): number => (a.number ?? Infinity) - (b.number ?? Infinity);
  // Infinity − Infinity is NaN, which || treats as a tie and falls through to the title.
  return out.sort((a, b) => a.album.localeCompare(b.album) || byNumber(a, b) || a.title.localeCompare(b.title));
}

/** One track's playback: an <audio> element through its own gain in the browser, a fake in the tests. Starts at gain 0. */
export interface Deck {
  play(): Promise<void>;
  pause(): void;
  /** Ramp this deck's gain to v over s seconds. */
  fade(v: number, s: number): void;
  /** Seconds left in the track, or null while unknown. */
  remainingS(): number | null;
  onEnded(cb: () => void): void;
  onError(cb: () => void): void;
  dispose(): void;
}

export const CROSSFADE_S = 2;
export type MusicStatus = 'playing' | 'paused' | 'no music';

export class MusicPlayer {
  private index = 0;
  private current: Deck | null = null;
  private outgoing: { deck: Deck; untilS: number }[] = [];
  /** Tracks failed in a row: all of them means there's nothing playable. */
  private failures = 0;
  private wantPlaying = false;
  private clockS = 0;

  constructor(readonly tracks: readonly Track[], private readonly makeDeck: (url: string) => Deck) {}

  get status(): MusicStatus {
    if (this.tracks.length === 0 || this.failures >= this.tracks.length) return 'no music';
    return this.wantPlaying ? 'playing' : 'paused';
  }

  get trackIndex(): number {
    return this.index;
  }

  get trackTitle(): string {
    return this.status === 'no music' ? 'no music' : this.tracks[this.index].title;
  }

  play(): void {
    if (this.status === 'no music') return;
    this.wantPlaying = true;
    if (this.current) void this.current.play().catch(() => {});
    else this.start(0.5);
  }

  pause(): void {
    this.wantPlaying = false;
    this.current?.pause();
    for (const o of this.outgoing) o.deck.dispose();
    this.outgoing = [];
  }

  toggle(): void {
    if (this.wantPlaying) this.pause();
    else this.play();
  }

  next(): void {
    if (this.status === 'no music') return;
    if (this.wantPlaying) {
      this.advance();
      return;
    }
    this.current?.dispose();
    this.current = null;
    this.index = (this.index + 1) % this.tracks.length;
  }

  /** Per frame (real seconds): the next track starts CROSSFADE_S before this one ends; faded decks are let go. */
  update(dtS: number): void {
    this.clockS += dtS;
    this.outgoing = this.outgoing.filter((o) => {
      if (this.clockS < o.untilS) return true;
      o.deck.dispose();
      return false;
    });
    if (!this.wantPlaying || !this.current) return;
    const left = this.current.remainingS();
    if (left !== null && left <= CROSSFADE_S) this.advance();
  }

  private advance(): void {
    if (this.current) {
      this.current.fade(0, CROSSFADE_S);
      this.outgoing.push({ deck: this.current, untilS: this.clockS + CROSSFADE_S });
      this.current = null;
    }
    this.index = (this.index + 1) % this.tracks.length;
    if (this.wantPlaying) this.start(CROSSFADE_S);
  }

  private start(fadeInS: number): void {
    const deck = this.makeDeck(this.tracks[this.index].url);
    this.current = deck;
    deck.onEnded(() => { if (this.current === deck) this.advance(); });
    deck.onError(() => { if (this.current === deck) this.fail(); });
    deck.fade(1, fadeInS);
    void deck.play().then(() => { if (this.current === deck) this.failures = 0; }, () => {});
  }

  private fail(): void {
    this.failures++;
    this.current?.dispose();
    this.current = null;
    if (this.status === 'no music') {
      this.wantPlaying = false;
      return;
    }
    this.advance();
  }
}

/** "▶ 3/16 First Things First", "❚❚ 1/16 …", or "no music". */
export function musicStatusText(status: MusicStatus, index: number, count: number, title: string): string {
  if (status === 'no music') return 'no music';
  return `${status === 'playing' ? '▶' : '❚❚'} ${index + 1}/${count} ${title}`;
}

/** A deck on an <audio> element, streamed through its own gain into dest (the browser decodes; one track in memory). */
export function mediaDeck(ctx: AudioContext, dest: AudioNode, url: string): Deck {
  const el = new Audio();
  el.preload = 'auto';
  el.src = url;
  const src = ctx.createMediaElementSource(el);
  const gain = new GainNode(ctx, { gain: 0 });
  src.connect(gain).connect(dest);
  return {
    play: () => el.play(),
    pause: () => el.pause(),
    fade: (v, s) => {
      const t = ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(v, t + Math.max(0.01, s));
    },
    remainingS: () => (Number.isFinite(el.duration) ? el.duration - el.currentTime : null),
    onEnded: (cb) => el.addEventListener('ended', cb),
    onError: (cb) => el.addEventListener('error', cb),
    dispose: () => {
      el.pause();
      el.removeAttribute('src');
      el.load();
      src.disconnect();
      gain.disconnect();
    },
  };
}
