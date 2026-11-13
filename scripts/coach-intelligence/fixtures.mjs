// Synthetic fixtures only. No account, session, or remote service is used.
export const TODAY = '2026-11-13';
export const days = (length = 14) => Array.from({ length }, (_, index) => {
  const date = new Date(TODAY + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() - length + index + 1);
  return date.toISOString().slice(0, 10);
});
const record = (date, values = {}) => ({ dateStr: date, date: date + 'T12:00:00', meals: [], workouts: [], steps: 0, water: 0, ...values });
const food = calories => [{ id: 'synthetic-food', name: 'Almuerzo registrado', type: 'Almuerzo', calories, time: '13:00' }];
const workout = activity => ({ id: 'synthetic-' + activity, activity, duration: 50, calories: 250, time: '18:00', details: '' });
const profile = (owner, name, records, goal = 'Mantenimiento') => ({ id: 'profile-' + owner, user_id: owner,
  name, age: 30, sex: 'Masculino', height: 175, weight: 73, activity: 'Moderado', goal,
  onboarding_completed: true, avatar_path: null, records });
const dates = days();
const regular = Object.fromEntries(dates.map((date, index) => [date, record(date, {
  meals: food(1900 + (index % 3) * 100), steps: 6000 + (index % 3) * 1000,
  workouts: [2, 5, 9, 12].includes(index) ? [workout(index % 2 ? 'Fútbol' : 'Gimnasio')] : [],
})]));
const variable = Object.fromEntries(dates.filter((_, index) => [0, 2, 3, 4, 5, 6, 7, 10, 13].includes(index))
  .map((date, index) => [date, record(date, { meals: food(1800 + index * 50) })]));
const goal = { id: '10000000-0000-4000-8000-000000000001', type: 'workout_sessions', target: 3,
  startDate: dates[7], endDate: TODAY, stepThreshold: null, status: 'active', version: 1,
  createdAt: dates[7] + 'T12:00:00Z', updatedAt: dates[7] + 'T12:00:00Z' };
export const fixtures = {
  new: { profile: profile('synthetic-new', 'Luz', {}), goals: [], expected: 'getting_started' },
  incomplete: { profile: profile('synthetic-incomplete', 'Alex', { [TODAY]: record(TODAY, { meals: food(700) }) }), goals: [], expected: 'nutrition_logging' },
  sufficient: { profile: profile('synthetic-sufficient', 'Mateo', regular, 'Déficit'), goals: [], expected: 'training' },
  variable: { profile: profile('synthetic-variable', 'Sol', variable), goals: [], expected: 'nutrition_logging' },
  football: { profile: profile('synthetic-football', 'Nico', Object.fromEntries(dates.slice(7).map((date, index) => [date,
    record(date, { workouts: index === 0 ? [workout('Fútbol')] : [2, 5].includes(index) ? [workout('Gimnasio')] : [], steps: 5000 + index * 250 })]))), goals: [], expected: 'training' },
  goals: { profile: profile('synthetic-goals', 'Emi', regular), goals: [goal], expected: 'goal' },
  inconsistent: { profile: profile('synthetic-inconsistent', 'Fran', {
    [TODAY]: record(TODAY, { meals: food(-10), steps: -100 }),
    '2026-11-12': record('2026-11-12', { water: 500 }),
  }), goals: [], expected: 'data_quality' },
  steps: { profile: profile('synthetic-steps', 'Ana', Object.fromEntries(dates.slice(7).map((date, index) => [date,
    record(date, { steps: 6000 + index * 500 })]))), goals: [], expected: 'steps' },
};
