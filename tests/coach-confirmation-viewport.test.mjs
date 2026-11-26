import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { createCoachConfirmationViewport } from '../src/lib/coachConfirmationViewport.ts';

// JSDOM does not lay out flex children or clamp scrolling after a shrink. This
// fixture models those browser constraints, including padding and a flex-filled
// transcript, so an ineffective scrollTop-only restoration cannot pass.
function fixture(t, { height = 600, messageHeights = [100, 100], proposalHeight = 460,
  receiptHeight = 140, initialMinHeight = '', initialOverflowAnchor = '' } = {}) {
  const { window } = new JSDOM('<section><div></div></section>');
  const reader = window.document.querySelector('section');
  const content = reader.firstElementChild;
  reader.style.padding = '14px 0';
  reader.style.overflowAnchor = initialOverflowAnchor;
  content.style.minHeight = initialMinHeight;
  const top = 80, padding = 14, gap = 12;
  let viewportHeight = height, scroll = 0;
  const sizes = new Map();
  const naturalHeight = () => [...content.children].reduce((total, child, index) =>
    total + sizes.get(child) + (index ? gap : 0), 0);
  const contentHeight = () => Math.max(naturalHeight(), Number.parseFloat(content.style.minHeight) || 0,
    viewportHeight - padding * 2);
  const scrollHeight = () => Math.max(viewportHeight, contentHeight() + padding * 2);
  const maxScroll = () => scrollHeight() - viewportHeight;
  const box = (y, elementHeight) => ({ top: y, bottom: y + elementHeight, height: elementHeight,
    left: 0, right: 375, width: 375, x: 0, y, toJSON() { return this; } });
  Object.defineProperties(reader, {
    clientHeight: { get: () => viewportHeight },
    clientTop: { value: 0 },
    scrollHeight: { get: scrollHeight },
    scrollTop: {
      get: () => { scroll = Math.min(scroll, maxScroll()); return scroll; },
      set: value => { scroll = Math.max(0, Math.min(value, maxScroll())); },
    },
  });
  reader.getBoundingClientRect = () => box(top, viewportHeight);
  content.getBoundingClientRect = () => box(top + padding - reader.scrollTop, contentHeight());
  const add = (id, elementHeight, className = '') => {
    const element = window.document.createElement('div');
    if (id) element.dataset.coachMessageId = id;
    element.className = className;
    element.textContent = id || 'Propuesta';
    sizes.set(element, elementHeight);
    content.append(element);
    element.getBoundingClientRect = () => {
      const children = [...content.children];
      const index = children.indexOf(element);
      const preceding = children.slice(0, index).reduce((sum, child) => sum + sizes.get(child) + gap, 0);
      return box(top + padding + preceding - reader.scrollTop, sizes.get(element));
    };
    return element;
  };
  const messages = messageHeights.map((messageHeight, index) => add(`message-${index}`, messageHeight));
  const proposal = add(null, proposalHeight, 'chat-confirmation');
  const viewport = createCoachConfirmationViewport(reader, content);
  t.after(() => { viewport.release(); window.close(); });
  return {
    reader, content, viewport, messages, proposal, naturalHeight, maxScroll,
    relativeTop: element => element.getBoundingClientRect().top - top,
    replace: (id = 'receipt') => { proposal.remove(); return add(id, receiptHeight, 'chat-message-receipt'); },
    add,
    resize: nextHeight => { viewportHeight = nextHeight; viewport.resize(); },
  };
}

test('a short conversation keeps the receipt at the proposal position when content stops overflowing', t => {
  const state = fixture(t);
  state.reader.scrollTop = state.maxScroll();
  const before = state.relativeTop(state.proposal), previousScroll = state.reader.scrollTop;
  state.viewport.capture('receipt');
  const receipt = state.replace();
  state.viewport.commit('receipt');
  assert.equal(state.relativeTop(receipt), before);
  assert.equal(state.reader.scrollTop, previousScroll, 'Enough range must exist to prevent browser clamping');
  assert.equal(state.viewport.ownsScroll(), true);
  assert.equal(state.reader.style.overflowAnchor, 'none');
  assert.ok(Number.parseFloat(state.content.style.minHeight) > state.naturalHeight());
});

test('a late confirmation preserves an older visible message rather than pulling the reader to the receipt', t => {
  const state = fixture(t, { messageHeights: [240, 260, 320, 400, 220], proposalHeight: 480 });
  state.reader.scrollTop = 310;
  const older = state.messages[1], before = state.relativeTop(older);
  state.viewport.capture('receipt');
  const receipt = state.replace();
  state.viewport.commit('receipt');
  assert.equal(state.relativeTop(older), before);
  assert.equal(state.reader.scrollTop, 310);
  assert.ok(state.relativeTop(receipt) > state.reader.clientHeight, 'The receipt must not displace earlier reading');
  assert.equal(state.content.style.minHeight, '', 'No artificial range is needed in a naturally long conversation');
  state.viewport.resize();
  assert.equal(state.relativeTop(older), before);
});

test('a tall mobile proposal yields a readable receipt and survives keyboard height changes', t => {
  const state = fixture(t, { height: 320, messageHeights: [180, 140], proposalHeight: 620, receiptHeight: 180 });
  state.reader.scrollTop = state.maxScroll();
  assert.ok(state.relativeTop(state.proposal) < 0, 'The proposal begins above the viewport');
  state.viewport.capture('receipt');
  const receipt = state.replace();
  state.viewport.commit('receipt');
  assert.equal(state.relativeTop(receipt), 14);
  assert.ok(state.relativeTop(receipt) + receipt.getBoundingClientRect().height <= state.reader.clientHeight - 14);
  state.resize(250);
  assert.equal(state.relativeTop(receipt), 14);
  state.resize(600);
  assert.equal(state.relativeTop(receipt), 14);
});

test('two success notifications capture only once and release restores the previous inline styles', t => {
  const state = fixture(t, { initialMinHeight: '10px', initialOverflowAnchor: 'auto' });
  state.reader.scrollTop = state.maxScroll();
  const before = state.relativeTop(state.proposal);
  state.viewport.capture('receipt');
  state.viewport.capture('receipt');
  const receipt = state.replace();
  state.viewport.commit('unrelated-message');
  assert.equal(state.viewport.ownsScroll(), true, 'An unrelated notification does not consume the intended anchor');
  state.viewport.commit('receipt');
  state.viewport.capture('receipt');
  state.viewport.commit('receipt');
  assert.equal(state.relativeTop(receipt), before);
  state.viewport.release();
  state.viewport.release();
  assert.equal(state.content.style.minHeight, '10px');
  assert.equal(state.reader.style.overflowAnchor, 'auto');
  assert.equal(state.viewport.ownsScroll(), false);
  assert.equal(state.viewport.resize(), false);
});

test('new content absorbs the reserve instead of accumulating permanent spacer height', t => {
  const state = fixture(t);
  state.reader.scrollTop = state.maxScroll();
  state.viewport.capture('receipt');
  const receipt = state.replace();
  state.viewport.commit('receipt');
  const anchoredTop = state.relativeTop(receipt);
  assert.notEqual(state.content.style.minHeight, '');
  state.add('next-message', 400);
  state.viewport.resize();
  assert.equal(state.relativeTop(receipt), anchoredTop);
  assert.equal(state.content.style.minHeight, '', 'Natural content has replaced all reserved space');
  state.viewport.resize();
  assert.equal(state.relativeTop(receipt), anchoredTop, 'A repeated ResizeObserver pass must be stable');
});

test('scrolling toward the beginning consumes only unused range and follows the new reading anchor', t => {
  const state = fixture(t);
  state.reader.scrollTop = state.maxScroll();
  state.viewport.capture('receipt');
  const receipt = state.replace();
  state.viewport.commit('receipt');
  const oldReserve = Number.parseFloat(state.content.style.minHeight);
  state.reader.scrollTop = 40;
  const before = state.relativeTop(receipt);
  state.viewport.scroll();
  assert.equal(state.reader.scrollTop, 40);
  assert.equal(state.relativeTop(receipt), before);
  assert.ok(Number.parseFloat(state.content.style.minHeight) < oldReserve);
  state.viewport.resize();
  assert.equal(state.relativeTop(receipt), before);
  state.reader.scrollTop = 0;
  state.viewport.scroll();
  assert.equal(state.maxScroll(), 0, 'The consumed range must not leave an extra blank screen below the transcript');
});

test('after the reader scrolls upward, opening the keyboard preserves earlier reading even if the receipt was visible', t => {
  const state = fixture(t);
  state.reader.scrollTop = state.maxScroll();
  state.viewport.capture('receipt');
  state.replace();
  state.viewport.commit('receipt');
  state.reader.scrollTop = 0;
  state.viewport.scroll();
  const before = state.relativeTop(state.messages[0]);
  state.resize(300);
  assert.equal(state.relativeTop(state.messages[0]), before,
    'Voluntary earlier reading takes precedence over keeping the old receipt fully in view');
});
