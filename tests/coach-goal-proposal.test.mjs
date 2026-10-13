import assert from 'node:assert/strict';
import { test } from 'node:test';
import { explicitWorkoutGoal, resolveCoachGoalProposal } from '../server/coachGoalProposal.ts';

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
  assert.ok(savedClaim.goalProposal);assert.match(savedClaim.reply,/Todavía no se guardó ningún cambio/);
  assert.equal(resolve('sí',{reply:'Ya lo guardé.'}).goalProposal,undefined);
  assert.ok(!resolve('sí',{reply:'Ya lo guardé.'}).reply.includes('guardé'));
});
