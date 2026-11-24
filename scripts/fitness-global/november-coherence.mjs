import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { before, go, open, repo, start } from './browser.mjs';

const folder = path.join(repo, 'docs/evidence/coherencia-noviembre', before ? 'antes' : 'despues');
await mkdir(folder, { recursive: true });
const browser = await start();
try {
  for (const [width, theme] of [[320, 'light'], [1440, 'dark'], [375, 'dark'], [1440, 'light']]) {
    const { page, context, errors } = await open(browser, width, theme, theme);
    try {
      const capture = async (name, locator) => {
        await locator.scrollIntoViewIfNeeded();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: path.join(folder, width + '-' + theme + '-' + name + '.jpg'), quality: 80 });
      };
      const button = name => page.getByRole('button', { name, exact: true });
      await capture('semana', page.locator('.home-date-nav'));
      const dates = await page.locator('.home-week-days [data-day]').evaluateAll(nodes => nodes.map(n => n.dataset.day));
      assert.equal(dates[0], before ? '2026-11-08' : '2026-11-09');
      await button('Agregar comida').click();
      await page.getByLabel('Descripción', {exact:true}).fill('Comida de prueba');
      await page.evaluate(() => { window.__homeQA.nextAI = {estimated:true, calories:1200, description:'Comida de prueba', assumptions:['Porción sintética']}; });
      await button('Estimar con IA').click();
      const calories = page.locator('#add-meal-calories');
      await page.waitForFunction(() => document.querySelector('#add-meal-calories')?.value === '1200');
      await calories.fill('1000');
      const result = page.locator('.entry-estimate-value');
      assert.match(await result.innerText(), before ? /1.200/ : /Se guardarán 1.000 kcal/);
      await capture('ajuste', result);
      if (!before) {
        for (const invalid of ['', '-5', '1.5']) {
          await calories.fill(invalid);
          assert.match(await result.innerText(), /Ingresá un valor válido/);
        }
        await calories.fill('1000');
      }
      await button('Guardar comida').click();
      const receipt = page.locator('.meal-saved');
      await receipt.waitFor();
      assert.match(await receipt.innerText(), /1.000 kcal/);
      await button('Ver registro').click();
      await page.locator('.daily-record-open:focus').click();
      await page.locator('.record-detail-edit').click();
      assert.equal(await page.locator('#edit-meal-calories').inputValue(), '1000');
      await button('Cancelar').click();
      await go(page, 'Datos');
      await page.locator('.charts-bucket').nth(5).click();
      const detail = page.locator('#charts-bucket-detail');
      assert.match(await detail.innerText(), before ? /Sin comidas/ : /Fecha futura/);
      await capture('futuro', detail);
      assert.deepEqual(errors, []);
      console.log(width, theme, browser.version());
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
