import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { go, open, repo, start } from './browser.mjs';

const reference = process.argv.includes('--reference');
const dir = path.join(repo, 'docs/evidence/ux-stage4', reference ? 'before' : 'after');
await mkdir(dir, { recursive: true });
const browser = await start();
const rows = [];
const b = (page, name) => page.getByRole('button', { name, exact: true });
const frames = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
try {
  for (const width of [375, 320, 393, 440, 768, 1440]) {
    for (const theme of ['light', 'dark']) {
      const { context, page, errors } = await open(browser, width, theme, theme);
      try {
        await go(page, 'Perfil');
        await page.screenshot({ path: path.join(dir, width + '-' + theme + '.jpg'), quality: 84 });
        const main = page.locator('.app-main');
        if ([375, 1440].includes(width)) {
          await main.evaluate(el => { el.scrollTop = el.scrollHeight; });
          await frames(page);
          await page.screenshot({ path: path.join(dir, width + '-' + theme + '-gestion.jpg'), quality: 84 });
        }
        const top = await main.evaluate(el => { el.scrollTop = 200; return el.scrollTop; });
        await go(page, 'Coach');
        await go(page, 'Perfil');
        const restored = await main.evaluate(el => el.scrollTop);
        if (!reference) assert.equal(restored, top);
        await b(page, 'Editar perfil').click();
        const name = page.getByLabel('Nombre', { exact: true });
        await name.fill('Alex borrador');
        if (width === 375) {
          await page.locator('.profile-form-actions').first().scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(dir, width + '-' + theme + '-edicion.jpg'), quality: 84 });
        }
        await page.evaluate(() => window.__homeQA.setProfile({ age: 31 }));
        await frames(page);
        const afterRefresh = await name.inputValue();
        assert.equal(afterRefresh, reference ? 'Alex' : 'Alex borrador');
        await name.fill('Alex borrador');
        await b(page, 'Cancelar').click();
        const guarded = await name.isVisible();
        assert.equal(guarded, !reference);
        if (guarded) {
          assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Seguir editando');
          await page.keyboard.press('Escape');
          assert.equal(await name.inputValue(), 'Alex borrador');
        } else {
          await b(page, 'Editar perfil').click();
        }
        await page.evaluate(() => {
          const q = window.__homeQA;
          q.submits = 0;
          const gate = new Promise(done => { q.finish = done; });
          q.store = { ...q.store, updateProfile: async () => { q.submits++; await gate; } };
          q.notify();
        });
        await frames(page);
        await page.evaluate(() => {
          const form = document.querySelector('.profile-personal-panel form');
          form.requestSubmit(); form.requestSubmit();
        });
        await frames(page);
        const submits = await page.evaluate(() => window.__homeQA.submits);
        assert.equal(submits, reference ? 2 : 1);
        const busy = await b(page, 'Guardando…').count();
        assert.equal(busy, reference ? 0 : 1);
        await page.evaluate(() => window.__homeQA.finish());
        await name.waitFor({ state: 'hidden' });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        assert.equal(overflow, false);
        assert.deepEqual(errors, []);
        rows.push({ width, theme, top, restored, afterRefresh, guarded, submits, busy, overflow });
      } finally { await context.close(); }
    }
  }
  await writeFile(path.join(dir, 'matrix.json'), JSON.stringify(rows, null, 2) + '\n');
  console.log(rows);
} finally { await browser.close(); }
