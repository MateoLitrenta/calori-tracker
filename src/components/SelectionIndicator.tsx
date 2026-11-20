import { useLayoutEffect, useRef } from 'react';

type Placement = { x: number; y: number; width: number; height: number };

/** Shares the accepted button's geometry without participating in layout or focus. */
export default function SelectionIndicator({ value, selector, className }: {
  value: string;
  selector: string;
  className: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef<Placement | null>(null);

  useLayoutEffect(() => {
    const marker = ref.current, group = marker?.parentElement;
    const button = group?.querySelector<HTMLButtonElement>(selector);
    if (!marker || !group || !button) return;

    const place = (animate: boolean) => {
      const outer = group.getBoundingClientRect(), target = button.getBoundingClientRect();
      if (target.width === 0 || target.height === 0) {
        marker.hidden = true;
        previous.current = null;
        return;
      }
      const x = target.left - outer.left + group.scrollLeft - group.clientLeft;
      const y = target.top - outer.top + group.scrollTop - group.clientTop;
      const { width, height } = target;
      const last = previous.current;
      if (last && x === last.x && y === last.y && width === last.width && height === last.height) return;

      marker.style.transitionProperty = animate && last ? '' : 'none';
      marker.style.transform = `translate(${x}px, ${y}px)`;
      marker.style.width = `${width}px`;
      marker.style.height = `${height}px`;
      marker.hidden = false;
      previous.current = { x, y, width, height };
    };

    place(true);
    const resize = () => place(false);
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', resize);
      return () => window.removeEventListener('resize', resize);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(group);
    group.querySelectorAll('button').forEach(item => observer.observe(item));
    return () => observer.disconnect();
  }, [value, selector]);

  return <span ref={ref} aria-hidden="true" className={`navigation-indicator ${className}`} />;
}
