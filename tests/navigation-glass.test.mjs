import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import postcss from 'postcss';

const readCSS = async file => postcss.parse(await readFile(new URL('../src/' + file, import.meta.url), 'utf8'));
const [styles, palette] = await Promise.all([readCSS('components/NavigationGlass.css'), readCSS('FitnessSystem.css')]);
const surfaces = ['.bottom-nav-track', '.app-sidebar'];
const indicators = ['.bottom-nav-indicator', '.sidebar-nav-indicator'];
const root = parent => parent.type === 'root';
const query = (name, condition) => parent => parent.type === 'atrule' && parent.name === name && condition.test(parent.params);
const glassSupport = query('supports', /backdrop-filter.*color-mix/);
const tintSupport = query('supports', /^\(background: color-mix/);
const relativeTintSupport = query('supports', /^\(color: hsl\(from red /);
const darkTint = ':where(html.dark) :is(.bottom-nav-indicator, .sidebar-nav-indicator)';
const contrastPreference = query('media', /prefers-contrast: more.*prefers-reduced-transparency: reduce/);
const forcedColors = query('media', /forced-colors: active/);

function value(css, selector, property, inScope = root) {
  let result;
  css.walkRules(rule => {
    if (rule.selectors.includes(selector) && inScope(rule.parent)) {
      rule.walkDecls(property, declaration => { result = declaration.value; });
    }
  });
  return result;
}

test('navigation material falls back to an opaque surface and keeps blur scoped to its two surfaces', () => {
  for (const surface of surfaces) {
    assert.equal(value(styles, surface, 'background'), 'var(--fit-surface)');
    assert.equal(value(styles, surface, 'backdrop-filter'), undefined);
    assert.match(value(styles, surface, 'background', glassSupport), /radial-gradient\([\s\S]*var\(--glass-nav-reflection-depth\)/);
    for (const property of ['backdrop-filter', '-webkit-backdrop-filter']) {
      assert.match(value(styles, surface, property, glassSupport), /^blur\(/);
      assert.equal(value(styles, surface, property, contrastPreference), 'none');
      assert.equal(value(styles, surface, property, forcedColors), 'none');
    }
    assert.equal(value(styles, surface, 'background', contrastPreference), 'var(--fit-surface)');
    assert.equal(value(styles, surface, 'background', forcedColors), 'Canvas');
  }
  styles.walkDecls(/^(?:-webkit-)?backdrop-filter$/, declaration => {
    if (declaration.value === 'none') return;
    assert.ok(declaration.parent.selectors.every(selector => surfaces.includes(selector)));
    assert.ok(glassSupport(declaration.parent.parent));
  });
});

test('navigation selection has a solid fallback and pairs system colors in forced-colors mode', () => {
  for (const indicator of indicators) {
    assert.equal(value(styles, indicator, 'background'), 'var(--fit-board)');
    assert.equal(value(styles, indicator, 'border'), '1px solid var(--glass-nav-selected-edge)');
    assert.match(value(styles, indicator, 'background', tintSupport), /linear-gradient\([\s\S]*var\(--fit-orange\)/);
    assert.equal(value(styles, indicator, 'background', forcedColors), 'Highlight');
  }
  assert.match(value(styles, darkTint, 'background', relativeTintSupport),
    /hsl\(from var\(--fit-orange\) h s var\(--glass-nav-tint-lightness-high\)\)[\s\S]*hsl\(from var\(--fit-orange\) h s var\(--glass-nav-tint-lightness-low\)\)/);
  const current = ':is(.bottom-nav-item, .sidebar-nav-item)[aria-current="page"]';
  assert.equal(value(styles, current, 'color', forcedColors), 'HighlightText');
  assert.equal(value(styles, current + ':focus-visible', 'outline-color', forcedColors), 'HighlightText');
  assert.equal(value(styles, ':is(.bottom-nav-item, .sidebar-nav-item):focus-visible', 'outline-color', forcedColors), 'ButtonText');
});

const rgb = hex => {
  assert.match(hex, /^#[\da-f]{6}$/i);
  return hex.slice(1).match(/../g).map(channel => Number.parseInt(channel, 16) / 255);
};
const mix = (top, bottom, alpha) => top.map((value, index) => alpha * value + (1 - alpha) * bottom[index]);
function luminance(rgb) {
  const channels = rgb.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}
function contrast(a, b) {
  const [low, high] = [luminance(a), luminance(b)].sort((left, right) => left - right);
  return (high + .05) / (low + .05);
}
const percent = token => {
  assert.match(token, /^\d+(?:\.\d+)?%$/);
  return Number.parseFloat(token) / 100;
};
function withLightness(color, lightness) {
  const max = Math.max(...color), min = Math.min(...color);
  const chroma = max - min;
  const saturation = chroma / (1 - Math.abs(max + min - 1));
  const nextChroma = saturation * (1 - Math.abs(2 * lightness - 1));
  return color.map(channel => lightness - nextChroma / 2 + nextChroma * (channel - min) / chroma);
}

test('navigation tokens retain text, icon, focus and selection contrast across backdrop extremes', () => {
  for (const button of ['.bottom-nav-item', '.sidebar-nav-item']) {
    assert.equal(value(styles, button, 'color'), 'var(--fit-ink)');
  }
  assert.match(value(styles, ':is(.bottom-nav-item, .sidebar-nav-item):focus-visible', 'outline'), /var\(--fit-focus\)/);
  // With a fixed alpha scrim, black and white bound the luminance of any RGB
  // backdrop. The browser runner independently samples the rendered gradient.
  const backgroundExtremes = [[0, 0, 0], [1, 1, 1]];
  for (const theme of ['Claro', 'Oscuro']) {
    const token = (css, property) => (theme === 'Oscuro' ? value(css, 'html.dark', property) : undefined)
      ?? value(css, ':root', property);
    const color = property => rgb(token(palette, property));
    const board = color('--fit-board'), ink = color('--fit-ink'), focus = color('--fit-focus');
    const orange = color('--fit-orange'), surface = color('--fit-surface'), soft = color('--fit-soft');
    const edgeToken = token(styles, '--glass-nav-selected-edge').match(/^var\((--[\w-]+)\)$/)?.[1];
    assert.ok(edgeToken);
    const selectedEdge = color(edgeToken);
    const low = percent(token(styles, '--glass-nav-tint-low'));
    const high = percent(token(styles, '--glass-nav-tint-high'));
    const tint = Array.from({ length: 11 }, (_, index) => mix(orange, board, low + (high - low) * index / 10));
    if (theme === 'Oscuro') {
      const lowerLightness = percent(token(styles, '--glass-nav-tint-lightness-low'));
      const upperLightness = percent(token(styles, '--glass-nav-tint-lightness-high'));
      const saturatedStops = Array.from({ length: 11 }, (_, index) =>
        withLightness(orange, lowerLightness + (upperLightness - lowerLightness) * index / 10));
      tint.push(...saturatedStops);
    }
    const reflection = token(styles, '--glass-nav-reflection').match(/^rgb\(255 255 255 \/ ([.\d]+)\)$/)?.[1];
    assert.ok(reflection);

    for (const target of surfaces) {
      const opacity = percent((theme === 'Oscuro' && value(styles, 'html.dark ' + target, '--glass-nav-opacity'))
        || value(styles, target, '--glass-nav-opacity'));
      const glass = backgroundExtremes.map(backdrop => mix(surface, backdrop, opacity));
      const illuminated = glass.map(backdrop => mix([1, 1, 1], backdrop, Number(reflection)));
      for (const backdrop of [...glass, ...illuminated, surface]) {
        assert.ok(contrast(ink, backdrop) >= 4.5, theme + ' ' + target + ' label/icon');
        assert.ok(contrast(focus, backdrop) >= 3, theme + ' ' + target + ' focus');
        assert.ok(contrast(selectedEdge, backdrop) >= 3, theme + ' ' + target + ' active edge');
        if (target === '.app-sidebar') {
          for (const property of ['--fit-quiet', '--fit-danger']) {
            assert.ok(contrast(color(property), backdrop) >= 4.5, theme + ' sidebar ' + property);
          }
        }
      }
      for (const backdrop of [...tint, board, soft]) {
        assert.ok(contrast(ink, backdrop) >= 4.5, theme + ' selection/hover label/icon');
        assert.ok(contrast(focus, backdrop) >= 3, theme + ' selection/hover focus');
      }
    }
  }
});
