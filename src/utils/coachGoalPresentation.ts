import type { CoachGoal } from './coachGoals.ts';

export function goalLabel(goal: CoachGoal) {
  return goal.type === 'workout_sessions' ? `${goal.target} ${goal.target === 1 ? 'entrenamiento' : 'entrenamientos'}`
    : `${goal.stepThreshold!.toLocaleString('es-AR')} pasos durante ${goal.target} ${goal.target === 1 ? 'día' : 'días'}`;
}

export function goalProgressQuery(text: string): 'workout_sessions' | 'step_days' | 'all' | undefined {
  const query = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/\b(?:registra\w*|anota\w*|carga\w*|agrega\w*|cancel\w*|modifica\w*|cambiar)\b/.test(query)) return;
  if (/objetivos?|metas?|cuantas?\b.*\b(?:sesiones|entrenamientos|dias)\b.*\bfaltan|como (?:voy|vengo)\b.*(?:entren|pasos)/.test(query)) {
    return /pasos/.test(query) ? 'step_days' : /entren|sesiones/.test(query) ? 'workout_sessions' : 'all';
  }
}
