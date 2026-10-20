import { useCallback, useLayoutEffect, useRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows' | 'value'> & { value: string };

/** Fit the entire value; scrolling belongs to the surrounding form. */
export default function AutoResizeTextarea({ value, style, ...props }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = useCallback(() => {
    const field = ref.current;
    const view = field?.ownerDocument.defaultView;
    if (!field || !view) return;
    const computed = view.getComputedStyle(field);
    const lineHeight = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.2 || 20;
    const padding = (parseFloat(computed.paddingTop) || 0) + (parseFloat(computed.paddingBottom) || 0);
    const border = (parseFloat(computed.borderTopWidth) || 0) + (parseFloat(computed.borderBottomWidth) || 0);
    const minimum = Math.max(parseFloat(computed.minHeight) || 0, lineHeight + padding + border);
    // Measure a hidden copy so shrinking never temporarily collapses the focused field
    // or clamps the bottom sheet's scroll position while typing.
    const measure = field.cloneNode() as HTMLTextAreaElement;
    measure.removeAttribute('id');
    measure.removeAttribute('name');
    measure.setAttribute('aria-hidden', 'true');
    measure.tabIndex = -1;
    measure.value = field.value;
    Object.assign(measure.style, { position: 'fixed', visibility: 'hidden', pointerEvents: 'none',
      top: '0', left: '0', width: `${field.getBoundingClientRect().width}px`,
      height: '0', minHeight: '0', maxHeight: 'none', overflow: 'hidden' });
    field.after(measure);
    const contentHeight = measure.scrollHeight + border;
    measure.remove();
    field.style.height = `${Math.max(minimum, contentHeight)}px`;
    field.scrollTop = 0;
  }, []);

  useLayoutEffect(resize, [resize, value]);
  useLayoutEffect(() => {
    const field = ref.current;
    const view = field?.ownerDocument.defaultView;
    if (!field || !view) return;
    let width = field.getBoundingClientRect().width;
    const observer = view.ResizeObserver ? new view.ResizeObserver(() => {
      const nextWidth = field.getBoundingClientRect().width;
      if (nextWidth !== width) { width = nextWidth; resize(); }
    }) : undefined;
    observer?.observe(field);
    view.addEventListener('resize', resize);
    return () => { observer?.disconnect(); view.removeEventListener('resize', resize); };
  }, [resize]);

  return <textarea {...props} ref={ref} value={value} rows={1} wrap="soft"
    style={{ ...style, boxSizing: 'border-box', resize: 'none', overflowX: 'hidden', overflowY: 'hidden', maxHeight: 'none',
      flex: 'none', overflowWrap: 'anywhere' }} />;
}
