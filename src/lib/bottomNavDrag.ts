const DRAG_SLOP = 6;
const TAB_THRESHOLD = .45;
const HORIZONTAL_DOMINANCE = 1.25;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const resist = (distance: number, limit: number) =>
  limit * distance / (Math.abs(distance) + 18);

export const startedNavDrag = (x: number, y: number) => Math.hypot(x, y) >= DRAG_SLOP;

export function navDragDestination(index: number, step: number, last: number, x: number, y: number) {
  if (Math.abs(x) < step * TAB_THRESHOLD || Math.abs(x) <= Math.abs(y) * HORIZONTAL_DOMINANCE) return index;
  return clamp(index + Math.sign(x) * Math.max(1, Math.round(Math.abs(x) / step)), 0, last);
}

export function navDragPose(anchor: number, end: number, x: number, y: number) {
  const target = anchor + x;
  const bounded = clamp(target, 0, end);
  const horizontal = Math.abs(x) >= Math.abs(y);
  const stretch = .018 * Math.min(Math.hypot(x, y) / 90, 1);
  return {
    x: bounded + resist(target - bounded, 2),
    y: resist(y, 3),
    scaleX: horizontal ? 1 + stretch : 1 - stretch / 2,
    scaleY: horizontal ? 1 - stretch / 2 : 1 + stretch,
  };
}
