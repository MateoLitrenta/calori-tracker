import { buildHabitInsights } from './habitInsights.ts';
import { evaluateCoachGoal, parseCoachGoal } from './coachGoals.ts';
import type { CoachGoal } from './coachGoals.ts';
import type { HabitDay, sanitizeCoachContext } from './coachContextContract.ts';

type CoachContext = ReturnType<typeof sanitizeCoachContext>;

export type ProactiveInsightKind = 'getting_started' | 'incomplete' | 'data_quality' | 'nutrition_logging' | 'training' | 'steps' | 'goal';
export interface ProactiveInsight {
  id: string;
  kind: ProactiveInsightKind;
  title: string;
  observation: string;
  evidence: string[];
  limitation: string;
  prompt: string;
  actionLabel: string;
  suggestions: string[];
  period: { startDate: string; endDate: string; days: number };
  metrics: Record<string, number | string | null>;
  goalId?: string;
}

const plural = (count: number, singular: string, multiple: string) => count === 1 ? singular : multiple;
const validNumber = (value: number | null) => value === null || (Number.isFinite(value) && value >= 0);
const validCount = (value: number) => Number.isSafeInteger(value) && value >= 0;
const consistentDay = (day: HabitDay) => validNumber(day.calories) && validNumber(day.steps)
  && validCount(day.steps) && validCount(day.mealCount) && validCount(day.workoutCount)
  && (day.mealCount > 0 ? day.calories !== null : day.calories === null)
  && (day.workoutCount > 0 || day.activities.length === 0);

// The identifier binds a click to the observation that was actually shown. It
// changes with the relevant evidence, never with render order or random time.
function identify(value: Omit<ProactiveInsight, 'id'>): ProactiveInsight {
  let hash = 2166136261;
  for (const character of JSON.stringify(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return { id: `proactive-v1-${value.kind}-${(hash >>> 0).toString(36)}`, ...value };
}

/** A single, evidence-bound opening. No requests, storage or inferred activity. */
export function buildProactiveInsight(context: CoachContext | null, goals: CoachGoal[] = [], goalHistory?: HabitDay[]): ProactiveInsight | null {
  if (!context) return null;
  const today = context.today.date;
  const habits = buildHabitInsights(context.historyDays, today);
  const current = habits.current;
  const previous = habits.previous;
  const days = context.historyDays.filter(day => day.date >= current.period.startDate && day.date <= today);
  const period = current.period;
  const activeGoals = goals.map(parseCoachGoal).filter((goal): goal is CoachGoal => Boolean(goal
    && goal.status === 'active' && goal.startDate <= today && goal.endDate >= today))
    .sort((a, b) => a.endDate.localeCompare(b.endDate) || a.id.localeCompare(b.id));
  // The visible recent workout entries are the source of activity names. Do
  // not elevate a conflicting historical label into an activity assertion.
  const names: string[] = [];
  for (const day of context.recentDays) for (const workout of day.workouts) {
    const name = workout.name.trim();
    if (name && names.length < 3 && !names.some(value => value.toLocaleLowerCase() === name.toLocaleLowerCase())) names.push(name);
  }
  const goalSuggestion = activeGoals.length ? '¿Qué próximo paso puedo dar con mi objetivo confirmado?' : null;
  const foodSuggestion = current.mealDays
    ? current.mealDays < 4
      ? `Tengo comidas registradas en ${current.mealDays} de 7 días. ¿Cómo puedo completar mi registro?`
      : `¿Qué muestran mis ${current.mealDays} días con comidas registradas para mi objetivo${context.profile.goal ? ` de ${context.profile.goal.toLowerCase()}` : ''}?`
    : '¿Cómo puedo empezar a registrar mis comidas sin complicarme?';
  const trainingSuggestion = current.workoutCount
    ? names.length > 1
      ? `¿Cómo puedo organizar mis próximos entrenamientos teniendo en cuenta mis registros de ${names.join(' y ')}?`
      : current.workoutCount === 1
        ? '¿Qué muestra mi entrenamiento registrado en los últimos 7 días?'
        : `¿Qué muestran mis ${current.workoutCount} entrenamientos registrados en los últimos 7 días?`
    : null;
  const stepSuggestion = current.stepDays
    ? current.stepDays === 1
      ? '¿Qué puedo aprender de mi día con pasos registrados?'
      : `¿Qué puedo aprender de mis ${current.stepDays} días con pasos registrados?`
    : null;
  const suggestions = [...new Set([goalSuggestion, trainingSuggestion, foodSuggestion, stepSuggestion,
    '¿Cómo puedo registrar una comida?', '¿Cómo funciona Calori?'].filter((value): value is string => Boolean(value)))].slice(0, 3);
  const base = { period, suggestions };
  const recentValuesInvalid = context.recentDays.some(day => day.meals.some(meal => meal.calories === null)
    || (day.meals.length > 0 && day.omittedMeals === 0 && day.calories !== null
      && Math.abs(day.meals.reduce((sum, meal) => sum + (meal.calories ?? 0), 0) - day.calories) > 0.01));
  const goalDays = goalHistory ?? context.historyDays;
  const relevantGoalDays = activeGoals[0] ? goalDays.filter(day => day.date >= activeGoals[0].startDate && day.date <= today) : [];
  const validGoalHistory = relevantGoalDays.every(day => validCount(day.steps) && validCount(day.workoutCount));
  if (recentValuesInvalid || !days.every(consistentDay) || !validGoalHistory) {
    return identify({ ...base, kind: 'data_quality', title: 'Revisemos tus registros',
      actionLabel: 'Revisar datos incompletos',
      observation: 'Hay datos incompletos o inconsistentes. Prefiero revisarlos antes de sacar conclusiones.',
      evidence: ['No hay una base confiable para comparar estos registros.'],
      limitation: 'Un registro incompleto no permite inferir consumo ni actividad.',
      prompt: '¿Qué datos conviene revisar para que mi Coach pueda orientarme con evidencia?',
      suggestions: ['¿Qué datos conviene revisar antes de comparar mis registros?', '¿Cómo puedo completar mi registro?', '¿Cómo funciona Calori?'],
      metrics: { dataQuality: 'inconsistent' } });
  }

  const goal = activeGoals[0];
  if (goal) {
    const progress = evaluateCoachGoal(goal, goalDays, today);
    if (progress.registered !== null) {
      const unit = goal.type === 'workout_sessions' ? 'entrenamientos' : 'días con el umbral de pasos';
      const reached = progress.registered >= goal.target;
      return identify({ ...base, kind: 'goal', title: reached ? 'Tu registro alcanzó el objetivo' : 'Tu objetivo tiene un próximo paso',
        actionLabel: reached ? 'Sostener mi objetivo' : goal.type === 'step_days' ? 'Ver avance de pasos' : 'Ver avance de entrenamientos',
        period: progress.period, goalId: goal.id,
        observation: `Tenés ${progress.registered} de ${goal.target} ${unit} registrados en el período de tu objetivo confirmado.`,
        evidence: [`Objetivo confirmado: ${goal.target} ${unit}.`,
          ...(goal.type === 'step_days' ? [`Umbral: ${goal.stepThreshold} pasos por día.`] : []),
          `${progress.observedDays} ${plural(progress.observedDays, 'día con registros', 'días con registros')} de ${progress.elapsedDays} transcurridos.`],
        limitation: 'El progreso refleja registros; los días sin datos no demuestran incumplimiento. Hoy sigue en curso.',
        prompt: reached ? '¿Qué registros respaldan que alcancé mi objetivo y cómo puedo sostenerlo?'
          : '¿Qué registros respaldan mi progreso y qué próximo paso puedo dar con mi objetivo confirmado?',
        metrics: { registered: progress.registered, target: goal.target, observedDays: progress.observedDays,
          elapsedDays: progress.elapsedDays, remainingToRegister: progress.remainingToRegister,
          stepThreshold: goal.stepThreshold, goalVersion: goal.version, goalType: goal.type } });
    }
  }

  if (current.workoutCount > 1 && names.length > 1) {
    return identify({ ...base, kind: 'training', title: 'Tus actividades, en conjunto',
      actionLabel: 'Organizar mis entrenamientos',
      observation: `Registraste ${current.workoutCount} entrenamientos en ${current.workoutDays} de los últimos 7 días. Podemos pensar cómo organizar el próximo.`,
      evidence: [`Actividades registradas: ${names.join(' · ')}.`, `${current.workoutDays} de 7 días con entrenamientos registrados.`],
      limitation: 'Estos registros no describen toda tu actividad ni permiten evaluar tu recuperación.',
      prompt: `¿Qué muestran mis registros de ${names.join(' y ')} y qué necesitarías saber para ayudarme a organizar el próximo entrenamiento?`,
      metrics: { workoutCount: current.workoutCount, workoutDays: current.workoutDays, activities: names.join(' · ') } });
  }

  if (current.mealDays || previous.mealDays >= 4) {
    const coverageChanged = Math.abs(current.mealDays - previous.mealDays) >= 2 && previous.mealDays >= 4;
    const sparse = current.mealDays < 4;
    const observation = coverageChanged
      ? `Hay comidas registradas en ${current.mealDays} de los últimos 7 días, frente a ${previous.mealDays} de 7 en el período anterior.`
      : `Hay comidas registradas en ${current.mealDays} de los últimos 7 días.${sparse ? ' Todavía es poco para hablar de una tendencia.' : ' Esa continuidad nos da un punto de partida para revisar tu alimentación.'}`;
    return identify({ ...base, kind: 'nutrition_logging', title: coverageChanged ? 'Tu regularidad de registro cambió' : sparse ? 'Completar el registro ayuda' : 'Tu registro tiene continuidad',
      actionLabel: coverageChanged ? 'Entender mi regularidad' : sparse ? 'Completar mi registro' : 'Revisar mi alimentación',
      observation,
      evidence: [`${current.mealCount} ${plural(current.mealCount, 'comida registrada', 'comidas registradas')} en ${current.mealDays} de 7 días.`,
        ...(coverageChanged ? [`Período anterior: ${previous.mealDays} de 7 días con comidas registradas.`] : [])],
      limitation: 'Un día con registros puede estar incompleto. Registrar menos no significa comer menos; hoy sigue en curso.',
      prompt: coverageChanged ? '¿Qué registros respaldan el cambio en mi regularidad y cómo puedo sostener un registro útil?'
        : sparse ? '¿Qué puedo hacer para completar mi registro y recibir orientación más útil?'
          : `¿Qué muestran mis registros de alimentación y qué próximo paso sería útil para mi objetivo${context.profile.goal ? ` de ${context.profile.goal.toLowerCase()}` : ''}?`,
      metrics: { mealDays: current.mealDays, mealCount: current.mealCount, previousMealDays: previous.mealDays,
        comparison: coverageChanged ? 'logging_coverage_changed' : 'registered_entries_only',
        averageCalories: sparse ? null : current.averageCalories } });
  }

  if (current.workoutCount) {
    return identify({ ...base, kind: 'training', title: 'Un punto de partida para entrenar',
      actionLabel: 'Elegir mi próximo entrenamiento',
      observation: `Tenés ${current.workoutCount} ${plural(current.workoutCount, 'entrenamiento registrado', 'entrenamientos registrados')} en los últimos 7 días. Podemos usarlo para pensar tu próximo paso.`,
      evidence: [`${current.workoutDays} de 7 días con entrenamientos registrados.`,
        ...(names.length ? [`Actividad registrada: ${names.join(' · ')}.`] : [])],
      limitation: 'Los días sin entrenamientos registrados no demuestran inactividad. Falta contexto para recomendar intensidad.',
      prompt: '¿Qué muestra mi entrenamiento registrado y qué necesitarías saber para orientarme con el próximo?',
      metrics: { workoutCount: current.workoutCount, workoutDays: current.workoutDays, activities: names.join(' · ') } });
  }

  if (current.stepDays) {
    const enough = current.stepDays >= 4;
    return identify({ ...base, kind: 'steps', title: enough ? 'Tu movimiento tiene registros' : 'Empecemos por tus pasos',
      actionLabel: 'Explorar mis pasos',
      observation: enough
        ? `Tenés pasos registrados en ${current.stepDays} de los últimos 7 días. Podemos usarlos como referencia para un próximo paso realista.`
        : `Hay pasos registrados en ${current.stepDays} de los últimos 7 días. Necesito más días para hablar de una tendencia.`,
      evidence: [`${current.stepDays} de 7 días con pasos registrados.`,
        ...(enough ? [`Promedio: ${current.averageSteps} pasos en los días con registros.`] : [])],
      limitation: 'Cero o falta de pasos significa información desconocida, no que no te moviste. Los pasos no equivalen a entrenamientos.',
      prompt: '¿Qué muestran mis pasos registrados y cómo puedo elegir un próximo paso realista?',
      metrics: { stepDays: current.stepDays, averageSteps: enough ? current.averageSteps : null } });
  }

  const hasOtherData = days.some(day => day.water > 0 || (day.weight !== null && day.weight > 0));
  return identify({ ...base, kind: hasOtherData ? 'incomplete' : 'getting_started',
    title: hasOtherData ? 'Ya hay un punto de partida' : 'Empecemos con algo simple',
    observation: hasOtherData
      ? 'Veo registros de agua o peso. Para orientarte sobre alimentación y actividad, necesito que registres también una comida o un entrenamiento.'
      : 'Todavía no hay comidas, entrenamientos ni pasos registrados en los últimos 7 días. Tu próximo registro me ayuda a conocerte.',
    evidence: [hasOtherData ? 'Hay registros de agua o peso en los últimos 7 días.' : 'Sin registros recientes de alimentación o actividad.'],
    limitation: 'Sin registros suficientes no puedo identificar tendencias ni asumir tus hábitos.',
    actionLabel: hasOtherData ? 'Elegir qué registrar ahora' : 'Elegir mi próximo registro',
    prompt: hasOtherData ? 'Tengo registros de agua o peso. ¿Qué me conviene registrar ahora para recibir orientación útil?'
      : 'Quiero empezar a usar mi Coach. ¿Qué registro simple puedo hacer primero?',
    suggestions: ['¿Cómo puedo empezar a registrar mis comidas sin complicarme?', '¿Qué datos necesitás para orientarme con mi actividad?', '¿Cómo funciona Calori?'],
    metrics: { mealDays: 0, workoutCount: 0, stepDays: 0, otherRecords: hasOtherData ? 'water_or_weight' : null } });
}
