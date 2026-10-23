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
    '<section class="activity-history" data-history-expanded="false"><button class="history-full-toggle">Ver historial completo</button><div class="history-visualization"><div class="history-period-grid history-period-grid--week"></div></div><div class="history-detail-extra" hidden data-expanded="false"></div></section></div>' +
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

test('mobile weeks have a bounded touch grid and contextual figures can always be reopened', t => {
  for (const width of [320, 375, 430]) {
    const { style, document } = view(t, width);
    const grid = style('.history-period-grid');
    assert.equal(grid.overflowX, 'auto');
    assert.equal(grid.gridAutoFlow, 'column');
    assert.ok(Number(grid.getPropertyValue('--history-grid-rows')) <= 4);
    assert.ok(parseInt(grid.gridAutoColumns) >= 44);
    assert.equal(style('.history-detail-extra').display, 'none');
    document.querySelector('.history-detail-extra').dataset.expanded = 'true';
    document.querySelector('.history-detail-extra').hidden = false;
    assert.notEqual(style('.history-detail-extra').display, 'none');
  }
  assert.equal(view(t, 1440).style('.history-detail-extra').display, 'none', 'Desktop starts compact too; the explicit detail disclosure reveals all figures');
});

test('mobile history reveals the complete existing grid; desktop always exposes it and short viewports adjust gaps only', t => {
  for (const width of [320, 375, 430]) {
    const { style, document } = view(t, width);
    assert.equal(style('.history-visualization').display, 'none');
    assert.notEqual(style('.history-full-toggle').display, 'none');
    document.querySelector('.activity-history').dataset.historyExpanded = 'true';
    assert.notEqual(style('.history-visualization').display, 'none');
  }
  const desktop = view(t, 1440, 900);
  assert.notEqual(desktop.style('.history-visualization').display, 'none');
  assert.equal(desktop.style('.history-full-toggle').display, 'none');
  const short = view(t, 1440, 768);
  assert.notEqual(short.style('.home-variants').getPropertyValue('--home-section-gap'), desktop.style('.home-variants').getPropertyValue('--home-section-gap'));
  assert.equal(short.style('.habit-controls button').minHeight, desktop.style('.habit-controls button').minHeight);
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
