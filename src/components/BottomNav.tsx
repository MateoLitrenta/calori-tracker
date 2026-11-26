import { House, ChatCircle, ChartBar, User } from '@phosphor-icons/react';
import { useCallback, useEffect, useLayoutEffect, useRef, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import { navDragDestination, navDragPose, startedNavDrag } from '../lib/bottomNavDrag';
import './BottomNavGesture.css';

export type Tab = 'home' | 'chat' | 'charts' | 'profile';

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const destinations = [
  { tab: 'home', label: 'Inicio', Icon: House },
  { tab: 'chat', label: 'Coach', Icon: ChatCircle },
  { tab: 'charts', label: 'Datos', Icon: ChartBar },
  { tab: 'profile', label: 'Perfil', Icon: User },
] as const;

type Drag = {
  pointerId: number;
  button: HTMLButtonElement;
  track: HTMLDivElement;
  bounds: DOMRect;
  viewport: [number, number];
  index: number;
  step: number;
  anchor: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
  frame: number | null;
};

const lastIndex = destinations.length - 1;
const dragStyles = ['--bottom-nav-drag-x', '--bottom-nav-drag-y', '--bottom-nav-drag-sx', '--bottom-nav-drag-sy'];

function sameDragFrame({ bounds, track, viewport }: Drag) {
  if (window.innerWidth !== viewport[0] || window.innerHeight !== viewport[1]) return false;
  const box = track.getBoundingClientRect();
  return box.width === bounds.width && box.height === bounds.height && box.left === bounds.left && box.top === bounds.top;
}

export default function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const activeIndex = destinations.findIndex(({ tab }) => tab === activeTab);
  const trackRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const releaseTimer = useRef<number | null>(null);

  const clearRelease = useCallback(() => {
    if (releaseTimer.current !== null) window.clearTimeout(releaseTimer.current);
    releaseTimer.current = null;
    trackRef.current?.removeAttribute('data-drag-release');
  }, []);

  const finish = useCallback((interrupted = true) => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    suppressClick.current = interrupted || current.moved;
    const { track, button, pointerId, frame } = current;
    if (frame !== null) window.cancelAnimationFrame(frame);
    if (track.hasAttribute('data-dragging')) {
      track.dataset.dragRelease = '';
      track.removeAttribute('data-dragging');
      dragStyles.forEach(property => track.style.removeProperty(property));
      releaseTimer.current = window.setTimeout(() => {
        track.removeAttribute('data-drag-release');
        releaseTimer.current = null;
      }, 260);
    }
    if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
  }, []);

  useLayoutEffect(() => { finish(); }, [activeIndex, finish]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const cancel = () => finish();
    const visibilityChanged = () => { if (document.hidden) cancel(); };
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => {
      const current = drag.current;
      if (current && !sameDragFrame(current)) cancel();
    });
    observer?.observe(track);
    window.addEventListener('resize', cancel);
    window.addEventListener('orientationchange', cancel);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', cancel);
      window.removeEventListener('orientationchange', cancel);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', visibilityChanged);
      cancel();
      clearRelease();
    };
  }, [clearRelease, finish]);

  const press = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current) {
      if (!event.isPrimary) finish();
      return;
    }
    if (!event.isPrimary || event.button !== 0) return;
    suppressClick.current = false;
    clearRelease();
    const button = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>('button[aria-current="page"]')
      : null;
    const indicator = indicatorRef.current;
    if (!button || !indicator) return;
    const box = button.getBoundingClientRect();
    if (!box.width || !box.height) return;
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      return; // If the pointer is gone, leave native button activation in charge.
    }
    drag.current = {
      pointerId: event.pointerId, button, track: event.currentTarget, bounds: event.currentTarget.getBoundingClientRect(),
      viewport: [window.innerWidth, window.innerHeight],
      index: activeIndex, step: box.width, anchor: activeIndex * box.width + indicator.getBoundingClientRect().left - box.left,
      startX: event.clientX, startY: event.clientY, x: 0, y: 0, moved: false, frame: null,
    };
  };

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    current.x = event.clientX - current.startX;
    current.y = event.clientY - current.startY;
    current.moved ||= startedNavDrag(current.x, current.y);
    if (!current.moved || current.frame !== null) return;
    current.frame = window.requestAnimationFrame(() => {
      current.frame = null;
      const pose = navDragPose(current.anchor, lastIndex * current.step, current.x, current.y);
      const { track } = current;
      track.style.setProperty('--bottom-nav-drag-x', `${pose.x}px`);
      track.style.setProperty('--bottom-nav-drag-y', `${pose.y}px`);
      track.style.setProperty('--bottom-nav-drag-sx', String(pose.scaleX));
      track.style.setProperty('--bottom-nav-drag-sy', String(pose.scaleY));
      track.dataset.dragging = '';
    });
  };

  const release = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    // A browser can deliver pointerup before the resize notification.
    if (!sameDragFrame(current)) {
      finish();
      return;
    }
    const x = event.clientX - current.startX;
    const y = event.clientY - current.startY;
    current.moved ||= startedNavDrag(x, y);
    const next = navDragDestination(current.index, current.step, lastIndex, x, y);
    finish(false);
    if (current.moved && next !== current.index) onTabChange(destinations[next].tab);
  };

  const interrupt = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerId === drag.current?.pointerId) finish();
  };

  const keepOnlyIntentionalClicks = (event: MouseEvent<HTMLDivElement>) => {
    if (suppressClick.current && event.detail > 0) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    finish();
    clearRelease();
  };
  return (
    <nav aria-label="Navegación principal" className="app-bottom-nav md:hidden">
      <div ref={trackRef} className="bottom-nav-track"
        style={{ '--active-index': activeIndex } as CSSProperties}
        onPointerDown={press} onPointerMove={move} onPointerUp={release}
        onPointerCancel={interrupt} onLostPointerCapture={interrupt}
        onClickCapture={keepOnlyIntentionalClicks}>
        <span ref={indicatorRef} className="bottom-nav-indicator" aria-hidden="true" />
        {destinations.map(({ tab, label, Icon }) => {
          const current = activeTab === tab;
          return (
            <button key={tab} type="button" onClick={() => onTabChange(tab)}
              aria-current={current ? 'page' : undefined}
              className="bottom-nav-item">
              <Icon size={20} weight={current ? 'fill' : 'regular'} aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
