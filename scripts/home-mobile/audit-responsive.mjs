import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const before = process.argv.includes('--before-refinement');
const phase = before ? 'before' : 'after';
const origin = 'http://127.0.0.1:' + (before ? '5183' : '5184');
const output = fileURLToPath(new URL('../../docs/evidence/v10-1-1-refinement/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const dimensions = [[320, 740], [375, 812], [393, 852], [440, 900], [768, 1024], [1440, 900]];
const results = [];
const errors = [];
// Effective CSS colors on the sampled flat surfaces, including translucent fills.
function inspectContrast(target) {
    const rgba = value => {
        const numbers = value.match(/[\d.]+/g).map(Number);
        return [...numbers.slice(0, 3), numbers[3] ?? 1];
    };
    function overlay(bottom, top) {
        return bottom.map((channel, i) => channel * (1 - top[3]) + top[i] * top[3]);
    }
    const ancestors = [];
    for (let node = target; node; node = node.parentElement)
        ancestors.unshift(node);
    const bg = ancestors.reduce((color, node) => overlay(color, rgba(getComputedStyle(node).backgroundColor)), [255, 255, 255]);
    const fg = overlay(bg, rgba(getComputedStyle(target).color));
    function luminance(rgb) {
        return rgb.map(x => x / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4)
            .reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0);
    }
    const values = [luminance(bg), luminance(fg)].sort((a, b) => a - b);
    return +((values[1] + .05) / (values[0] + .05)).toFixed(2);
}
try {
    for (const theme of ['light', 'dark']) {
        const context = await browser.newContext({ timezoneId: 'America/Buenos_Aires', reducedMotion: 'reduce' });
        await context.route('**/*', route => new URL(route.request().url()).origin === origin
            ? route.continue() : route.abort());
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => {
            if (message.type() === 'error' && /same key|unique.*key/i.test(message.text()))
                errors.push(message.text());
        });
        for (const [width, height] of dimensions) {
            await page.setViewportSize({ width, height });
            await page.goto(origin + '/qa?controls=0&theme=' + theme);
            await page.locator('.energy-card').waitFor();
            await page.evaluate(() => document.fonts.ready);
            const name = phase + '-' + width + '-' + theme;
            await page.screenshot({ path: path.join(output, name + '.jpg'), type: 'jpeg', quality: 85, animations: 'disabled' });
            const geometry = await page.evaluate(() => {
                const rect = selector => {
                    const box = document.querySelector(selector).getBoundingClientRect();
                    return { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) };
                };
                const shell = document.querySelector('.app-main');
                return { docWidth: document.documentElement.scrollWidth, mainOverflow: shell.scrollWidth - shell.clientWidth,
                    date: rect('.home-date-nav'), weekDay: rect('.home-week-days button'), balance: rect('.energy-card'),
                    actions: rect('.daily-quick-actions'), row: rect('.daily-record-open'),
                    activeNav: getComputedStyle(document.querySelector('.bottom-nav-item[aria-current]')).color };
            });
            const check = { width, height, theme, ...geometry };
            const navItem = page.locator(width < 768 ? '.bottom-nav-item[aria-current] span' : '.app-sidebar nav button').first();
            check.contrast = {
                activeNavigation: await navItem.evaluate(inspectContrast),
                selectedDay: await page.locator('.home-week-days button[aria-pressed="true"] strong').evaluate(inspectContrast),
                balance: await page.locator('.energy-number').evaluate(inspectContrast),
            };
            if (!before) {
                await page.getByRole('button', { name: 'Abrir calendario mensual' }).click();
                const picker = page.getByRole('dialog');
                await picker.waitFor();
                const info = await picker.evaluate(el => {
                    const rect = el.getBoundingClientRect();
                    const main = document.querySelector('.app-main');
                    const day = el.querySelector('[aria-current="date"]') || el.querySelector('[aria-pressed="true"]');
                    const dayRect = day?.getBoundingClientRect();
                    return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height),
                        dayWidth: dayRect && Math.round(dayRect.width), dayHeight: dayRect && Math.round(dayRect.height),
                        mainScroll: main.scrollTop, hasFocus: el.contains(document.activeElement) };
                });
                check.calendar = info;
                await page.screenshot({ path: path.join(output, 'calendar-' + width + '-' + theme + '.jpg'), type: 'jpeg', quality: 85, animations: 'disabled' });
                await page.keyboard.press('Escape');
                await picker.waitFor({ state: 'hidden' });
                check.returnFocus = await page.getByRole('button', { name: 'Abrir calendario mensual' }).evaluate(e => document.activeElement === e);
            }
            results.push(check);
        }
        await context.close();
    }
    await writeFile(path.join(output, phase + '-responsive.json'), JSON.stringify({ phase, results, errors }, null, 2) + '\n');
    assert.equal(errors.length, 0, errors.join('\n'));
    for (const check of results) {
        assert.equal(check.docWidth, check.width);
        assert.ok(check.mainOverflow <= 1);
        if (!before) {
            assert.ok(check.weekDay.w >= 44 && check.weekDay.h >= 44, JSON.stringify(check));
            assert.ok(check.calendar.dayWidth >= 44 && check.calendar.dayHeight >= 44, JSON.stringify(check));
            assert.ok(Object.values(check.contrast).every(ratio => ratio >= 4.5), JSON.stringify(check));
            assert.ok(check.calendar.hasFocus && check.returnFocus, JSON.stringify(check));
        }
    }
    console.log(phase, results.length, 'viewports and themes checked');
}
finally {
    await browser.close();
}
