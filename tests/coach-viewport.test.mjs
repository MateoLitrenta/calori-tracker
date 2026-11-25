import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { followCoachViewport, getFocusedCoachProposalField } from '../src/lib/coachViewport.ts';

function fixture(t, { touch = true, height = 812 } = {}) {
  const { window } = new JSDOM(
    `<main>
      <section class="chat-messages"><div class="chat-proposal-edit">
        <input id="proposal-name" type="text" class="chat-field">
        <input id="proposal-calories" type="number" class="chat-field">
        <input id="proposal-time" type="time" class="chat-field">
        <select id="proposal-type" class="chat-field"><option>Almuerzo</option></select>
        <textarea id="proposal-details" class="chat-field"></textarea>
      </div><button id="proposal-confirm" type="button">Confirmar</button></section>
      <form class="chat-composer"><textarea class="chat-textarea"></textarea><button type="button">Enviar</button></form>
    </main>`,
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
  const composer = shell.querySelector('.chat-textarea');
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
  assert.equal(shell.dataset.coachKeyboardOwner, 'composer');
  assert.equal(shell.style.getPropertyValue('--coach-viewport-height'), '530px');
  assert.equal(shell.style.getPropertyValue('--coach-viewport-top'), '16px');
  shell.querySelector('button').focus();
  assert.equal(shell.dataset.coachKeyboard, 'open', 'Keep the frame stable during blur');
  assert.equal(shell.dataset.coachKeyboardOwner, 'composer');
  assert.equal(resize({ height: 812, offsetTop: 0 }), undefined);
  assert.equal(shell.dataset.coachKeyboardOwner, undefined);
  composer.focus();
  assert.equal(resize({ height: 490 }), 'open', 'Reopening the keyboard works');
  stop();
  assert.equal(shell.dataset.coachKeyboard, undefined);
  assert.equal(shell.dataset.coachKeyboardOwner, undefined);
  assert.equal(shell.style.getPropertyValue('--coach-viewport-height'), '');
  assert.equal(resize({ height: 460 }), undefined, 'Listener was removed');
  assert.equal(shell.style.getPropertyValue('--coach-viewport-height'), '');
});

for (const fieldId of ['proposal-name', 'proposal-calories', 'proposal-time', 'proposal-type', 'proposal-details']) {
  test(`Coach recognizes a keyboard opened directly in ${fieldId}`, t => {
    const { shell, composer, resize } = fixture(t);
    composer.disabled = true;
    const field = shell.querySelector(`#${fieldId}`);
    field.focus();
    assert.equal(getFocusedCoachProposalField(shell), field);
    assert.equal(shell.dataset.coachKeyboard, undefined, 'Focus alone must leave navigation available');
    assert.equal(shell.dataset.coachKeyboardOwner, undefined);
    assert.equal(resize({ height: 725 }), undefined, 'Browser bars are not a keyboard');
    assert.equal(resize({ height: 530, scale: 1.5, width: 250 }), undefined, 'Pinch zoom is not a keyboard');
    assert.equal(shell.dataset.coachKeyboardOwner, undefined);
    assert.equal(resize({ height: 530, scale: 1, width: 375 }), 'open');
    assert.equal(shell.dataset.coachKeyboardOwner, 'proposal');
    assert.equal(resize({ height: 812 }), undefined, 'Closing works while the proposal field retains focus');
    assert.equal(getFocusedCoachProposalField(shell), field);
    assert.equal(shell.dataset.coachKeyboardOwner, undefined);
    assert.equal(resize({ height: 530 }), 'open', 'Reopening works without returning to the composer');
    assert.equal(shell.dataset.coachKeyboardOwner, 'proposal');
  });
}

test('Coach retains the proposal owner through action focus and switches only to another editor', t => {
  const { window, shell, composer, resize, stop } = fixture(t);
  const name = shell.querySelector('#proposal-name');
  const details = shell.querySelector('#proposal-details');
  name.focus();
  assert.equal(resize({ height: 530 }), 'open');
  details.focus();
  details.value = 'Primera línea\nSegunda línea';
  details.setSelectionRange(4, 4);
  assert.equal(shell.dataset.coachKeyboardOwner, 'proposal');
  details.blur();
  assert.equal(resize({ height: 525 }), 'open', 'Blur alone must not change the action layout');
  assert.equal(shell.dataset.coachKeyboardOwner, 'proposal');
  const confirm = shell.querySelector('#proposal-confirm');
  confirm.focus();
  assert.equal(getFocusedCoachProposalField(shell), null);
  assert.equal(shell.dataset.coachKeyboardOwner, 'proposal');
  assert.equal(resize({ height: 520 }), 'open');
  assert.equal(window.document.activeElement, confirm);
  composer.focus();
  assert.equal(shell.dataset.coachKeyboardOwner, 'composer');
  details.focus();
  assert.equal(shell.dataset.coachKeyboardOwner, 'proposal');
  assert.equal(details.value, 'Primera línea\nSegunda línea');
  assert.equal(details.selectionEnd, 4);
  assert.equal(resize({ height: 812 }), undefined);
  assert.equal(shell.dataset.coachKeyboardOwner, undefined);
  assert.equal(resize({ height: 530 }), 'open');
  assert.equal(shell.dataset.coachKeyboardOwner, 'proposal');
  stop();
  assert.equal(shell.dataset.coachKeyboardOwner, undefined);
  assert.equal(resize({ height: 500 }), undefined);
});

test('Coach excludes non-editable proposal controls and fields outside its proposal scope', t => {
  const { window, shell, resize } = fixture(t);
  const proposal = shell.querySelector('.chat-proposal-edit');
  const excluded = [
    ...['checkbox', 'radio', 'file', 'button', 'submit', 'reset', 'hidden'].map(type => `<input type="${type}">`),
    '<button type="button">Action</button>',
    '<input type="text" readonly>', '<textarea readonly></textarea>',
    '<input type="number" disabled>', '<textarea disabled></textarea>', '<select disabled><option>Tipo</option></select>',
    '<fieldset disabled><input type="text"></fieldset>',
  ];
  for (const markup of excluded) {
    const wrapper = window.document.createElement('div');
    wrapper.innerHTML = markup;
    proposal.append(wrapper);
    const field = wrapper.querySelector('input, textarea, select, button');
    field.focus();
    assert.equal(getFocusedCoachProposalField(shell), null, markup);
    assert.equal(resize({ height: 530 }), undefined, markup);
    assert.equal(shell.dataset.coachKeyboardOwner, undefined, markup);
    resize({ height: 812 });
    wrapper.remove();
  }
  const outsideProposal = window.document.createElement('input');
  shell.append(outsideProposal);
  outsideProposal.focus();
  assert.equal(getFocusedCoachProposalField(shell), null);
  assert.equal(resize({ height: 530 }), undefined);
  resize({ height: 812 });
  const outsideShell = window.document.createElement('div');
  outsideShell.className = 'chat-proposal-edit';
  outsideShell.innerHTML = '<textarea></textarea>';
  window.document.body.append(outsideShell);
  outsideShell.querySelector('textarea').focus();
  assert.equal(getFocusedCoachProposalField(shell), null);
  assert.equal(resize({ height: 530 }), undefined);
});

test('Coach retains a proposal keyboard through rotation and the navigation breakpoint', t => {
  const { window, shell, composer, frame, resize } = fixture(t, { height: 667 });
  composer.disabled = true;
  const field = shell.querySelector('#proposal-details');
  field.focus();
  assert.equal(resize({ height: 385 }), 'open');
  frame(667, 375);
  assert.equal(shell.dataset.coachKeyboardOwner, 'proposal', 'Keep owner during mismatched rotation events');
  assert.equal(resize({ width: 667, height: 190 }), 'open');
  assert.equal(resize({ width: 667, height: 190 }), 'open');
  assert.equal(shell.dataset.coachKeyboardOwner, 'proposal');
  frame(768, 450);
  assert.equal(resize({ width: 768, height: 215 }), 'open');
  assert.equal(shell.dataset.coachKeyboardOwner, 'proposal');
  frame(767, 450);
  assert.equal(resize({ width: 767, height: 215 }), 'open');
  frame(375, 667);
  assert.equal(resize({ width: 375, height: 385 }), 'open');
  assert.equal(window.document.activeElement, field);
  assert.equal(resize({ height: 625 }), undefined);
  assert.equal(shell.dataset.coachKeyboardOwner, undefined);
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
