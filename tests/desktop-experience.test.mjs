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

test('desktop reflow is isolated from mobile; tablet keeps the existing dashboard and only Coach gets a bounded scroll layout', () => {
  styles.walkRules(item => {
    assert.equal(item.parent.type, 'atrule'); assert.equal(item.parent.name, 'media');
    assert.ok(['(min-width: 768px)', '(min-width: 1280px)'].includes(item.parent.params));
    for (const selector of item.selectors) assert.ok(selector.startsWith('.app-shell'), selector);
  });
  for (const selector of ['.app-shell .home-variants', '.app-shell .charts-insights', '.app-shell .profile-view.profile-v2']) {
    const item = rule(selector);
    assert.equal(item.parent.params, '(min-width: 1280px)'); assert.equal(value(item, 'display'), 'grid');
    assert.ok(!item.nodes.some(node => ['height', 'overflow', 'overflow-y'].includes(node.prop)), 'Normal views must remain able to grow/scroll');
  }
  assert.equal(value(rule('.app-shell-coach .app-main'), 'overflow'), 'hidden');
  const log = rule('.app-shell-coach .assistant-view .chat-messages');
  assert.equal(value(log, 'min-height'), '0'); assert.equal(value(log, 'overflow-y'), 'auto');
  const fixed = rule('.app-shell-coach .assistant-view .chat-heading');
  assert.equal(value(fixed, 'flex'), '0 0 auto');
  assert.equal(value(rule('.app-shell .home-variants .daily-logs ul'), 'overflow-y'), 'auto');
  assert.doesNotMatch(source, /\b(?:animation|transition|order)\s*:/, 'Keep existing motion/reduced-motion rules and DOM reading order');
});
