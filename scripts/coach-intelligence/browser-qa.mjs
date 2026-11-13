import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fixtures, TODAY } from './fixtures.mjs';

// Run with PLAYWRIGHT_MODULE pointing to an installed playwright package.
// Product dependencies and the real App / Coach / CSS are used. Only external
// services and unrelated screens are replaced at the Vite module boundary.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const phase = process.argv.includes('--before') ? 'before' : 'after';
const review2 = process.argv.includes('--review-2');
const base = review2 ? 'e8c16fc242d567f2fccc31373433e4b05d2be9fc' : '742bd78d553d99f75f604e0b3fdb577829f1253d';
let root = repo;
if (phase === 'before') {
  root = path.resolve(repo, review2 ? '../coach-v10-baseline-review2' : '../coach-v10-baseline');
  mkdirSync(root, { recursive: true });
  if (!existsSync(path.join(root, 'src'))) {
    const archive = path.join(root, 'baseline.tar');
    execFileSync('git', ['archive', '--format=tar', '--output', archive, base, 'src', 'public', 'index.html', 'postcss.config.js', 'tailwind.config.js', 'package.json'], { cwd: repo });
    execFileSync('tar', ['-xf', archive, '-C', root]);
  }
  if (!existsSync(path.join(root, 'node_modules'))) symlinkSync(path.join(repo, 'node_modules'), path.join(root, 'node_modules'), 'junction');
}
const { createServer } = await import(pathToFileURL(path.join(repo, 'node_modules/vite/dist/node/index.js')));
const { default: react } = await import(pathToFileURL(path.join(repo, 'node_modules/@vitejs/plugin-react/dist/index.js')));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const output = path.join(repo, 'docs/evidence/v10-1', ...(review2 ? ['review-2'] : [])); mkdirSync(output, { recursive: true });
// Tailwind v3 resolves content globs from cwd. Bind it to the chosen source
// tree so baseline-only classes cannot be purged using the candidate's files.
process.chdir(root);
console.log(JSON.stringify({ phase, step: 'create-local-server' }));
const external = {
  '/hooks/useAppStore.ts': `import {useSyncExternalStore} from 'react';
    export function useAppStore(){return useSyncExternalStore(cb=>{window.__qa.listeners.add(cb);return()=>window.__qa.listeners.delete(cb)},()=>window.__qa.store);}`,
  '/lib/supabase.ts': `export const supabase={auth:{getSession:async()=>({data:{session:null}})},storage:{from:()=>({createSignedUrl:async()=>({data:null,error:null})})}};`,
  '/services/aiTransport.ts': `export async function requestAI(body){window.__qa.calls.push(body); await new Promise(r=>setTimeout(r,30)); return {reply:'Podemos revisar los registros disponibles y elegir el siguiente paso. Los días sin datos no confirman lo que ocurrió.',actions:[],presentation:'none'};}`,
  '/services/coachGoals.ts': `export class CoachGoalsError extends Error{}; export async function fetchCoachGoals(owner){window.__qa.goalReads++;return {goals:window.__qa.goals,hasMore:false}};export async function confirmCoachGoal(){throw Error('No writes in synthetic QA')}`,
};
const blank = ['HomeView', 'ChartsView', 'ProfileView', 'AuthModal', 'LandingPage', 'Onboarding'];
const entry = `import React from 'react';import{createRoot}from'react-dom/client';
import App from '/src/App.tsx';import{ThemeProvider}from'/src/components/ThemeProvider.tsx';import'/src/index.css';
${phase === 'after' || review2 ? `import{buildCoachContext}from'/src/utils/coachContext.ts';import{buildProactiveInsight}from'/src/utils/coachProactive.ts';window.__qa.expectedInsight=()=>buildProactiveInsight(buildCoachContext(window.__qa.store.activeProfile,${JSON.stringify(TODAY)}),window.__qa.goals);` : ''}
createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,null,React.createElement(App)));`;
const server = await createServer({ root, configFile: false, plugins: [{ name: 'synthetic-coach-boundaries', enforce: 'pre',
  resolveId(id) { if (id === '/__qa_entry.tsx') return '\0qa-entry.tsx'; },
  load(id) {
    if (id === '\0qa-entry.tsx') return entry;
    const clean = id.replaceAll('\\', '/').split('?')[0];
    for (const [suffix, source] of Object.entries(external)) if (clean.endsWith('/src' + suffix)) return source;
    if (blank.some(name => clean.endsWith('/src/components/' + name + '.tsx'))) return 'export default()=>null;';
  },
  configureServer(s) { s.middlewares.use(async (req, res, next) => {
    if (req.url?.split('?')[0] !== '/qa') return next();
    res.setHeader('Content-Type', 'text/html'); res.end(await s.transformIndexHtml('/qa', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/__qa_entry.tsx"></script></body></html>'));
  }); },
}, react()], server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'warn' });
await server.listen();
console.log(JSON.stringify({ phase, step: 'launch-browser' }));
const address = server.httpServer.address(), url = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ channel: process.env.QA_BROWSER_CHANNEL || 'chrome', headless: true });
console.log(JSON.stringify({ phase, step: 'browser-ready' }));
const report = { phase, baseCommit: base, review: review2 ? 2 : 1, localSyntheticOnly: true, productionRequests: 0, geminiCalls: 0, cases: [], issues: [] };
const functionalOnly = process.argv.includes('--functional-only');
const missingOnly = process.argv.includes('--missing-only');
const evidenceOnly = process.argv.includes('--evidence-only');
const screenshotsOnly = process.argv.includes('--screenshots-only');
const selectedScenarios = (process.argv.find(value => value.startsWith('--scenarios='))?.split('=')[1] ?? '').split(',').filter(Boolean);
const selectedWidths = (process.argv.find(value => value.startsWith('--widths='))?.split('=')[1] ?? '').split(',').filter(Boolean).map(Number);
assert.ok(selectedScenarios.every(value => Object.hasOwn(fixtures, value)), 'Only known synthetic scenarios may be selected');
assert.ok(selectedWidths.every(value => Number.isSafeInteger(value) && value > 0), 'Viewport widths must be positive integers');
if (missingOnly && existsSync(path.join(output, `${phase}-browser-report.json`))) {
  const previous = JSON.parse(readFileSync(path.join(output, `${phase}-browser-report.json`), 'utf8'));
  report.cases = previous.cases;
}
if (functionalOnly && existsSync(path.join(output, 'after-browser-report.json'))) {
  const previous = JSON.parse(readFileSync(path.join(output, 'after-browser-report.json'), 'utf8'));
  report.cases = previous.cases.filter(value => !['responsive', 'account-switch', 'data-refresh', 'reopen-conversation'].includes(value.scenario));
}
if (evidenceOnly && existsSync(path.join(output, 'after-browser-report.json'))) report.cases = JSON.parse(readFileSync(path.join(output, 'after-browser-report.json'), 'utf8')).cases;
if (selectedScenarios.length && existsSync(path.join(output, `${phase}-browser-report.json`))) {
  report.cases = JSON.parse(readFileSync(path.join(output, `${phase}-browser-report.json`), 'utf8')).cases.filter(value => !(selectedScenarios.includes(value.scenario) && (!selectedWidths.length || selectedWidths.includes(value.width))));
}
const recordCase = value => {
  report.cases = report.cases.filter(previous => !(previous.scenario === value.scenario && previous.theme === value.theme && previous.width === value.width));
  report.cases.push(value);
};
async function open(scenario, theme, width, height = 900) {
  console.log(JSON.stringify({ phase, step: 'opening', scenario, theme, width }));
  const started = performance.now();
  const context = await browser.newContext({ viewport: { width, height }, timezoneId: 'America/Buenos_Aires', reducedMotion: 'reduce' });
  await context.addInitScript(({ fixture, theme, today }) => {
    const RealDate = Date;
    class FixedDate extends RealDate { constructor(...args) { super(...(args.length ? args : [today + 'T15:00:00Z'])); } static now() { return new RealDate(today + 'T15:00:00Z').getTime(); } }
    window.Date = FixedDate;
    localStorage.setItem('calori-theme', theme);
    const listeners = new Set();
    const qa = { listeners, calls: [], goals: fixture.goals, goalReads: 0, writes: 0 };
    qa.store = { user: { id: fixture.profile.user_id, email: 'synthetic@example.test' }, activeProfile: fixture.profile,
      avatarRevision: 0, loading: false, habitDrafts: {}, signOut: async () => {}, completeOnboarding: async () => {},
      updateRecord: async () => { qa.writes++; throw Error('QA never writes records'); } };
    qa.setFixture = next => { qa.goals = next.goals; qa.store = { ...qa.store, user: { id: next.profile.user_id, email: 'synthetic@example.test' }, activeProfile: next.profile }; listeners.forEach(listener => listener()); };
    window.__qa = qa;
  }, { fixture: fixtures[scenario], theme, today: TODAY });
  await context.route('**/*', route => route.request().url().startsWith(url) ? route.continue() : (report.productionRequests++, route.abort()));
  const page = await context.newPage(); const errors = [];
  page.setDefaultTimeout(60000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url + '/qa', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('button', { name: 'Coach', exact: true }).filter({ visible: true }).click();
  await page.getByRole('textbox', { name: 'Mensaje para Coach' }).waitFor();
  if (phase === 'after' || review2) await page.waitForFunction(expected => document.querySelector('.chat-proactive')?.dataset.insightKind === expected, fixtures[scenario].expected);
  return { page, context, errors, openLatencyMs: Math.round(performance.now() - started) };
}
try {
  const screenshots = functionalOnly || evidenceOnly ? [] : selectedScenarios.length ? selectedScenarios : phase === 'before' ? ['sufficient'] : Object.keys(fixtures);
  for (const scenario of screenshots) {
    const layouts = review2 && scenario === 'sufficient'
      ? [[320, 568], [375, 667], [393, 852], [1440, 900]].flatMap(([width, height]) => ['light', 'dark'].map(theme => [theme, width, height]))
      : [['light', 393, 852], ['dark', 1440, 900], ...(scenario === 'sufficient' ? [['dark', 393, 852], ['light', 1440, 900]] : [])];
    for (const [theme, width, height] of layouts) {
      if (selectedWidths.length && !selectedWidths.includes(width)) continue;
      if (missingOnly && existsSync(path.join(output, `${phase}-${scenario}-${theme}-${width}.png`))) continue;
      const { page, context, errors, openLatencyMs } = await open(scenario, theme, width, height);
      const data = await page.evaluate(() => ({ calls: window.__qa.calls.length, writes: window.__qa.writes,
        scrollWidth: document.documentElement.scrollWidth, width: innerWidth, text: document.querySelector('.assistant-view')?.innerText,
        openingGeometry: (() => {
          const card = document.querySelector('.chat-proactive')?.getBoundingClientRect();
          const empty = document.querySelector('.chat-empty')?.getBoundingClientRect();
          const suggestions = document.querySelector('.chat-empty-suggestions')?.getBoundingClientRect();
          return card && suggestions ? { cardBottom: card.bottom, emptyTop: empty?.top, suggestionsTop: suggestions.top,
            gapToSuggestions: Math.round((suggestions.top - card.bottom) * 100) / 100,
            gapToEmpty: empty ? Math.round((empty.top - card.bottom) * 100) / 100 : null } : null;
        })(),
        composer: (() => { const r = document.querySelector('.chat-composer')?.getBoundingClientRect();return r && { top: r.top, bottom: r.bottom }; })() }));
      assert.equal(data.calls, 0, 'Opening Coach must not call Gemini'); assert.equal(data.writes, 0);
      assert.ok(data.scrollWidth <= width + 1, 'No horizontal page overflow'); assert.deepEqual(errors, []);
      const filename = `${phase}-${scenario}-${theme}-${width}.png`;
      await page.screenshot({ path: path.join(output, filename), fullPage: false });
      if (phase === 'after') {
        assert.equal(await page.locator('.chat-proactive').count(), 1, 'One proactive observation');
        if (review2) {
          assert.notEqual((await page.locator('.chat-proactive-action').innerText()).trim(), 'Revisar juntos', 'Action is specific to its observation');
          if (width < 768) assert.ok(data.openingGeometry?.gapToSuggestions >= 0 && data.openingGeometry.gapToSuggestions <= 24,
            `Opening options sit within 24px of the observation: ${data.openingGeometry?.gapToSuggestions}`);
        }
        await page.getByText('Ver evidencia y límites', { exact: true }).click();
        assert.ok((await page.locator('.chat-proactive-evidence').innerText()).length > 80, 'Evidence and limitations are available');
        const displayedInsight = await page.evaluate(() => window.__qa.expectedInsight());
        const beforeClick = performance.now();
        await page.locator('.chat-proactive-action').click();
        await page.waitForFunction(() => window.__qa.calls.length === 1 && !document.querySelector('[aria-label="Coach está respondiendo"]'));
        const request = await page.evaluate(() => window.__qa.calls[0]);
        assert.ok(request.proactiveInsightId?.startsWith('proactive-v1-'), 'CTA references displayed evidence');
        assert.equal(request.proactiveInsightId, displayedInsight.id, 'CTA sends the exact current observation identifier');
        assert.equal(request.messages.at(-1).text, displayedInsight.prompt, 'CTA sends the selected observation question');
        assert.equal(request.coachContext.profile.name, fixtures[scenario].profile.name);
        assert.equal(request.messages.filter(message => message.role === 'user').length, 1, 'One click starts one contextual request');
        assert.equal(await page.locator('.chat-proactive > details[open]').count(), 0, 'Observation compacts during conversation');
        data.contextualAction = { aiTransportCalls: 1, userSteps: 1, mockResponseLatencyMs: Math.round(performance.now() - beforeClick), reference: request.proactiveInsightId };
      }
      recordCase({ scenario, theme, width, height, openLatencyMs, ...data, errors, screenshot: filename });
      console.log(JSON.stringify({ phase, step: 'case-passed', scenario, theme, width }));
      await context.close();
    }
  }
  if (phase === 'after' && !screenshotsOnly) {
    for (const [width, height] of (evidenceOnly ? [[320, 568]] : [[320, 568], [375, 667], [768, 1024], [1920, 1080]])) {
      const { page, context, errors } = await open('sufficient', 'light', width, height);
      const geometry = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        action: (() => { const r = document.querySelector('.chat-proactive-action').getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height }; })(),
        composer: (() => { const r = document.querySelector('.chat-composer').getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; })() }));
      assert.ok(geometry.scrollWidth <= width + 1, 'No horizontal overflow');
      assert.ok(geometry.action.left >= 0 && geometry.action.right <= width && geometry.action.bottom <= geometry.composer.top, 'Action visible above composer');
      assert.ok(geometry.action.height >= 40, 'CTA touch target'); assert.deepEqual(errors, []);
      const filename = `after-responsive-light-${width}.png`; await page.screenshot({ path: path.join(output, filename) });
      if (width < 400) {
        await page.getByText('Ver evidencia y límites', { exact: true }).click();
        await page.locator('.chat-proactive-action').scrollIntoViewIfNeeded();
        const expanded = await page.evaluate(() => {
          const card = document.querySelector('.chat-proactive'), composer = document.querySelector('.chat-composer').getBoundingClientRect(), action = document.querySelector('.chat-proactive-action').getBoundingClientRect();
          return { actionTop: action.top, actionBottom: action.bottom, composerTop: composer.top,
            cardHeight: card.clientHeight, cardScrollHeight: card.scrollHeight, overflow: getComputedStyle(card).overflowY };
        });
        assert.ok(expanded.actionTop >= 0 && expanded.actionBottom <= expanded.composerTop, 'Expanded evidence keeps CTA reachable above composer');
        assert.equal(expanded.overflow, 'auto'); geometry.expandedEvidence = expanded;
        await page.screenshot({ path: path.join(output, `after-evidence-light-${width}.png`) });
        await page.locator('.chat-proactive').evaluate(card => { card.scrollTop = card.scrollHeight; });
        const limit = await page.evaluate(() => {
          const card = document.querySelector('.chat-proactive').getBoundingClientRect(), element = document.querySelector('.chat-proactive-evidence > p:last-of-type'), text = element.getBoundingClientRect();
          return { text: element.textContent, visibleInsideCard: text.top >= card.top && text.bottom <= card.bottom + 1 };
        });
        assert.ok(limit.visibleInsideCard, 'Full limitation can be read by scrolling the observation');
        await page.screenshot({ path: path.join(output, `after-evidence-scrolled-light-${width}.png`) });
        await page.getByText('Ver evidencia y límites', { exact: true }).click();
        assert.equal(await page.locator('.chat-proactive-evidence[open]').count(), 0);
        await page.locator('.chat-proactive > details > summary').click();
        assert.equal(await page.locator('.chat-proactive > details[open]').count(), 0);
        assert.ok(await page.getByRole('textbox', { name: 'Mensaje para Coach' }).isVisible());
        await page.screenshot({ path: path.join(output, `after-evidence-closed-light-${width}.png`) });
        geometry.fullLimitationReadable = limit; geometry.collapseKeepsComposerVisible = true;
      }
      if (evidenceOnly) report.cases = report.cases.filter(value => !(value.scenario === 'responsive' && value.width === width));
      recordCase({ scenario: 'responsive', width, height, geometry, screenshot: filename }); await context.close();
    }
    if (!evidenceOnly) {
    const { page, context } = await open('sufficient', 'light', 393, 852);
    await page.locator('.chat-proactive-action').click();
    await page.waitForFunction(() => window.__qa.calls.length === 1 && !document.querySelector('[aria-label="Coach está respondiendo"]'));
    await page.screenshot({ path: path.join(output, 'after-contextual-conversation-light-393.png') });
    await page.evaluate(fixture => window.__qa.setFixture(fixture), fixtures.steps);
    await page.waitForSelector('.app-shell:not(.app-shell-coach)');
    await page.getByRole('button', { name: 'Coach', exact: true }).filter({ visible: true }).click();
    await page.waitForFunction(() => document.querySelector('.chat-proactive')?.dataset.insightKind === 'steps');
    assert.equal(await page.evaluate(() => window.__qa.calls.length), 1, 'Account switch does not call AI');
    assert.doesNotMatch(await page.locator('.assistant-view').innerText(), /Fútbol|Gimnasio/);
    await page.locator('.chat-proactive-action').click();
    await page.waitForFunction(() => window.__qa.calls.length === 2);
    const second = await page.evaluate(() => window.__qa.calls[1]);
    assert.equal(second.coachContext.profile.name, 'Ana');
    assert.ok(second.coachContext.historyDays.every(day => day.workoutCount === 0));
    assert.equal(second.messages.filter(message => message.role === 'user').length, 1);
    recordCase({ scenario: 'account-switch', status: 'passed', autoAICalls: 0, contextualCalls: 2, secondAccount: 'steps-only' });
    await context.close();
    const changed = await open('incomplete', 'light', 393, 852);
    const originalSuggestions = await changed.page.locator('.chat-empty-suggestions').innerText();
    const modified = structuredClone(fixtures.sufficient);
    modified.profile = { ...modified.profile, id: fixtures.incomplete.profile.id, user_id: fixtures.incomplete.profile.user_id };
    await changed.page.evaluate(fixture => window.__qa.setFixture(fixture), modified);
    await changed.page.waitForFunction(() => document.querySelector('.chat-proactive')?.dataset.insightKind === 'training');
    assert.notEqual(await changed.page.locator('.chat-empty-suggestions').innerText(), originalSuggestions, 'Suggestions change with data');
    assert.equal(await changed.page.evaluate(() => window.__qa.calls.length), 0);
    recordCase({ scenario: 'data-refresh', status: 'passed', autoAICalls: 0, suggestionsChanged: true });
    await changed.context.close();
    const reopened = await open('incomplete', 'dark', 393, 852);
    await reopened.page.locator('.chat-proactive-action').click();
    await reopened.page.waitForFunction(() => window.__qa.calls.length === 1 && !document.querySelector('[aria-label="Coach está respondiendo"]'));
    // App canonicalizes its URL to /app. Re-enter the isolated QA entry at the
    // same origin so stored chat survives without loading production main.tsx.
    await reopened.page.goto(url + '/qa', { waitUntil: 'domcontentloaded' });
    await reopened.page.getByRole('button', { name: 'Coach', exact: true }).filter({ visible: true }).click();
    await reopened.page.getByRole('textbox', { name: 'Mensaje para Coach' }).waitFor();
    assert.equal(await reopened.page.locator('.chat-proactive > details[open]').count(), 1, 'Reopening shows current observation beside stored conversation');
    assert.equal(await reopened.page.evaluate(() => window.__qa.calls.length), 0, 'Reopening does not call AI');
    assert.ok(await reopened.page.locator('.chat-message').count() > 0, 'Stored conversation remains');
    recordCase({ scenario: 'reopen-conversation', status: 'passed', autoAICalls: 0 });
    await reopened.context.close();
    }
  }
  writeFileSync(path.join(output, `${phase}-browser-report.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ phase, screenshots: report.cases.filter(value => value.screenshot).length, productionRequests: report.productionRequests, casesPassed: report.cases.length }));
} catch (error) {
  report.issues.push(String(error.stack || error));
  writeFileSync(path.join(output, `${phase}-browser-report.json`), JSON.stringify(report, null, 2));
  throw error;
} finally { await browser.close(); await server.close(); }
