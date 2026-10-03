/**
 * Every audio file under /music/ (Andrew's own copies, README "Music"), as URLs, found at build time. Nothing is fetched
 * until a track plays. Both extension cases, since Windows keeps whatever the file came with.
 */
export const MUSIC_FILES = import.meta.glob('/music/**/*.{mp3,MP3,m4a,M4A,ogg,OGG,flac,FLAC,wav,WAV}', {
  query: '?url', import: 'default', eager: true,
}) as Record<string, string>;

/** The front end's track slot (dune select spec §12). None ships this step: the front end is quiet but for the sea. */
export const FRONT_END_TRACK: string | null = null;
