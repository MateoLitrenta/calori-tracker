import type { DailyRecordsMap } from '../types';
import type { DataAction } from '../services/aiService';

/** Provenance of an explicitly confirmed Coach entry, never inferred from its text. */
export interface RecordedCoachAction {
  type: 'add_meal' | 'add_workout';
  dateStr: string;
  entryId: string;
}

export function parseRecordedCoachActions(value: unknown): RecordedCoachAction[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries = value.filter((entry): entry is RecordedCoachAction => entry !== null && typeof entry === 'object' &&
    (entry.type === 'add_meal' || entry.type === 'add_workout') &&
    typeof entry.dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.dateStr) &&
    typeof entry.entryId === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(entry.entryId));
  return entries.length ? entries.map(({ type, dateStr, entryId }) => ({ type, dateStr, entryId })) : undefined;
}

/**
 * Only a matching confirmed ID in this conversation can mark a proposal as
 * already saved. Similar entries elsewhere are not deduplicated, and callers
 * always offer an explicit way to register another identical entry.
 */
export function findRecordedCoachAction(action: DataAction, records: DailyRecordsMap,
  confirmed: readonly RecordedCoachAction[]): RecordedCoachAction | undefined {
  const p = action.payload;
  const dateStr = p.dateStr as string;
  const day = records[dateStr];
  if (!day) return undefined;
  return confirmed.find(receipt => {
    if (receipt.type !== action.type || receipt.dateStr !== dateStr) return false;
    if (action.type === 'add_meal') {
      const meal = day.meals.find(entry => entry.id === receipt.entryId);
      return !!meal && meal.name === p.name && meal.type === p.type && meal.calories === p.calories &&
        meal.time === p.time && (meal.details ?? '') === (p.details ?? '') && !meal.photo_path;
    }
    if (action.type === 'add_workout') {
      const workout = day.workouts.find(entry => entry.id === receipt.entryId);
      return !!workout && workout.activity === p.activity && workout.duration === p.duration &&
        workout.calories === p.calories && workout.time === p.time && (workout.details ?? '') === (p.details ?? '') &&
        (workout.distance ?? undefined) === p.distance && (workout.pace ?? '') === (p.pace ?? '') && workout.muscles.length === 0;
    }
    return false;
  });
}
