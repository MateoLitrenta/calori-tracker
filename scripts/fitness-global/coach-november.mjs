import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { before, go, open, repo, start } from './browser.mjs';

const folder = path.join(repo, 'docs/evidence/coach-noviembre', before ? 'antes' : 'despues');
await mkdir(folder, { recursive: true });
const browser = await start();
try {
  for (const [width, theme] of [[375,'light'],[375,'dark'],[1440,'light'],[1440,'dark'],[320,'light']]) {
    const { page, context, errors } = await open(browser, width, 'system', theme);
    const button = name => page.getByRole('button', { name, exact:true });
    const photo = name => page.screenshot({ path:path.join(folder, width + '-' + theme + '-' + name + '.jpg'), quality:82 });
    try {
      await page.evaluate(() => {
        const q = window.__homeQA;
        q.goals[q.account] = [{ id:'00000000-0000-4000-8000-000000000043', type:'workout_sessions', target:12,
          startDate:q.today, endDate:q.today, status:'active', version:1, updatedAt:q.today+'T12:00:00Z', createdAt:q.today+'T12:00:00Z' }];
      });
      await go(page,'Coach');
      await page.locator('[data-insight-kind="goal"]').waitFor();
      // Double fixed-pixel copy too, keeping the CSS viewport at 320.
      const doubleText = async selector => {
        if (width !== 320) return;
        await page.evaluate(selector => {
          document.documentElement.style.fontSize = '16px';
          const elements = [...document.querySelector(selector).querySelectorAll('*')].filter(n => n instanceof HTMLElement && !n.dataset.doubled);
          const sizes = elements.map(n => parseFloat(getComputedStyle(n).fontSize));
          elements.forEach((n,i) => { n.style.fontSize = sizes[i]*2+'px'; n.dataset.doubled='1'; });
        }, selector);
      };
      await doubleText('.assistant-view');
      await photo('inicio');
      await button('Mis objetivos').click();
      await page.locator('.coach-goal-card').waitFor();
      await doubleText('[role="dialog"]');
      if (!before) {
        for (const control of await page.locator('.chat-heading-actions button, .coach-goals-panel button').all()) {
          const rect = await control.boundingBox();
          assert.ok(rect && rect.width >= 44 && rect.height >= 44 && rect.x >= -1 && rect.x+rect.width <= width+1);
        }
      }
      await photo('objetivos');
      await button('Cerrar formulario').click();
      const shortcut = page.locator('.chat-empty-suggestions button').first();
      const question = await shortcut.getAttribute('aria-description');
      await page.locator('.chat-textarea').evaluate(el => { window.emptyComposer = el; });
      await shortcut.click();
      await page.getByText('Respuesta sintética de QA', {exact:true}).waitFor();
      assert.equal(await page.evaluate(() => window.__homeQA.aiCalls.at(-1).messages.at(-1).text), question);
      if (!before) assert.ok(await page.locator('.chat-textarea').evaluate(el => el === window.emptyComposer && el === document.activeElement));
      await photo('conversacion');
      if (width > 320) {
        await go(page,'Inicio');
        await page.evaluate(() => {
          const q=window.__homeQA;
          localStorage.setItem('calori:assistant:messages:'+q.store.user.id+':'+q.today, JSON.stringify(Array.from({length:18}, (_,i) => ({
            id:'sample-'+i, role:i%2?'bot':'user', text:i%2?'Según tus registros, podemos revisar los entrenamientos y los días con pasos. '.repeat(9):'¿Qué muestran mis registros de esta semana?',
          }))));
        });
        await go(page,'Coach');
        await page.waitForFunction(() => document.querySelectorAll('.chat-message').length === 18);
        const log = page.locator('.chat-messages');
        await log.evaluate(el => {el.scrollTop=Math.round((el.scrollHeight-el.clientHeight)/2);});
        const top = await log.evaluate(el=>el.scrollTop);
        await page.locator('.chat-textarea').focus();
        assert.equal(await log.evaluate(el=>el.scrollTop), top);
        await photo('lectura');
      }
      if (!before && width === 375 && theme === 'light') {
        const input = page.locator('.chat-textarea');
        const png = await page.evaluate(() => {
          const canvas = document.createElement('canvas');
          canvas.width=canvas.height=48;
          canvas.getContext('2d').fillRect(0,0,48,48);
          return canvas.toDataURL('image/png').split(',')[1];
        });
        await page.locator('.chat-composer input[type=file]').setInputFiles({name:'prueba.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
        const attachment = page.getByAltText('Foto de comida adjunta');
        await attachment.waitFor();
        const photoUrl = await attachment.getAttribute('src');
        await input.fill('Borrador sintético');
        await input.evaluate(el => { window.originalComposer = el; });
        await page.setViewportSize({width:1024,height:800});
        await page.emulateMedia({ colorScheme:'dark' });
        await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
        assert.equal(await attachment.getAttribute('src'), photoUrl);
        assert.equal(await input.inputValue(), 'Borrador sintético');
        assert.ok(await input.evaluate(el => el === window.originalComposer && document.activeElement === el));
        await button('Quitar foto').click();
        await page.evaluate(() => { const q=window.__homeQA; q.goals[q.account]=[]; q.setProfile({records:{}}); });
        await button('Nueva conversación').click();
        await go(page,'Inicio');
        await go(page,'Coach');
        await page.locator('[data-insight-kind="getting_started"]').waitFor();
        await photo('sin-registros');
        await button('Mis objetivos').click();
        await page.getByText(/No tenés objetivos aceptados/).waitFor();
        await photo('sin-objetivos');
      }
      assert.deepEqual(errors, []);
      console.log(width, theme, browser.version(), question);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
