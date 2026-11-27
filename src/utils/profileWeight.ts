import { isValid, parseISO } from 'date-fns';
import type { DailyRecordsMap } from '../types';
import { formatDateStr } from './helpers.ts';

export function latestWeightMeasurement(records: DailyRecordsMap, today = formatDateStr(new Date())) {
  let latest: { dateStr: string; weight: number } | undefined;
  for (const { dateStr, weight } of Object.values(records)) {
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) continue;
    if (dateStr > today || (latest && dateStr <= latest.dateStr)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || dateStr < '0001-01-01' || !isValid(parseISO(dateStr))) continue;
    latest = { dateStr, weight };
  }
  return latest;
}
