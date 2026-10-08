import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';

interface EntryFormShellProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  desktopModal?: boolean;
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
    if (!mobile || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const main = document.querySelector<HTMLElement>('.app-main');
    const previousOverflow = main?.style.overflowY;
    const bodyOverflow = document.body.style.overflow;
    const background = Array.from(document.querySelectorAll<HTMLElement>('.app-main, .app-bottom-nav, .app-shell > aside'));
    const previousInert = background.map(element => element.inert);
    background.forEach(element => { element.inert = true; });
    if (main) main.style.overflowY = 'hidden';
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus({ preventScroll: true });

    const focusScope = () => dialog.querySelector<HTMLElement>('.fixed.inset-0') ?? dialog;
    const focusable = () => Array.from(focusScope().querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled):not([type="hidden"]):not([type="file"]), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
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
      const height = viewport?.height ?? window.innerHeight;
      const offset = Math.max(0, window.innerHeight - height - (viewport?.offsetTop ?? 0));
      dialog.style.setProperty('--entry-viewport-height', `${height}px`);
      dialog.style.setProperty('--entry-keyboard-offset', `${offset}px`);
      const content = dialog.querySelector<HTMLElement>('.entry-form-content');
      const field = document.activeElement;
      if (!content || !(field instanceof HTMLElement) || !content.contains(field)) return;
      const visible = content.getBoundingClientRect();
      const bounds = field.getBoundingClientRect();
      if (bounds.bottom > visible.bottom) content.scrollTop += bounds.bottom - visible.bottom + 12;
      else if (bounds.top < visible.top) content.scrollTop -= visible.top - bounds.top + 12;
    };
    updateViewport();
    viewport?.addEventListener('resize', updateViewport);
    viewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    dialog.addEventListener('focusin', updateViewport);
    return () => {
      viewport?.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
      dialog.removeEventListener('focusin', updateViewport);
      document.removeEventListener('keydown', keyboard);
      document.removeEventListener('focusin', containFocus);
      background.forEach((element, index) => { element.inert = previousInert[index]; });
      if (main) main.style.overflowY = previousOverflow ?? '';
      document.body.style.overflow = bodyOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [mobile]);

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
          {header}
          {children}
        </div>
      </div>
    </div>, document.body
  );

  if (desktopModal) return <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
    <div className="entry-desktop-modal bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 w-full max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl shadow-xl flex flex-col animate-in zoom-in-95 duration-200">
      <div className="p-4 border-b border-slate-200 dark:border-gray-800 flex justify-between items-center bg-slate-100 dark:bg-[#0f141c]">
        <h3 className="font-bold text-lg text-slate-900 dark:text-white">{title}</h3>
        <button type="button" onClick={onClose} className="text-slate-500 dark:text-gray-400 hover:text-white transition-colors p-1" aria-label="Cerrar formulario"><X size={20} /></button>
      </div>
      {children}
    </div>
  </div>;

  return children;
}
