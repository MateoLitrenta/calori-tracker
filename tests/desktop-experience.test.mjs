import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import postcss from 'postcss';

const source = await readFile(new URL('../src/DesktopExperience.css', import.meta.url), 'utf8');
const styles = postcss.parse(source);
const rule = selector => {
  const matches = [];
  styles.walkRules(item => { if (item.selectors.includes(selector)) matches.push(item); });
  assert.equal(matches.length, 1, selector); return matches[0];
};
const value = (item, property) => item.nodes.find(node => node.prop === property)?.value;

test('desktop shell is isolated from mobile and only Coach gets a bounded scroll layout', () => {
  styles.walkRules(item => {
    if (item.parent.type === 'root') {
      assert.equal(item.selector, '.app-shell');
      assert.ok(item.nodes.every(node => node.type === 'decl' && node.prop.startsWith('--')), 'Only shared app tokens may apply outside desktop media queries');
      return;
    }
    assert.equal(item.parent.type, 'atrule'); assert.equal(item.parent.name, 'media');
    assert.ok(['(min-width: 768px)', '(min-width: 1280px)'].includes(item.parent.params));
    for (const selector of item.selectors) assert.ok(selector.startsWith('.app-shell'), selector);
  });
  assert.doesNotMatch(source, /charts-insights|profile-v2|home-variants/, 'Each view owns its desktop composition without a second override layer');
  assert.equal(value(rule('.app-shell-coach .app-main'), 'overflow'), 'hidden');
  const log = rule('.app-shell-coach .assistant-view .chat-messages');
  assert.equal(value(log, 'min-height'), '0'); assert.equal(value(log, 'overflow-y'), 'auto');
  const fixed = rule('.app-shell-coach .assistant-view .chat-heading');
  assert.equal(value(fixed, 'flex'), '0 0 auto');
  assert.doesNotMatch(source, /daily-logs[^{}]*\{[^}]*\b(?:max-height|overflow-y)\s*:/, 'Journal must grow with the normal page scroll');
  assert.doesNotMatch(source, /\b(?:animation|transition|order)\s*:/, 'Keep existing motion/reduced-motion rules and DOM reading order');
});
