import type { BoardKind } from '../board/boardSpec';

export type PoseName = 'sit' | 'paddle' | 'popup' | 'drop' | 'bottomTurn' | 'trim' | 'barrel' | 'kickout' | 'bail' | 'prone' | 'proneBarrel' | 'dropKnee';

/** Key poses (spec §3.5): the stand-up boards', then the bodyboard's. */
export const STAND_POSES: readonly PoseName[] = ['sit', 'paddle', 'popup', 'drop', 'bottomTurn', 'trim', 'barrel', 'kickout', 'bail'];
export const BODYBOARD_POSES: readonly PoseName[] = ['sit', 'paddle', 'prone', 'proneBarrel', 'dropKnee', 'bail'];
export const ALL_POSES: readonly PoseName[] = [...new Set([...STAND_POSES, ...BODYBOARD_POSES])];

export const posesFor = (kind: BoardKind): readonly PoseName[] => (kind === 'bodyboard' ? BODYBOARD_POSES : STAND_POSES);
