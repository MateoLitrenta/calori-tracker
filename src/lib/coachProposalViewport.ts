import { getFocusedCoachProposalField } from './coachViewport.ts';

// An inline editor lives inside the transcript. Reveal only that transcript's
// active field; scrolling the whole page would move the fixed Coach shell.
export function revealCoachProposalField(container: HTMLElement): boolean {
  const field = getFocusedCoachProposalField(container);
  if (!field) return false;
  const viewport = container.ownerDocument.defaultView?.visualViewport;
  const reader = container.getBoundingClientRect();
  const top = Math.max(reader.top, viewport?.offsetTop ?? reader.top) + 8;
  const bottom = Math.min(reader.bottom, viewport ? viewport.offsetTop + viewport.height : reader.bottom) - 8;
  if (bottom <= top) return true;

  // Keep a multiline control within the reader. Its native internal scrolling
  // then keeps the caret visible without measuring or moving the selection.
  container.style.setProperty('--coach-proposal-field-space', `${Math.max(44, bottom - top)}px`);
  const bounds = field.getBoundingClientRect();
  const label = field.closest('label')?.getBoundingClientRect();
  const target = label && label.height <= bottom - top ? label : bounds;
  const delta = target.top < top ? target.top - top : target.bottom > bottom ? target.bottom - bottom : 0;
  if (delta) container.scrollTop += delta;
  return true;
}

export function followCoachProposalViewport(container: HTMLElement): () => void {
  const document = container.ownerDocument;
  const browser = document.defaultView;
  if (!browser) return () => {};
  let frame = 0;
  const reveal = () => {
    if (frame) browser.cancelAnimationFrame(frame);
    frame = browser.requestAnimationFrame(() => {
      frame = 0;
      revealCoachProposalField(container);
    });
  };
  container.addEventListener('focusin', reveal);
  container.addEventListener('input', reveal);
  document.addEventListener('selectionchange', reveal);
  browser.visualViewport?.addEventListener('resize', reveal);
  browser.visualViewport?.addEventListener('scroll', reveal);
  return () => {
    if (frame) browser.cancelAnimationFrame(frame);
    container.removeEventListener('focusin', reveal);
    container.removeEventListener('input', reveal);
    document.removeEventListener('selectionchange', reveal);
    browser.visualViewport?.removeEventListener('resize', reveal);
    browser.visualViewport?.removeEventListener('scroll', reveal);
    container.style.removeProperty('--coach-proposal-field-space');
  };
}
