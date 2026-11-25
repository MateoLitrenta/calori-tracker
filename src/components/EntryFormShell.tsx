import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';

interface EntryFormShellProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  desktopModal?: boolean;
  dailyEditor?: boolean;
  closeLabel?: string;
  fitness?: boolean;
  dateContext?: ReactNode;
  restoreFocusTo?: RefObject<HTMLElement | null>;
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

export default function EntryFormShell({ title, onClose, children, dailyEditor = false, desktopModal = dailyEditor, closeLabel = 'Cerrar formulario', fitness = false, dateContext, restoreFocusTo }: EntryFormShellProps) {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = desktopModal ? 'entry-edit-title' : 'entry-add-title';

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const change = () => setMobile(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);

  const modal = mobile || desktopModal;
  const portalled = mobile || dailyEditor;
  useEffect(() => {
    if (!modal || !dialogRef.current) return;
    const dialog = dialogRef.current;
    openerRef.current ??= restoreFocusTo?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const main = document.querySelector<HTMLElement>('.app-main');
    const previousOverflow = main?.style.overflowY;
    const bodyOverflow = document.body.style.overflow;
    // Daily editors and mobile sheets are portalled. Other dialogs can be inside .app-main.
    // Never make an ancestor inert, which would disable the dialog itself.
    const background = Array.from(document.querySelectorAll<HTMLElement>('.app-main, .app-bottom-nav, .app-shell > aside'))
      .filter(element => portalled || !element.contains(dialog));
    const previousInert = background.map(element => element.inert);
    background.forEach(element => { element.inert = true; });
    if (main) main.style.overflowY = 'hidden';
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus({ preventScroll: true });

    const focusScope = () => dialog.querySelector<HTMLElement>('.fixed.inset-0') ?? dialog;
    const focusable = () => Array.from(focusScope().querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled):not([type="hidden"]):not([type="file"]), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]'
    )).filter(element => element.getClientRects().length > 0);
    const hasConfirmation = () => !!document.querySelector('dialog[open]:is([data-discard-draft], [data-record-delete])');
    const keyboard = (event: KeyboardEvent) => {
      if (hasConfirmation()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        const closeCamera = dialog.querySelector<HTMLButtonElement>('[data-entry-camera-close]');
        (closeCamera ?? closeRef.current)?.click();
      }
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
      if (hasConfirmation()) return;
      if (!focusScope().contains(event.target as Node)) (focusable()[0] ?? closeRef.current)?.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', keyboard);
    document.addEventListener('focusin', containFocus);

    return () => {
      document.removeEventListener('keydown', keyboard);
      document.removeEventListener('focusin', containFocus);
      background.forEach((element, index) => { element.inert = previousInert[index]; });
      if (main) main.style.overflowY = previousOverflow ?? '';
      document.body.style.overflow = bodyOverflow;
      if (openerRef.current?.isConnected) openerRef.current.focus({ preventScroll: true });
    };
  }, [modal, portalled, restoreFocusTo]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!mobile || !dialog) return;
    const viewport = window.visualViewport;
    const editor = fitness && !!dialog.querySelector('form.entry-form');
    const updateViewport = () => {
      const height = viewport?.height ?? window.innerHeight;
      dialog.style.setProperty('--entry-viewport-height', `${height}px`);
      if (editor) {
        // The backdrop is anchored to the document, so use document coordinates
        // even while Safari pans the layout and visual viewports independently.
        const pageTop = viewport?.pageTop ?? window.scrollY + (viewport?.offsetTop ?? 0);
        dialog.parentElement?.style.setProperty('--entry-page-top', `${pageTop}px`);
      } else {
        const backdropTop = dialog.parentElement?.getBoundingClientRect().top ?? 0;
        const bottom = (viewport?.offsetTop ?? 0) + height - backdropTop;
        dialog.style.setProperty('--entry-visible-bottom', `${bottom}px`);
      }
    };
    const revealField = () => {
      const content = dialog.querySelector<HTMLElement>('.entry-form-content');
      const field = document.activeElement;
      if (!content || !(field instanceof HTMLElement) || !content.contains(field)) return;
      // Moving a focused button between pointerdown and pointerup would
      // cancel its activation. Only editors need caret tracking.
      if (editor && !field.matches('input, textarea, select')) return;
      const visible = content.getBoundingClientRect();
      const bounds = focusedBounds(field);
      // Keep the caret in the upper reading area. Safari's floating controls
      // can cover the lower part even when it belongs to the visual viewport.
      const readingBottom = editor ? visible.top + Math.max((visible.bottom - visible.top) / 2, bounds.bottom - bounds.top) : visible.bottom;
      if (bounds.bottom > readingBottom) content.scrollTop += bounds.bottom - readingBottom + 12;
      else if (bounds.top < visible.top) content.scrollTop -= visible.top - bounds.top + 12;
    };
    let frame: number | undefined;
    const scheduleReveal = () => {
      if (frame !== undefined) return;
      frame = window.requestAnimationFrame(() => { frame = undefined; revealField(); });
    };
    const viewportChanged = () => {
      updateViewport();
      if (editor) scheduleReveal();
      else revealField();
    };
    const followSelection = () => {
      if (document.activeElement?.tagName === 'TEXTAREA' && dialog.contains(document.activeElement)) scheduleReveal();
    };
    viewportChanged();
    viewport?.addEventListener('resize', viewportChanged);
    viewport?.addEventListener('scroll', viewportChanged);
    window.addEventListener('resize', viewportChanged);
    window.addEventListener('scroll', viewportChanged);
    dialog.addEventListener('focusin', revealField);
    dialog.addEventListener('input', scheduleReveal);
    dialog.addEventListener('select', followSelection);
    document.addEventListener('selectionchange', followSelection);
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', viewportChanged);
      viewport?.removeEventListener('scroll', viewportChanged);
      window.removeEventListener('resize', viewportChanged);
      window.removeEventListener('scroll', viewportChanged);
      dialog.removeEventListener('focusin', revealField);
      dialog.removeEventListener('input', scheduleReveal);
      dialog.removeEventListener('select', followSelection);
      document.removeEventListener('selectionchange', followSelection);
    };
  }, [mobile, fitness]);

  const heading = fitness ? <div className="entry-sheet-heading">
    <h3 id={titleId}>{title}</h3>
    {dateContext}
  </div> : <h3 id={titleId}>{title}</h3>;
  const header = <div className="entry-sheet-header">
    {heading}
    <button ref={closeRef} type="button" onClick={onClose} aria-label={closeLabel}>
      <X size={22} aria-hidden="true" />
    </button>
  </div>;

  if (!modal) return children;

  const desktopBackdrop = 'fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in';
  const desktopPanel = 'entry-desktop-modal bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 w-full max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl shadow-xl flex flex-col animate-in zoom-in-95 duration-200';
  const dialog = <div className={mobile ? 'entry-sheet-backdrop' : desktopBackdrop}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
      data-fitness={(!mobile && fitness) || undefined} className={mobile ? 'entry-bottom-sheet' : desktopPanel}>
      {mobile && <span className="entry-sheet-handle" aria-hidden="true" />}
      {fitness || mobile ? header : <div className="p-4 border-b border-slate-200 dark:border-gray-800 flex justify-between items-center bg-slate-100 dark:bg-[#0f141c]">
        <h3 id={titleId} className="font-bold text-lg text-slate-900 dark:text-white">{title}</h3>
        <button ref={closeRef} type="button" onClick={onClose} className="text-slate-500 dark:text-gray-400 hover:text-white transition-colors p-1" aria-label={closeLabel}><X size={20} /></button>
      </div>}
      {children}
    </div>
  </div>;

  if (!portalled || typeof document === 'undefined') return dialog;
  // One portal and one form subtree survive a change between sheet and desktop editor.
  return createPortal(<div className={mobile
    ? 'home-variants entry-sheet-root' + (fitness ? ' fitness-entry-portal' : '')
    : 'home-variants fitness-home'} style={mobile ? undefined : { display: 'contents' }}>
    {dialog}
  </div>, document.body);
}
