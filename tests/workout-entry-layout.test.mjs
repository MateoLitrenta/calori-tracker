import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import postcss from 'postcss';
import ts from 'typescript';

const source = await readFile(new URL('../src/components/HomeVariants.css', import.meta.url), 'utf8');
const viewportSizes = [[1920, 1080], [1440, 900], [1366, 768], [1280, 720], [768, 1024], [430, 932], [375, 812], [320, 740]];
function stylesAt(width, height, dark) {
  const css = postcss.parse(source);
  css.walkAtRules('media', rule => {
    const bounds = [...rule.params.matchAll(/(min|max)-(width|height):\s*(\d+)px/g)];
    if (/prefers-reduced-motion/.test(rule.params) || bounds.some(([, limit, axis, pixels]) => {
      const size = axis === 'width' ? width : height;
      return limit === 'min' ? size < Number(pixels) : size > Number(pixels);
    })) rule.remove();
    else rule.replaceWith(...rule.nodes);
  });
  // JSDOM does not resolve var() in border shorthand. Substitute only the
  // existing theme token for this style contract; browser checks measure layout.
  const tokenSelector = dark ? '.home-variants' : 'html:not(.dark) .home-variants';
  let line;
  css.walkRules(rule => {
    if (rule.selector === tokenSelector) line = rule.nodes.find(node => node.prop === '--home-line')?.value ?? line;
  });
  assert.ok(line);
  return css.toString().replaceAll('var(--home-line)', line);
}

test('workout forms and balance keep their style contracts in eight viewports and both themes', t => {
  for (const [width, height] of viewportSizes) for (const dark of [false, true]) {
    const mobile = width < 768;
    const dom = new JSDOM(`<!doctype html><html class="${dark ? 'dark' : ''}"><head><style>${stylesAt(width, height, dark)}</style></head><body>
      <section class="home-variants"><div class="daily-summary"><div class="energy-card"></div><div class="daily-habits"><div></div></div></div></section>
      <section class="home-variants ${mobile ? 'entry-sheet-root' : ''}"><div class="entry-bottom-sheet">
      <form class="entry-form"><div class="entry-form-content entry-fields-grid entry-workout-fields">
        <div class="entry-field entry-description entry-activity"><textarea></textarea></div>
        <div class="entry-ai-controls"><section class="entry-estimate-result">
          <h5 class="entry-estimate-heading">Estimación con IA</h5><p class="entry-estimate-value">485 kcal</p>
          <p class="entry-estimate-context">${'Actividad extensa sin espacios: ' + 'x'.repeat(500)}</p>
          <p class="entry-estimate-note">Estimación basada en los datos proporcionados.</p>
          <details class="entry-estimate-details"><summary>¿Cómo se calculó?</summary><ul><li>${'Original assumption. '.repeat(50)}</li></ul></details>
        </section></div>
      </div><footer class="entry-form-footer"><button>Guardar ejercicio</button></footer></form>
      <div class="entry-fields-grid entry-workout-fields entry-edit-fields"></div>
      <div class="entry-fields-grid entry-meal-fields"></div></div></section>
      </body></html>`);
    t.after(() => dom.window.close());
    const document = dom.window.document;
    const style = selector => dom.window.getComputedStyle(document.querySelector(selector));
    const context = `${width}×${height}, ${dark ? 'dark' : 'light'}`;
    assert.equal(style('.energy-card').borderTopWidth, '1px', context);
    assert.equal(style('.energy-card').borderTopStyle, 'solid', context);
    assert.notEqual(style('.energy-card').borderTopColor, 'transparent', context);
    assert.equal(style('.energy-card').borderRadius, 'var(--radius-panel)', context);
    assert.equal(style('.entry-estimate-result').minWidth, '0', context);
    assert.equal(style('.entry-estimate-result').overflowWrap, 'anywhere', context);
    assert.equal(style('.entry-estimate-result').maxHeight, '', context);
    assert.equal(style('.entry-estimate-result').overflowY, '', context);
    assert.equal(style('.entry-estimate-details').maxHeight, '', context);
    assert.equal(style('.entry-estimate-details').overflowY, '', context);
    assert.ok(parseInt(style('.entry-estimate-details summary').minHeight) >= 44, context);
    assert.equal(style('.entry-estimate-context').whiteSpace, 'pre-wrap', context);
    assert.ok(parseInt(style('.entry-estimate-value').fontSize) > parseInt(style('.entry-estimate-note').fontSize), context);
    assert.equal(style('.entry-activity').gridArea, 'activity', context);
    assert.equal(style('.entry-activity textarea').minHeight, mobile ? '48px' : '42px', context);
    if (mobile) {
      assert.equal(style('.entry-form-content').display, 'flex', context);
      assert.equal(style('.entry-form-content').overflowY, 'auto', context);
      assert.equal(style('.entry-form-footer').flex, '0 0 auto', context);
      assert.ok(parseInt(style('.entry-form-footer button').minHeight) >= 48, context);
    } else {
      for (const selector of ['.entry-workout-fields', '.entry-workout-fields.entry-edit-fields']) {
        const areas = style(selector).gridTemplateAreas;
        assert.ok(areas.indexOf('ai') < areas.indexOf('secondary'), context);
        assert.ok(areas.includes('chips'), context);
      }
      assert.match(style('.entry-meal-fields').gridTemplateAreas, /secondary.*photo.*ai/, 'Meal ordering is preserved');
    }
  }
});

test('the energy border is fixed at its existing rule and inline explanations introduce no nested scrollport', () => {
  const css = postcss.parse(source);
  let baseEnergy;
  const estimateRules = [];
  css.walkRules(rule => {
    if (rule.selector === '.home-variants .energy-card' && rule.parent.type === 'root') baseEnergy = rule;
    if (rule.selector.includes('.entry-estimate')) estimateRules.push(rule);
    if (rule.selector.includes('.energy-card')) for (const node of rule.nodes) {
      if (node.prop === 'border') assert.notEqual(node.value, '0');
    }
  });
  assert.equal(baseEnergy.nodes.find(node => node.prop === 'border').value, '1px solid var(--home-line)');
  assert.equal(baseEnergy.nodes.find(node => node.prop === 'box-shadow').value, 'none');
  assert.ok(estimateRules.length > 0);
  for (const rule of estimateRules) for (const node of rule.nodes) {
    assert.ok(!['position', 'height', 'max-height', 'overflow', 'overflow-y', 'overflow-x', 'box-shadow'].includes(node.prop),
      `Explanations remain in normal form flow: ${rule.selector} ${node.prop}`);
  }
});

test('tablet creation gives activity the full row without changing desktop or edit grids', t => {
  for (const width of [767, 768, 900, 1023, 1024]) {
    const dom = new JSDOM(`<style>${stylesAt(width, 1024, true)}</style><div class="home-variants"><div class="entry-workout-fields"></div><div class="entry-workout-fields entry-edit-fields"></div></div>`);
    t.after(() => dom.window.close());
    const style = selector => dom.window.getComputedStyle(dom.window.document.querySelector(selector));
    const tablet = width >= 768 && width <= 1023;
    assert.equal(style('.entry-workout-fields').gridTemplateColumns,
      tablet ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr) 96px 96px', `${width}px`);
    const areas = style('.entry-workout-fields').gridTemplateAreas;
    if (tablet) {
      assert.ok(areas.includes('"activity activity"'), `${width}px: activity uses both columns`);
      assert.ok(areas.includes('"duration calories"'), `${width}px: numeric controls share the next row`);
      assert.ok(areas.includes('"ai ai"') && areas.includes('"secondary secondary"'), `${width}px: supplementary content stays full width`);
    } else assert.ok(areas.includes('"activity duration calories"'), `${width}px: existing non-tablet geometry`);
    assert.equal(style('.entry-edit-fields').gridTemplateColumns, 'minmax(0, 1fr) 96px', `${width}px: edit grid is preserved`);
  }
});

test('the native methodology summary participates in the edit dialog keyboard focus loop', async t => {
  const shellSource = (await readFile(new URL('../src/components/EntryFormShell.tsx', import.meta.url), 'utf8'))
    .replace("import { X } from '@phosphor-icons/react';", 'const X = () => null;');
  const code = ts.transpileModule(shellSource, { compilerOptions: { module: ts.ModuleKind.ESNext,
    jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023 } }).outputText
    .replace(/from ["']([^"']+)["']/g, (_, specifier) => `from ${JSON.stringify(import.meta.resolve(specifier))}`);
  const { default: EntryFormShell } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  const saved = Object.fromEntries(['window', 'document', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'].map(name => [name, globalThis[name]]));
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.HTMLElement.prototype.getClientRects = () => [{ width: 100, height: 44 }];
  const root = createRoot(document.getElementById('root'));
  t.after(async () => {
    await act(() => root.unmount()); dom.window.close();
    for (const [name, value] of Object.entries(saved)) globalThis[name] = value;
  });
  await act(() => root.render(React.createElement(EntryFormShell, { title: 'Editar ejercicio', desktopModal: true, onClose() {} },
    React.createElement('details', null, React.createElement('summary', null, '¿Cómo se calculó?'), 'Suposiciones originales'))));
  const close = document.querySelector('[aria-label="Cerrar formulario"]');
  const summary = document.querySelector('summary');
  assert.equal(document.activeElement, close);
  summary.focus();
  const tab = new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  await act(() => summary.dispatchEvent(tab));
  assert.equal(tab.defaultPrevented, true);
  assert.equal(document.activeElement, close, 'Tab from the final summary wraps to the dialog close control');
  const backwards = new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
  await act(() => close.dispatchEvent(backwards));
  assert.equal(backwards.defaultPrevented, true);
  assert.equal(document.activeElement, summary, 'Shift+Tab wraps back to the final native summary');
});
