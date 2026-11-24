import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { evidence, go, open, start } from './browser.mjs';

const output = path.join(evidence, 'views-flows');
await mkdir(output, { recursive: true });
const browser = await start();
const runs = [];

async function capture(page, panel, filename, includeToast = false) {
  await panel.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.mouse.move(0, 0);
  await page.evaluate(() => new Promise(done => requestAnimationFrame(done)));
  const subject = includeToast ? page : panel;
  await subject.screenshot({ path: path.join(output, filename + '.jpg'), quality: 85 });
}

async function charts(page, theme) {
  await go(page, 'Datos');
  const picker = page.getByRole('group', { name: 'Período', exact: true });
  const detail = page.locator('#charts-bucket-detail');
  for (const period of ['Semana', 'Mes', 'Año']) {
    await picker.getByRole('button', { name: period }).click();
    const bars = page.locator('.charts-bucket');
    const clipped = await page.locator('.charts-plot-scroll').evaluate(el => el.scrollWidth > el.clientWidth);
    if (clipped && period === 'Semana') assert.ok(await page.locator('.charts-scroll-hint[data-overflow=true]').isVisible());
    if (clipped && period === 'Año') assert.ok(await page.locator('.charts-year-navigation .charts-scroll-hint').isVisible());
    const values = bars.filter({ has: page.locator('.charts-bar-consumed') });
    const first = values.first();
    await first.focus();
    assert.equal(await first.getAttribute('aria-pressed'), 'false');
    await first.press('Enter');
    assert.equal(await first.getAttribute('aria-pressed'), 'true');
    const label = await first.getAttribute('aria-label');
    const totals = await detail.locator('dd').allTextContents();
    assert.equal(totals.length, 3);
    for (const total of totals) assert.ok(label.includes(total), label + ' / ' + total);
    await page.keyboard.press('Escape');
    assert.equal(await detail.getAttribute('data-selected'), 'false');
    await first.click();
    if (period === 'Mes') {
      await capture(page, page.locator('.charts-energy'), 'grafico-mes-' + theme);
    }
    await detail.getByRole('button', { name: 'Quitar selección del gráfico' }).click();
    assert.equal(await detail.getAttribute('data-selected'), 'false');
    const targets = await bars.evaluateAll(items => items.map(item => item.getBoundingClientRect().width));
    assert.ok(targets.every(width => width >= 44), targets);
  }
  const methodology = page.locator('.charts-method');
  await methodology.locator('summary').focus();
  await page.keyboard.press('Enter');
  assert.ok(await methodology.locator('.charts-coverage').isVisible());
  assert.ok(await methodology.locator('.charts-insight').isVisible());
  await methodology.locator('summary').press('Enter');
}

async function profile(page, theme) {
  await go(page, 'Perfil');
  const original = await page.evaluate(() => JSON.stringify(window.__homeQA.store.activeProfile.records));
  const danger = page.locator('.profile-management');
  await danger.locator('summary').click();
  await danger.getByRole('button', { name: 'Borrar todos los registros' }).click();
  await danger.getByRole('button', { name: 'Cancelar' }).click();
  assert.equal(await danger.getByRole('button', { name: 'Borrar registros' }).count(), 0);

  const panel = page.locator('.profile-account-panel');
  await panel.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await panel.getByLabel('Nueva contraseña', { exact: true }).fill('fixture-healthy-01');
  await panel.getByLabel('Repetir nueva contraseña').fill('fixture-mismatch');
  await panel.getByRole('button', { name: 'Guardar contraseña' }).click();
  await page.getByText('Las contraseñas no coinciden.').waitFor();
  assert.deepEqual(await page.evaluate(() => window.__homeQA.authEvents), []);
  await panel.getByLabel('Repetir nueva contraseña').fill('fixture-healthy-01');
  await page.evaluate(() => { window.__homeQA.authError = true; });
  await panel.getByRole('button', { name: 'Guardar contraseña' }).click();
  await page.getByText('No pudimos actualizar la contraseña. Intentá nuevamente.').waitFor();
  await capture(page, panel, 'seguridad-' + theme, true);
  await page.evaluate(() => { window.__homeQA.authError = false; });
  await panel.getByRole('button', { name: 'Guardar contraseña' }).click();
  await panel.getByRole('button', { name: 'Cambiar contraseña' }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.__homeQA.authEvents), ['password-update', 'password-update']);

  const upload = page.getByLabel('Elegir foto de perfil');
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 80;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#bd7848';
    ctx.fillRect(0, 0, 80, 80);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const file = { name: 'avatar-qa.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') };
  const photo = page.locator('.profile-photo-actions');
  await upload.setInputFiles(file);
  await page.getByAltText('Vista previa de la foto de perfil').waitFor();
  await photo.getByRole('button', { name: 'Cancelar foto' }).click();
  assert.equal(await page.evaluate(() => window.__homeQA.files.size), 0);
  await upload.setInputFiles(file);
  await photo.getByRole('button', { name: 'Guardar foto', exact: true }).click();
  const avatar = page.locator('.profile-identity img[alt="Foto de perfil"]');
  await avatar.waitFor();
  await avatar.evaluate(img => img.decode());
  assert.equal(await page.evaluate(() => window.__homeQA.files.size), 1);
  await photo.getByRole('button', { name: 'Eliminar foto' }).click();
  await page.waitForFunction(() => !window.__homeQA.store.activeProfile.avatar_path && window.__homeQA.files.size === 0);
  assert.equal(await page.evaluate(() => JSON.stringify(window.__homeQA.store.activeProfile.records)), original);
}

try {
  for (const theme of ['light', 'dark']) {
    const { context, page, errors } = await open(browser, 393, theme);
    try {
      await charts(page, theme);
      await profile(page, theme);
      assert.deepEqual(errors, []);
      const counters = await page.evaluate(() => ({ requests: window.__homeQA.externalRequests, ai: window.__homeQA.aiCalls.length }));
      assert.deepEqual(counters, { requests: 0, ai: 0 });
      runs.push({ theme, width: 393, result: 'passed', counters });
    } finally {
      await context.close();
    }
  }
  await writeFile(path.join(output, 'checks.json'), JSON.stringify({
    scope: 'Chromium local. Datos y Perfil reales. Auth, Storage y persistencia simulados.',
    checks: ['Semana/Mes/Año con foco, detalle exacto, Escape y deselección', 'Metodología y cobertura por teclado',
      'Objetivo táctil >= 44 px en barras', 'Cancelación de borrado', 'Contraseñas distintas, error y reintento',
      'Previsualización, cancelación, guardado y eliminación de foto sintética', 'Registros intactos y cero llamadas externas'],
    runs,
  }, null, 2) + '\n');
  console.log(JSON.stringify(runs));
} finally {
  await browser.close();
}
