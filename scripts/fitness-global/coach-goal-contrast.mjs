import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { go, open, repo, start } from './browser.mjs';

const folder = path.join(repo, 'docs/evidence/coach-noviembre/acciones');
const failures = [];
await mkdir(folder, { recursive: true });

function luminance(rgb) {
  const channels = rgb.match(/\d+/g).map(value => Number(value) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

async function checkAction(page, theme, label, file) {
  const action = page.getByRole('button', { name: label, exact: true });
  await action.focus();
  const colors = await action.evaluate(button => {
    const style = getComputedStyle(button);
    const tokenColor = name => {
      const probe = document.createElement('span');
      probe.style.color = 'var(' + name + ')';
      button.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    };
    return { ink: style.color, fill: style.backgroundColor,
      expectedInk: tokenColor('--fit-on-orange'), expectedFill: tokenColor('--fit-orange') };
  });
  const [low, high] = [luminance(colors.ink), luminance(colors.fill)].sort((a,b) => a-b);
  const ratio = (high + 0.05) / (low + 0.05);
  console.log(theme, label, colors.ink, colors.fill, ratio.toFixed(2));
  if (colors.ink !== colors.expectedInk || colors.fill !== colors.expectedFill || ratio < 4.5)
    failures.push(theme + ' · ' + label);
  await page.screenshot({ path: path.join(folder, theme + '-' + file + '.jpg'), quality: 86 });
}

async function checkHeader(page, width) {
  await page.setViewportSize({ width, height: 1024 });
  const heading = page.locator('.chat-heading');
  const title = await heading.getByRole('heading', { name: 'Coach' }).boundingBox();
  const bounds = await heading.boundingBox();
  const navigation = page.getByRole('navigation', { name: 'Navegación principal' });
  const sidebar = await navigation.boundingBox();
  assert.ok(sidebar && sidebar.x + sidebar.width <= bounds.x + 1, 'Sidebar visible beside Coach');
  let right = bounds.x;
  for (const name of ['Mis objetivos', 'Historial', 'Nueva conversación']) {
    const action = heading.getByRole('button', { name, exact: true });
    await action.focus();
    const box = await action.boundingBox();
    const reachable = await action.evaluate(button => {
      const rect = button.getBoundingClientRect();
      return button === document.activeElement && button.contains(document.elementFromPoint(rect.x + rect.width/2, rect.y + rect.height/2));
    });
    assert.ok(box && box.width >= 44 && box.height >= 44 && reachable);
    const label = await action.locator('span').boundingBox();
    if (box.x < right - 1 || !label || label.x < box.x - 1 || label.x + label.width > box.x + box.width + 1
        || box.x + box.width > bounds.x + bounds.width + 1) failures.push(width + ' px · ' + name);
    right = box.x + box.width;
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const titleRight = await heading.locator('h1').evaluate(el => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return range.getBoundingClientRect().right;
  });
  const first = await heading.getByRole('button').first().boundingBox();
  console.log(width, 'header width', bounds.width, 'title text ends', titleRight, 'actions start', first.x, 'end', right, 'overflow', overflow);
  const sameRow = first.y < title.y + title.height && first.y + first.height > title.y;
  if ((sameRow && titleRight > first.x + 1) || overflow > 0) failures.push(width + ' px · título o desplazamiento');
}

const browser = await start();
try {
  for (const theme of ['dark', 'light']) {
    const { page, context, errors } = await open(browser, 768, theme);
    try {
      await go(page, 'Coach');
      for (const width of [768, 820, 900]) {
        await checkHeader(page, width);
        if (theme === 'light') await page.locator('.chat-heading').screenshot({ path: path.join(folder, 'encabezado-' + width + '.png') });
      }
      const button = name => page.getByRole('button', { name, exact: true });
      await page.evaluate(() => {
        const qa = window.__homeQA;
        qa.nextAI = { reply: 'Objetivo de prueba.', actions: [], goalProposal: {
          operation: 'accept', id: '00000000-0000-4000-8000-000000000055', type: 'workout_sessions',
          target: 3, startDate: qa.today, endDate: qa.today, stepThreshold: null } };
      });
      await page.getByRole('textbox', { name: 'Mensaje para Coach' }).fill('Quiero registrar tres entrenamientos.');
      await button('Enviar mensaje').click();
      await checkAction(page, theme, 'Aceptar objetivo', 'aceptar');
      const writes = () => page.evaluate(() => window.__homeQA.goalWrites.map(write => write.operation));
      assert.deepEqual(await writes(), []);
      await button('Aceptar objetivo').press('Enter');
      await page.waitForFunction(() => window.__homeQA.goalWrites.length === 1);
      await button('Mis objetivos').click();
      await button('Editar objetivo').click();
      await page.getByLabel('Nueva meta (sesiones)').fill('4');
      await checkAction(page, theme, 'Revisar cambio', 'revisar');
      await button('Revisar cambio').press('Enter');
      await checkAction(page, theme, 'Confirmar modificación', 'modificar');
      assert.deepEqual(await writes(), ['accept']);
      await button('Confirmar modificación').press('Enter');
      await page.getByText('Objetivo actualizado.', { exact: true }).waitFor();
      await button('Cancelar objetivo').click();
      await checkAction(page, theme, 'Confirmar cancelación', 'cancelar');
      assert.deepEqual(await writes(), ['accept', 'update']);
      await button('Confirmar cancelación').press('Enter');
      await page.getByText('Objetivo cancelado.', { exact: true }).waitFor();
      assert.deepEqual(await writes(), ['accept', 'update', 'cancel']);
      await button('Cerrar formulario').click();
      assert.ok(await button('Mis objetivos').evaluate(el => el === document.activeElement));
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  assert.deepEqual(failures, [], 'Goal action colors and header geometry');
} finally { await browser.close(); }
