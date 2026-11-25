import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { followCoachViewport } from '../src/lib/coachViewport.ts';

function fixture(t, { touch = true } = {}) {
  const { window } = new JSDOM(
    '<main><form class="chat-composer"><textarea class="chat-textarea"></textarea><button type="button">Enviar</button></form></main>',
  );
  window.innerWidth = 375;
  window.innerHeight = 812;
  const viewport = new window.EventTarget();
  Object.assign(viewport, { height: 812, width: 375, scale: 1, offsetTop: 0 });
  window.visualViewport = viewport;
  window.matchMedia = query => Object.assign(new window.EventTarget(), {
    matches: query.includes('max-width') ? true : touch,
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
  return { window, shell, composer, stop, resize };
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
  mobile.window.innerWidth = 667;
  assert.equal(mobile.resize({ height: 375, width: 667 }), undefined);
  assert.equal(mobile.resize({ height: 215 }), 'open');
  const desktop = fixture(t, { touch: false });
  desktop.composer.focus();
  assert.equal(desktop.resize({ height: 500 }), undefined);
});
