import assert from 'node:assert/strict';
import { test } from 'node:test';
import { explicitWorkoutGoal, resolveCoachGoalProposal } from '../server/coachGoalProposal.ts';
import { workoutGoalConversation } from '../server/coachGoalConversation.ts';

const today='2026-10-13';
const explicit='Quiero establecer un objetivo de tres entrenamientos durante los próximos siete días y guardarlo en Calori';
const values={type:'workout_sessions',target:3,startDate:today,endDate:'2026-10-19',stepThreshold:null};
const resolve=(text,overrides={})=>resolveCoachGoalProposal({text,today,availability:'available',goals:[],
  reply:'Te propongo un objetivo. ¿Quieres confirmarlo?',suggestion:null,...overrides});

test('whole-message extraction supports only explicit counts and relative inclusive periods',()=>{
  assert.deepEqual(explicitWorkoutGoal(explicit,today),values);
  assert.deepEqual(explicitWorkoutGoal('Quiero establecer un objetivo de 3 sesiones de entrenamiento durante los próximos 7 días. Quiero guardarlo en Calori para que puedas hacer seguimiento de mi progreso.',today),values);
  assert.equal(explicitWorkoutGoal('Quiero establecer un objetivo de 31 entrenamientos durante los próximos 31 días',today).endDate,'2026-11-12');
  for(const text of [
    'No '+explicit, 'Si quisiera establecer un objetivo de tres entrenamientos durante los próximos siete días',
    explicit+' pero no lo guardes', explicit+' si puedo', explicit+' o cuatro entrenamientos',
    'Mi amigo dijo: "'+explicit+'"', '¿Cómo establezco un objetivo de tres entrenamientos durante siete días?',
    'Quiero establecer un objetivo de tres entrenamientos durante los próximos siete días a partir de mañana',
    'Quiero establecer un objetivo de tres entrenamientos del 15 al 21 de octubre',
    'Quiero establecer un objetivo de cero entrenamientos durante los próximos siete días',
    'Quiero establecer un objetivo de 32 entrenamientos durante los próximos siete días',
    'Quiero establecer un objetivo de tres entrenamientos durante los próximos 32 días',
    'Quiero establecer un objetivo de tres entrenamientos durante los próximos 0 días',
    'Quiero establecer un objetivo de tres entrenamientos', '¿Cómo vengo entrenando?', 'sí',
  ]) assert.equal(explicitWorkoutGoal(text,today),undefined,text);
});

const conversationToday = '2026-10-21';
const conversation = texts => texts.flatMap(text => [{ role: 'user', text }, { role: 'bot', text: 'Tu meta será entrenar tres veces por semana. Ya está guardada.' }]).slice(0, -1);
const resolveConversation = (texts, overrides = {}) => resolveCoachGoalProposal({ today: conversationToday,
  text: texts.at(-1), messages: conversation(texts), availability: 'available', goals: [],
  reply: 'Tu meta será ir al gimnasio tres veces por semana. Te ayudaré a seguir tu progreso.',
  suggestion: { ...values, operation: 'accept', target: 12, startDate: '2026-11-01', endDate: '2026-11-30' }, ...overrides });

test('observed conversation keeps the weekly count through September/November corrections without inventing a monthly total', () => {
  const texts = ['Quiero ir al gimnasio 3 veces por semana durante el mes de noviembre',
    'Septiembre', 'Perdón, es para el mes de noviembre', 'No quiero otras metas', '¿Podés guardar mi objetivo?'];
  for (let length = 1; length <= texts.length; length++) {
    const result = resolveConversation(texts.slice(0, length));
    assert.equal(result.goalProposal, undefined);
    assert.doesNotMatch(result.reply, /Tu meta será|Te ayudaré|12 entrenamientos|propuesta confirmable/);
    assert.match(result.reply, length === 2 ? /período ya pasó/ : /3 sesiones por semana/);
    assert.match(result.reply, /no se guardó/);
  }
  const corrected = resolveConversation([texts[0], 'Septiembre', 'Perdón, quise decir noviembre, no septiembre']);
  assert.match(corrected.reply, /no puede exigir una frecuencia cada semana/);
});

test('natural workout requests and explicit monthly totals produce exact inclusive dates even when Gemini omits or contradicts the object', () => {
  for (const suggestion of [null, undefined, { operation: 'accept', ...values, target: 31 }]) {
    for (const [text, target, startDate, endDate] of [
      ['Quiero entrenar 3 veces durante los próximos 7 días', 3, conversationToday, '2026-10-27'],
      ['Quiero una meta de 12 entrenamientos durante noviembre', 12, '2026-11-01', '2026-11-30'],
      ['Quiero un objetivo de 12 entrenamientos del 2026-11-01 al 2026-11-30', 12, '2026-11-01', '2026-11-30'],
      ['Quiero una meta de 12 entrenamientos durante noviembre de 2026', 12, '2026-11-01', '2026-11-30'],
    ]) {
      const result = resolveConversation([text], { suggestion });
      assert.deepEqual({ ...result.goalProposal, id: undefined }, { type: 'workout_sessions', target, startDate, endDate, stepThreshold: null, operation: 'accept', id: undefined });
      assert.match(result.reply, /todavía no está guardada/);
    }
  }
});

const naturalToday = '2026-11-13';
const naturalRequest = 'Quiero fijar un objetivo de 2 entrenamientos en total del 13 al 19 de noviembre de 2026.';
const naturalValues = { type: 'workout_sessions', target: 2, startDate: naturalToday, endDate: '2026-11-19', stepThreshold: null };
const resolveNatural = (texts, overrides = {}) => resolveCoachGoalProposal({ today: naturalToday,
  text: texts.at(-1), messages: conversation(texts), availability: 'available', goals: [],
  reply: 'Ya guardé tu objetivo de 31 sesiones.', suggestion: null, ...overrides });

test('the observed explicit natural range and en total preserve user values when the model omits or contradicts the proposal', () => {
  for (const text of [naturalRequest, naturalRequest.replace(' en total', ''), naturalRequest.replace('de 2 entrenamientos', 'de dos entrenamientos'),
    'Quiero fijar un objetivo de 2 entrenamientos en total del 2026-11-13 al 2026-11-19.']) {
    for (const suggestion of [null, undefined, { ...naturalValues, operation: 'accept', target: 31,
      startDate: '2026-11-14', endDate: '2026-11-20' }]) {
      const result = resolveNatural([text], { suggestion });
      assert.deepEqual({ ...result.goalProposal, id: undefined }, { ...naturalValues, operation: 'accept', id: undefined });
      assert.match(result.reply, /2 sesiones.*2026-11-13 al 2026-11-19/);
      assert.match(result.reply, /todavía no está guardada/);
      assert.doesNotMatch(result.reply, /31 sesiones|Ya guardé/);
    }
  }
});

test('unambiguous named ranges support same day, month boundaries, explicit years and leap days without rolling dates', () => {
  for (const [today, range, startDate, endDate] of [
    ['2026-11-13', 'del 13 al 13 de noviembre de 2026', '2026-11-13', '2026-11-13'],
    ['2026-11-13', 'del 13 de noviembre al 13 de diciembre de 2026', '2026-11-13', '2026-12-13'],
    ['2026-11-28', 'del 28 de noviembre al 4 de diciembre de 2026', '2026-11-28', '2026-12-04'],
    ['2026-12-28', 'del 28 de diciembre de 2026 al 3 de enero de 2027', '2026-12-28', '2027-01-03'],
    ['2028-02-28', 'del 28 de febrero al 1 de marzo de 2028', '2028-02-28', '2028-03-01'],
    ['2028-02-29', 'del 29 al 29 de febrero de 2028', '2028-02-29', '2028-02-29'],
  ]) {
    const result = resolveNatural([`Quiero una meta de 2 entrenamientos en total ${range}`], { today });
    assert.equal(result.goalProposal.target, 2);
    assert.equal(result.goalProposal.startDate, startDate); assert.equal(result.goalProposal.endDate, endDate);
    assert.match(result.reply, /todavía no está guardada/);
  }
});

test('invalid calendars, reversed ranges, excessive periods and distant starts require a concrete correction', () => {
  for (const [today, range, expected] of [
    [naturalToday, 'del 13 al 31 de noviembre de 2026', /fechas válidas y ordenadas/],
    ['2027-02-28', 'del 28 al 29 de febrero de 2027', /fechas válidas y ordenadas/],
    [naturalToday, 'del 19 al 13 de noviembre de 2026', /fechas válidas y ordenadas/],
    [naturalToday, 'del 13 de noviembre al 14 de diciembre de 2026', /período debe tener entre 1 y 31 días/],
    [naturalToday, 'del 15 al 19 de diciembre de 2026', /inicio debe estar/],
    [naturalToday, 'del 13 al 19 de octubre de 2026', /período ya pasó/],
    ['2026-12-28', 'del 28 de diciembre al 3 de enero de 2027', /fechas válidas y ordenadas/],
  ]) {
    const result = resolveNatural([`Quiero fijar un objetivo de 2 entrenamientos en total ${range}`], { today,
      suggestion: { ...naturalValues, operation: 'accept' } });
    assert.equal(result.goalProposal, undefined, range); assert.match(result.reply, expected);
    assert.match(result.reply, /no se guardó/);
  }
  for (const target of [0, 32, 999]) {
    const result = resolveNatural([naturalRequest.replace('de 2 entrenamientos', `de ${target} entrenamientos`)]);
    assert.equal(result.goalProposal, undefined); assert.match(result.reply, /meta debe ser de 1 a 31 sesiones/);
  }
});

test('missing years and partial date ranges preserve the target for an explicit date clarification only', () => {
  for (const range of ['del 13 al 19 de noviembre', 'del 13 al 19',
    'del 13 de noviembre de 2026 al 19 de noviembre', 'del 13/11/2026 al 19/11/2026']) {
    const initial = `Quiero fijar un objetivo de 2 entrenamientos en total ${range}`;
    const incomplete = resolveNatural([initial], { suggestion: { ...naturalValues, operation: 'accept' } });
    assert.equal(incomplete.goalProposal, undefined); assert.match(incomplete.reply, /Conservo tu meta de 2 sesiones/);
    assert.match(incomplete.reply, /AAAA-MM-DD/);
    const corrected = resolveNatural([initial, 'del 13 al 19 de noviembre de 2026']);
    assert.equal(corrected.goalProposal.target, 2); assert.equal(corrected.goalProposal.endDate, '2026-11-19');
    assert.equal(resolveNatural([initial, '¿Cuántas calorías tiene una manzana?', 'del 13 al 19 de noviembre de 2026']).goalProposal, undefined);
  }
});

test('natural date recognition cannot convert noncommitting requests, extra restrictions or weekly recurrence into accepted totals', () => {
  for (const text of ['No ' + naturalRequest, 'Si pudiera, ' + naturalRequest,
    `Mi amigo dijo: "${naturalRequest}"`, naturalRequest + ' pero no lo guardes',
    naturalRequest + ' si puedo', naturalRequest + ' o 3 entrenamientos', naturalRequest + ' solo gimnasio']) {
    assert.equal(resolveNatural([text], { suggestion: { ...naturalValues, operation: 'accept' } }).goalProposal, undefined, text);
  }
  const weekly = resolveNatural(['Quiero fijar un objetivo de 2 entrenamientos por semana del 13 al 19 de noviembre de 2026']);
  assert.equal(weekly.goalProposal, undefined); assert.match(weekly.reply, /2 sesiones por semana/);
  for (const availability of ['disabled', 'unavailable']) {
    const result = resolveNatural([naturalRequest], { availability });
    assert.equal(result.goalProposal, undefined); assert.match(result.reply, availability === 'disabled' ? /no están habilitados/ : /No pude consultar/);
  }
});

const cancelRequest = 'Quiero cancelar mi objetivo de entrenamiento confirmado.';
const activeWorkout = { ...naturalValues, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', target: 3,
  status: 'active', version: 2, createdAt: '2026-11-13T12:00:00Z', updatedAt: '2026-11-13T12:05:00Z' };

test('the exact current cancellation command uses only the unique official active workout and version', () => {
  for (const suggestion of [null, undefined, { operation: 'cancel', id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    { ...activeWorkout, operation: 'cancel', expectedVersion: 1, target: 31 },
    { ...naturalValues, operation: 'accept' }]) {
    const result = resolveNatural([cancelRequest], { goals: [activeWorkout], goalsTruncated: false,
      suggestion, reply: 'Ya cancelé tu objetivo.' });
    assert.deepEqual(result.goalProposal, { ...activeWorkout, operation: 'cancel', expectedVersion: 2 });
    assert.match(result.reply, /cancelar tu objetivo de 3 sesiones.*2026-11-13 al 2026-11-19/);
    assert.match(result.reply, /confirmala con el botón; todavía no se guardó/);
    assert.doesNotMatch(result.reply, /Ya cancelé|31 sesiones/);
  }
});

test('cancellation requires complete available goals and a single active workout, ignoring model-selected alternatives', () => {
  const stepGoal = { ...activeWorkout, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', type: 'step_days', target: 3, stepThreshold: 8000 };
  for (const overrides of [
    { goals: [] }, { goals: [{ ...activeWorkout, status: 'cancelled' }] }, { goals: [stepGoal] },
    { goals: [activeWorkout, { ...activeWorkout, id: stepGoal.id }] }, { goals: [activeWorkout, stepGoal] },
    { goals: [activeWorkout], goalsTruncated: true }, { goals: [activeWorkout], availability: 'disabled' },
    { goals: [activeWorkout], availability: 'unavailable' },
  ]) {
    const result = resolveNatural([cancelRequest], { suggestion: { operation: 'cancel', id: activeWorkout.id }, ...overrides });
    assert.equal(result.goalProposal, undefined); assert.match(result.reply, /todavía no se guardó/);
    assert.doesNotMatch(result.reply, /meta y el período|Preparé la propuesta/);
  }
  const result = resolveNatural([cancelRequest], { goals: [activeWorkout, { ...stepGoal, status: 'cancelled' }] });
  assert.equal(result.goalProposal.id, activeWorkout.id);
});

test('cancellation does not use a prior command or noncommitting current messages', () => {
  for (const text of ['No ' + cancelRequest, 'Si pudiera, ' + cancelRequest,
    `Mi amigo dijo: "${cancelRequest}"`, cancelRequest + ' pero no lo canceles',
    '¿Cómo cancelo mi objetivo de entrenamiento confirmado?', 'Quiero saber si puedo cancelar mi objetivo de entrenamiento confirmado']) {
    const result = resolveNatural([text], { goals: [activeWorkout], suggestion: { operation: 'cancel', id: activeWorkout.id } });
    assert.equal(result.goalProposal, undefined, text);
  }
  const current = '¿Cómo voy con mi objetivo?';
  const result = resolveNatural([cancelRequest, current], { goals: [activeWorkout], suggestion: null, reply: 'Tu progreso sigue disponible.' });
  assert.equal(result.goalProposal, undefined); assert.equal(result.reply, 'Tu progreso sigue disponible.');
});

test('safe clarifications reuse only user counts and the corrected month; save references work without repeating the request', () => {
  for (const correction of ['Perdón, es para el mes de noviembre', 'Perdón, quise decir noviembre, no septiembre']) {
    const result = resolveConversation(['Quiero una meta de 12 entrenamientos', 'Septiembre', correction, 'Quiero guardar el objetivo que acabamos de definir']);
    assert.equal(result.goalProposal.target, 12);
    assert.equal(result.goalProposal.startDate, '2026-11-01'); assert.equal(result.goalProposal.endDate, '2026-11-30');
  }
  assert.match(resolveConversation(['Quiero entrenar 3 veces']).reply, /Conservo tu meta de 3 sesiones/);
  const result = resolveConversation(['Quiero entrenar 3 veces', 'los próximos 7 días']);
  assert.equal(result.goalProposal.target, 3); assert.equal(result.goalProposal.endDate, '2026-10-27');
});

test('weekly alternatives require an explicit choice; monthly totals are never multiplied from a weekly frequency', () => {
  const initial = 'Quiero ir al gimnasio 3 veces por semana durante noviembre';
  for (const followup of ['sí', 'dale', '¿Podés guardar mi objetivo?']) assert.equal(resolveConversation([initial, followup]).goalProposal, undefined);
  const weekly = resolveConversation([initial, 'Prefiero la opción semanal']);
  assert.equal(weekly.goalProposal.target, 3); assert.equal(weekly.goalProposal.startDate, conversationToday);
  assert.equal(weekly.goalProposal.endDate, '2026-10-27');
  const monthly = resolveConversation([initial, 'Acepto una meta total de 10 entrenamientos para noviembre, sin exigir tres sesiones cada semana']);
  assert.equal(monthly.goalProposal.target, 10); assert.equal(monthly.goalProposal.endDate, '2026-11-30');
});

test('negations, quotes, hypothetical/ambiguous turns and topic changes cannot revive a previous draft or trust a bot claim', () => {
  const initial = 'Quiero entrenar 3 veces durante los próximos 7 días';
  for (const text of ['No quiero guardar mi objetivo', 'No lo guardes', 'Si puedo', '¿Y si entreno tres veces?',
    'Quiero una meta de 12 entrenamientos durante noviembre o diciembre', 'Mi amigo dijo: "Quiero entrenar 3 veces"',
    '¿Cuántas calorías tiene una manzana?', 'Registrá una comida hoy']) {
    assert.equal(resolveConversation([initial, text, '¿Podés guardar mi objetivo?']).goalProposal, undefined, text);
  }
  assert.equal(resolveConversation(['¿Podés guardar mi objetivo?']).goalProposal, undefined);
  assert.equal(workoutGoalConversation([{ role: 'bot', text: initial }, { role: 'user', text: 'Noviembre' }], conversationToday), undefined);
  assert.equal(workoutGoalConversation(conversation([initial, 'sí']), conversationToday), undefined);
});

test('invalid dates, targets, past months and distant starts request a concrete correction without silent coercion', () => {
  for (const [text, expected] of [
    ['Quiero una meta de 12 entrenamientos durante septiembre', /período ya pasó/],
    ['Quiero una meta de 12 entrenamientos durante diciembre', /inicio debe estar/],
    ['Quiero entrenar 3 veces durante los próximos 32 días', /período debe tener/],
    ['Quiero una meta de 32 entrenamientos durante noviembre', /meta debe ser/],
    ['Quiero un objetivo de 3 entrenamientos del 2026-11-01 al 2026-11-31', /fechas válidas/],
  ]) {
    const result = resolveConversation([text]); assert.equal(result.goalProposal, undefined); assert.match(result.reply, expected);
  }
  for (const availability of ['disabled', 'unavailable']) {
    const result = resolveConversation(['Quiero entrenar 3 veces', 'los próximos 7 días'], { availability });
    assert.equal(result.goalProposal, undefined); assert.match(result.reply, availability === 'disabled' ? /no están habilitados/ : /No pude consultar/);
  }
});
test('missing, malformed and contradictory provider proposals cannot override an exact user request',()=>{
  for(const suggestion of [null,undefined,{...values,operation:'accept',startDate:'2026-02-30'},
    {...values,operation:'accept',target:4,endDate:'2026-10-20'}]) {
    const result=resolve(explicit,{suggestion});
    assert.equal(result.goalProposal.target,3);assert.equal(result.goalProposal.endDate,'2026-10-19');
    assert.equal(result.goalProposal.operation,'accept');assert.match(result.reply,/todavía no está guardada/);
    assert.ok(!result.reply.includes('4 sesiones'));
  }
});
test('valid structured proposals keep the existing normalizer, including step-day goals',()=>{
  const result=resolve('Quiero establecer un objetivo de cinco días con 8000 pasos durante los próximos siete días',{reply:'Propuesta de pasos.',
    suggestion:{...values,type:'step_days',target:5,stepThreshold:8000,operation:'accept'}});
  assert.equal(result.goalProposal.target,5);assert.equal(result.goalProposal.stepThreshold,8000);
  assert.equal(result.reply,'Propuesta de pasos.');
});
test('negations, hypotheticals, information and ambiguous yes suppress even model-provided goal objects',()=>{
  for(const text of ['No quiero guardar un objetivo',explicit+' pero no lo guardes',explicit+' si puedo',
    'Si quisiera crear un objetivo de entrenamiento','¿Y si establezco un objetivo de tres sesiones?',
    '¿Cómo vengo con mi objetivo?','¿Cuáles son mis objetivos?','Quiero consultar mis objetivos',
    'Mi amigo dijo: "'+explicit+'"','sí']) {
    assert.equal(resolve(text,{suggestion:{...values,operation:'accept'}}).goalProposal,undefined,text);
  }
});
test('invalid or incomplete proposals request clarification without a promise of a confirmation button',()=>{
  for(const text of ['Quiero establecer un objetivo','Quiero establecer un objetivo de pasos']) {
    const result=resolve(text,{suggestion:{...values,operation:'accept',startDate:'2026-02-30'}});
    assert.equal(result.goalProposal,undefined);assert.match(result.reply,/Indicame el tipo de objetivo, la meta y el período/);
  }
  const invented=resolve('Quiero establecer un objetivo',{suggestion:{...values,operation:'accept'}});
  assert.equal(invented.goalProposal,undefined);assert.match(invented.reply,/Indicame/);
  for(const text of ['Quiero establecer un objetivo de tres entrenamientos durante los próximos 32 días',
    'Quiero establecer un objetivo de tres entrenamientos del 2026-02-30 al 2026-03-06'])
    assert.equal(resolve(text,{suggestion:{...values,operation:'accept'}}).goalProposal,undefined);
  assert.equal(resolve('¿Cómo vengo entrenando?',{reply:'Venís con regularidad.',suggestion:null}).reply,'Venís con regularidad.');
});
test('disabled and unavailable persistence produce explicit responses, with no goal proposal or false saved claim',()=>{
  for(const availability of ['disabled','unavailable']) {
    const result=resolve(explicit,{availability,reply:'Guardé tu objetivo.',suggestion:{...values,operation:'accept'}});
    assert.equal(result.goalProposal,undefined);assert.ok(!result.reply.includes('Guardé'));
    assert.match(result.reply,availability==='disabled'?/no están habilitados/:/No pude consultar/);
  }
  assert.match(resolve('Quiero establecer un objetivo',{reply:'Guardé el objetivo.'}).reply,/No se guardó ningún cambio/);
  const savedClaim=resolve('Quiero entrenar tres veces esta semana',{reply:'Tu objetivo fue guardado.',suggestion:{...values,operation:'accept'}});
  assert.ok(savedClaim.goalProposal);assert.match(savedClaim.reply,/todavía no está guardada/);
  assert.equal(resolve('sí',{reply:'Ya lo guardé.'}).goalProposal,undefined);
  assert.ok(!resolve('sí',{reply:'Ya lo guardé.'}).reply.includes('guardé'));
});
