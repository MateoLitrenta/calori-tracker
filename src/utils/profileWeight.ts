import { format, isValid, parseISO } from 'date-fns';
import type { DailyRecordsMap, UserProfile } from '../types';

type WeightMeasurement = { dateStr: string; weight: number };
type WeightProfile = Pick<UserProfile, 'weight' | 'records'>;

const localToday = () => format(new Date(), 'yyyy-MM-dd');

function createMeasurementLookup(records?: DailyRecordsMap) {
  const measurements: WeightMeasurement[] = [];
  for (const record of Object.values(records ?? {})) {
    const weight = record?.weight;
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) continue;
    const { dateStr } = record;
    if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr) ||
      dateStr < '0001-01-01' || !isValid(parseISO(dateStr))) continue;
    measurements.push({ dateStr, weight });
  }
  measurements.sort((a, b) => b.dateStr.localeCompare(a.dateStr));
  return (date: string) => measurements.find(measurement => measurement.dateStr <= date);
}

export function latestWeightMeasurement(records: DailyRecordsMap, date = localToday()) {
  return createMeasurementLookup(records)(date);
}

export function createWeightResolver(profile: WeightProfile, records = profile.records) {
  const measurementAt = createMeasurementLookup(records);
  return (date: string) => measurementAt(date)?.weight ?? profile.weight;
}

export function resolveWeight(profile: WeightProfile, date = localToday()) {
  return createWeightResolver(profile)(date);
}
