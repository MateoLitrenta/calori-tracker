type ReadingAnchor = { element: HTMLElement; offset: number; receipt: boolean };

/** Keeps the reader in place when a tall proposal becomes a short receipt.
 * The small amount of missing scroll range belongs to this mounted view only.
 * New content or scrolling towards the beginning consumes it without a jump.
 */
export function createCoachConfirmationViewport(reader: HTMLElement, content: HTMLElement) {
  const originalMinHeight = content.style.minHeight;
  const originalOverflowAnchor = reader.style.overflowAnchor;
  let pending: { id: string; proposalOffset: number; following: boolean; anchor: ReadingAnchor | null } | null = null;
  let anchor: ReadingAnchor | null = null;
  let receiptId: string | null = null;
  let lastAppliedScrollTop = reader.scrollTop;

  const readerTop = () => reader.getBoundingClientRect().top + reader.clientTop;
  const offset = (element: HTMLElement) => element.getBoundingClientRect().top - readerTop();
  const receipt = (id: string) => Array.from(content.querySelectorAll<HTMLElement>('[data-coach-message-id]'))
    .find(element => element.dataset.coachMessageId === id);
  const firstVisibleMessage = (): ReadingAnchor | null => {
    const top = readerTop();
    const bottom = top + reader.clientHeight;
    const element = Array.from(content.querySelectorAll<HTMLElement>('[data-coach-message-id]'))
      .find(message => {
        const rect = message.getBoundingClientRect();
        return rect.bottom > top && rect.top < bottom;
      });
    return element ? { element, offset: offset(element), receipt: false } : null;
  };

  const reserveRange = (scrollTop: number) => {
    const contentTop = content.getBoundingClientRect().top;
    const naturalHeight = Array.from(content.children).reduce((height, child) =>
      Math.max(height, child.getBoundingClientRect().bottom - contentTop), 0);
    const paddingBottom = Number.parseFloat(reader.ownerDocument.defaultView?.getComputedStyle(reader).paddingBottom || '0') || 0;
    const contentStart = contentTop - readerTop() + reader.scrollTop;
    const requiredHeight = Math.ceil(Math.max(0, scrollTop + reader.clientHeight - contentStart - paddingBottom));
    const minHeight = requiredHeight > naturalHeight + 1 ? `${requiredHeight}px` : originalMinHeight;
    if (content.style.minHeight !== minHeight) content.style.minHeight = minHeight;
  };

  const restore = () => {
    if (!anchor?.element.isConnected || reader.clientHeight <= 0) return;
    let targetOffset = anchor.offset;
    if (anchor.receipt) {
      // A tall mobile proposal may begin above the viewport. Its receipt must
      // remain readable, including when the keyboard reduces the reader.
      const padding = Number.parseFloat(reader.ownerDocument.defaultView?.getComputedStyle(reader).paddingTop || '0') || 0;
      const lastVisibleTop = Math.max(padding, reader.clientHeight - padding - anchor.element.getBoundingClientRect().height);
      targetOffset = Math.max(padding, Math.min(targetOffset, lastVisibleTop));
    }
    const targetScroll = Math.max(0, reader.scrollTop + offset(anchor.element) - targetOffset);
    reserveRange(targetScroll);
    if (Math.abs(reader.scrollTop - targetScroll) > 0.5) reader.scrollTop = targetScroll;
    lastAppliedScrollTop = reader.scrollTop;
    anchor.offset = offset(anchor.element);
  };

  return {
    capture(id: string) {
      if (pending?.id === id || receiptId === id || reader.clientHeight <= 0) return;
      const proposal = content.querySelector<HTMLElement>('.chat-confirmation');
      if (!proposal) return;
      pending = {
        id,
        proposalOffset: offset(proposal),
        following: reader.scrollHeight - reader.clientHeight - reader.scrollTop <= 24,
        anchor: firstVisibleMessage(),
      };
      // Reserve before React removes the proposal: after removal the browser
      // has already clamped scrollTop, so restoring only that number is too late.
      content.style.minHeight = `${Math.ceil(content.getBoundingClientRect().height)}px`;
      reader.style.overflowAnchor = 'none';
      lastAppliedScrollTop = reader.scrollTop;
    },
    commit(id: string | undefined) {
      if (!pending || pending.id !== id) return;
      const element = receipt(pending.id);
      if (!element) return;
      receiptId = pending.id;
      anchor = pending.following || !pending.anchor
        ? { element, offset: pending.proposalOffset, receipt: true }
        : pending.anchor;
      pending = null;
      restore();
    },
    ownsScroll() {
      return pending !== null || anchor !== null;
    },
    resize() {
      if (pending) return true;
      if (!anchor) return false;
      restore();
      return true;
    },
    scroll() {
      if (pending || !anchor) return;
      const currentScrollTop = reader.scrollTop;
      if (Math.abs(currentScrollTop - lastAppliedScrollTop) <= 0.5) return;
      reserveRange(currentScrollTop);
      // A person's scroll transfers ownership to the message they are reading.
      // Do not pull a still-visible receipt back into view on the next resize.
      anchor = firstVisibleMessage() ?? anchor;
      lastAppliedScrollTop = reader.scrollTop;
    },
    release() {
      pending = null;
      anchor = null;
      receiptId = null;
      content.style.minHeight = originalMinHeight;
      reader.style.overflowAnchor = originalOverflowAnchor;
    },
  };
}
