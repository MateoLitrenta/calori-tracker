import assert from 'node:assert/strict';
import { test } from 'node:test';
import handler from '../api/ai/chat.ts';

test('estimate mode handles meal text, image, combined input, and workout without chat actions', async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'mock';
  let sent;
  globalThis.fetch = async (_url, options) => {
    sent = JSON.parse(options.body);
    const meal = sent.systemInstruction.parts[0].text.includes('comida');
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(meal
      ? { calories: 720, description: 'Milanesa con puré', assumptions: ['Porción mediana'], estimated: true }
      : { calories: 540, activity: 'Fútbol', assumptions: ['Intensidad no indicada'], estimated: true }) }] } }] });
  };
  const request = body => handler.fetch(new Request('http://localhost/api/ai/chat', { method: 'POST', body: JSON.stringify({ mode: 'estimate', ...body }) }));
  const image = { kind: 'image', mimeType: 'image/jpeg', data: 'aGVsbG8=' };
  try {
    for (const body of [
      { estimateType: 'meal', text: 'Milanesa con puré', details: 'Una porción' },
      { estimateType: 'meal', attachment: image },
      { estimateType: 'meal', text: 'Milanesa con puré', attachment: image },
    ]) {
      const response = await request(body);
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.calories, 720);
      assert.equal(result.estimated, true);
      assert.equal(Object.hasOwn(result, 'actions'), false);
      assert.equal(Boolean(sent.contents[0].parts[1]?.inlineData), Boolean(body.attachment));
      assert.equal(sent.contents[0].parts[0].text.includes('Milanesa'), Boolean(body.text));
      assert.ok(!sent.systemInstruction.parts[0].text.includes('ACTION_INSTRUCTIONS'));
    }
    const workout = await request({ estimateType: 'workout', text: 'Fútbol', duration: 60, profile: { weight: 80 }, details: 'Intensidad alta' });
    assert.equal(workout.status, 200);
    assert.deepEqual(await workout.json(), { calories: 540, activity: 'Fútbol', assumptions: ['Intensidad no indicada'], estimated: true });
    assert.match(sent.contents[0].parts[0].text, /60 min/);
    assert.match(sent.contents[0].parts[0].text, /80 kg/);
    for (const body of [
      { estimateType: 'workout', text: 'Fútbol', profile: { weight: 80 } },
      { estimateType: 'workout', text: 'Fútbol', duration: 60, profile: { weight: 80 }, attachment: image },
      { estimateType: 'meal', text: '' },
      { estimateType: 'meal', attachment: { ...image, mimeType: 'image/heic' } },
    ]) {
      const response = await request(body);
      assert.equal(response.status, 400);
      assert.equal(typeof (await response.json()).error, 'string');
    }
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey;
  }
});
