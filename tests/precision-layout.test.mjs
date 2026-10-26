import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';
import { JSDOM } from 'jsdom';

// Style contracts only: JSDOM does not measure geometry. Real browser geometry
// and screenshots for the nine viewports are recorded in the V6 review document.
const files = ['DesktopExperience.css', 'components/HomeVariants.css', 'components/PremiumViews.css'];
const source = (await Promise.all(files.map(file => readFile(new URL('../src/' + file, import.meta.url), 'utf8')))).join('\n');
function stylesAt(width, height = 900) {
  const css = postcss.parse(source);
  css.walkAtRules('media', rule => {
    const min = /min-width:\s*(\d+)px/.exec(rule.params);
    const max = /max-width:\s*(\d+)px/.exec(rule.params);
    const minHeight = /min-height:\s*(\d+)px/.exec(rule.params);
    const maxHeight = /max-height:\s*(\d+)px/.exec(rule.params);
    if ((min && width < Number(min[1])) || (max && width > Number(max[1])) || (minHeight && height < Number(minHeight[1])) || (maxHeight && height > Number(maxHeight[1])) || /prefers-reduced-motion/.test(rule.params)) rule.remove();
    else rule.replaceWith(...rule.nodes);
  });
  return css.toString();
}
function view(t, width, height = 900) {
  const dom = new JSDOM('<style>' + stylesAt(width, height) + '</style><div class="app-shell app-shell-coach">' +
    '<div class="app-main"><div class="app-content">' +
    '<section class="assistant-view"><header class="chat-heading"></header><div class="chat-messages">' +
    '<div class="chat-message chat-message-bot chat-message-structured"><div class="chat-bubble">Text</div></div></div><form class="chat-composer"></form></section>' +
    '<div class="home-variants"><div class="daily-summary"><div class="energy-card"></div><div class="daily-habits"><div class="habit-card"><div class="habit-controls"><button>+</button></div></div></div></div>' +
    '<section class="activity-history" data-history-expanded="false"><div class="history-navigation"><label>Fecha<input type="date"></label></div><div class="history-detail"><div class="history-detail-heading"></div><div class="history-detail-body"><dl class="history-detail-primary"><div><dt>Balance</dt><dd>1.000</dd></div><div><dt>Consumidas</dt><dd>2.000</dd></div><div><dt>Gasto</dt><dd>3.000</dd></div></dl></div></div><div class="history-visualization"><div class="history-day-navigation"><div class="history-ribbon-navigation"><p>Elegí un día</p><div class="history-strip-actions"><button>←</button><button>→</button></div></div><div class="history-day-strip"><button class="history-day"><strong>24</strong><small>oct 26</small></button></div></div><div class="history-annual-calendar"><div class="heatmap-layout"></div></div><div class="history-period-grid history-period-grid--week"><button class="history-period"><span class="history-week-range">20 oct – 26 oct<small>2026</small></span><span class="history-period-coverage">2 / 7</span></button></div><div class="history-period-grid history-period-grid--month"></div><div class="history-period-grid history-period-grid--year"></div></div><div class="history-explore"><button class="history-full-toggle">Explorar calendario anual</button><button class="history-detail-toggle">Cómo leer estos datos</button></div><div class="history-detail-extra" hidden data-expanded="false"></div></section></div>' +
    '<div class="charts-view charts-insights"><section class="charts-panel charts-summary"></section></div>' +
    '<div class="profile-view profile-v2"><section class="profile-panel profile-account-panel"></section></div>' +
    '</div></div></div>');
  t.after(() => dom.window.close());
  const style = selector => dom.window.getComputedStyle(dom.window.document.querySelector(selector));
  return { style, document: dom.window.document };
}

test('desktop frames share their width cap, while Coach preserves readable prose and transcript-only scrolling', t => {
  for (const width of [1280, 1440, 1920]) {
    const { style } = view(t, width);
    const cap = style('.assistant-view').maxWidth;
    assert.equal(cap, style('.home-variants').maxWidth);
    assert.equal(cap, style('.charts-view').maxWidth);
    assert.equal(cap, style('.profile-view').maxWidth);
    assert.equal(cap, 'var(--content-max)', 'No screen may introduce its own narrower frame');
    assert.equal(style('.app-main').overflow, 'hidden');
    assert.equal(style('.app-content').overflow, 'hidden');
    assert.equal(style('.chat-messages').overflowY, 'auto');
    assert.equal(style('.chat-messages').minHeight, '0');
    assert.equal(style('.chat-heading').flexShrink, '0');
    assert.equal(style('.chat-composer').flexShrink, '0');
    assert.ok(parseInt(style('.chat-bubble').maxWidth) <= 680);
    assert.notEqual(style('.chat-message-structured').maxWidth, style('.chat-bubble').maxWidth);
  }
});

test('dashboard row follows its tallest content and analysis/settings share spacing without fixed card heights', t => {
  const { style } = view(t, 1440);
  assert.equal(style('.daily-summary').alignItems, 'stretch');
  assert.equal(style('.daily-habits').alignItems, 'stretch');
  assert.equal(style('.habit-card').height, 'auto');
  assert.ok(parseInt(style('.habit-controls button').minHeight) >= 44);
  assert.equal(style('.charts-view').gap, style('.profile-view').gap);
  assert.equal(style('.charts-panel').padding, style('.profile-panel').padding);
  assert.equal(style('.charts-summary').alignSelf, 'stretch');
  assert.equal(style('.charts-summary').height, '');
});

test('compact history always exposes direct touch selectors and all primary figures', t => {
  for (const width of [320, 375, 430, 768, 1023]) {
    const { style, document } = view(t, width);
    const grid = style('.history-period-grid--week');
    assert.notEqual(style('.history-visualization').display, 'none');
    assert.equal(grid.overflowX, 'auto');
    assert.equal(grid.gridAutoFlow, 'column');
    assert.equal(Number(grid.getPropertyValue('--history-grid-rows')), 1);
    assert.ok(parseInt(grid.gridAutoColumns) >= 128);
    assert.equal(grid.scrollbarWidth, 'none');
    assert.notEqual(style('.history-week-range').display, 'none');
    assert.notEqual(style('.history-period-coverage').display, 'none');
    assert.notEqual(style('.history-day-navigation').display, 'none');
    assert.equal(style('.history-day-strip').overflowX, 'auto');
    assert.ok(parseInt(style('.history-day').minWidth) >= 44);
    assert.ok(parseInt(style('.history-day').minHeight) >= 44);
    for (const dimension of ['minWidth', 'minHeight']) assert.ok(parseInt(style('.history-strip-actions button')[dimension]) >= 44);
    assert.equal(style('.history-day').height, '', 'Labels grow naturally when text is enlarged');
    assert.equal(Number(style('.history-period-grid--month').getPropertyValue('--history-grid-columns')), 3);
    assert.equal(Number(style('.history-period-grid--year').getPropertyValue('--history-grid-columns')), 2);
    assert.notEqual(style('.history-navigation').display, 'none', 'Choosing a date never requires expansion');
    assert.notEqual(style('.history-detail-primary').display, 'none');
    assert.equal(document.querySelectorAll('.history-detail-primary > div').length, 3);
    assert.equal(style('.history-detail-primary').gridTemplateColumns, 'repeat(2, minmax(0, 1fr))');
    assert.equal(style('.history-detail-extra').display, 'none');
    document.querySelector('.history-detail-extra').hidden = false;
    assert.notEqual(style('.history-detail-extra').display, 'none', 'Only supporting explanation is disclosed');
  }
});

test('only the annual day calendar is optional on mobile; desktop keeps the complete calendar and no extra ribbon', t => {
  for (const width of [320, 375, 430, 768, 1023]) {
    const { style, document } = view(t, width);
    assert.equal(style('.history-annual-calendar').display, 'none');
    assert.notEqual(style('.history-full-toggle').display, 'none');
    assert.notEqual(style('.history-detail-toggle').display, 'none');
    assert.ok(parseInt(style('.history-full-toggle').minHeight) >= 44);
    assert.ok(parseInt(style('.history-detail-toggle').minHeight) >= 44);
    document.querySelector('.activity-history').dataset.historyExpanded = 'true';
    assert.notEqual(style('.history-annual-calendar').display, 'none');
    assert.notEqual(style('.history-visualization').display, 'none');
    assert.equal(style('.history-day-navigation').display, 'none', 'The annual calendar replaces the day ribbon without showing duplicate selectors');
    document.querySelector('.activity-history').dataset.historyExpanded = 'false';
    assert.notEqual(style('.history-day-navigation').display, 'none', 'Returning to compact mode restores the direct selector');
    assert.equal(style('.heatmap-layout').getPropertyValue('--history-cell'), '44px');
  }
  const desktop = view(t, 1440, 900);
  assert.notEqual(desktop.style('.history-annual-calendar').display, 'none');
  assert.notEqual(desktop.style('.history-visualization').display, 'none');
  assert.equal(desktop.style('.history-full-toggle').display, 'none');
  assert.equal(desktop.style('.history-day-navigation').display, 'none');
  assert.equal(desktop.style('.history-period-coverage').display, 'none', 'Desktop week cards keep their compact established geometry');
  assert.equal(desktop.style('.history-detail-primary').gridTemplateColumns, 'repeat(3, minmax(0, 1fr))');
  const short = view(t, 1440, 768);
  assert.notEqual(short.style('.home-variants').getPropertyValue('--home-section-gap'), desktop.style('.home-variants').getPropertyValue('--home-section-gap'));
  assert.equal(short.style('.habit-controls button').minHeight, desktop.style('.habit-controls button').minHeight);
});

test('new direct selectors keep focus feedback, a bounded horizontal scrollport and reduced-motion support', () => {
  const css = postcss.parse(source);
  let focus;
  let reduced;
  css.walkRules(rule => {
    if (rule.selector === '.home-variants .activity-history button:focus-visible') focus = rule;
    if (rule.selector.includes('.history-day') && rule.parent.type === 'atrule' && /prefers-reduced-motion/.test(rule.parent.params)) reduced = rule;
  });
  assert.ok(focus.nodes.some(node => node.prop === 'outline' && /2px/.test(node.value)));
  assert.ok(reduced.nodes.some(node => node.prop === 'transition' && node.value === 'none'));
  assert.ok(reduced.nodes.some(node => node.prop === 'animation' && node.value === 'none'));
  assert.ok(reduced.nodes.some(node => node.prop === 'scroll-behavior' && node.value === 'auto'));
  assert.ok(!source.includes('.history-preview-grid'), 'No passive presentation can resemble a second selector');
});

test('the new history disclosure uses a readable accent against a light surface', () => {
  // JSDOM does not resolve this variable/specificity cascade. Check the actual
  // light-theme declaration; the browser review also records its computed RGB.
  let accent;
  postcss.parse(source).walkRules(rule => {
    if (rule.selectors.includes('html:not(.dark) .home-variants .history-full-toggle')) accent = rule.nodes.find(node => node.prop === 'color').value;
  });
  assert.match(accent, /^#[0-9a-f]{6}$/i);
  const rgb = [1, 3, 5].map(index => parseInt(accent.slice(index, index + 2), 16));
  const linear = rgb.map(channel => channel / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  const luminance = .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
  assert.ok(1.05 / (luminance + .05) >= 4.5, 'Normal-size accent text must meet AA contrast against white');
});
