import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { open, repo, settled, start } from '../ux-stage1/browser.mjs';

const before = process.argv.includes('--before');
const mealAction = before ? '+ Comida' : 'Agregar comida';
const workoutAction = before ? '+ Ejercicio' : 'Agregar ejercicio';
const directory = process.env.CALORI_QA_OUTPUT || path.join(repo, 'docs/evidence/ux-stage2/entry-time', before ? 'before' : 'after');
mkdirSync(directory, { recursive: true });
const results = [];
const browser = await start(['--enable-blink-features=LangAttributeAwareFormControlUI']);

// Chromium keeps the hour, period and picker in a closed user-agent shadow tree.
async function measureTime(cdp, id) {
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#' + id });
  const { node } = await cdp.send('DOM.describeNode', { nodeId, depth: 12, pierce: true });
  const parts = new Map();
  function index(part) {
    const offset = part.attributes?.indexOf('pseudo') ?? -1;
    if (offset >= 0) parts.set(part.attributes[offset + 1], part.backendNodeId);
    for (const child of [...(part.children ?? []), ...(part.shadowRoots ?? [])]) index(child);
  }
  index(node);
  async function read(name) {
    const backendNodeId = parts.get('-webkit-' + name);
    assert.ok(backendNodeId, name + ' must remain available in the native input');
    const { object } = await cdp.send('DOM.resolveNode', { backendNodeId });
    const { result, exceptionDetails } = await cdp.send('Runtime.callFunctionOn', {
      objectId: object.objectId, returnByValue: true,
      functionDeclaration: function () {
        const box = this.getBoundingClientRect();
        const canvas = this.ownerDocument.createElement('canvas').getContext('2d');
        canvas.font = getComputedStyle(this).font;
        const content = this.textContent;
        return { content, width: box.width, left: box.left, right: box.right,
          localeAllowance: Math.max(...['a. m.', 'p. m.'].map(value => canvas.measureText(value).width)) - canvas.measureText(content).width };
      }.toString(),
    });
    assert.equal(exceptionDetails, undefined);
    return result.value;
  }
  const editor = await read('datetime-edit');
  const fields = await read('datetime-edit-fields-wrapper');
  const dayPeriod = await read('datetime-edit-ampm-field');
  const picker = await read('calendar-picker-indicator');
  assert.match(fields.content, /^07:54\s*PM$/);
  assert.ok(picker.width > 0);
  return { display: fields.content, editorWidth: editor.width, fieldsWidth: fields.width, pickerWidth: picker.width,
    dayPeriodVisible: dayPeriod.right <= editor.right + 0.5,
    spareWithSpanishSuffix: editor.right - fields.right - Math.max(0, dayPeriod.localeAllowance) };
}

try {
  for (const width of [320, 375, 1440]) {
    for (const theme of ['light', 'dark']) {
      const { page, context, errors } = await open(browser, width, theme, 'main', theme, 'http://127.0.0.1:5198', 'en-US');
      const cdp = await context.newCDPSession(page);
      try {
        for (const mode of ['add-meal', 'edit-meal', 'add-workout', 'edit-workout']) {
          const isMeal = mode.endsWith('meal');
          if (mode.startsWith('add')) {
            await page.getByRole('button', { name: isMeal ? mealAction : workoutAction, exact: true }).click();
          } else {
            await page.locator('.daily-record-open').filter({ hasText: isMeal ? 'Comida sintética' : 'Gimnasio' }).first().click();
            await page.locator('.record-detail-edit').click();
          }
          const id = mode + '-time';
          const input = page.locator('#' + id);
          if (isMeal) await page.locator('form .fitness-extras summary').click();
          const notes = page.locator('#' + mode + '-notes');
          await notes.fill('Nota sintética opcional para comprobar el pie del formulario.');
          await input.evaluate(element => {
            element.lang = 'en-US';
            // Rebuild the probe control using its fixture locale after React mounts it.
            element.type = 'text';
            element.type = 'time';
          });
          await input.fill('19:54');
          await input.evaluate(element => element.closest('.entry-time').scrollIntoView({ block: 'center' }));
          await settled(page);
          const native = await measureTime(cdp, id);
          const box = await input.boundingBox();
          const form = page.locator('form.entry-form');
          const now = form.getByRole('button', { name: 'Usar hora actual' });
          const footer = await form.locator('button[type=submit]').boundingBox();
          const viewport = page.viewportSize();
          assert.equal(await input.evaluate(element => element.type === 'time' && typeof element.showPicker === 'function'), true);
          assert.equal(await notes.isVisible(), true);
          assert.ok(footer && footer.y >= 0 && footer.y + footer.height <= viewport.height + 1);
          if (!before) {
            assert.ok(native.dayPeriodVisible, JSON.stringify({ mode, width, native }));
            assert.ok(native.spareWithSpanishSuffix >= 0, JSON.stringify({ mode, width, native }));
          }
          if ((width === 375 && theme === 'dark') || (mode === 'add-meal' && ((width === 1440 && theme === 'dark') || (width === 320 && theme === 'light')))) {
            await page.screenshot({ path: path.join(directory, `${width}-${theme}-${mode}.jpg`), quality: 88 });
          }
          await now.click();
          const nowValue = await input.inputValue();
          if (!before) assert.equal(nowValue, '12:00');
          if (before) page.once('dialog', prompt => prompt.accept());
          await form.getByRole('button', { name: 'Cancelar' }).click();
          if (!before) await page.getByRole('button', { name: 'Descartar cambios' }).click();
          await form.waitFor({ state: 'hidden' });
          results.push({ width, theme, mode, inputWidth: box.width, ...native, nowValue, footerVisible: true });
        }
        assert.deepEqual(errors, []);
        assert.equal(await page.evaluate(() => {
          const qa = window.__homeQA;
          return qa.writes.length + qa.aiCalls.length + qa.externalRequests;
        }), 0);
      } finally {
        await context.close();
        writeFileSync(path.join(directory, 'results.json'), JSON.stringify(results, null, 2) + '\n');
      }
    }
  }
  if (before) assert.ok(results.some(row => row.width === 375 && row.theme === 'dark' && row.mode === 'add-meal' && !row.dayPeriodVisible));
  assert.equal(results.length, 24);
  console.log((before ? 'Reference' : 'Candidate') + ': ' + results.length + ' cases verified');
} finally {
  await browser.close();
}
