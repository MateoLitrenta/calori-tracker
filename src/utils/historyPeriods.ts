import { addDays, addMonths, endOfMonth, format, startOfMonth, startOfWeek, subDays, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';

export type HistoryPeriod = 'day' | 'week' | 'month' | 'year';
export interface HistoryInterval {
  key: string;
  label: string;
  shortLabel: string;
  secondaryLabel: string;
  dates: string[];
}

// Presentation ranges only. Energy totals and averages remain in aggregateEnergy.
// Keep the existing horizon: Sunday-aligned trailing year, 12 months, 2 years.
export function buildHistoryPeriods(today: Date) {
  const stamp = (date: Date) => format(date, 'yyyy-MM-dd');
  const range = (start: Date, end: Date) => {
    const dates: string[] = [];
    for (let date = start; date <= end; date = addDays(date, 1)) dates.push(stamp(date));
    return dates;
  };
  const start = startOfWeek(subDays(today, 364), { weekStartsOn: 0 });
  const weeks: HistoryInterval[] = [];
  const columns: (string | null)[][] = [];
  for (let date = start; date <= today; date = addDays(date, 7)) {
    const end = addDays(date, 6);
    const dates = range(date, end);
    weeks.push({ key: dates[0], dates,
      label: format(date, 'd MMM yyyy', { locale: es }) + ' – ' + format(end, 'd MMM yyyy', { locale: es }),
      shortLabel: format(date, 'd MMM', { locale: es }), secondaryLabel: format(date, 'yyyy') });
    columns.push(dates.map(day => day <= stamp(today) ? day : null));
  }
  const monthLabels: { label: string; colIndex: number }[] = [];
  // Align each label with the week containing the first day of that month.
  columns.forEach((week, colIndex) => {
    const firstOfMonth = week.find(day => day?.endsWith('-01'));
    if (firstOfMonth) monthLabels.push({ label: format(new Date(firstOfMonth + 'T12:00:00'), 'MMM', { locale: es }), colIndex });
  });
  const months: HistoryInterval[] = [];
  const firstMonth = subMonths(startOfMonth(today), 11);
  for (let index = 0; index < 12; index++) {
    const date = addMonths(firstMonth, index);
    const dates = range(date, endOfMonth(date));
    months.push({ key: dates[0], dates, label: format(date, 'MMMM yyyy', { locale: es }),
      shortLabel: format(date, 'MMMM', { locale: es }), secondaryLabel: format(date, 'yyyy') });
  }
  const years = [today.getFullYear() - 1, today.getFullYear()].map(year => {
    const dates = range(new Date(year, 0, 1), new Date(year, 11, 31));
    return { key: dates[0], dates, label: String(year), shortLabel: String(year),
      secondaryLabel: year === today.getFullYear() ? 'Año en curso' : 'Año calendario' };
  });
  return { columns, monthLabels, week: weeks, month: months, year: years };
}
