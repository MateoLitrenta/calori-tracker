import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';
import { JSDOM } from 'jsdom';

// CSS contracts only. JSDOM has no layout/container-query engine: these fixtures
// explicitly select a container width. Browser geometry is verified separately.
const files = ['index.css', 'DesktopExperience.css', 'components/HomeVariants.css', 'components/HomeMobile.css', 'components/FitnessHome.css', 'components/FitnessDaily.css', 'components/HomeSkeleton.css', 'FitnessSystem.css', 'components/CoachFitness.css', 'components/FitnessCharts.css', 'components/FitnessProfile.css', 'components/SegmentedControl.css', 'components/ActivityHistory.css', 'components/ActivityHistoryMotion.css'];
const source = (await Promise.all(files.map(file => readFile(new URL('../src/' + file, import.meta.url), 'utf8')))).join('\n');
function stylesAt(width, height = 900, containerWidth = width) {
  const css = postcss.parse(source);
  css.walkAtRules(rule => {
    if (!['media', 'container'].includes(rule.name)) return;
    const queryWidth = rule.name === 'container' ? containerWidth : width;
    // The text-size fixture uses a 16px container font by default.
    const widthLimit = kind => {
      const match = new RegExp(kind + '-width:\\s*([\\d.]+)(px|em)').exec(rule.params);
      return match ? Number(match[1]) * (match[2] === 'em' ? 16 : 1) : null;
    };
    const min = widthLimit('min'), max = widthLimit('max');
    const minHeight = /min-height:\s*(\d+)px/.exec(rule.params), maxHeight = /max-height:\s*(\d+)px/.exec(rule.params);
    if ((min !== null && queryWidth < min) || (max !== null && queryWidth > max) ||
      (minHeight && height < Number(minHeight[1])) || (maxHeight && height > Number(maxHeight[1])) || /prefers-reduced-motion/.test(rule.params)) rule.remove();
    else rule.replaceWith(...rule.nodes);
  });
  return css.toString();
}
function view(t, width, height = 900, containerWidth = width) {
  const cssText = stylesAt(width, height, containerWidth);
  const dom = new JSDOM('<style>' + cssText + '</style><div class="app-shell app-shell-coach">' +
    '<div class="app-main"><div class="app-content">' +
    '<section class="assistant-view"><header class="chat-heading"></header><div class="chat-messages">' +
    '<div class="chat-message chat-message-bot chat-message-structured"><div class="chat-bubble">Text</div></div></div><form class="chat-composer"></form></section>' +
    '<div class="home-variants fitness-home"><div class="daily-panel" data-period="day"><div class="daily-summary"><section class="energy-card fitness-score" data-energy-state="recorded"><div class="fitness-readout"><h4>Balance energético</h4><div class="energy-number"><span>-600</span><small> kcal</small></div></div><details class="energy-breakdown fitness-breakdown"><summary aria-label="Ver desglose"><span class="fitness-breakdown-label">Ver desglose</span></summary><div class="fitness-breakdown-body"><p class="fitness-balance-category">Déficit Alto</p></div></details></section></div>' +
    '<div class="daily-journal"><div class="daily-entry"><div class="daily-quick-actions"><button>Agregar comida</button><button>Agregar ejercicio</button></div></div>' +
    '<div class="daily-logs"><ul class="daily-records" data-expanded="false">' +
    '<li><button class="daily-record-open"><span class="fitness-record-mark"></span><span class="fitness-record-copy"><span class="daily-record-title">Comida</span><span class="daily-record-meta">12:00 · Almuerzo</span></span><span class="fitness-record-kcal">+300 kcal</span></button></li>'.repeat(5) +
    '</ul><button class="daily-records-toggle">Ver todos los registros (5)</button></div>' +
    '<section class="daily-habits-block"><div class="daily-habits"><div class="habit-card"><div class="habit-reading"><div class="habit-header"><span class="habit-label">Agua</span></div>' +
    '<div class="habit-metric"><button class="habit-value">1.500 <small class="habit-unit">ml</small></button></div></div><div class="habit-controls"><button>−250</button><button>+250</button></div></div></div></section></div></div>' +
    '<section class="activity-history-v2"><header class="ah-header"><div><h2>Tu actividad</h2></div><div class="ah-view-switch segmented-control"><button aria-pressed="true">Mes</button></div></header>' +
    '<div class="ah-layout"><div class="ah-calendar"><div class="ah-navigation"><h3>Noviembre 2026</h3><div class="ah-nav-actions"><button>←</button><button>Hoy</button><button>→</button></div></div>' +
    '<div class="ah-compact-week"><p>Semana 2 de 5</p><div><button>←</button><button>→</button></div></div>' +
    '<div class="ah-calendar-surface ah-calendar-surface--month"><div class="ah-weekdays"><span>Dom</span></div><div class="ah-week" data-active="true"><button class="ah-day" aria-pressed="true"><span class="ah-day-number">12</span></button></div><div class="ah-week" data-active="false"><button class="ah-day"><span class="ah-day-number">19</span></button></div></div>' +
    '<div class="ah-year"><button class="ah-month">Noviembre</button></div></div><div class="ah-detail"><h3>Jueves 12 de noviembre</h3><button class="ah-open">Abrir registros del día</button></div></div>' +
    '<details class="ah-energy"><summary>Ver resumen energético</summary><div>Promedios con datos reales</div></details></section></div>' +
    '<div class="charts-view charts-insights"><section class="charts-panel charts-summary"></section></div>' +
    '<div class="profile-view profile-v2"><section class="profile-panel profile-account-panel"></section></div>' +
    '</div></div></div>');
  t.after(() => dom.window.close());
  const style = selector => dom.window.getComputedStyle(dom.window.document.querySelector(selector));
  const declaration = (selector, property) => {
    let value;
    postcss.parse(cssText).walkRules(rule => {
      if (rule.selector === selector) for (const node of rule.nodes) if (node.prop === property) value = node.value;
    });
    return value;
  };
  return { style, declaration, document: dom.window.document };
}

test('desktop frames share their width cap, while Coach preserves readable prose and transcript-only scrolling', t => {
  for (const width of [1280, 1440, 1920]) {
    const { style, document } = view(t, width);
    document.querySelector('.app-main').insertAdjacentHTML('afterbegin', '<header class="home-header"></header>');
    for (const tab of ['home', 'charts', 'profile', 'chat']) {
      document.querySelector('.app-content').insertAdjacentHTML('beforeend', `<div class="view-skeleton view-skeleton-${tab}"></div>`);
    }
    const cap = style('.assistant-view').maxWidth;
    for (const selector of ['.fitness-home', '.home-header', '.charts-view', '.profile-view',
      '.view-skeleton-home', '.view-skeleton-charts', '.view-skeleton-profile', '.view-skeleton-chat']) {
      assert.equal(style(selector).width, '100%', selector);
      assert.equal(style(selector).maxWidth, cap, selector);
    }
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
  assert.equal(style('.daily-journal').gridTemplateAreas, '"entry records" "habits records"');
  assert.equal(style('.daily-journal').alignItems, 'start');
  assert.equal(style('.habit-card').height, 'auto');
  assert.ok(parseInt(style('.habit-controls button').minHeight) >= 44);
  assert.equal(style('.charts-view').gap, style('.profile-view').gap);
  assert.equal(style('.charts-panel').padding, style('.profile-panel').padding);
  assert.equal(style('.charts-summary').alignSelf, 'stretch');
  assert.equal(style('.charts-summary').height, '');
});

test('daily energy categories share neutral presentation instead of rewarding a large recorded deficit', t => {
  const { document, style } = view(t, 393);
  const category = document.querySelector('.fitness-balance-category');
  assert.equal(category.closest('details').open, false);
  for (const dark of [false, true]) {
    document.documentElement.classList.toggle('dark', dark);
    for (const label of ['Déficit Alto', 'Déficit Leve', 'Superávit', 'Mantenimiento']) {
      category.textContent = label;
      assert.equal(style('.fitness-balance-category').color, 'var(--fit-board-muted)', label);
      assert.equal(style('.fitness-balance-category').backgroundColor, 'rgba(0, 0, 0, 0)', label);
    }
  }
});

test('mobile daily actions and compact complementary controls retain comfortable targets with a single page scroll', t => {
  for (const width of [320, 375, 393, 440, 768]) {
    const { style, document } = view(t, width, 900, width - 32);
    const band = document.querySelector('.daily-habits');
    const columns = () => style('.daily-habits').getPropertyValue('--habit-columns') || '1';
    assert.equal(columns(), width < 375 ? '1' : '3');
    band.setAttribute('data-needs-room', 'true');
    assert.equal(columns(), width < 768 ? '1' : '3');
    band.removeAttribute('data-needs-room');
    assert.ok(parseInt(style('.daily-quick-actions button').minHeight) >= 44);
    assert.ok(parseInt(style('.habit-controls button').minHeight) >= 44);
    assert.ok(parseInt(style('.fitness-breakdown summary').minHeight) >= 44);
    assert.equal(style('.habit-controls').display, 'flex');
    assert.equal(style('.habit-controls').flexFlow, 'row nowrap');
    assert.equal(style('.habit-controls').gap, '6px');
    assert.equal(style('.daily-habits .habit-card').borderTopWidth, '0px');
    assert.equal(style('.habit-card').flexWrap, 'wrap');
    assert.equal(style('.habit-metric').alignItems, 'baseline');
    assert.ok(parseInt(style('.habit-value').minHeight) >= 44);
    assert.ok(parseInt(style('.daily-record-open').minHeight) >= 44);
    assert.equal(style('.daily-record-title').overflowWrap, 'anywhere');
    assert.equal(style('.daily-records li:nth-child(5)').display, 'none');
    assert.equal(style('.daily-records-toggle').display, 'inline-flex');
    assert.equal(style('.daily-logs').maxHeight, '');
    assert.equal(style('.daily-logs').overflowY, '');
  }
});

test('numbered history retains seven columns and accessible target sizes across all required widths', t => {
  for (const width of [320, 375, 393, 430, 768, 1440]) {
    const { style } = view(t, width);
    // Keep the 44px floor while text enlargement can grow both aligned grids;
    // the existing local scroller carries their width instead of clipping values.
    const columns = 'repeat(7, minmax(max(44px, 2.75em), 1fr))';
    assert.equal(style('.ah-week').gridTemplateColumns, columns);
    assert.equal(style('.ah-weekdays').gridTemplateColumns, columns);
    assert.ok(parseInt(style('.ah-day').minWidth) >= 44);
    assert.ok(parseInt(style('.ah-day').minHeight) >= 44);
    assert.ok(parseInt(style('.ah-day-number').fontSize) >= 14);
    assert.ok(parseInt(style('.ah-view-switch button').minHeight) >= 44);
    assert.ok(parseInt(style('.ah-nav-actions button').minWidth) >= 44);
    assert.ok(parseInt(style('.ah-nav-actions button').minHeight) >= 44);
    assert.ok(parseInt(style('.ah-open').minHeight) >= 44);
    assert.equal(style('.ah-calendar-surface').overflowX, 'auto');
    assert.equal(style('.ah-calendar-surface').minWidth, '0');
    assert.notEqual(style('.ah-detail').display, 'none');
    assert.ok(parseInt(style('.ah-month').minHeight) >= 44);
    assert.ok(parseInt(style('.ah-energy > summary').minHeight) >= 44);
  }
});

test('narrow containers use an active weekly surface; roomy desktop integrates calendar and contextual detail', t => {
  for (const container of [286, 303, 317]) {
    const { style } = view(t, 320, 852, container);
    assert.equal(style('.ah-compact-week').display, 'flex');
    assert.equal(style('.ah-week[data-active="false"]').display, 'none');
    assert.equal(style('.ah-week[data-active="true"]').display, 'grid');
    assert.ok(parseInt(style('.ah-week').minWidth) >= 7 * 44);
    assert.equal(style('.ah-calendar-surface').overflowX, 'auto');
    assert.equal(style('.ah-year').gridTemplateColumns, 'repeat(2, minmax(0, 1fr))');
  }
  for (const container of [341, 359, 396, 700]) {
    const { style } = view(t, 768, 1024, container);
    assert.equal(style('.ah-compact-week').display, 'none');
    assert.equal(style('.ah-week[data-active="false"]').display, 'grid');
  }
  const roomy = view(t, 1440, 900, 1100);
  assert.equal(roomy.style('.ah-layout').gridTemplateColumns, 'minmax(0, 1.15fr) minmax(0, 1fr)');
  // JSDOM cannot resolve the color custom property in a border shorthand.
  assert.equal(roomy.declaration('.ah-detail', 'border-top'), '0');
  assert.match(roomy.declaration('.ah-detail', 'border-left'), /^1px solid var\(--home-line\)$/);
  const compact = view(t, 768, 1024, 700);
  assert.equal(compact.style('.ah-layout').gridTemplateColumns, 'minmax(0, 1fr)');
  assert.match(compact.declaration('.ah-detail', 'border-top'), /^1px solid var\(--home-line\)$/);
  const short = view(t, 1440, 768, 1100);
  assert.notEqual(short.style('.home-variants').getPropertyValue('--home-section-gap'), roomy.style('.home-variants').getPropertyValue('--home-section-gap'));
  assert.equal(short.style('.habit-controls button').minHeight, roomy.style('.habit-controls button').minHeight);
});

test('history scopes visible focus and reduced motion without decorative passive selectors', async () => {
  const historyCSS = await readFile(new URL('../src/components/ActivityHistory.css', import.meta.url), 'utf8');
  const css = postcss.parse(historyCSS);
  let focus, reduced;
  css.walkRules(rule => {
    if (rule.selector.includes('.activity-history-v2') && rule.selector.includes(':focus-visible')) focus = rule;
    if (rule.selector === '.ah-day' && rule.parent.type === 'atrule' && /prefers-reduced-motion/.test(rule.parent.params)) reduced = rule;
  });
  assert.ok(focus.nodes.some(node => node.prop === 'outline' && /2px/.test(node.value)));
  assert.ok(reduced.nodes.some(node => node.prop === 'transition' && node.value === 'none'));
  assert.ok(!historyCSS.includes('.history-preview-grid'));
  assert.ok(!historyCSS.includes('.history-full-toggle'));
});

test('the optional history explanation reuses the existing accessible light-card foreground', () => {
  const tokens = {};
  let explanationColor;
  postcss.parse(source).walkRules(rule => {
    if (rule.selector === ':root') {
      for (const node of rule.nodes) if (['--fit-quiet', '--fit-surface'].includes(node.prop)) tokens[node.prop] = node.value;
    }
    if (rule.selector === '.ah-energy') {
      const color = rule.nodes.find(node => node.prop === 'color');
      if (color) explanationColor = color.value;
    }
  });
  assert.equal(explanationColor, 'var(--home-muted)');
  const luminance = hex => {
    assert.match(hex, /^#[0-9a-f]{6}$/i);
    const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
      .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
  };
  const foreground = luminance(tokens['--fit-quiet']), background = luminance(tokens['--fit-surface']);
  assert.ok((Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) >= 4.5);
});
