import { describe, expect, it } from 'vitest';
import { MUSIC_FILES } from './musicFiles';
import { CROSSFADE_S, type Deck, MusicPlayer, buildPlaylist, musicStatusText, parseTrackName } from './musicPlayer';

class FakeDeck implements Deck {
  playing = false;
  gain = 0;
  disposed = false;
  left: number | null = 200;
  private readonly ended: (() => void)[] = [];
  private readonly errors: (() => void)[] = [];
  constructor(readonly url: string, private readonly fails: boolean) {}
  play(): Promise<void> {
    if (this.fails) {
      queueMicrotask(() => this.errors.forEach((f) => f()));
      return Promise.reject(new Error('404'));
    }
    this.playing = true;
    return Promise.resolve();
  }
  pause(): void { this.playing = false; }
  fade(v: number): void { this.gain = v; }
  remainingS(): number | null { return this.left; }
  onEnded(cb: () => void): void { this.ended.push(cb); }
  onError(cb: () => void): void { this.errors.push(cb); }
  dispose(): void { this.disposed = true; this.playing = false; }
  end(): void { this.ended.forEach((f) => f()); }
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function rig(urls: string[], failing = new Set<string>()) {
  const decks: FakeDeck[] = [];
  const tracks = urls.map((url, i) => ({ album: 'a', number: i + 1, title: `t${i + 1}`, url }));
  const player = new MusicPlayer(tracks, (url) => {
    const d = new FakeDeck(url, failing.has(url));
    decks.push(d);
    return d;
  });
  return { player, decks };
}

describe('track names', () => {
  it('reads the leading number and the title', () => {
    expect(parseTrackName('1. Morning of the Earth.mp3')).toEqual({ number: 1, title: 'Morning of the Earth' });
    expect(parseTrackName('10. Bali Waters.mp3')).toEqual({ number: 10, title: 'Bali Waters' });
    expect(parseTrackName("2. I'll Be Alright.mp3")).toEqual({ number: 2, title: "I'll Be Alright" });
    expect(parseTrackName('07 - Song.ogg')).toEqual({ number: 7, title: 'Song' });
    expect(parseTrackName('Intro.MP3')).toEqual({ number: null, title: 'Intro' });
    expect(parseTrackName('1999.mp3')).toEqual({ number: null, title: '1999' });
  });
});

describe('the playlist', () => {
  it('sorts by the track number, not the name (2 before 10), unnumbered last; skips non-audio', () => {
    const files = { '/music/a/10. Ten.mp3': 'u10', '/music/a/2. Two.mp3': 'u2', '/music/a/1. One.MP3': 'u1', '/music/a/Bonus.mp3': 'ub', '/music/a/notes.txt': 'x' };
    expect(buildPlaylist(files).map((t) => t.title)).toEqual(['One', 'Two', 'Ten', 'Bonus']);
  });
  it('one album per folder, albums by folder name; files at the top level are their own album', () => {
    const files = { '/music/b/1. B1.mp3': 'b1', '/music/a/2. A2.mp3': 'a2', '/music/Loose.mp3': 'l' };
    expect(buildPlaylist(files).map((t) => `${t.album}|${t.title}`)).toEqual(['|Loose', 'a|A2', 'b|B1']);
  });
  it('finds the committed album: 16 tracks in album order', () => {
    const list = buildPlaylist(MUSIC_FILES);
    expect(list).toHaveLength(16);
    expect(list.every((t) => t.album === 'morning-of-the-earth')).toBe(true);
    expect(list[0].title).toBe('Morning of the Earth');
    expect(list[1].title).toBe("I'll Be Alright");
    expect(list[9].title).toBe('Bali Waters');
    expect(list[15].title).toBe('Come with Me');
  });
});

describe('MusicPlayer', () => {
  it('plays in order, starting the next track CROSSFADE_S before the end, then retires the old deck', () => {
    const { player, decks } = rig(['a', 'b', 'c']);
    player.play();
    expect(decks[0].playing).toBe(true);
    expect(decks[0].gain).toBe(1);
    decks[0].left = CROSSFADE_S - 0.5;
    player.update(0.016);
    expect(decks[1].url).toBe('b');
    expect(decks[1].playing).toBe(true);
    expect(decks[0].gain).toBe(0);
    player.update(CROSSFADE_S + 0.1);
    expect(decks[0].disposed).toBe(true);
    expect(player.trackIndex).toBe(1);
  });
  it('loops back to track 1', () => {
    const { player, decks } = rig(['a', 'b']);
    player.play();
    decks[0].end();
    decks[1].end();
    expect(decks[2].url).toBe('a');
  });
  it('advances on "ended" even without update() (a hidden tab stops the frames)', () => {
    const { player, decks } = rig(['a', 'b']);
    player.play();
    decks[0].end();
    expect(decks[1].url).toBe('b');
    decks[0].end(); // a stale deck's late event changes nothing
    expect(decks).toHaveLength(2);
  });
  it('skips a track that fails to load', async () => {
    const { player, decks } = rig(['a', 'b', 'c'], new Set(['b']));
    player.play();
    decks[0].end();
    await flush();
    expect(decks.map((d) => d.url)).toEqual(['a', 'b', 'c']);
    expect(decks[2].playing).toBe(true);
    expect(player.status).toBe('playing');
  });
  it('gives up with "no music" when every track fails, and stops trying', async () => {
    const { player, decks } = rig(['a', 'b'], new Set(['a', 'b']));
    player.play();
    await flush();
    await flush();
    expect(player.status).toBe('no music');
    expect(decks).toHaveLength(2);
    player.play();
    player.next();
    expect(decks).toHaveLength(2);
  });
  it('with no tracks: "no music", and play does nothing', () => {
    const { player, decks } = rig([]);
    player.play();
    expect(player.status).toBe('no music');
    expect(player.trackTitle).toBe('no music');
    expect(decks).toHaveLength(0);
  });
  it('pause and play resume the same deck', () => {
    const { player, decks } = rig(['a', 'b']);
    player.play();
    player.pause();
    expect(decks[0].playing).toBe(false);
    expect(player.status).toBe('paused');
    player.play();
    expect(decks).toHaveLength(1);
    expect(decks[0].playing).toBe(true);
  });
  it('next: crossfades while playing; while paused it only moves on', () => {
    const { player, decks } = rig(['a', 'b', 'c']);
    player.play();
    player.next();
    expect(decks[1].url).toBe('b');
    expect(decks[0].gain).toBe(0);
    player.pause();
    player.next();
    expect(player.trackIndex).toBe(2);
    expect(decks).toHaveLength(2);
    player.play();
    expect(decks[2].url).toBe('c');
  });
  it('status text', () => {
    expect(musicStatusText('playing', 2, 16, 'First Things First')).toBe('▶ 3/16 First Things First');
    expect(musicStatusText('paused', 0, 16, 'Morning of the Earth')).toBe('❚❚ 1/16 Morning of the Earth');
    expect(musicStatusText('no music', 0, 0, '')).toBe('no music');
  });
});
