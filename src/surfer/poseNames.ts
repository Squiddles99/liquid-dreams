import type { BoardKind } from '../board/boardSpec';

export type PoseName = 'sit' | 'paddle' | 'popup' | 'drop' | 'bottomTurn' | 'trim' | 'barrel' | 'kickout' | 'bail' | 'prone' | 'proneBarrel' | 'dropKnee' | 'carry';

/** Key poses (spec §3.5): the stand-up boards', then the bodyboard's. */
export const STAND_POSES: readonly PoseName[] = ['sit', 'paddle', 'popup', 'drop', 'bottomTurn', 'trim', 'barrel', 'kickout', 'bail'];
export const BODYBOARD_POSES: readonly PoseName[] = ['sit', 'paddle', 'prone', 'proneBarrel', 'dropKnee', 'bail'];
/** Poses only on land (walking spec §4): standing with the board under the arm. */
export const LAND_POSES: readonly PoseName[] = ['carry'];
export const ALL_POSES: readonly PoseName[] = [...new Set([...STAND_POSES, ...BODYBOARD_POSES, ...LAND_POSES])];

export const posesFor = (kind: BoardKind): readonly PoseName[] => (kind === 'bodyboard' ? BODYBOARD_POSES : STAND_POSES);
/** The poses there are here: the board's, and on land the carry. */
export const posesOn = (kind: BoardKind, onLand: boolean): readonly PoseName[] => (onLand ? [...posesFor(kind), ...LAND_POSES] : posesFor(kind));
