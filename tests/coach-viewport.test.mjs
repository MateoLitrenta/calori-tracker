import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { followCoachViewport } from '../src/lib/coachViewport.ts';

function fixture(t, { touch = true, height = 812 } = {}) {
  const { window } = new JSDOM(
    '<main><form class="chat-composer"><textarea class="chat-textarea"></textarea><button type="button">Enviar</button></form></main>',
  );
  window.innerWidth = 375;
  window.innerHeight = height;
  const viewport = new window.EventTarget();
  Object.assign(viewport, { height, width: 375, scale: 1, offsetTop: 0 });
  window.visualViewport = viewport;
  window.matchMedia = query => Object.defineProperty(new window.EventTarget(), 'matches', {
    get: () => query.includes('max-width') ? window.innerWidth <= 767 : touch,
  });
  const shell = window.document.querySelector('main');
  const composer = shell.querySelector('textarea');
  const stop = followCoachViewport(shell);
  t.after(() => {
    stop();
    window.close();
  });
  const resize = values => {
    Object.assign(viewport, values);
    viewport.dispatchEvent(new window.Event('resize'));
    return shell.dataset.coachKeyboard;
  };
  const frame = (width, height) => {
    window.innerWidth = width;
    window.innerHeight = height;
    window.dispatchEvent(new window.Event('resize'));
  };
  return { window, shell, composer, stop, resize, frame };
}

test('Coach reserves nav space only until a touch keyboard occludes the focused composer', t => {
  const { shell, composer, stop, resize } = fixture(t);
  assert.equal(resize({ height: 530 }), undefined, 'Occlusion without composer focus');
  assert.equal(resize({ height: 812 }), undefined);
  composer.focus();
  assert.equal(shell.dataset.coachKeyboard, undefined, 'Focus without occlusion');
  assert.equal(resize({ height: 725 }), undefined, 'URL bar');
  assert.equal(resize({ height: 530, scale: 1.5, width: 250 }), undefined, 'Pinch zoom');
  assert.equal(resize({ height: 530, scale: 1, width: 375, offsetTop: 16 }), 'open');
  assert.equal(shell.style.getPropertyValue('--coach-viewport-height'), '530px');
  assert.equal(shell.style.getPropertyValue('--coach-viewport-top'), '16px');
  shell.querySelector('button').focus();
  assert.equal(shell.dataset.coachKeyboard, 'open', 'Keep the frame stable during blur');
  assert.equal(resize({ height: 812, offsetTop: 0 }), undefined);
  composer.focus();
  assert.equal(resize({ height: 490 }), 'open', 'Reopening the keyboard works');
  stop();
  assert.equal(shell.dataset.coachKeyboard, undefined);
  assert.equal(shell.style.getPropertyValue('--coach-viewport-height'), '');
  assert.equal(resize({ height: 460 }), undefined, 'Listener was removed');
  assert.equal(shell.style.getPropertyValue('--coach-viewport-height'), '');
});

test('Coach starts a fresh viewport baseline on rotation and ignores occlusion on fine-pointer screens', t => {
  const mobile = fixture(t);
  mobile.composer.focus();
  mobile.frame(667, 375);
  assert.equal(mobile.resize({ height: 375, width: 667 }), undefined);
  assert.equal(mobile.resize({ height: 215 }), 'open');
  const desktop = fixture(t, { touch: false });
  desktop.composer.focus();
  assert.equal(desktop.resize({ height: 500 }), undefined);
});

test('Coach keeps an open keyboard across rotation until the visual viewport recovers', t => {
  const { window, shell, composer, frame, resize } = fixture(t, { height: 667 });
  composer.value = 'Consulta de prueba\nSegunda línea';
  composer.focus();
  composer.setSelectionRange(5, 5);

  assert.equal(resize({ height: 385 }), 'open');
  frame(667, 375);
  assert.equal(shell.dataset.coachKeyboard, 'open', 'Keep the state while the two viewports report different widths');
  assert.equal(resize({ width: 667, height: 190 }), 'open');
  assert.equal(resize({ width: 667, height: 190 }), 'open', 'A duplicate resize must not replace the closed reference');
  frame(375, 667);
  assert.equal(resize({ width: 375, height: 385 }), 'open');
  assert.equal(window.document.activeElement, composer);
  assert.equal(composer.selectionEnd, 5);
  assert.equal(composer.value, 'Consulta de prueba\nSegunda línea');
  assert.equal(resize({ height: 625 }), undefined, 'Restore navigation when only the browser bars remain');
  assert.equal(window.document.activeElement, composer);
  assert.equal(resize({ height: 385 }), 'open');
  frame(667, 375);
  assert.equal(resize({ width: 667, height: 190 }), 'open');
  assert.equal(resize({ height: 340 }), undefined, 'A close in landscape works with the composer still focused');
  assert.equal(window.document.activeElement, composer);
});

test('Coach keeps the composer frame across 767px while the touch keyboard is open', t => {
  const { shell, composer, frame, resize } = fixture(t, { height: 667 });
  composer.focus();
  assert.equal(resize({ height: 385 }), 'open');
  frame(768, 450);
  assert.equal(resize({ width: 768, height: 215 }), 'open');
  assert.equal(shell.style.getPropertyValue('--coach-viewport-height'), '215px');
  frame(767, 450);
  assert.equal(resize({ width: 767, height: 215 }), 'open');
  frame(768, 450);
  assert.equal(resize({ width: 768, height: 450 }), undefined);
  assert.equal(shell.style.getPropertyValue('--coach-viewport-height'), '');
  frame(767, 450);
  assert.equal(resize({ width: 767, height: 450 }), undefined, 'The keyboard closed above the breakpoint');
  assert.equal(resize({ height: 215 }), 'open');
});
