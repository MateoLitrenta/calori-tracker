import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { go, heights, open, repo, start } from './browser.mjs';

const reference = process.argv.includes('--reference');
const directory = path.join(repo, 'docs/evidence/ux-stage3', reference ? 'before' : 'after');
await mkdir(directory, { recursive: true });
const browser = await start();
const results = [];
const origin = 'http://127.0.0.1:5194';
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const shot = (page, name) => page.screenshot({ path: path.join(directory, name + '.jpg'), quality: 86 });
const button = (page, name) => page.getByRole('button', { name, exact: true });
const measure = page => page.evaluate(() => {
  const log = document.querySelector('.chat-messages');
  const observation = document.querySelector('.chat-proactive');
  const footer = document.querySelector('.chat-composer').getBoundingClientRect();
  const suggestions = document.querySelector('.chat-composer-suggestions');
  return { reader: log.clientHeight, top: log.scrollTop, end: log.scrollHeight - log.clientHeight,
    kind: observation?.dataset.insightKind ?? null, observation: observation?.offsetHeight ?? 0,
    expanded: observation?.querySelector('details')?.open ?? false,
    footerVisible: footer.top >= 0 && footer.bottom <= innerHeight + 1,
    suggestionsWidth: suggestions?.clientWidth ?? 0, suggestionsScroll: suggestions?.scrollWidth ?? 0,
    hasOverflow: document.documentElement.scrollWidth > innerWidth };
});

async function seed(page, withGoalReply = false) {
  return page.evaluate(withGoalReply => {
    const qa = window.__homeQA;
    const day = qa.today;
    const user = qa.store.user.id;
    const previous = new Date(day + 'T12:00:00');
    previous.setDate(previous.getDate() - 1);
    const yesterday = previous.toLocaleDateString('en-CA');
    qa.goals[qa.account] = [{
      id: '00000000-0000-4000-8000-000000000043', type: 'workout_sessions', target: 12, startDate: day,
      endDate: day, status: 'active', version: 1, updatedAt: day + 'T12:00:00Z', createdAt: day + 'T12:00:00Z',
    }];
    qa.goalsGate = new Promise(resolve => { qa.releaseGoals = resolve; });
    localStorage.setItem('calori:assistant:messages:' + user + ':' + day, JSON.stringify(Array.from({ length: 12 }, (_, i) => {
      const id = 'synthetic-' + i;
      if (withGoalReply && i === 11) return { id, role: 'bot', goalProgress: 'all',
        text: 'Tenés 2 de 12 entrenamientos registrados. Podemos pensar el próximo paso con tus registros.' };
      return { id, role: i % 2 ? 'bot' : 'user', text: 'Mensaje sintético ' + i + '.\n\n' +
        'Una respuesta extensa con datos de prueba y texto legible. '.repeat(i % 2 ? 18 : 1) };
    })));
    localStorage.setItem('calori:assistant:messages:' + user + ':' + yesterday,
      JSON.stringify([{ id: 'past', role: 'bot', text: 'Conversación histórica sintética.' }]));
    return yesterday;
  }, withGoalReply);
}
async function checkCounters(page, ai = 0) {
  assert.deepEqual(await page.evaluate(() => {
    const q = window.__homeQA;
    return [q.aiCalls.length, q.writes.length, q.goalWrites.length, q.externalRequests];
  }), [ai, 0, 0, 0]);
}
async function matrix(width, theme) {
  const { context, page, errors } = await open(browser, width, theme, theme, origin);
  try {
    await seed(page);
    await go(page, 'Coach');
    await settle(page);
    const loading = await measure(page);
    if (width === 375 && theme === 'dark') await shot(page, '375-dark-loading');
    await page.evaluate(() => window.__homeQA.releaseGoals());
    await page.locator('.chat-proactive[data-insight-kind="goal"]').waitFor();
    await settle(page);
    const restored = await measure(page);
    assert.equal(await page.locator('.chat-message').count(), 12);
    assert.ok(restored.footerVisible && !restored.hasOverflow);
    if ([375, 1440].includes(width)) await shot(page, width + '-' + theme + '-existing');
    await page.locator('.chat-messages').evaluate(log => { log.scrollTop = 120; });
    await settle(page);
    await page.locator('.chat-textarea').focus();
    await settle(page);
    const focus = await measure(page);
    if (!reference) {
      assert.equal(loading.kind, null);
      assert.equal(restored.expanded, false);
      assert.equal(restored.reader, loading.reader);
      assert.ok(restored.observation <= 48);
      assert.ok(Math.abs(focus.top - 120) <= 2);
      const summary = page.locator('.chat-proactive-heading');
      await summary.focus();
      await page.keyboard.press('Enter');
      await page.locator('.chat-proactive-evidence summary').focus();
      await page.keyboard.press('Enter');
      assert.ok(await page.locator('.chat-proactive-evidence li').first().isVisible());
      assert.ok(Math.abs((await measure(page)).top - 120) <= 2);
      await summary.press('Enter');
      const suggestions = page.locator('.chat-composer-suggestions');
      await suggestions.locator('summary').press('Enter');
      const list = suggestions.locator('.chat-suggestion-list');
      assert.ok(await list.evaluate(e => e.scrollWidth <= e.clientWidth + 1));
      assert.ok(await list.getByRole('button').count());
      assert.ok((await measure(page)).footerVisible);
      if (width === 375 && theme === 'dark') await shot(page, '375-dark-suggestions');
      await suggestions.locator('summary').press('Enter');
    } else if (width === 375) {
      assert.ok(loading.kind && loading.kind !== restored.kind && restored.expanded);
      assert.ok(focus.top > 120);
    }
    await checkCounters(page);
    assert.deepEqual(errors, []);
    return { width, theme, loading, restored, focus, messages: 12, newCalls: 0 };
  } finally {
    await context.close();
  }
}

async function flows() {
  const { context, page, errors } = await open(browser, 375, 'system', 'light', origin);
  try {
    const yesterday = await seed(page);
    await page.evaluate(() => { window.__homeQA.goalError = 503; });
    await go(page, 'Coach');
    await page.evaluate(() => window.__homeQA.releaseGoals());
    const observation = page.locator('.chat-proactive');
    await observation.locator('.chat-proactive-heading').click();
    await observation.getByText('No pude consultar tus objetivos. Esta observación usa tus registros.').waitFor();
    await page.evaluate(() => { window.__homeQA.goalError = 0; });
    await button(page, 'Reintentar consulta de objetivos').click();
    await page.locator('.chat-proactive[data-insight-kind="goal"]').waitFor();
    await observation.locator('.chat-proactive-heading').click();
    await checkCounters(page);
    await page.evaluate(() => {
      const qa = window.__homeQA;
      qa.goalsGate = new Promise(resolve => { qa.releaseGoals = resolve; });
      window.dispatchEvent(new Event('focus'));
    });
    await page.waitForFunction(() => document.querySelector('.chat-proactive-action')?.disabled);
    assert.equal((await measure(page)).kind, 'goal');
    await page.evaluate(() => window.__homeQA.releaseGoals());
    await page.waitForFunction(() => !document.querySelector('.chat-proactive-action')?.disabled);

    const log = page.locator('.chat-messages');
    const place = async top => { await log.evaluate((e, value) => { e.scrollTop = value; }, top); await settle(page); };
    await place(120);
    await page.emulateMedia({ colorScheme: 'dark' });
    await settle(page);
    assert.ok(await page.locator('html').evaluate(e => e.classList.contains('dark')));
    assert.ok(Math.abs((await measure(page)).top - 120) <= 2);
    await go(page, 'Inicio');
    await go(page, 'Coach');
    await settle(page);
    assert.ok(Math.abs((await measure(page)).top - 120) <= 2);
    await button(page, 'Historial').click();
    await page.locator('.chat-history-picker select').selectOption(yesterday);
    await page.getByText('Conversación histórica sintética.').waitFor();
    assert.equal(await page.locator('.chat-composer').count(), 0);
    await button(page, 'Volver a hoy').click();
    await settle(page);
    assert.ok(Math.abs((await measure(page)).top - 120) <= 2);

    const suggestions = page.locator('.chat-composer-suggestions');
    await suggestions.locator('summary').press('Enter');
    const suggestion = suggestions.getByRole('button').first();
    const fullPrompt = await suggestion.getAttribute('aria-description');
    assert.ok(fullPrompt.length > (await suggestion.textContent()).length);
    await page.evaluate(() => {
      const qa = window.__homeQA;
      qa.replyDelayMs = 650;
      qa.nextAI = { reply: 'Respuesta tardía sintética.\n\n' + 'Texto completo que debe quedar accesible. '.repeat(100), actions: [] };
    });
    await suggestion.click();
    await page.getByRole('status', { name: 'Coach está respondiendo' }).waitFor();
    await place(150);
    await page.getByText('Respuesta tardía sintética.').waitFor();
    const completeText = await page.locator('.chat-message-bot').last().innerText();
    assert.equal(completeText.split('Texto completo que debe quedar accesible.').length - 1, 100);
    assert.ok(Math.abs((await measure(page)).top - 150) <= 2);
    assert.equal(await page.evaluate(() => window.__homeQA.aiCalls[0].messages.at(-1).text), fullPrompt);
    await page.evaluate(() => { window.__homeQA.aiError = 503; window.__homeQA.replyDelayMs = 0; });
    const input = page.getByRole('textbox', { name: 'Mensaje para Coach' });
    await input.fill('Consulta sintética para reintento');
    await button(page, 'Enviar mensaje').click();
    await page.locator('.chat-message-bot').filter({ hasText: '❌' }).last().waitFor();
    await page.evaluate(() => { window.__homeQA.aiError = 0; });
    await input.fill('Consulta sintética para reintento');
    await button(page, 'Enviar mensaje').click();
    await page.getByText('Respuesta sintética de QA', { exact: true }).waitFor();
    await settle(page);
    const last = await measure(page);
    assert.ok(last.end - last.top <= 24);
    await checkCounters(page, 3);
    await button(page, 'Nueva conversación').click();
    assert.equal(await page.locator('.chat-message').count(), 0);
    assert.ok((await measure(page)).expanded);
    await checkCounters(page, 3);
    assert.deepEqual(errors, []);
    return { errorAndRetry: true, goalRefresh: true, delayedReplyAnchor: true, completeText: true,
      system: true, navigation: true, exactSuggestion: true, newConversation: true, simulatedCalls: 3 };
  } finally {
    await context.close();
  }
}

async function structured() {
  const { page, context, errors } = await open(browser, 375, 'dark', 'dark', origin);
  try {
    await seed(page, true);
    await go(page, 'Coach');
    await page.evaluate(() => window.__homeQA.releaseGoals());
    const stack = page.locator('.chat-coach-stack');
    await stack.locator('.coach-goal-count').getByText('2/12', { exact: true }).waitFor();
    assert.match(await stack.locator('.chat-markdown').innerText(), /Tenés 2 de 12 entrenamientos registrados/);
    assert.equal(await page.locator('.chat-message').count(), 12);
    assert.equal((await measure(page)).expanded, reference);
    await settle(page);
    await shot(page, '375-dark-goal-reply');
    await checkCounters(page);
    assert.deepEqual(errors, []);
    console.log('Structured reply and full text verified');
  } finally {
    await context.close();
  }
}

try {
  if (!process.argv.includes('--structured-only')) {
    for (const width of Object.keys(heights).map(Number)) {
      for (const theme of ['light', 'dark']) {
        results.push(await matrix(width, theme));
        await writeFile(path.join(directory, 'matrix.json'), JSON.stringify(results, null, 2) + '\n');
        console.log(width, theme, 'verified');
      }
    }
    if (!reference) await writeFile(path.join(directory, 'flows.json'), JSON.stringify(await flows(), null, 2) + '\n');
  }
  await structured();
} finally {
  await browser.close();
}
