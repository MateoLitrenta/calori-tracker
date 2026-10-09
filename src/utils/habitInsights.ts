import { aggregateCoachMetrics } from './coachCardMetrics.ts';
import { coachDates } from './coachDates.ts';
import type { HabitDay } from './coachContextContract.ts';

export type HabitPeriod = 7 | 14 | 30;
const normalized = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const followsUp = (text: string) => /^[¿\s]*(?:y\b|por que\b|que cambio\b|que registros\b|mostra\b|explica\b)/.test(normalized(text));
export function isHabitQuery(messages: { role: string; text: string }[]): boolean {
  const users = messages.filter(message => message.role === 'user');
  const last = normalized(users.at(-1)?.text ?? '');
  if (/^[¿\s]*(?:como vengo hoy|como va mi dia|como estoy con las calorias|resumime mi dia)[?!.\s]*$/.test(last)) return false;
  if (/\b(?:registra(?:me|lo|la|los|las)?|anota(?:me|lo|la|los|las)?|carga(?:me|lo|la|los|las)?|agrega(?:me|lo|la|los|las)?|guarda(?:me|lo|la|los|las)?)\b/.test(last)
    || /\b(?:quiero|necesito|podes|puedes|podrias|ayudame a)\b.*\b(?:registrar|anotar|cargar|agregar|guardar)\b/.test(last)) return false;
  if (/^(?:y\s+)?(?:recien\b|acabo de\b|comi\b|cene\b|almorce\b|desayune\b|merende\b|tome\b|bebi\b|entrene\b|jugue\b|hice\b|termine\b|me pese\b)/.test(last.trim())) return false;
  if (/\b(?:analiz\w*|compar\w*|resum\w*)\b.*\b(?:dias|semanas|mes|periodo|ventanas)\b/.test(last)) return true;
  if (/\b(?:habitos?|constan\w*|irregular\w*|regularidad|mejor\w*|cambio|cambios|avanz\w*|progres\w*|objetivo)\b|como (?:comi|vengo)|haciendo bien|semana (?:anterior|pasada)|\b(?:como|que|cuanta|cuanto)\b.*\b(?:agua|peso)\b/.test(last)) return true;
  return followsUp(last) && users.length > 1 ? isHabitQuery(users.slice(0, -1)) : false;
}
export function requestsHabitDetails(messages: { role: string; text: string }[]): boolean {
  const users = messages.filter(message => message.role === 'user');
  const last = normalized(users.at(-1)?.text ?? '');
  if (/cada dia|dia por dia|detalle|desglose|por que|que registros|gastadas|consumidas/.test(last)) return true;
  return followsUp(last) && users.length > 1 ? requestsHabitDetails(users.slice(0, -1)) : false;
}
export function resolveHabitPeriod(messages: { role: string; text: string }[]): HabitPeriod {
  const users = messages.filter(message => message.role === 'user');
  const explicit = (text: string): HabitPeriod | undefined => {
    const value = normalized(text);
    if (/\b30\s*dias\b|\bmes\b/.test(value)) return 30;
    if (/\b14\s*dias\b|\b(?:dos|2) semanas\b|\bquincena\b/.test(value)) return 14;
    if (/\b7\s*dias\b|\bsemana\b/.test(value)) return 7;
  };
  const last = users.at(-1)?.text ?? '';
  const period = explicit(last);
  if (period) return period;
  // A fresh question resets the default; an explanation/comparison follows the
  // nearest explicit period, using only the bounded conversational history.
  if (followsUp(last)) {
    for (const message of [...users.slice(0, -1)].reverse()) {
      const prior = explicit(message.text);
      if (prior) return prior;
      if (/\bsemana\b/.test(normalized(message.text))) return 7;
    }
  }
  return 7;
}

const mean = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const coverage = (observedDays: number, totalDays: number) => ({ observedDays, totalDays });
const enough = (observed: number, length: number) => observed >= 3 && observed * 2 >= length;

export function buildHabitInsights(history: HabitDay[], today: string, length: HabitPeriod = 7, includeDaily = false) {
  const window = (offset: number) => {
    const dates = coachDates(today, length, offset);
    const days = dates.map(date => history.find(day => day.date === date) ?? {
      date, calories: null, expenditure: null, mealCount: 0, workoutCount: 0, steps: 0, water: 0, weight: null, activities: [], omittedActivities: 0 });
    const metrics = aggregateCoachMetrics(days);
    const water = days.filter(day => day.water > 0), weights = days.filter(day => day.weight !== null && day.weight > 0);
    return { period: { startDate: dates[0], endDate: dates.at(-1)!, days: length }, days, metrics,
      water: { days: water.length, averageMl: mean(water.map(day => day.water)) },
      weights: weights.map(day => ({ date: day.date, kg: day.weight! })) };
  };
  const current = window(0), previous = window(length);
  const summary = (value: typeof current) => ({ period: value.period, ...value.metrics, water: value.water,
    weightMeasurements: value.weights,
    coverage: { food: coverage(value.metrics.mealDays, length), steps: coverage(value.metrics.stepDays, length),
      water: coverage(value.water.days, length), weight: coverage(value.weights.length, length) } });
  const insight = (type: string, metrics: Record<string, unknown>, observed: number, classification: string, limitations: string[]) =>
    ({ type, period: current.period, metrics, coverage: coverage(observed, length), classification, limitations });
  const mealDays = current.days.filter(day => day.calories !== null);
  const half = Math.floor(length / 2);
  const early = aggregateCoachMetrics(current.days.slice(0, half)), late = aggregateCoachMetrics(current.days.slice(-half));
  const foodTrend = enough(early.mealDays, half) && enough(late.mealDays, half)
    ? late.averageCalories! === early.averageCalories! ? 'same_registered_average' : late.averageCalories! > early.averageCalories! ? 'higher_later_registered_average' : 'lower_later_registered_average'
    : 'insufficient_data';
  const food = insight('nutrition_logging', { mealDays: current.metrics.mealDays, mealCount: current.metrics.mealCount,
    averageCalories: current.metrics.averageCalories, minCalories: mealDays.length ? Math.min(...mealDays.map(day => day.calories!)) : null,
    maxCalories: mealDays.length ? Math.max(...mealDays.map(day => day.calories!)) : null,
    recordedDates: mealDays.map(day => day.date), missingDates: current.days.filter(day => day.calories === null).map(day => day.date),
    trend: { classification: foodTrend, early: { startDate: current.days[0].date, endDate: current.days[half - 1].date, days: half, ...early },
      late: { startDate: current.days[length - half].date, endDate: today, days: half, ...late } } },
    current.metrics.mealDays, current.metrics.mealDays === length ? 'daily_food_entries' : 'partial_food_entries',
    ['registered_intake_only', 'a_recorded_day_may_be_incomplete', 'no_food_quality_or_excess_inference']);
  const canCompareFood = enough(current.metrics.mealDays, length) && enough(previous.metrics.mealDays, length);
  const comparison = { period: previous.period, currentMealDays: current.metrics.mealDays, previousMealDays: previous.metrics.mealDays,
    coverageChanged: current.metrics.mealDays !== previous.metrics.mealDays,
    classification: canCompareFood ? 'registered_days_comparison' : 'insufficient_data',
    averageCaloriesDifference: canCompareFood ? current.metrics.averageCalories! - previous.metrics.averageCalories! : null,
    averageStepsDifference: enough(current.metrics.stepDays, length) && enough(previous.metrics.stepDays, length)
      ? current.metrics.averageSteps! - previous.metrics.averageSteps! : null,
    currentStepDays: current.metrics.stepDays, previousStepDays: previous.metrics.stepDays,
    weightMedianDifferenceKg: current.weights.length >= 6 && previous.weights.length >= 6
      ? Math.round((median(current.weights.map(value => value.kg)) - median(previous.weights.map(value => value.kg))) * 1000) / 1000 : null,
    workoutCountDifference: current.metrics.workoutCount - previous.metrics.workoutCount,
    limitations: ['equal_calendar_windows', 'different_recorded_day_denominators_must_be_explained', 'logging_changes_are_not_behavior_changes', 'missing_workouts_are_not_inactivity'] };
  const training = insight('training_distribution', { workoutCount: current.metrics.workoutCount, workoutDays: current.metrics.workoutDays,
    recordedDates: current.days.filter(day => day.workoutCount > 0).map(day => day.date),
    blocks: Array.from({ length: Math.ceil(length / 7) }, (_, i) => {
      const block = current.days.slice(i * 7, i * 7 + 7);
      return { startDate: block[0].date, endDate: block.at(-1)!.date, days: block.length,
        workoutCount: aggregateCoachMetrics(block).workoutCount };
    }), activities: [...new Set(current.days.flatMap(day => day.activities))].slice(0, 8),
    activityListsIncomplete: current.days.some(day => day.omittedActivities > 0) || new Set(current.days.flatMap(day => day.activities)).size > 8 },
    current.metrics.workoutDays, current.metrics.workoutDays === 0 ? 'no_sessions_recorded' : current.metrics.workoutDays === 1 ? 'sessions_on_one_day' : 'sessions_on_multiple_days',
    ['session_entries_are_not_observed_activity_on_other_days', 'partial_week_blocks_are_not_equivalent_weeks']);
  const stepDays = current.days.filter(day => day.steps > 0);
  const movement = insight('everyday_movement', { averageSteps: current.metrics.averageSteps,
    minSteps: stepDays.length ? Math.min(...stepDays.map(day => day.steps)) : null,
    maxSteps: stepDays.length ? Math.max(...stepDays.map(day => day.steps)) : null }, current.metrics.stepDays,
    enough(current.metrics.stepDays, length) ? 'multiple_recorded_days' : 'insufficient_data',
    ['positive_steps_only', 'zero_or_missing_is_unknown_movement', 'steps_are_separate_from_structured_sessions']);
  const water = insight('water_logging', current.water, current.water.days,
    current.water.days * 2 >= length ? 'multiple_water_entries' : 'insufficient_data',
    ['recorded_water_only', 'no_hydration_diagnosis_or_individual_requirement']);
  const weightEnough = current.weights.length >= 6;
  const firstWeights = current.weights.slice(0, Math.floor(current.weights.length / 2));
  const lastWeights = current.weights.slice(-Math.floor(current.weights.length / 2));
  const firstMedian = weightEnough ? median(firstWeights.map(value => value.kg)) : null;
  const lastMedian = weightEnough ? median(lastWeights.map(value => value.kg)) : null;
  const weight = insight('weight_measurements', { measurements: current.weights, earlyMedianKg: firstMedian, lateMedianKg: lastMedian,
    differenceKg: weightEnough ? Math.round((lastMedian! - firstMedian!) * 1000) / 1000 : null }, current.weights.length,
    !weightEnough ? 'insufficient_data' : firstMedian === lastMedian ? 'same_measurement_medians' : lastMedian! > firstMedian! ? 'higher_later_measurements' : 'lower_later_measurements',
    ['at_least_six_daily_measurements', 'measurement_changes_are_not_body_composition', 'no_results_promised_from_estimated_deficits']);
  return { current: summary(current), previous: summary(previous), comparison, insights: [food, training, movement, water, weight],
    ...(includeDaily ? { daily: [...previous.days, ...current.days] } : {}) };
}
