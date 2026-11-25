import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { before, go, heights, origin, repo } from './browser.mjs';

const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
const output = path.join(repo, 'docs/evidence/iphone-noviembre', before ? 'antes' : 'despues');
const module = process.env.PLAYWRIGHT_MODULE || path.resolve(repo, '../qa-tools/node_modules/playwright/index.mjs');
const playwright = await import(pathToFileURL(module));
const browser = await playwright[engine].launch(engine === 'chromium' ? { channel: 'chrome' } : {});
const results = [];
const target = process.argv.find(arg => arg.startsWith('--width='));
const rotationCheck = process.argv.includes('--rotation');
assert.ok(!rotationCheck || !before, 'Run the rotation check on the candidate');
const frameHeight = width => rotationCheck ? 667 : heights[width];
const draft = 'Pregunta sintética\nSegunda línea\nÚltima línea';
const response = 'Respuesta sintética de QA';

// Model the visual viewport independently of the layout viewport. This measures
// application geometry around a simulated keyboard, without emulating iOS chrome.
function simulateViewport() {
  const visualViewport = new EventTarget();
  Object.defineProperty(window, 'visualViewport', { value: visualViewport, configurable: true });
  window.simulateCoachViewport = ({ reduction = 0, offsetTop = 0, scale = 1, keyboard = false } = {}) => {
    const height = Math.round((innerHeight - reduction) / scale);
    Object.assign(visualViewport, { height, width: innerWidth / scale, offsetTop, offsetLeft: 0, scale });
    let panel = document.querySelector('#simulated-coach-keyboard');
    if (keyboard && !panel) {
      panel = document.createElement('div');
      panel.id = 'simulated-coach-keyboard';
      panel.textContent = 'Teclado táctil simulado';
      Object.assign(panel.style, {
        position: 'fixed', inset: 'auto 0 0', zIndex: '9999', background: '#313539',
        color: '#fff', borderTop: '1px dashed #c2c7ca', padding: '12px', textAlign: 'center',
      });
      document.body.append(panel);
    }
    if (panel) {
      panel.style.height = innerHeight - height - offsetTop + 'px';
      panel.hidden = !keyboard;
    }
    visualViewport.dispatchEvent(new Event('resize'));
    visualViewport.dispatchEvent(new Event('scroll'));
  };
  window.simulateCoachViewport();
}

async function open(width, theme) {
  const mobile = width <= 767;
  const context = await browser.newContext({
    viewport: { width, height: frameHeight(width) }, isMobile: mobile, hasTouch: mobile,
    colorScheme: theme, locale: 'es-AR', timezoneId: 'America/Buenos_Aires', reducedMotion: 'reduce',
  });
  const errors = [];
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    errors.push('External network request');
    return route.abort();
  });
  await context.addInitScript(simulateViewport);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(origin + '/qa?controls=0&theme=' + theme, { waitUntil: 'commit', timeout: 90000 });
  await page.locator('.home-variants').waitFor({ timeout: 90000 });
  await page.evaluate(() => {
    window.simulateCoachViewport(); // The document's viewport meta tag is now active.
    const { today, store } = window.__homeQA;
    const messages = Array.from({ length: 14 }, (_, index) => ({
      id: 'keyboard-' + index, role: index % 2 === 0 ? 'user' : 'bot',
      text: index % 2 === 0 ? 'Pregunta sobre mis registros de prueba.' :
        'Respuesta previa sintética sobre registros. '.repeat(14),
    }));
    localStorage.setItem('calori:assistant:messages:' + store.user.id + ':' + today, JSON.stringify(messages));
  });
  await go(page, 'Coach');
  return { context, page, errors };
}

async function measure(page) {
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  return page.evaluate(() => {
    const shell = document.querySelector('.app-shell-coach');
    const main = shell.querySelector('.app-main');
    const nav = shell.querySelector('.app-bottom-nav');
    const log = shell.querySelector('.chat-messages');
    const field = shell.querySelector('.chat-textarea');
    const form = shell.querySelector('.chat-composer-form');
    const button = shell.querySelector('.chat-send');
    const area = form.getBoundingClientRect();
    const send = button.getBoundingClientRect();
    const visibleBottom = visualViewport.height + visualViewport.offsetTop;
    return {
      navVisible: nav.getClientRects().length > 0,
      keyboardState: shell.dataset.coachKeyboard ?? null,
      navPadding: parseFloat(getComputedStyle(main).paddingBottom),
      readerHeight: log.clientHeight,
      scrollTop: log.scrollTop,
      composerBottom: area.bottom,
      viewportBottom: visibleBottom,
      sendVisible: send.bottom <= visibleBottom + 1 &&
        button.contains(document.elementFromPoint(send.x + send.width / 2, send.y + send.height / 2)),
      focus: field === document.activeElement,
      caret: field.selectionEnd,
      text: field.value,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
}

async function run(width, theme) {
  const { context, page, errors } = await open(width, theme);
  const box = page.getByRole('textbox', { name: 'Mensaje para Coach' });
  const send = page.getByRole('button', { name: 'Enviar mensaje' });
  const log = page.locator('.chat-messages');
  const viewport = options => page.evaluate(value => window.simulateCoachViewport(value), options);
  const place = async top => { await log.evaluate((element, value) => { element.scrollTop = value; }, top); };
  try {
    await box.focus();
    await box.fill(draft);
    await place(240);
    const focused = await measure(page);
    assert.ok(focused.focus && focused.sendVisible && !focused.overflow, JSON.stringify(focused));
    const result = { width, theme, focused };
    if (width === 1440) {
      assert.equal(focused.navVisible, false);
      assert.deepEqual(errors, []);
      results.push(result);
      return;
    }
    assert.equal(focused.navVisible, true);
    await viewport({ reduction: 90 });
    assert.equal((await measure(page)).navVisible, true, 'Browser bars keep main navigation');
    await viewport({ scale: 1.5 });
    assert.equal((await measure(page)).navVisible, true, 'Pinch zoom keeps main navigation');
    await viewport();
    await page.setViewportSize({ width: 420, height: 320 });
    await viewport();
    assert.equal((await measure(page)).navVisible, true, 'Rotating alone keeps main navigation');
    await page.setViewportSize({ width, height: frameHeight(width) });
    await viewport();
    await place(240);
    const keyboard = { reduction: width === 320 ? 243 : 282, offsetTop: 16, keyboard: true };
    await viewport(keyboard);
    if (!before) {
      await page.keyboard.insertText('x');
      await box.press('Backspace');
      assert.ok(await box.evaluate(field => Math.abs(field.scrollTop - field.scrollHeight + field.clientHeight) <= 1));
    }
    const typing = await measure(page);
    assert.equal(typing.navVisible, before);
    assert.equal(typing.navPadding, before ? focused.navPadding : 0);
    assert.ok(typing.focus && !typing.overflow, JSON.stringify(typing));
    if (!before) assert.equal(typing.sendVisible, true, JSON.stringify(typing));
    assert.equal(typing.text, draft);
    assert.equal(typing.caret, draft.length);
    assert.ok(Math.abs(typing.scrollTop - 240) <= 2);
    result.typing = typing;
    if (engine === 'chromium' && !rotationCheck) {
      await page.screenshot({ path: path.join(output, 'coach-' + width + '-' + theme + '-teclado.jpg'), quality: 85 });
    }
    if (rotationCheck) {
      const rotate = async (width, height, reduction) => {
        await page.setViewportSize({ width, height });
        await viewport({ reduction, keyboard: true });
        const state = await measure(page);
        assert.ok(!state.navVisible && state.focus && !state.overflow, JSON.stringify(state));
        assert.equal(state.text, draft);
        assert.equal(state.caret, draft.length);
        assert.ok(Math.abs(state.scrollTop - 240) <= 2, JSON.stringify(state));
        assert.equal(state.keyboardState, 'open');
        assert.equal(state.navPadding, 0);
        assert.ok(state.sendVisible, JSON.stringify(state));
        assert.ok(await box.evaluate(field => field.scrollHeight - field.clientHeight - field.scrollTop <= 1),
          'The last line stays visible when the composer is resized');
        return { width, height, visualHeight: height - reduction, ...state };
      };
      const landscape = await rotate(667, 375, 185);
      await viewport({ reduction: 185, keyboard: true });
      assert.equal((await measure(page)).keyboardState, 'open', 'Duplicate resize keeps the state');
      if (engine === 'chromium' && theme === 'dark') {
        await page.screenshot({ path: path.join(output, 'coach-667-rotacion-teclado.jpg'), quality: 85 });
      }
      const portrait = await rotate(375, 667, 282);
      const wide = await rotate(768, 450, 235);
      const narrow = await rotate(767, 450, 235);
      const returned = await rotate(375, 667, 282);
      result.rotation = [landscape, portrait, wide, narrow, returned];
    }
    await viewport();
    const restored = await measure(page);
    assert.ok(restored.navVisible && restored.focus && restored.sendVisible);
    assert.equal(restored.text, draft);
    assert.equal(restored.navPadding, focused.navPadding);
    assert.ok(Math.abs(restored.scrollTop - 240) <= 2);
    result.restored = restored;
    await viewport(keyboard);
    assert.equal((await measure(page)).navVisible, before);

    if (!before) {
      await send.evaluate(button => {
        // React's listener runs on the root before the event reaches document.
        document.addEventListener('pointerdown', event => {
          if (event.composedPath().includes(button)) {
            window.coachSendPointer = { type: event.pointerType, defaultPrevented: event.defaultPrevented };
          }
        }, { once: true });
      });
      await page.evaluate(() => {
        const fetchFixture = window.fetch.bind(window);
        const waitForReading = new Promise(resolve => { window.releaseCoachReply = resolve; });
        window.fetch = async (input, init) => {
          const reply = await fetchFixture(input, init);
          if (String(input).includes('/api/ai/chat')) await waitForReading;
          return reply;
        };
      });
      await send.tap();
      await page.waitForFunction(() => window.__homeQA.aiCalls.length === 1);
      assert.deepEqual(await page.evaluate(() => window.coachSendPointer), { type: 'touch', defaultPrevented: true });
      assert.equal(await page.evaluate(() => window.__homeQA.aiCalls[0].messages.at(-1).text), draft);
      assert.equal(await box.inputValue(), '');
      const afterTap = await measure(page);
      assert.ok(afterTap.focus, await page.evaluate(() => 'Focus after tap: ' + document.activeElement?.tagName));
      await place(240);
      const pending = await measure(page);
      assert.equal(await page.getByText(response, { exact: true }).count(), 0);
      assert.ok(Math.abs(pending.scrollTop - 240) <= 2);
      await page.evaluate(() => window.releaseCoachReply());
      await page.getByText(response, { exact: true }).waitFor();
      const replied = await measure(page);
      assert.equal(replied.focus, true);
      assert.ok(Math.abs(replied.scrollTop - 240) <= 2);
      result.replied = replied;

      // Restore navigation and return to the original reading position.
      await viewport();
      await go(page, 'Inicio');
      assert.equal(await page.locator('[data-coach-keyboard]').count(), 0);
      await go(page, 'Coach');
      await page.waitForFunction(() => Math.abs(document.querySelector('.chat-messages').scrollTop - 240) <= 2);
      assert.equal((await measure(page)).navVisible, true);
      await page.addStyleTag({ content: '.chat-textarea { font-size: 32px !important; }' });
      await box.fill(draft);
      await viewport(keyboard);
      const enlarged = await measure(page);
      assert.ok(!enlarged.navVisible && enlarged.focus && enlarged.sendVisible && !enlarged.overflow, JSON.stringify(enlarged));
      result.enlarged = enlarged;
      result.localAICalls = 1;
      result.rotationZoomBarsKeptNavigation = true;
    }
    assert.deepEqual(errors, []);
    results.push(result);
    console.log(JSON.stringify({ width, theme, navPadding: typing.navPadding, readerHeight: typing.readerHeight, sent: result.localAICalls }));
  } finally {
    await context.close();
  }
}

await mkdir(output, { recursive: true });
try {
  const widths = rotationCheck ? [375] : target ? [Number(target.split('=')[1])] : engine === 'chromium' ? [375, 320, 1440] : [375, 320];
  for (const width of widths) {
    for (const theme of ['light', 'dark']) await run(width, theme);
  }
  await writeFile(path.join(output, 'coach-' + engine + (rotationCheck ? '-rotacion' : target ? '-diagnostic' : '') + '.json'), JSON.stringify({
    engine, version: browser.version(), simulatedKeyboard: true, results,
  }, null, 2) + '\n');
} finally {
  await browser.close();
}
