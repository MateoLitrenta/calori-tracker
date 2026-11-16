import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getCaloriesIngested, calculateDailyExpenditure } from '../../src/utils/helpers.ts';
// Automated product tests in disposable headless Chrome. No user browser,
// profile, session or remote service is used. Only the local fixture server.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const browserModule = process.env.PLAYWRIGHT_MODULE || path.resolve(repo, '../qa-tools/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(browserModule));
const fitness = process.argv.includes('--fitness');
const origin = process.env.HOME_QA_URL || (fitness ? 'http://127.0.0.1:5192' : 'http://127.0.0.1:5184');
assert.equal(new URL(origin).hostname, '127.0.0.1', 'Journey tests only target the local synthetic fixture');
const output = path.resolve(repo, fitness ? 'docs/evidence/fitness-moderno/journeys' : 'docs/evidence/v10-1-1-refinement');
mkdirSync(output, {
    recursive: true
});
const today = '2026-11-13', yesterday = '2026-11-12';
const browser = await chromium.launch({
    channel: process.env.QA_BROWSER_CHANNEL || 'chrome', headless: true
});
const report = {
    dateUTC: new Date().toISOString(), source: 'App and Home sources with synthetic Auth/writer/Storage/AI boundaries', browser: 'Chrome headless, disposable contexts', localOnly: true, remoteServicesCertified: false, blockedExternalRequests: [], cases: []
};
const chosen = (process.argv.find(arg => arg.startsWith('--scenarios='))?.split('=')[1] || '').split(',').filter(Boolean);
const sanitizeError = error => String(error?.message || error).replaceAll(repo, '<repository>').split('\n    at ')[0];
const saveReport = () => writeFileSync(path.join(output, 'journeys.json'), JSON.stringify(report, null, 2) + '\n');
const activeDate = page => page.locator('.home-date-context time').getAttribute('datetime');
const snapshots = page => page.evaluate(() => ({
    date: document.querySelector('.home-date-context time')?.getAttribute('datetime'),
    dailyDate: document.querySelector('.daily-active-date')?.getAttribute('datetime'),
    mainScroll: document.querySelector('.app-main')?.scrollTop ?? 0, width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    aiCalls: window.__homeQA.aiCalls.length, externalRequests: window.__homeQA.externalRequests,
    writes: window.__homeQA.writes.map(write => ({
        owner: write.owner, date: write.date, status: write.status
    })),
    profile: window.__homeQA.store.activeProfile
}));
async function selected(page, date) {
    await page.waitForFunction(expected => document.querySelector('.home-date-context time')?.getAttribute('datetime') === expected, date);
    assert.equal(await page.locator('.daily-active-date').getAttribute('datetime'), date);
}
async function runCase(scenario, label, width, flow) {
    if (chosen.length && !chosen.includes(scenario))
        return;
    const context = await browser.newContext({
        viewport: {
            width, height: width === 320 ? 568 : width >= 768 ? 1000 : 852
        }, timezoneId: 'America/Buenos_Aires', reducedMotion: 'reduce'
    });
    await context.route('**/*', route => {
        const url = route.request().url();
        if (url.startsWith(origin + '/'))
            return route.continue();
        report.blockedExternalRequests.push(url.split('?')[0]);
        return route.abort();
    });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => errors.push(sanitizeError(error)));
    page.on('console', message => {
        if (message.type() === 'error')
            errors.push(sanitizeError(message.text()));
    });
    const actions = [], shots = [];
    let priorScroll = 0, scrollDistance = 0;
    const record = async (kind, label) => {
        const scroll = await page.locator('.app-main').evaluate(el => el.scrollTop);
        scrollDistance += Math.abs(scroll - priorScroll);
        priorScroll = scroll;
        actions.push({
            kind, label, mainScroll: Math.round(scroll)
        });
    };
    const t = {
        page, actions, shots,
        click: async (label, locator) => {
            await locator.click();
            await record('click', label);
        },
        fill: async (label, locator, value) => {
            await locator.fill(value);
            await record('field-edit', label);
        },
        press: async (label, locator, key) => {
            await locator.press(key);
            await record('key', label);
        },
        shot: async (name) => {
            const file = `journey-${name}-${width}-light.png`;
            await page.screenshot({
                path: path.join(output, file), fullPage: false
            });
            shots.push(file);
        },
        select: async (date) => {
            await t.click('Elegir ' + date, page.locator(`[data-day="${date}"]`));
            await selected(page, date);
        },
        submit: async () => {
            await t.click('Guardar registro', page.locator('.entry-form button[type="submit"]:visible').last());
        },
    };
    const started = performance.now();
    try {
        await page.goto(origin + '/qa?controls=0&theme=light&reset=1', {
            waitUntil: 'networkidle'
        });
        await page.locator('.home-date-nav').waitFor();
        await selected(page, today);
        const before = await snapshots(page);
        const details = await flow(t);
        const after = await snapshots(page);
        assert.deepEqual(errors, [], 'No application page errors');
        assert.equal(after.externalRequests, 0);
        assert.equal(after.aiCalls, 0, 'No AI requests without an explicit AI action');
        assert.equal(after.scrollWidth <= width + 1, true, 'No horizontal document overflow');
        report.cases.push({
            scenario, label, width, status: 'passed', actions, clicks: actions.filter(action => action.kind === 'click').length, fieldEdits: actions.filter(action => action.kind === 'field-edit').length, keyActions: actions.filter(action => action.kind === 'key').length,
            observedMainScrollChangePx: Math.round(scrollDistance), durationMs: Math.round(performance.now() - started), before: {
                date: before.date, writes: before.writes.length
            }, after: {
                date: after.date, writes: after.writes, aiCalls: after.aiCalls, externalRequests: after.externalRequests
            }, details, screenshots: shots
        });
        console.log(JSON.stringify({
            scenario, label, width, status: 'passed'
        }));
    }
    catch (error) {
        const file = `journey-failed-${scenario}-${width}.png`;
        await page.screenshot({
            path: path.join(output, file)
        }).catch(() => {
        });
        report.cases.push({
            scenario, label, width, status: 'failed', actions, error: sanitizeError(error), pageErrors: errors, screenshot: file
        });
        console.log(JSON.stringify({
            scenario, label, width, status: 'failed', message: sanitizeError(error)
        }));
    }
    finally {
        saveReport();
        await context.close();
    }
}
async function fillMeal(t, name, calories) {
    await t.fill('Descripción', t.page.locator('#add-meal-description'), name);
    await t.fill('Calorías', t.page.locator('#add-meal-calories'), String(calories));
    await t.fill('Hora', t.page.locator('#add-meal-time'), '17:30');
}
async function waitWrites(page, count) {
    await page.waitForFunction(expected => window.__homeQA.writes.filter(write => write.status === 'confirmed').length === expected, count);
}
try {
    await runCase('A', 'Comprender balance de Hoy', 393, async (t) => {
        const s = await snapshots(t.page), r = s.profile.records[today];
        const consumed = getCaloriesIngested(r), expenditure = calculateDailyExpenditure(s.profile, r), balance = Math.round(consumed - expenditure);
        const card = (await t.page.locator('.energy-card').innerText()).replaceAll('−', '-');
        for (const value of [consumed, expenditure, balance])
            assert.ok(card.includes(value.toLocaleString('es-AR')), 'Canonical energy value is visible: ' + value);
        assert.match(card, /estimado|estimación/i);
        assert.match(card, /registros|comidas|consumidas/i);
        return {
            consumed, estimatedExpenditure: expenditure, balance, stepsToRead: 0, canonicalValuesVisible: true
        };
    });
    await runCase('B', 'Registrar comida', 393, async (t) => {
        await t.click('Registrar comida', t.page.locator('.daily-quick-actions').getByRole('button', {
            name: /Comida/i
        }));
        await fillMeal(t, 'Merienda sintética de refinamiento', 321);
        await t.shot('B-meal-form');
        await t.submit();
        await waitWrites(t.page, 1);
        const s = await snapshots(t.page), meals = s.profile.records[today].meals;
        assert.equal(meals.length, 4);
        assert.equal(meals.filter(meal => meal.name === 'Merienda sintética de refinamiento').length, 1);
        assert.equal(s.writes[0].date, today);
        await t.page.locator('.daily-records').getByRole('button', {
            name: /Merienda sintética/
        }).waitFor();
        return {
            oneConfirmedRecord: true, writerDate: today, aiCalls: 0
        };
    });
    await runCase('C', 'Ir a ayer y editar un registro', 393, async (t) => {
        await t.select(yesterday);
        await t.click('Abrir comida de ayer', t.page.locator('.daily-records').getByRole('button', {
            name: /Comida de ayer/
        }));
        await t.click('Editar registro', t.page.locator('.record-detail-modal').getByRole('button', {
            name: 'Editar', exact: true
        }));
        await t.fill('Editar descripción', t.page.locator('#edit-meal-description'), 'Comida de ayer revisada');
        await t.submit();
        await waitWrites(t.page, 1);
        const s = await snapshots(t.page);
        assert.equal(s.profile.records[yesterday].meals[0].name, 'Comida de ayer revisada');
        assert.equal(s.profile.records[today].meals.length, 3);
        assert.equal(s.writes[0].date, yesterday);
        return {
            writerDate: yesterday, todayUnchanged: true
        };
    });
    await runCase('D', 'Calendario contextual y otro mes', 375, async (t) => {
        const trigger = t.page.getByRole('button', {
            name: 'Abrir calendario mensual'
        });
        await t.click('Abrir calendario', trigger);
        const dialog = t.page.getByRole('dialog', {
            name: 'Elegir fecha', exact: true
        });
        await dialog.waitFor();
        assert.equal(await dialog.locator('[data-calendar-day="2026-11-14"]').isDisabled(), true);
        await t.click('Mes anterior', dialog.getByRole('button', {
            name: 'Mes anterior', exact: true
        }));
        assert.equal(await activeDate(t.page), today);
        await t.click('Elegir 31 de octubre', dialog.locator('[data-calendar-day="2026-10-31"]'));
        await selected(t.page, '2026-10-31');
        assert.equal(await dialog.count(), 0);
        assert.match(await t.page.locator('.daily-records').innerText(), /Comida de octubre/);
        assert.equal(await t.page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Abrir calendario mensual');
        await t.click('Reabrir calendario', trigger);
        await t.click('Volver a Hoy', t.page.getByRole('dialog', {
            name: 'Elegir fecha', exact: true
        }).locator('[data-calendar-today]'));
        await selected(t.page, today);
        const s = await snapshots(t.page);
        assert.equal(s.writes.length, 0);
        return {
            monthExplorationDoesNotRetarget: true, directSelectionCloses: true, futureDisabled: true, focusRestored: true, todayShortcut: true
        };
    });
    for (const width of [320, 375])
        await runCase('E', 'Registrar agua, pasos y peso', width, async (t) => {
            await t.click('Sumar agua', t.page.getByRole('button', {
                name: 'Sumar 250 ml de agua', exact: true
            }));
            await t.page.waitForFunction(() => window.__homeQA.store.activeProfile.records['2026-11-13'].water === 2000);
            await t.click('Sumar pasos', t.page.getByRole('button', {
                name: 'Sumar 500 pasos', exact: true
            }));
            await t.page.waitForFunction(() => window.__homeQA.store.activeProfile.records['2026-11-13'].steps === 6800);
            await t.click('Editar peso', t.page.locator('.daily-habits [title="Registrar peso"]'));
            const dialog = t.page.getByRole('dialog', {
                name: /Registrar peso/i
            });
            await dialog.waitFor();
            const input = dialog.getByLabel('Peso (kg)', {
                exact: true
            });
            await t.fill('Peso', input, '73,6');
            await t.press('Guardar peso con Enter', input, 'Enter');
            await waitWrites(t.page, 3);
            assert.equal(await dialog.count(), 0);
            const s = await snapshots(t.page), r = s.profile.records[today];
            assert.equal(r.weight, 73.6);
            assert.equal(r.water, 2000);
            assert.equal(r.steps, 6800);
            assert.ok(s.writes.every(write => write.date === today));
            await t.page.locator('.daily-habits-block').scrollIntoViewIfNeeded();
            await t.shot('E-habits');
            return {
                water: r.water, steps: r.steps, weight: r.weight, writerDate: today, nativeEnter: true
            };
        });
    await runCase('F', 'Explorar Historial y regresar', 375, async (t) => {
        await t.click('Abrir Historial', t.page.locator('.home-history-toggle'));
        await t.click('Explorar ayer en Historial', t.page.locator('.history-day[data-date="2026-11-12"]'));
        assert.equal(await activeDate(t.page), today);
        await t.click('Abrir registros del día', t.page.locator('.ah-detail').getByRole('button', {
            name: 'Abrir registros del día', exact: true
        }));
        await selected(t.page, yesterday);
        await t.click('Volver a Tu actividad', t.page.locator('.history-record-return'));
        assert.equal(await activeDate(t.page), yesterday);
        await t.click('Ir a Datos', t.page.getByRole('button', {
            name: 'Datos', exact: true
        }).filter({
            visible: true
        }));
        await t.page.locator('.charts-insights').waitFor();
        await t.click('Volver a Inicio', t.page.getByRole('button', {
            name: 'Inicio', exact: true
        }).filter({
            visible: true
        }));
        await selected(t.page, yesterday);
        assert.equal((await snapshots(t.page)).writes.length, 0);
        return {
            historyPreviewIndependent: true, explicitOpen: true, returnDoesNotRetarget: true, tabContextPreserved: true
        };
    });
    for (const [date, state] of [['2026-11-10', 'empty'], ['2026-11-11', 'partial']])
        await runCase('G', 'Día ' + state, 393, async (t) => {
            await t.select(date);
            const card = await t.page.locator('.energy-card').innerText();
            if (state === 'empty')
                assert.match(card, /Sin datos/i);
            else
                assert.match(card, /provisional|parcial|sin comidas/i);
            assert.match(await t.page.locator('.daily-logs').innerText(), /Todavía no|Sin registros|No hay/i);
            await t.shot('G-' + state);
            assert.equal((await snapshots(t.page)).writes.length, 0);
            return {
                state, date, balancePresentation: state === 'empty' ? 'empty' : 'provisional', coverageHonest: true
            };
        });
    await runCase('H', 'Borrador y cambio de día en desktop', 1440, async (t) => {
        await t.click('Registrar comida', t.page.locator('.daily-quick-actions').getByRole('button', {
            name: /Comida/i
        }));
        await t.fill('Borrador', t.page.locator('#add-meal-description'), 'Borrador H desktop');
        await t.click('Intentar seleccionar ayer', t.page.locator(`[data-day="${yesterday}"]`));
        assert.equal(await activeDate(t.page), today);
        assert.equal(await t.page.locator('#add-meal-description').inputValue(), 'Borrador H desktop');
        assert.equal(await t.page.locator('.home-date-blocked').isVisible(), true);
        await t.click('Intentar abrir calendario', t.page.getByRole('button', {
            name: 'Abrir calendario mensual'
        }));
        assert.equal(await t.page.getByRole('dialog', {
            name: 'Elegir fecha', exact: true
        }).count(), 0);
        await t.click('Recuperar foco del borrador', t.page.getByRole('button', {
            name: 'Volver al registro en edición', exact: true
        }));
        assert.equal(await t.page.locator('#add-meal-description').inputValue(), 'Borrador H desktop');
        assert.equal((await snapshots(t.page)).writes.length, 0);
        await t.shot('H-draft-guard');
        return {
            dayRetained: today, draftRetained: true, calendarBlocked: true, explicitRecovery: true
        };
    });
    await runCase('H', 'Sheet móvil protege el borrador', 375, async (t) => {
        await t.click('Registrar comida', t.page.locator('.daily-quick-actions').getByRole('button', {
            name: /Comida/i
        }));
        const dialog = t.page.getByRole('dialog', {
            name: 'Agregar comida', exact: true
        });
        await dialog.waitFor();
        await t.fill('Borrador', dialog.locator('#add-meal-description'), 'Borrador H móvil');
        assert.equal(await t.page.locator('.app-main').evaluate(el => el.inert), true);
        for (let index = 0; index < 12; index++) {
            await t.page.keyboard.press('Tab');
            assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true, 'Keyboard focus stays inside the sheet');
        }
        assert.equal(await activeDate(t.page), today);
        assert.equal(await dialog.locator('#add-meal-description').inputValue(), 'Borrador H móvil');
        assert.equal((await snapshots(t.page)).writes.length, 0);
        await t.shot('H-mobile-sheet');
        return {
            dayRetained: today, backgroundInert: true, focusContained: true, keyboardFocusMoves: 12, draftRetained: true
        };
    });
    if (fitness) {
        await runCase('I', 'Ejercicio en ayer: error, reintento, edición y eliminación', 375, async t => {
            await t.select(yesterday);
            const initial = (await snapshots(t.page)).profile.records;
            const name = 'Caminata sintética de revisión';
            await t.click('Abrir ejercicio', t.page.locator('.daily-quick-actions').getByRole('button', { name: /Ejercicio/i }));
            await t.fill('Actividad', t.page.locator('#add-workout-activity'), name);
            await t.fill('Duración', t.page.locator('#add-workout-duration'), '25');
            await t.fill('Calorías', t.page.locator('#add-workout-calories'), '140');
            await t.fill('Hora', t.page.locator('#add-workout-time'), '09:00');
            await t.page.evaluate(() => { window.__homeQA.failed = 'reject'; });
            await t.submit();
            await t.page.waitForFunction(() => window.__homeQA.writes.some(w => w.status === 'failed'));
            await t.page.getByText('No se pudo guardar el ejercicio. Intentá nuevamente.', { exact:true }).waitFor();
            assert.equal(await t.page.locator('#add-workout-activity').inputValue(), name);
            assert.deepEqual((await snapshots(t.page)).profile.records, initial);
            await t.page.evaluate(() => { window.__homeQA.failed = false; });
            await t.submit();
            await waitWrites(t.page, 1);
            const entry = (await snapshots(t.page)).profile.records[yesterday].workouts.find(w => w.activity === name);
            assert.ok(entry);
            const row = t.page.locator('.daily-records').getByRole('button', { name: new RegExp(name) });
            const detail = t.page.locator('.record-detail-modal');
            await t.click('Consultar ejercicio', row);
            await t.click('Editar ejercicio', detail.getByRole('button', { name: 'Editar', exact: true }));
            await t.fill('Corregir duración', t.page.locator('#edit-workout-duration'), '35');
            await t.submit();
            await waitWrites(t.page, 2);
            const updates = (await snapshots(t.page)).profile.records[yesterday].workouts.filter(w => w.activity === name);
            assert.equal(updates.length, 1);
            assert.equal(updates[0].id, entry.id);
            assert.equal(updates[0].duration, 35);
            await t.click('Reabrir ejercicio', row);
            await t.click('Eliminar ejercicio', detail.getByRole('button', { name: 'Eliminar', exact: true }));
            await waitWrites(t.page, 3);
            const final = await snapshots(t.page);
            assert.deepEqual(final.profile.records[yesterday].workouts, initial[yesterday].workouts);
            assert.deepEqual(final.profile.records[today], initial[today]);
            assert.ok(final.writes.every(w => w.date === yesterday && w.owner === 'A'));
            return { visibleSaveError: true, failedDraftRetained: true, retryOnce: true, sameEntryId: true, deletionConfirmed: true };
        });
        await runCase('J', 'Eliminar comida y cambiar de cuenta', 393, async t => {
            await t.select(yesterday);
            const baseline = (await snapshots(t.page)).profile.records;
            await t.click('Consultar comida de ayer', t.page.locator('.daily-records').getByRole('button', { name: /Comida de ayer/ }));
            await t.click('Eliminar comida', t.page.locator('.record-detail-modal').getByRole('button', { name: 'Eliminar', exact: true }));
            await waitWrites(t.page, 1);
            const saved = (await snapshots(t.page)).profile.records;
            assert.equal(saved[yesterday].meals.length, 0);
            assert.deepEqual(saved[today], baseline[today]);
            await t.page.evaluate(() => window.__homeQA.switchAccount('B'));
            await selected(t.page, today);
            assert.equal((await snapshots(t.page)).profile.id, 'synthetic-home-b');
            assert.equal(await t.page.locator('.daily-record-open').count(), 0);
            await t.click('Sumar agua en la cuenta B', t.page.getByRole('button', { name: 'Sumar 250 ml de agua', exact: true }));
            await waitWrites(t.page, 2);
            assert.equal((await snapshots(t.page)).profile.records[today].water, 500);
            await t.page.evaluate(() => window.__homeQA.switchAccount('A'));
            await selected(t.page, yesterday);
            const final = await snapshots(t.page);
            assert.deepEqual(final.profile.records, saved);
            assert.deepEqual(final.writes.map(w => [w.owner,w.date]), [['A',yesterday],['B',today]]);
            return { mealDeletedOnSelectedDay: true, twoOwnersIsolated: true, dateRestored: true };
        });
    }
}
finally {
    await browser.close();
    saveReport();
}
report.summary = {
    cases: report.cases.length, passed: report.cases.filter(value => value.status === 'passed').length, failed: report.cases.filter(value => value.status === 'failed').length,
    semanticScenarios: [...new Set(report.cases.map(value => value.scenario))], interactionCounts: 'Task clicks, field edits and save keys are counted separately. The mobile H case additionally verifies 12 Tab presses, reported in keyboardFocusMoves. These are scripted task steps, not usability scores.', scrollMeasurement: 'Sum of observed absolute .app-main scrollTop changes between actions; not physical gestures or a performance benchmark.'
};
saveReport();
console.log(JSON.stringify(report.summary));
process.exitCode = report.summary.failed ? 1 : 0;
