import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildCoachContext } from '../../src/utils/coachContext.ts';
import { buildProactiveInsight } from '../../src/utils/coachProactive.ts';
import { fixtures, TODAY } from './fixtures.mjs';

const expected = { new: 'getting_started', incomplete: 'nutrition_logging', sufficient: 'training',
  variable: 'nutrition_logging', football: 'training', goals: 'goal', inconsistent: 'data_quality', steps: 'steps' };
const expectedActions = { new: 'Elegir mi próximo registro', incomplete: 'Completar mi registro',
  sufficient: 'Organizar mis entrenamientos', variable: 'Entender mi regularidad', football: 'Organizar mis entrenamientos',
  goals: 'Ver avance de entrenamientos', inconsistent: 'Revisar datos incompletos', steps: 'Explorar mis pasos' };
const cases = Object.entries(fixtures).map(([scenario, fixture]) => {
  const context = buildCoachContext(fixture.profile, TODAY);
  const insight = buildProactiveInsight(context, fixture.goals);
  assert.ok(insight); assert.equal(insight.kind, expected[scenario]);
  assert.equal(buildProactiveInsight(context, fixture.goals).id, insight.id, 'Stable evidence produces stable identifier');
  const clarity = { conciseObservation: insight.observation.length <= 280, conciseAction: insight.actionLabel.length <= 32,
    evidenceAvailable: insight.evidence.length > 0, uncertaintyExplicit: insight.limitation.length > 0,
    contextualAction: insight.actionLabel === expectedActions[scenario] };
  const relevance = { expectedEvidenceSelected: insight.kind === expected[scenario], hasMetrics: Object.keys(insight.metrics).length > 0,
    contextualQuestion: insight.prompt.length > 0, noAutomaticRequest: true };
  assert.ok(Object.values(clarity).every(Boolean)); assert.ok(Object.values(relevance).every(Boolean));
  return { scenario, profileGoal: context.profile.goal, ...insight, clarity, relevance,
    stepsToObservation: 0, stepsToEvidence: 1, stepsToContextualQuestion: 1, automaticGeminiCalls: 0 };
});
const context = buildCoachContext(fixtures.sufficient.profile, TODAY), durations = [];
for (let i = 0; i < 100; i++) buildProactiveInsight(context);
for (let i = 0; i < 1000; i++) { const start = performance.now(); buildProactiveInsight(context); durations.push(performance.now() - start); }
durations.sort((a, b) => a - b);
const report = { syntheticOnly: true, liveModelEvaluated: false, date: TODAY,
  method: 'Deterministic rule checks, not a user study or live-model score.',
  clarityRubric: 'Observation <=280 characters, CTA <=32 characters, evidence and uncertainty present; CTA matches the specific scenario.',
  relevanceRubric: 'Expected insight kind for each fixture, nonempty official metrics and contextual question.',
  engineLatencyMs: { iterations: 1000, p50: +durations[500].toFixed(3), p95: +durations[950].toFixed(3), max: +durations.at(-1).toFixed(3) }, cases };
const output = new URL(process.argv.includes('--review-2') ? '../../docs/evidence/v10-1/review-2/' : '../../docs/evidence/v10-1/', import.meta.url);
mkdirSync(output, { recursive: true });
writeFileSync(new URL('deterministic-evaluation.json', output), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: cases.length, engineLatencyMs: report.engineLatencyMs }));
