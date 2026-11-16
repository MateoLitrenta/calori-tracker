import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { evidence, go, open, start } from './browser.mjs';

const directory = path.join(evidence, 'coach-flows');
await mkdir(directory, {recursive:true});
const browser = await start();
const results = [];

async function runScenario(width, theme) {
  const {context, page, errors} = await open(browser, width, theme);
  const shot = name => page.screenshot({path:path.join(directory, width + '-' + theme + '-' + name + '.png')});
  const button = name => page.getByRole('button', {name, exact:true});
  const textbox = page.getByRole('textbox', {name:'Mensaje para Coach'});
  const send = async (question, response) => {
    await page.evaluate(reply => { window.__homeQA.nextAI = reply; }, response);
    await textbox.fill(question);
    await button('Enviar mensaje').click();
  };
  const counts = () => page.evaluate(() => {
    const q = window.__homeQA;
    return {calls:q.aiCalls.length, writes:q.writes.length, goals:q.goalWrites.length, external:q.externalRequests};
  });
  try {
    await go(page, 'Coach');
    const today = await page.evaluate(() => window.__homeQA.today);
    const evidenceSummary = page.locator('.chat-proactive-evidence summary');
    await evidenceSummary.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.chat-proactive-evidence').getAttribute('open'), '');
    assert.ok(await page.locator('.chat-proactive-evidence li').count());
    assert.equal(await page.locator('.chat-empty-suggestions button').count(), 3);
    await shot('evidencia');
    await evidenceSummary.click();
    assert.deepEqual(await counts(), {calls:0, writes:0, goals:0, external:0});

    await page.evaluate(() => { window.__homeQA.replyDelayMs = 700; });
    await page.locator('.chat-proactive-action').click();
    await page.getByRole('status', {name:'Coach está respondiendo'}).waitFor();
    await page.locator('.chat-message-bot').getByText('Respuesta sintética de QA').waitFor();
    assert.ok(await page.evaluate(() => window.__homeQA.aiCalls[0].proactiveInsightId));
    await page.evaluate(() => { window.__homeQA.replyDelayMs = 0; });

    // A real local canvas and recorder exercise browser media APIs without device access.
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = async constraints => {
        if (constraints.video) {
          const canvas = document.createElement('canvas');
          canvas.width = 300; canvas.height = 225;
          const drawing = canvas.getContext('2d');
          drawing.fillStyle = '#dac6a6'; drawing.fillRect(0, 0, 300, 225);
          drawing.fillStyle = '#f4eee3'; drawing.beginPath(); drawing.arc(150, 112, 85, 0, 2 * Math.PI); drawing.fill();
          const stream = canvas.captureStream();
          stream.getVideoTracks()[0].requestFrame();
          return stream;
        }
        const audio = new AudioContext();
        const output = audio.createMediaStreamDestination();
        window.__homeQA.closeAudio = () => audio.close();
        return output.stream;
      };
    });
    await button('Adjuntar foto de comida').click();
    const menuItemFocused = name => page.getByRole('menuitem', {name}).evaluate(element => element === document.activeElement);
    assert.ok(await menuItemFocused('Tomar foto'));
    await page.keyboard.press('ArrowDown');
    assert.ok(await menuItemFocused('Elegir de galería'));
    await page.keyboard.press('ArrowUp');
    assert.ok(await menuItemFocused('Tomar foto'));
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('menuitem').count(), 0);
    assert.ok(await button('Iniciar dictado por voz').evaluate(element => element === document.activeElement));
    await button('Adjuntar foto de comida').click();
    await page.keyboard.press('Escape');
    assert.equal(await button('Adjuntar foto de comida').evaluate(element => element === document.activeElement), true);
    await button('Adjuntar foto de comida').click();
    await page.getByRole('menuitem', {name:'Tomar foto'}).click();
    const camera = page.getByRole('dialog', {name:'Tomar foto'});
    await camera.waitFor();
    assert.ok(await camera.evaluate(element => element.matches(':modal') && element.contains(document.activeElement)));
    await camera.getByRole('button', {name:'Capturar'}).click();
    await page.getByAltText('Foto de comida adjunta').waitFor();
    await button('Quitar foto').click();
    await button('Iniciar dictado por voz').click();
    await page.locator('.chat-recording-bar').waitFor();
    await page.locator('.chat-recording-bar').getByRole('button', {name:'Cancelar'}).click();
    await page.evaluate(() => window.__homeQA.closeAudio());
    assert.equal((await counts()).calls, 1);

    const meal = {type:'add_meal', estimated:true, payload:{dateStr:today, name:'Merienda de prueba', type:'Merienda', calories:210, time:'16:20'}};
    await send('Anotá mi merienda de prueba.', {reply:'Revisá tu propuesta.', actions:[meal]});
    const proposal = page.getByRole('region', {name:'Propuesta de registros para revisar'});
    await proposal.waitFor();
    assert.equal((await counts()).writes, 0);
    await proposal.getByRole('button', {name:'Editar'}).click();
    await proposal.getByLabel('Calorías (kcal)').fill('220');
    await shot('editar-propuesta');
    await proposal.getByRole('button', {name:'Confirmar'}).click();
    await page.locator('.chat-saved').getByText('Guardado confirmado').waitFor();
    assert.deepEqual(await page.evaluate(() => {
      const q = window.__homeQA;
      return q.writes.map(({date, owner, record, status}) => ({
        date, owner, status, values:record.meals.filter(m => m.name === 'Merienda de prueba').map(m => m.calories),
      }));
    }), [{date:today, owner:'A', status:'confirmed', values:[220]}]);

    const goal = {operation:'accept', id:'00000000-0000-0000-0000-000000000055', type:'workout_sessions', target:3,
      startDate:today, endDate:today, stepThreshold:null};
    const response = {reply:'Propuesta de objetivo de prueba.', actions:[], goalProposal:goal};
    await send('Quiero un objetivo de entrenamiento.', response);
    await button('Descartar propuesta').click();
    assert.equal((await counts()).goals, 0);
    await send('Proponé el objetivo nuevamente.', response);
    await button('Aceptar objetivo').click();
    await page.waitForFunction(() => window.__homeQA.goalWrites.length === 1);
    await button('Mis objetivos').click();
    const panel = page.getByRole('dialog', {name:'Mis objetivos'});
    await panel.getByRole('button', {name:'Modificar'}).click();
    await panel.getByLabel('Nueva meta (sesiones)').fill('2');
    await panel.getByRole('button', {name:'Revisar cambio'}).click();
    assert.equal((await counts()).goals, 1);
    await shot('objetivo');
    await panel.getByRole('button', {name:'Confirmar modificación'}).click();
    await panel.getByText('Objetivo actualizado.').waitFor();
    await panel.getByRole('button', {name:'Cancelar objetivo'}).click();
    await panel.getByRole('button', {name:'Confirmar cancelación'}).click();
    await panel.getByText('Objetivo cancelado.').waitFor();
    const writes = await page.evaluate(() => window.__homeQA.goalWrites);
    assert.deepEqual(writes.map(w => w.operation), ['accept','update','cancel']);
    assert.ok(writes.every(w => w.owner === 'A'));
    await panel.getByRole('button', {name:'Cerrar formulario'}).click();
    assert.ok(await button('Mis objetivos').evaluate(element => element === document.activeElement));

    await button('Historial').click();
    assert.equal(await page.locator('.chat-history-picker select').inputValue(), today);
    await button('Historial').click();
    await page.evaluate(() => { window.__homeQA.aiError = 429; });
    await send('¿Podemos seguir?', null);
    await page.locator('.chat-messages').getByText(/límite de consultas/).waitFor();
    const toast = page.locator('[data-rht-toaster]').getByText(/límite de consultas/);
    await toast.waitFor();
    const footer = await page.locator('.chat-composer').boundingBox();
    const notice = await toast.boundingBox();
    assert.ok(notice.y + notice.height <= footer.y, 'The quota notice must clear the composer');
    assert.deepEqual(await counts(), {calls:5, writes:1, goals:3, external:0});
    await shot('cuota');
    await page.evaluate(() => { window.__homeQA.aiError = 0; window.__homeQA.switchAccount('B'); });
    await go(page, 'Coach');
    await page.locator('.chat-empty').waitFor();
    assert.equal(await page.locator('.chat-saved, .chat-confirmation').count(), 0);
    assert.equal(await page.locator('.chat-messages').getByText('Revisá tu propuesta.').count(), 0);
    await button('Mis objetivos').click();
    await panel.getByText(/No tenés objetivos aceptados/).waitFor();
    assert.equal(await panel.locator('.coach-goal-card').count(), 0);
    await panel.getByRole('button', {name:'Cerrar formulario'}).click();
    assert.deepEqual(errors, []);
    return {width, theme, ...await counts(), checks:['evidence', 'context', 'typing', 'menu-focus', 'camera-capture-and-remove',
      'cancel-dictation', 'edit-and-confirm-meal', 'dismiss-and-accept-goal', 'modify-and-cancel-goal',
      'dialog-focus-restore', 'history', 'quota', 'account-isolation']};
  } finally {
    await context.close();
  }
}

try {
  for (const [width, theme] of [[375, 'light'], [1440, 'dark']]) {
    results.push(await runScenario(width, theme));
  }
  await writeFile(path.join(directory, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
