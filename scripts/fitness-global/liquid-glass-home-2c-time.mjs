import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { before, open, repo } from './browser.mjs';
import { settle } from './liquid-glass-home-2c-flows.mjs';
import { measureTime } from '../ux-stage2/native-time.mjs';

const playwrightModule = process.env.PLAYWRIGHT_MODULE || path.resolve(repo, '../qa-tools/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightModule));
const browser = await chromium.launch({ channel: process.env.QA_BROWSER_CHANNEL || 'chrome',
  args: ['--enable-blink-features=LangAttributeAwareFormControlUI'] });
const tests = [
  ['add-meal', 'Agregar comida'], ['edit-meal', 'Editar comida'],
  ['add-workout', 'Agregar ejercicio'], ['edit-workout', 'Editar ejercicio'],
];
const width = 375, theme = 'dark';
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const results = [];

try {
  const { context, page, errors } = await open(browser, width, theme, theme);
  const cdp = await context.newCDPSession(page);
  try {
    for (const [name, title] of tests) {
      const meal = name.endsWith('meal');
      if (name.startsWith('add')) await button(page, title).press('Enter');
      else {
        await page.locator('.daily-record-open[data-entry-kind="' + (meal ? 'meal' : 'workout') + '"]').first().press('Enter');
        await page.getByRole('dialog', { name: 'Detalle del registro' }).locator('.record-detail-edit').press('Enter');
      }
      const dialog = page.getByRole('dialog', { name: title, exact: true });
      if (meal) await dialog.locator('.fitness-extras summary').press('Enter');
      await dialog.locator('#' + name + '-notes').fill('Nota sintética de revisión de Hora');
      const time = dialog.locator('#' + name + '-time');
      await time.evaluate(el => { el.lang = 'en-US'; el.type = 'text'; el.type = 'time'; });
      await time.fill('19:54');
      await time.evaluate(el => el.closest('.entry-time').scrollIntoView({ block: 'center' }));
      await settle(page);
      const native = await measureTime(cdp, name + '-time');
      const footer = await dialog.locator('.entry-form-footer button[type=submit]').boundingBox();
      assert.ok(footer && footer.y >= 0 && footer.y + footer.height <= page.viewportSize().height + 1);
      assert.equal(await time.evaluate(el => el.type === 'time' && typeof el.showPicker === 'function'), true);
      if (!before) assert.ok(native.dayPeriodVisible && native.spareWithSpanishSuffix >= 0, JSON.stringify({name, ...native}));
      await button(dialog, 'Usar hora actual').press('Enter');
      const now = await time.inputValue();
      assert.notEqual(now, '19:54');
      await button(dialog, 'Cancelar').press('Enter');
      await button(page.locator('dialog[data-discard-draft]'), 'Descartar cambios').press('Enter');
      await dialog.waitFor({ state: 'hidden' });
      results.push({ name, ...native, now, footerVisible: true });
    }
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => {
      const q = window.__homeQA;
      return q.writes.length + q.aiCalls.length + q.externalRequests;
    }), 0);
  } finally {
    await cdp.detach();
    await context.close();
  }
  const output = path.join(repo, 'docs/evidence/liquid-glass-home-2c', before ? 'before' : 'after');
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'chromium-hora.json'), JSON.stringify({ width, theme, version: browser.version(), results }, null, 2) + '\n');
  console.log('Hora nativa: ' + results.length + ' formularios');
} finally {
  await browser.close();
}
