import assert from 'node:assert/strict';

// Chromium keeps the hour, period and picker in a closed user-agent shadow tree.
export async function measureTime(cdp, id) {
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#' + id });
  const { node } = await cdp.send('DOM.describeNode', { nodeId, depth: 12, pierce: true });
  const parts = new Map();
  function index(part) {
    const offset = part.attributes?.indexOf('pseudo') ?? -1;
    if (offset >= 0) parts.set(part.attributes[offset + 1], part.backendNodeId);
    for (const child of [...(part.children ?? []), ...(part.shadowRoots ?? [])]) index(child);
  }
  index(node);
  async function read(name) {
    const backendNodeId = parts.get('-webkit-' + name);
    assert.ok(backendNodeId, name + ' must remain available in the native input');
    const { object } = await cdp.send('DOM.resolveNode', { backendNodeId });
    const { result, exceptionDetails } = await cdp.send('Runtime.callFunctionOn', {
      objectId: object.objectId, returnByValue: true,
      functionDeclaration: function () {
        const box = this.getBoundingClientRect();
        const canvas = this.ownerDocument.createElement('canvas').getContext('2d');
        canvas.font = getComputedStyle(this).font;
        const content = this.textContent;
        return { content, width: box.width, left: box.left, right: box.right,
          localeAllowance: Math.max(...['a. m.', 'p. m.'].map(value => canvas.measureText(value).width)) - canvas.measureText(content).width };
      }.toString(),
    });
    assert.equal(exceptionDetails, undefined);
    return result.value;
  }
  const editor = await read('datetime-edit');
  const fields = await read('datetime-edit-fields-wrapper');
  const dayPeriod = await read('datetime-edit-ampm-field');
  const picker = await read('calendar-picker-indicator');
  assert.match(fields.content, /^07:54\s*PM$/);
  assert.ok(picker.width > 0);
  return { display: fields.content, editorWidth: editor.width, fieldsWidth: fields.width, pickerWidth: picker.width,
    dayPeriodVisible: dayPeriod.right <= editor.right + 0.5,
    spareWithSpanishSuffix: editor.right - fields.right - Math.max(0, dayPeriod.localeAllowance) };
}
