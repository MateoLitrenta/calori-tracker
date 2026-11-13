import { addDays, isValid, parseISO, startOfWeek } from 'date-fns';
import { formatDateStr } from './helpers.ts';

export interface HomePresentationState {
  dailyDateStr: string;
  history: { view: 'week' | 'month' | 'year'; dateStr: string; anchor: string };
  openedFromHistory: boolean;
}

// Match the existing Historial 2.1 range. Dates remain local calendar dates,
// never instants parsed through Date's UTC-only YYYY-MM-DD constructor.
export const homeDateBounds = (today: string) => ({ min: `${parseISO(today).getFullYear() - 1}-01-01`, max: today });
export function isHomeDate(value: unknown, today: string): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parseISO(value), { min, max } = homeDateBounds(today);
  return isValid(date) && formatDateStr(date) === value && value >= min && value <= max;
}
export const homeWeek = (date: string) => {
  const first = startOfWeek(parseISO(date), { weekStartsOn: 0 });
  return Array.from({ length: 7 }, (_, index) => formatDateStr(addDays(first, index)));
};
export function moveHomeWeek(date: string, direction: -1 | 1, today: string): string {
  const next = formatDateStr(addDays(parseISO(date), direction * 7)), { min, max } = homeDateBounds(today);
  return next < min ? min : next > max ? max : next;
}
export function normalizeHomePresentation(value: unknown, today: string): HomePresentationState {
  const candidate = value && typeof value === 'object' ? value as Partial<HomePresentationState> : {};
  const dailyDateStr = isHomeDate(candidate.dailyDateStr, today) ? candidate.dailyDateStr : today;
  const history = candidate.history;
  return { dailyDateStr, history: {
    view: history && ['week', 'month', 'year'].includes(history.view) ? history.view : 'month',
    dateStr: isHomeDate(history?.dateStr, today) ? history.dateStr : dailyDateStr,
    anchor: isHomeDate(history?.anchor, today) ? history.anchor : dailyDateStr,
  }, openedFromHistory: candidate.openedFromHistory === true };
}

export const homePresentationKey = (ownerId: string) => `calori:home:presentation:v1:${ownerId}`;
export function readHomePresentation(ownerId: string, today: string): HomePresentationState {
  try {
    const raw = window.sessionStorage.getItem(homePresentationKey(ownerId));
    const saved = raw && raw.length < 2048 ? JSON.parse(raw) : null;
    return normalizeHomePresentation(saved?.version === 1 ? saved : null, today);
  } catch { return normalizeHomePresentation(null, today); }
}
export function saveHomePresentation(ownerId: string, value: HomePresentationState, today: string): void {
  try { window.sessionStorage.setItem(homePresentationKey(ownerId), JSON.stringify({ version: 1, ...normalizeHomePresentation(value, today) })); }
  catch { /* Presentation storage can be unavailable; daily records still use the existing writer. */ }
}
