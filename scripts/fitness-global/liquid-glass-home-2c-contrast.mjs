import assert from 'node:assert/strict';

const selectors = [
  '.entry-sheet-header h3', '.entry-sheet-header button', '.entry-date-context',
  '.entry-field-label', '.entry-unit', 'input:not([type=file])', 'textarea', 'select',
  '.entry-form button', '.fitness-extras summary', '.entry-photo-hint', '.entry-ai-controls [role=status]',
  '.entry-estimate-result h5', '.entry-estimate-result p', '.entry-estimate-result summary', '.meal-write-error',
  '.home-month-heading h4', '.home-date-picker button', '.home-month-weekdays span', '.home-calendar-footer span',
].join(',');

export async function contrast(page, dialog, stage, before, { targets = selectors, scope = '[aria-modal="true"]' } = {}) {
  const samples = await dialog.evaluate((root, selector) => {
    const points = (host, box) => [.26, .5, .74]
      .map(fraction => [Math.round(box.x + box.width * fraction), Math.round(box.y + box.height * .5)])
      .filter(([x, y]) => host.contains(document.elementFromPoint(x, y)));
    const item = (el, color, point, kind, label = '') => {
      const css = getComputedStyle(el);
      const disabled = !!el.closest(':disabled, [aria-disabled="true"]');
      const large = parseFloat(css.fontSize) >= 24 || (parseFloat(css.fontSize) >= 18.667 && parseInt(css.fontWeight, 10) >= 700);
      let opacity = 1;
      for (let node = el; node && node !== root.parentElement; node = node.parentElement) opacity *= +getComputedStyle(node).opacity;
      return { color, point, opacity, disabled, label, limit: kind === 'icon' || large ? 3 : 4.5, kind };
    };
    const results = [];
    const elements = [...root.querySelectorAll(selector)];
    if (root.matches(selector)) elements.unshift(root);
    for (const el of elements) {
      if (el.matches('textarea, input, select')) {
        const css = getComputedStyle(el);
        const color = !el.value && el.placeholder ? getComputedStyle(el, '::placeholder').color : css.color;
        const box = el.getBoundingClientRect();
        const p = [Math.round(box.x + box.width * .5), Math.round(box.y + Math.min(box.height / 2, 18))];
        if (el === document.elementFromPoint(...p)) results.push(item(el, color, [p], 'text', el.id));
      }
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      while (walker.nextNode()) {
        const node = walker.currentNode, parent = node.parentElement;
        const label = node.textContent.trim().replace(/\s+/g, ' ');
        if (!label || parent.closest('[aria-hidden=true], .sr-only, option') || parent.closest(selector) !== el) continue;
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (rect.width < 2 || rect.height < 6) continue;
          const p = points(parent, rect);
          if (p.length) results.push(item(parent, getComputedStyle(parent).color, p, 'text', label));
        }
      }
      if (el.matches('button') && el.querySelector('svg')) {
        const icon = el.querySelector('svg');
        const p = points(el, icon.getBoundingClientRect());
        if (p.length) results.push(item(icon, getComputedStyle(icon).color, p, 'icon', el.getAttribute('aria-label') || el.textContent.trim()));
      }
    }
    return results;
  }, targets);
  assert.ok(samples.length > 0, 'No hay muestras de contraste en ' + stage);
  const style = await page.addStyleTag({ content: `
    :is(${scope}), :is(${scope}) *, :is(${scope}) *::placeholder { -webkit-text-fill-color: transparent !important; text-shadow: none !important; }
    :is(${scope}) svg { visibility: hidden !important; }
  ` });
  let bitmap;
  try { bitmap = (await page.screenshot({ scale: 'css' })).toString('base64'); }
  finally { await style.evaluate(el => el.remove()); }
  const readings = await page.evaluate(async ({bitmap, samples}) => {
    const source = new Image();
    source.src = 'data:image/png;base64,' + bitmap;
    await source.decode();
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const m = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    function luminance(rgb) {
      return rgb.map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4)
        .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    }
    return samples.map(({color, point, opacity, disabled, label, limit, kind}) => {
      m.clearRect(0, 0, 1, 1);
      m.fillStyle = color;
      m.fillRect(0, 0, 1, 1);
      const rgba = [...m.getImageData(0, 0, 1, 1).data];
      const a = opacity * rgba[3] / 255;
      const ratio = Math.min(...point.map(([x, y]) => {
        const offset = 4 * (y * canvas.width + x);
        const bg = [...data.slice(offset, offset + 3)];
        const l1 = luminance(bg);
        const l2 = luminance(bg.map((channel, i) => channel * (1 - a) + rgba[i] * a));
        return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
      }));
      return {label, kind, disabled, limit, ratio};
    });
  }, {bitmap, samples});
  const violations = readings.filter(item => !item.disabled && item.ratio < item.limit);
  if (!before) assert.deepEqual(violations, [], stage);
  const minimum = matches => {
    const ratios = readings.filter(matches).map(item => item.ratio);
    return ratios.length ? Number(Math.min(...ratios).toFixed(2)) : null;
  };
  return {stage, samples: readings.length, textMin: minimum(item => item.kind === 'text' && !item.disabled),
    iconsMin: minimum(item => item.kind === 'icon' && !item.disabled), disabledMin: minimum(item => item.disabled), violations };
}
