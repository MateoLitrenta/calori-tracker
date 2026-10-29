import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';

interface EntryFormShellProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  desktopModal?: boolean;
}

// A tall textarea cannot fit in the viewport. Follow its caret rather than its bottom edge.
function focusedBounds(field: HTMLElement) {
  const bounds = field.getBoundingClientRect();
  if (field.tagName !== 'TEXTAREA') return bounds;
  const textarea = field as HTMLTextAreaElement;
  const computed = window.getComputedStyle(field);
  const mirror = document.createElement('div');
  for (const property of ['font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
    'line-height', 'letter-spacing', 'word-spacing', 'text-indent',
    'text-transform', 'tab-size', 'padding', 'border']) {
    mirror.style.setProperty(property, computed.getPropertyValue(property));
  }
  Object.assign(mirror.style, { position: 'fixed', visibility: 'hidden', pointerEvents: 'none',
    top: '0', left: '0', boxSizing: 'border-box', width: `${bounds.width}px`,
    whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' });
  mirror.setAttribute('aria-hidden', 'true');
  const caret = document.createElement('span');
  const position = textarea.selectionDirection === 'backward' ? textarea.selectionStart : textarea.selectionEnd;
  mirror.textContent = textarea.value.slice(0, position);
  caret.textContent = textarea.value.slice(position) || '.';
  mirror.append(caret);
  document.body.append(mirror);
  const top = bounds.top + caret.offsetTop;
  const height = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.2 || 20;
  mirror.remove();
  return { top, bottom: top + height };
}

export default function EntryFormShell({ title, onClose, children, desktopModal = false }: EntryFormShellProps) {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = desktopModal ? 'entry-edit-title' : 'entry-add-title';

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const change = () => setMobile(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);

  useEffect(() => {
    if ((!mobile && !desktopModal) || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const main = document.querySelector<HTMLElement>('.app-main');
    const previousOverflow = main?.style.overflowY;
    const bodyOverflow = document.body.style.overflow;
    // Mobile sheets are portalled; desktop dialogs can be inside .app-main.
    // Never make an ancestor inert, which would disable the dialog itself.
    const background = Array.from(document.querySelectorAll<HTMLElement>('.app-main, .app-bottom-nav, .app-shell > aside'))
      .filter(element => mobile || !element.contains(dialog));
    const previousInert = background.map(element => element.inert);
    background.forEach(element => { element.inert = true; });
    if (main) main.style.overflowY = 'hidden';
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus({ preventScroll: true });

    const focusScope = () => dialog.querySelector<HTMLElement>('.fixed.inset-0') ?? dialog;
    const focusable = () => Array.from(focusScope().querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled):not([type="hidden"]):not([type="file"]), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]'
    )).filter(element => element.getClientRects().length > 0);
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current?.click(); }
      if (event.key !== 'Tab') return;
      const controls = focusable();
      const first = controls[0];
      const last = controls.at(-1);
      if (!first) { event.preventDefault(); closeRef.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !focusScope().contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !focusScope().contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    const containFocus = (event: FocusEvent) => {
      if (!focusScope().contains(event.target as Node)) (focusable()[0] ?? closeRef.current)?.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', keyboard);
    document.addEventListener('focusin', containFocus);

    const viewport = window.visualViewport;
    const updateViewport = () => {
      if (!mobile) return;
      const height = viewport?.height ?? window.innerHeight;
      const offset = Math.max(0, window.innerHeight - height - (viewport?.offsetTop ?? 0));
      dialog.style.setProperty('--entry-viewport-height', `${height}px`);
      dialog.style.setProperty('--entry-keyboard-offset', `${offset}px`);
      const content = dialog.querySelector<HTMLElement>('.entry-form-content');
      const field = document.activeElement;
      if (!content || !(field instanceof HTMLElement) || !content.contains(field)) return;
      const visible = content.getBoundingClientRect();
      const bounds = focusedBounds(field);
      if (bounds.bottom > visible.bottom) content.scrollTop += bounds.bottom - visible.bottom + 12;
      else if (bounds.top < visible.top) content.scrollTop -= visible.top - bounds.top + 12;
    };
    let scrollFrame: number | undefined;
    const followCaret = () => {
      if (document.activeElement?.tagName !== 'TEXTAREA' || !dialog.contains(document.activeElement)) return;
      if (scrollFrame !== undefined) window.cancelAnimationFrame(scrollFrame);
      // React commits the new value and textarea height before the next frame.
      scrollFrame = window.requestAnimationFrame(() => { scrollFrame = undefined; updateViewport(); });
    };
    updateViewport();
    viewport?.addEventListener('resize', updateViewport);
    viewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    dialog.addEventListener('focusin', updateViewport);
    dialog.addEventListener('input', followCaret);
    dialog.addEventListener('select', followCaret);
    document.addEventListener('selectionchange', followCaret);
    return () => {
      if (scrollFrame !== undefined) window.cancelAnimationFrame(scrollFrame);
      viewport?.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
      dialog.removeEventListener('focusin', updateViewport);
      dialog.removeEventListener('input', followCaret);
      dialog.removeEventListener('select', followCaret);
      document.removeEventListener('selectionchange', followCaret);
      document.removeEventListener('keydown', keyboard);
      document.removeEventListener('focusin', containFocus);
      background.forEach((element, index) => { element.inert = previousInert[index]; });
      if (main) main.style.overflowY = previousOverflow ?? '';
      document.body.style.overflow = bodyOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [mobile, desktopModal]);

  const header = <div className="entry-sheet-header">
    <h3 id={titleId}>{title}</h3>
    <button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar formulario">
      <X size={22} aria-hidden="true" />
    </button>
  </div>;

  if (mobile) return createPortal(
    <div className="home-variants dark entry-sheet-root">
      <div className="entry-sheet-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
        <div ref={dialogRef} className="entry-bottom-sheet" role="dialog" aria-labelledby={titleId} aria-modal="true">
          <span className="entry-sheet-handle" aria-hidden="true" />
          {header}
          {children}
        </div>
      </div>
    </div>, document.body
  );

  if (desktopModal) return <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="entry-desktop-modal bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 w-full max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl shadow-xl flex flex-col animate-in zoom-in-95 duration-200">
      <div className="p-4 border-b border-slate-200 dark:border-gray-800 flex justify-between items-center bg-slate-100 dark:bg-[#0f141c]">
        <h3 id={titleId} className="font-bold text-lg text-slate-900 dark:text-white">{title}</h3>
        <button ref={closeRef} type="button" onClick={onClose} className="text-slate-500 dark:text-gray-400 hover:text-white transition-colors p-1" aria-label="Cerrar formulario"><X size={20} /></button>
      </div>
      {children}
    </div>
  </div>;

  return children;
}
