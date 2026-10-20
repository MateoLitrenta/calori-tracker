import { useCallback, useLayoutEffect, useRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows' | 'value'> & { value: string };

/** Keep short entries compact and long entries readable without growing past six lines. */
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
    const maximum = Math.max(minimum, lineHeight * 6 + padding + border);
    // Reset before measuring so deletion and wider layouts can shrink the control too.
    field.style.height = '0px';
    const contentHeight = field.scrollHeight + border;
    field.style.height = `${Math.min(maximum, Math.max(minimum, contentHeight))}px`;
    field.style.overflowY = contentHeight > maximum ? 'auto' : 'hidden';
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
    style={{ ...style, boxSizing: 'border-box', resize: 'none', overflowWrap: 'anywhere' }} />;
}
