import { useCallback, useLayoutEffect, useState } from 'react';

export interface HistoryMotionSnapshot {
  view: 'week' | 'month' | 'year';
  /** ISO period key supplied by the existing calendar, not a new date calculation. */
  key: string;
}

export const HISTORY_MOTION_DURATION = 210;

interface MotionEnvironment {
  requestFrame: (callback: () => void) => number;
  cancelFrame: (frame: number) => void;
  reduced: () => boolean;
}

interface MotionPlan {
  name: 'previous' | 'next' | 'scale';
  frames: Keyframe[];
}

function motionPlan(from: HistoryMotionSnapshot, to: HistoryMotionSnapshot,
  direction?: -1 | 1): MotionPlan | null {
  if (from.view !== to.view) return {
    name: 'scale',
    frames: [
      { opacity: 0.6, transform: 'translateY(8px) scale(.985)' },
      { opacity: 1, transform: 'translateY(0px) scale(1)' },
    ],
  };
  if (direction === undefined && from.key === to.key) return null;
  const step = direction ?? (to.key > from.key ? 1 : -1);
  return {
    name: step > 0 ? 'next' : 'previous',
    frames: [
      { opacity: 0.6, transform: `translateX(${step * 18}px)` },
      { opacity: 1, transform: 'translateX(0px)' },
    ],
  };
}

/** Visual enhancement only: it never owns calendar state, focus or scroll. */
export function createHistoryMotion(environment: MotionEnvironment) {
  let element: HTMLElement | null = null;
  let frame: number | null = null;
  let animation: Animation | null = null;
  let revision = 0;
  let disposed = false;

  const cancel = () => {
    revision++;
    if (frame !== null) environment.cancelFrame(frame);
    frame = null;
    const previous = animation;
    animation = null;
    previous?.cancel();
    element?.removeAttribute('data-history-motion');
  };

  return {
    attach(next: HTMLElement | null) {
      if (next === element) return;
      cancel();
      element = next;
    },
    connect() { disposed = false; },
    request(from: HistoryMotionSnapshot, to: HistoryMotionSnapshot, direction?: -1 | 1) {
      cancel();
      const plan = motionPlan(from, to, direction);
      if (disposed || !plan || environment.reduced() || !element?.animate) return;
      const requestedRevision = revision;
      frame = environment.requestFrame(() => {
        if (requestedRevision !== revision) return;
        frame = null;
        if (disposed || environment.reduced() || !element?.animate) return;
        const target = element;
        target.setAttribute('data-history-motion', plan.name);
        let current: Animation;
        try {
          current = target.animate(plan.frames, {
            duration: HISTORY_MOTION_DURATION,
            easing: 'cubic-bezier(.2,.75,.25,1)',
            fill: 'none',
          });
        } catch {
          // Unsupported animation cannot prevent the selected content from rendering.
          target.removeAttribute('data-history-motion');
          return;
        }
        animation = current;
        const settle = () => {
          if (animation !== current || revision !== requestedRevision) return;
          animation = null;
          target.removeAttribute('data-history-motion');
        };
        current.onfinish = settle;
        current.oncancel = settle;
      });
    },
    preferenceChanged() { if (environment.reduced()) cancel(); },
    cancel,
    dispose() { disposed = true; cancel(); },
  };
}

/** Keep one calendar surface mounted; only its newly selected content moves. */
export function useHistoryMotion() {
  const [motion] = useState(() => createHistoryMotion({
    requestFrame: callback => window.requestAnimationFrame(callback),
    cancelFrame: frame => window.cancelAnimationFrame(frame),
    reduced: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  }));
  const ref = useCallback((element: HTMLDivElement | null) => motion.attach(element), [motion]);
  const request = useCallback((from: HistoryMotionSnapshot, to: HistoryMotionSnapshot, direction?: -1 | 1) =>
    motion.request(from, to, direction), [motion]);

  useLayoutEffect(() => {
    motion.connect();
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => motion.preferenceChanged();
    media.addEventListener('change', update);
    update();
    return () => { media.removeEventListener('change', update); motion.dispose(); };
  }, [motion]);
  return { ref, request };
}
