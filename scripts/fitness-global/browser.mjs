import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const evidence = path.join(repo, 'docs/evidence/fitness-global');
export const before = process.argv.includes('--before');
export const origin = 'http://127.0.0.1:' + (before ? '5193' : '5194');
const pw = process.env.PLAYWRIGHT_MODULE || path.resolve(repo, '../qa-tools/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(pw));
export const start = () => chromium.launch({channel:process.env.QA_BROWSER_CHANNEL || 'chrome', headless:true});
export const tabs = {Inicio:'.home-variants', Coach:'.assistant-view textarea', Datos:'.charts-insights', Perfil:'.profile-view'};
export const heights = {320:568,375:812,393:852,440:956,768:1024,1440:900};

export async function open(browser, width, preference='light', system='light', localOrigin=origin) {
  assert.ok(['http://127.0.0.1:5193','http://127.0.0.1:5194'].includes(localOrigin),'Isolated fixtures only');
  const context = await browser.newContext({viewport:{width,height:heights[width]}, colorScheme:system,
    timezoneId:'America/Buenos_Aires', locale:'es-AR', reducedMotion:'reduce'});
  const errors = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === localOrigin) return route.continue();
    errors.push('Blocked external host: ' + url.hostname);
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if(m.type()==='error') errors.push(m.text()); });
  await page.goto(localOrigin + '/qa?controls=0&theme=' + preference,{waitUntil:'commit',timeout:90000});
  await page.locator(tabs.Inicio).waitFor({timeout:90000});
  return {context,page,errors};
}

export async function go(page, tab) {
  const button = page.getByRole('navigation',{name:'Navegación principal'}).getByRole('button',{name:tab, exact:true});
  await button.click();
  await page.locator(tabs[tab]).first().waitFor({timeout:40000});
  assert.equal(await button.getAttribute('aria-current'),'page');
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
  });
}
