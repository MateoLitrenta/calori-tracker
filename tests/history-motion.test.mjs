import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createHistoryMotion, HISTORY_MOTION_DURATION, useHistoryMotion } from '../src/hooks/useHistoryMotion.ts';

const snapshot = (view, key) => ({ view, key });
const november = snapshot('month', '2026-11'), october = snapshot('month', '2026-10');
function harness() {
  const pending = new Map(), canceled = [], calls = [], attributes = new Map();
  let nextFrame = 0, reduced = false;
  const environment = {
    requestFrame(callback) { const id = nextFrame++; pending.set(id, callback); return id; },
    cancelFrame(id) { canceled.push(id); pending.delete(id); },
    reduced: () => reduced,
  };
  const element = {
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: name => attributes.delete(name),
    animate(frames, options) {
      const animation = { frames, options, cancelCount: 0, onfinish: null, oncancel: null,
        cancel() { this.cancelCount++; this.oncancel?.(); } };
      calls.push(animation); return animation;
    },
    focus() { assert.fail('Motion cannot change focus'); },
    scrollIntoView() { assert.fail('Motion cannot move page scroll'); },
  };
  const motion = createHistoryMotion(environment); motion.attach(element);
  const flush = () => { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback()); };
  return { motion, element, calls, attributes, pending, canceled, flush,
    reduce(value) { reduced = value; motion.preferenceChanged(); } };
}

test('month and week motion is chronological, lasts 180–240 ms and changes only opacity/transform', () => {
  const s = harness();
  s.motion.request(october, november); assert.equal(s.calls.length, 0);
  s.flush(); assert.equal(s.attributes.get('data-history-motion'), 'next');
  assert.equal(s.calls[0].frames[0].transform, 'translateX(18px)');
  assert.ok(HISTORY_MOTION_DURATION >= 180 && HISTORY_MOTION_DURATION <= 240);
  assert.equal(s.calls[0].options.duration, 210);
  for (const frame of s.calls[0].frames) assert.deepEqual(Object.keys(frame).sort(), ['opacity', 'transform']);
  s.motion.request(snapshot('week', '2026-11-08'), snapshot('week', '2026-11-01'));
  s.flush(); assert.equal(s.attributes.get('data-history-motion'), 'previous');
  assert.equal(s.calls[1].frames[0].transform, 'translateX(-18px)');
  assert.equal(s.calls[0].cancelCount, 1);
});

test('changing scale uses one coherent entrance and never creates an outgoing calendar', () => {
  const s = harness();
  s.motion.request(november, snapshot('year', '2026')); s.flush();
  assert.equal(s.calls.length, 1); assert.equal(s.attributes.get('data-history-motion'), 'scale');
  assert.match(s.calls[0].frames[0].transform, /translateY\(8px\).*scale/);
  s.calls[0].onfinish(); assert.equal(s.attributes.has('data-history-motion'), false);
  assert.equal(s.calls[0].options.fill, 'none');
});

test('rapid requests cancel pending frames and only the latest period is animated', () => {
  const s = harness();
  s.motion.request(october, november);
  const stale = [...s.pending.values()][0];
  s.motion.request(november, october);
  assert.equal(s.pending.size, 1); assert.deepEqual(s.canceled, [0]);
  stale(); assert.equal(s.calls.length, 0);
  s.flush(); assert.equal(s.calls.length, 1);
  assert.equal(s.attributes.get('data-history-motion'), 'previous');
});

test('a canceled animation cannot remove the newer motion state when its old finish callback arrives', () => {
  const s = harness();
  s.motion.request(october, november); s.flush(); const old = s.calls[0];
  s.motion.request(november, october); s.flush();
  old.onfinish(); assert.equal(s.attributes.get('data-history-motion'), 'previous');
  assert.equal(s.calls[1].cancelCount, 0);
});

test('selecting another day in the same period cancels old motion without animating or locking the day', () => {
  const s = harness();
  s.motion.request(october, november); s.flush();
  s.motion.request(november, november); s.flush();
  assert.equal(s.calls.length, 1); assert.equal(s.calls[0].cancelCount, 1);
  assert.equal(s.pending.size, 0); assert.equal(s.attributes.size, 0);
});

test('compact weekly navigation can explicitly slide while the month remains selected', () => {
  const s = harness(); s.motion.request(november, november, -1); s.flush();
  assert.equal(s.attributes.get('data-history-motion'), 'previous');
});

test('reduced motion prevents frames and immediately cancels an active animation', () => {
  const s = harness(); s.reduce(true); s.motion.request(october, november); s.flush();
  assert.equal(s.calls.length, 0); assert.equal(s.pending.size, 0);
  s.reduce(false); s.motion.request(october, november); s.flush();
  s.reduce(true); assert.equal(s.calls[0].cancelCount, 1); assert.equal(s.attributes.size, 0);
});

test('a preference change between the request and its frame prevents animation', () => {
  const s = harness(); s.motion.request(october, november); s.reduce(true); s.flush();
  assert.equal(s.calls.length, 0);
});

test('unmount cancels frames and active animation; reconnect supports StrictMode without replaying requests', () => {
  const s = harness(); s.motion.request(october, november); const stale = [...s.pending.values()][0];
  s.motion.dispose(); assert.equal(s.pending.size, 0); stale(); assert.equal(s.calls.length, 0);
  s.motion.connect(); s.motion.request(october, november); s.flush(); assert.equal(s.calls.length, 1);
  s.motion.dispose(); assert.equal(s.calls[0].cancelCount, 1); assert.equal(s.attributes.size, 0);
  s.motion.request(november, october); s.flush(); assert.equal(s.calls.length, 1);
});

test('replacing or removing the surface cancels the previous node animation', () => {
  const s = harness(); s.motion.request(october, november); s.flush();
  s.motion.attach(null); assert.equal(s.calls[0].cancelCount, 1); assert.equal(s.attributes.size, 0);
  s.motion.request(november, october); s.flush(); assert.equal(s.calls.length, 1);
});

test('a browser without Web Animations still renders selected content immediately', () => {
  const s = harness(); s.element.animate = undefined;
  s.motion.request(october, november); s.flush(); assert.equal(s.calls.length, 0);
  assert.equal(s.attributes.size, 0);
});

test('an unavailable animation enhancement does not leave stale attributes or prevent the next request', () => {
  const s = harness(), animate = s.element.animate;
  s.element.animate = () => { throw new Error('Unsupported animation'); };
  s.motion.request(october, november); s.flush(); assert.equal(s.attributes.size, 0);
  s.element.animate = animate; s.motion.request(november, october); s.flush();
  assert.equal(s.calls.length, 1);
});

test('the real React hook keeps one focused surface, honors live reduced motion and removes its listener on unmount', async t => {
  const dom = new JSDOM('<main><div id="root"></div></main>', { pretendToBeVisual: true });
  const previous = {};
  for (const name of ['window', 'document', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT']) previous[name] = globalThis[name];
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const listeners = new Set(), pending = new Map(), animations = [];
  let reduced = false, nextFrame = 0;
  const media = { get matches() { return reduced; },
    addEventListener(_type, callback) { listeners.add(callback); },
    removeEventListener(_type, callback) { listeners.delete(callback); } };
  window.matchMedia = () => media;
  window.requestAnimationFrame = callback => { const id = nextFrame++; pending.set(id, callback); return id; };
  window.cancelAnimationFrame = id => pending.delete(id);
  window.HTMLElement.prototype.animate = function(frames, options) {
    const animation = { frames, options, cancelCount: 0,
      cancel() { this.cancelCount++; this.oncancel?.(); } };
    animations.push(animation); return animation;
  };
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  let mounted = true;
  t.after(async () => {
    if (mounted) await act(() => root.unmount());
    dom.window.close(); for (const [name, value] of Object.entries(previous)) globalThis[name] = value;
  });
  function Fixture() {
    const motion = useHistoryMotion(), [month, setMonth] = React.useState(10);
    return React.createElement('section', null,
      React.createElement('button', { onClick: () => {
        motion.request(snapshot('month', String(month)), snapshot('month', String(month + 1)));
        setMonth(month + 1);
      } }, 'Siguiente'),
      React.createElement('div', { ref: motion.ref, 'data-calendar': true }, 'Mes ' + month));
  }
  await act(() => root.render(React.createElement(React.StrictMode, null, React.createElement(Fixture))));
  assert.equal(listeners.size, 1, 'StrictMode cannot accumulate preference listeners');
  const surface = document.querySelector('[data-calendar]'), button = document.querySelector('button');
  document.querySelector('main').scrollTop = 237; button.focus();
  await act(() => button.click());
  assert.equal(surface.textContent, 'Mes 11', 'Selected state is published before the animation frame');
  assert.equal(animations.length, 0);
  await act(() => { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback()); });
  assert.equal(animations.length, 1);
  assert.equal(document.querySelectorAll('[data-calendar]').length, 1);
  assert.equal(document.querySelector('[data-calendar]'), surface);
  assert.equal(document.activeElement, button); assert.equal(document.querySelector('main').scrollTop, 237);
  await act(() => { reduced = true; listeners.forEach(listener => listener()); });
  assert.equal(animations[0].cancelCount, 1); assert.equal(surface.hasAttribute('data-history-motion'), false);
  await act(() => button.click()); assert.equal(surface.textContent, 'Mes 12'); assert.equal(pending.size, 0);
  await act(() => root.unmount()); mounted = false;
  assert.equal(listeners.size, 0); assert.equal(pending.size, 0);
});
