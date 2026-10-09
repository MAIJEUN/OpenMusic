import type { Modifier } from '@dnd-kit/core';

/** @dnd-kit/modifiers 패키지 없이 세로 이동만 허용 */
export const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });
