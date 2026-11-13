import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { addDays, addMonths, endOfMonth, format, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale/es';
import {
  ArrowUpRight,
  CaretLeft,
  CaretRight,
  Barbell,
  ForkKnife,
  CalendarBlank,
  SoccerBall,
  Pulse,
} from '@phosphor-icons/react';
import type { DailyRecordsMap, UserProfile } from '../types';
import { formatDateStr, getHeatmapColor } from '../utils/helpers';
import { buildHistoryPeriods } from '../utils/historyPeriods';
import {
  getHistoryDay,
  getHistoryPeriod,
  getHistorySports,
  hasHistoryActivity,
  type HistorySports,
} from '../utils/historyPresentation';
import { useHistoryMotion, type HistoryMotionSnapshot } from '../hooks/useHistoryMotion';
import './ActivityHistory.css';
import './ActivityHistoryMotion.css';

export interface ActivityHistoryState {
  view: 'week' | 'month' | 'year';
  dateStr: string;
  anchor: string;
}
interface HeatmapProps {
  records: DailyRecordsMap;
  selectedDateStr: string;
  /** Exploring is local; only the explicit Open action changes the daily writer. */
  onSelectDate: (dateStr: string) => void;
  profile: UserProfile;
  historyState?: ActivityHistoryState;
  onHistoryStateChange?: (state: ActivityHistoryState) => void;
  openDayBlocked?: boolean;
  onReturnToDraft?: () => void;
}
const views = [
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
  { key: 'year', label: 'Año' },
] as const;
const weekdays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const hasActivity = hasHistoryActivity;
const countLabel = (count: number, one: string, many: string) =>
  count + ' ' + (count === 1 ? one : many);
const number = (value: number) => value.toLocaleString('es-AR', { maximumFractionDigits: 20 });
const dateLabel = (date: string) => format(parseISO(date), "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
const monthLabel = (date: string) => format(parseISO(date), "MMMM 'de' yyyy", { locale: es });
const signed = (value: number) => (value > 0 ? '+' : '') + number(value);
const averageLabel = (info: ReturnType<typeof getHistoryPeriod>) => info.provisional
  ? 'Promedio provisional' : info.category.startsWith('deficit-') ? 'Déficit promedio'
    : info.category.startsWith('surplus-') ? 'Superávit promedio'
      : info.category === 'neutral' ? 'Equilibrio promedio' : 'Balance del período';
const sportsLabel = (sports: HistorySports) =>
  [
    sports.football ? 'Fútbol: ' + sports.football : '',
    sports.gym ? 'Gimnasio: ' + sports.gym : '',
    sports.other ? 'Otros entrenamientos: ' + sports.other : '',
  ]
    .filter(Boolean)
    .join(' · ');
function SportMarks({ sports, counts = false }: { sports: HistorySports; counts?: boolean }) {
  if (!sports.total) return null;
  return (
    <span className="ah-sports" aria-hidden="true">
      {sports.football > 0 && (
        <span data-sport="football" title={'Fútbol: ' + sports.football}>
          <SoccerBall weight="fill" />
          {counts && <span>{sports.football}</span>}
        </span>
      )}
      {sports.gym > 0 && (
        <span data-sport="gym" title={'Gimnasio: ' + sports.gym}>
          <Barbell weight="fill" />
          {counts && <span>{sports.gym}</span>}
        </span>
      )}
      {sports.other > 0 && (
        <span data-sport="other" title={'Otros entrenamientos: ' + sports.other}>
          <Pulse weight="bold" />
          {counts && <span>{sports.other}</span>}
        </span>
      )}
    </span>
  );
}
function BalanceReading({
  value,
  category,
  label,
  unit = 'kcal',
}: {
  value: number | null;
  category: string;
  label: string;
  unit?: string;
}) {
  return (
    <span className="ah-balance-reading" data-balance={category}>
      {category !== 'empty' && (
        <i className={'ah-balance-fill ' + getHeatmapColor(value)} aria-hidden="true" />
      )}
      <span className="ah-balance-label">{label}</span>
      <b>
        {value === null ? (
          'Sin datos energéticos'
        ) : (
          <>
            {signed(value)} <small>{unit}</small>
          </>
        )}
      </b>
    </span>
  );
}
const motionSnapshot = (value: ActivityHistoryState): HistoryMotionSnapshot => ({
  view: value.view,
  key:
    value.view === 'year'
      ? value.anchor.slice(0, 4)
      : value.view === 'month'
        ? value.anchor.slice(0, 7)
        : formatDateStr(startOfWeek(parseISO(value.dateStr), { weekStartsOn: 0 })),
});
const monthWeeks = (month: string) => {
  const first = startOfWeek(parseISO(month), { weekStartsOn: 0 }),
    last = endOfMonth(parseISO(month));
  const result: string[][] = [];
  for (let date = first; date <= last; date = addDays(date, 7))
    result.push(Array.from({ length: 7 }, (_, index) => formatDateStr(addDays(date, index))));
  return result;
};

export default function Heatmap({
  records,
  selectedDateStr,
  onSelectDate,
  profile,
  historyState,
  onHistoryStateChange,
  openDayBlocked,
  onReturnToDraft,
}: HeatmapProps) {
  const today = formatDateStr(new Date());
  const minDate = parseISO(today).getFullYear() - 1 + '-01-01';
  const clampDate = (date: string) => (date < minDate ? minDate : date > today ? today : date);
  const [local, setLocal] = useState<ActivityHistoryState>(() => ({
    view: 'month',
    dateStr: clampDate(selectedDateStr),
    anchor: clampDate(selectedDateStr),
  }));
  const state = historyState ?? local;
  const { ref: motionRef, request: requestMotion } = useHistoryMotion();
  const historyRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const reserveRevision = useRef(0);
  const change = (patch: Partial<ActivityHistoryState>, direction?: -1 | 1) => {
    const next = { ...state, ...patch };
    const fromPeriod = motionSnapshot(state),
      toPeriod = motionSnapshot(next);
    if (fromPeriod.view !== toPeriod.view || fromPeriod.key !== toPeriod.key || direction) {
      // Reserve only the space needed to retain the current scroll position.
      // Calendar content can still grow; this never moves the scroller.
      const section = historyRef.current,
        main = section?.closest<HTMLElement>('.app-main');
      if (section && main && main.clientHeight > 0) {
        const remaining = Math.max(0, main.scrollHeight - main.clientHeight - main.scrollTop);
        const needed = Math.max(0, section.getBoundingClientRect().height - remaining);
        section.style.minBlockSize = needed > 0 ? Math.ceil(needed) + 'px' : '';
      }
    }
    requestMotion(fromPeriod, toPeriod, direction);
    const detail = detailRef.current;
    if (detail) {
      if (next.view !== state.view) {
        reserveRevision.current++;
        detail.style.minBlockSize = '';
      } else if (next.dateStr !== state.dateStr) {
        // Keep the space already on screen before React renders a shorter day.
        // This avoids the browser clamping the page's scroll position near its end.
        // A longer day can still grow naturally; no content is clipped or capped.
        const height = Math.max(
          detail.getBoundingClientRect().height,
          parseFloat(detail.style.minBlockSize) || 0,
        );
        if (height > 0) {
          reserveRevision.current++;
          detail.style.minBlockSize = height + 'px';
        }
      }
    }
    setLocal(next);
    onHistoryStateChange?.(next);
  };
  const selected = clampDate(state.dateStr),
    anchor = parseISO(clampDate(state.anchor));
  const month = format(startOfMonth(anchor), 'yyyy-MM-dd'),
    year = anchor.getFullYear();
  const dayRecord = records[selected],
    hasData = hasActivity(dayRecord),
    incomplete = hasData && !dayRecord?.meals.length;
  const helpId = useId(),
    detailId = useId(),
    blockedId = useId();
  const focusRequest = useRef<string | null>(null),
    surfaceRef = useRef<HTMLDivElement>(null);
  const calendar = buildHistoryPeriods(parseISO(today));
  const yearDates = calendar.year.find((period) => period.key.startsWith(String(year)))?.dates ?? [];
  const monthDates = yearDates.filter((date) => date.startsWith(month.slice(0, 7)));
  const weeks = monthWeeks(month);
  const activeWeek = Math.max(
    0,
    weeks.findIndex((week) => week.includes(selected)),
  );
  const weekStart = startOfWeek(parseISO(selected), { weekStartsOn: 0 });
  const weekDates = Array.from({ length: 7 }, (_, index) => formatDateStr(addDays(weekStart, index)));
  const scopeDates = state.view === 'year' ? yearDates : state.view === 'month' ? monthDates : weekDates;
  const periodInfo = getHistoryPeriod(records, scopeDates, profile, today);
  const summary = periodInfo.summary;
  const selectedInfo = getHistoryDay(dayRecord, selected, profile, today);
  const registeredDays = periodInfo.activityDays;
  const events = [
    ...(dayRecord?.meals ?? []).map((meal) => ({
      id: meal.id,
      kind: 'meal',
      name: meal.name,
      label: meal.type,
      time: meal.time,
      metric: number(meal.calories) + ' kcal',
      sports: null,
    })),
    ...(dayRecord?.workouts ?? []).map((workout) => ({
      id: workout.id,
      kind: 'workout',
      name: workout.activity,
      label: 'Entrenamiento',
      time: workout.time,
      metric: number(workout.duration) + ' min',
      sports: getHistorySports([workout]),
    })),
  ].sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'));
  const previewMealIds = new Set(
    events
      .filter((event) => event.kind === 'meal')
      .slice(0, 3)
      .map((event) => event.id),
  );
  const visibleEvents = events.filter(
    (event) => event.kind === 'workout' || previewMealIds.has(event.id),
  );

  useLayoutEffect(() => {
    const detail = detailRef.current;
    if (!detail || typeof ResizeObserver === 'undefined') return;
    let previousWidth = detail.getBoundingClientRect().width;
    let frame: number | null = null;
    let revision = reserveRevision.current;
    let disposed = false;
    const observer = new ResizeObserver(() => {
      if (disposed) return;
      const width = detail.getBoundingClientRect().width;
      // A measured reserve belongs to its current line wrapping, not another width.
      if (Math.abs(width - previousWidth) > 0.5) {
        revision = reserveRevision.current;
        // Writing during the observer delivery itself can trigger a resize loop.
        if (frame === null)
          frame = window.requestAnimationFrame(() => {
            frame = null;
            if (!disposed && revision === reserveRevision.current) {
              detail.style.minBlockSize = '';
              if (historyRef.current) historyRef.current.style.minBlockSize = '';
            }
          });
      }
      previousWidth = width;
    });
    observer.observe(detail);
    return () => {
      disposed = true;
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  useLayoutEffect(() => {
    if (!focusRequest.current) return;
    const button = surfaceRef.current?.querySelector<HTMLButtonElement>(
      '[data-date="' + focusRequest.current + '"]',
    );
    if (button) {
      button.focus({ preventScroll: true });
      const scroll = surfaceRef.current;
      if (scroll) {
        const bounds = button.getBoundingClientRect(),
          viewport = scroll.getBoundingClientRect();
        if (bounds.left < viewport.left) scroll.scrollLeft -= viewport.left - bounds.left;
        if (bounds.right > viewport.right) scroll.scrollLeft += bounds.right - viewport.right;
      }
    }
    focusRequest.current = null;
  }, [state.dateStr, state.view, state.anchor]);

  const select = (date: string, focus = false) => {
    const next = clampDate(date);
    // A boundary key must not leave a focus request waiting for an unrelated click.
    focusRequest.current = focus && (next !== state.dateStr || next !== state.anchor) ? next : null;
    change({ dateStr: next, anchor: next });
  };
  const navigateDays = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-date]');
    if (!target?.dataset.date) return;
    const current = parseISO(target.dataset.date);
    let next: Date;
    if (event.key === 'ArrowLeft') next = addDays(current, -1);
    else if (event.key === 'ArrowRight') next = addDays(current, 1);
    else if (event.key === 'ArrowUp') next = addDays(current, -7);
    else if (event.key === 'ArrowDown') next = addDays(current, 7);
    else if (event.key === 'Home') next = startOfWeek(current, { weekStartsOn: 0 });
    else if (event.key === 'End') next = addDays(startOfWeek(current, { weekStartsOn: 0 }), 6);
    else if (event.key === 'PageUp') next = addMonths(current, -1);
    else if (event.key === 'PageDown') next = addMonths(current, 1);
    else return;
    event.preventDefault();
    select(formatDateStr(next), true);
  };
  const move = (direction: number) => {
    const next =
      state.view === 'year'
        ? addMonths(anchor, direction * 12)
        : state.view === 'month'
          ? addMonths(anchor, direction)
          : addDays(parseISO(selected), direction * 7);
    select(formatDateStr(next));
  };
  const canMove = (direction: number) =>
    state.view === 'year'
      ? year + direction >= parseISO(minDate).getFullYear() &&
        year + direction <= parseISO(today).getFullYear()
      : state.view === 'month'
        ? format(addMonths(anchor, direction), 'yyyy-MM') >= minDate.slice(0, 7) &&
          format(addMonths(anchor, direction), 'yyyy-MM') <= today.slice(0, 7)
        : formatDateStr(addDays(weekStart, direction * 7)) <= today &&
          formatDateStr(addDays(weekStart, direction * 7 + 6)) >= minDate;
  const moveMonthWeek = (direction: number) => {
    const available = weeks[activeWeek + direction]?.filter(
      (date) => date >= minDate && date <= today && date.startsWith(month.slice(0, 7)),
    );
    if (available?.length)
      change(
        {
          dateStr:
            available.find((date) => parseISO(date).getDay() === parseISO(selected).getDay()) ??
            available[0],
        },
        direction > 0 ? 1 : -1,
      );
  };
  const renderDay = (date: string) => {
    const record = records[date],
      activity = hasActivity(record),
      missingMeals = activity && !record?.meals.length,
      unavailable = date > today || date < minDate;
    const energy = getHistoryDay(record, date, profile, today);
    const habitText =
      ((record?.steps ?? 0) > 0 ? ' · ' + number(record!.steps) + ' pasos' : '') +
      ((record?.water ?? 0) > 0 ? ' · ' + number(record!.water) + ' ml de agua' : '') +
      ((record?.weight ?? 0) > 0 ? ' · Peso ' + number(record!.weight!) + ' kg' : '');
    const status = activity
      ? countLabel(record?.meals.length ?? 0, 'comida', 'comidas') +
        ' · ' +
        countLabel(record?.workouts.length ?? 0, 'entrenamiento', 'entrenamientos') +
        habitText +
        (missingMeals ? ' · Sin comidas registradas' : '')
      : 'Sin registros';
    return (
      <button
        type="button"
        key={date}
        className="ah-day history-day"
        data-date={date}
        data-outside={date.slice(0, 7) !== month.slice(0, 7)}
        data-activity={activity && !unavailable}
        data-incomplete={missingMeals && !unavailable}
        data-balance={unavailable ? 'empty' : energy.category}
        data-completeness={date > today ? 'future' : date < minDate ? 'unavailable' : energy.state}
        disabled={unavailable}
        aria-label={
          dateLabel(date) +
          (date === today ? ' · Hoy' : '') +
          ' · ' +
          (unavailable
            ? date > today
              ? 'Fecha futura · No disponible'
              : 'Fuera del período disponible'
            : status +
              ' · ' +
              energy.label +
              (energy.balance !== null
                ? ' · ' +
                  signed(energy.balance) +
                  ' kcal' +
                  (!energy.canColorBalance ? ' provisional' : '')
                : '') +
              (energy.sports.total ? ' · ' + sportsLabel(energy.sports) : ''))
        }
        aria-pressed={date === selected}
        aria-current={date === today ? 'date' : undefined}
        tabIndex={date === selected ? 0 : -1}
        onClick={() => select(date)}
      >
        {!unavailable && energy.canColorBalance && (
          <span className={'ah-day-fill ' + getHeatmapColor(energy.balance)} aria-hidden="true" />
        )}
        <span className="ah-day-number">{parseISO(date).getDate()}</span>
        {!unavailable && energy.activity && (
          <span className="ah-day-balance">
            {energy.canColorBalance && energy.balance !== null ? signed(energy.balance) : 'Parcial'}
          </span>
        )}
        <span className="ah-day-marks" aria-hidden="true">
          {!!record?.meals.length && !unavailable && <ForkKnife weight="fill" />}
          {!unavailable && <SportMarks sports={energy.sports} />}
          {activity && !record?.meals.length && !record?.workouts.length && !unavailable && (
            <span className="ah-other-mark" />
          )}
        </span>
      </button>
    );
  };
  const heading =
    state.view === 'year'
      ? String(year)
      : state.view === 'month'
        ? monthLabel(month)
        : format(weekStart, 'd MMM', { locale: es }) +
          ' – ' +
          format(addDays(weekStart, 6), 'd MMM yyyy', { locale: es });
  const viewLabel = views.find((view) => view.key === state.view)!.label;

  return (
    <section
      className="activity-history-v2"
      ref={historyRef}
      data-history-root
      tabIndex={-1}
      aria-label="Historial de actividad"
      onClick={(event) => event.stopPropagation()}
    >
      <header className="ah-header">
        <div>
          <p className="ah-eyebrow">Historial</p>
          <h2>Tu actividad</h2>
        </div>
        <div className="ah-view-switch" role="group" aria-label="Período del historial">
          {views.map((view) => (
            <button
              key={view.key}
              type="button"
              aria-pressed={state.view === view.key}
              onClick={() => change({ view: view.key, anchor: selected })}
            >
              {view.label}
            </button>
          ))}
        </div>
      </header>
      <div className="ah-layout">
        <div className="ah-calendar">
          <div className="ah-navigation">
            <h3 aria-live="polite" aria-atomic="true">
              {heading}
            </h3>
            <div className="ah-nav-actions">
              <button
                type="button"
                aria-label={viewLabel + ' anterior'}
                disabled={!canMove(-1)}
                onClick={() => move(-1)}
              >
                <CaretLeft aria-hidden="true" />
              </button>
              <button
                type="button"
                className="ah-today"
                onClick={() => change({ dateStr: today, anchor: today })}
              >
                Hoy
              </button>
              <button
                type="button"
                aria-label={viewLabel + ' siguiente'}
                disabled={!canMove(1)}
                onClick={() => move(1)}
              >
                <CaretRight aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="ah-motion-viewport">
            <div className="ah-motion-surface" ref={motionRef}>
              {state.view === 'year' ? (
                <div className="ah-year" role="group" aria-label={'Meses de ' + year}>
                  {Array.from({ length: 12 }, (_, index) => {
                    const key = year + '-' + String(index + 1).padStart(2, '0'),
                      dates = yearDates.filter((date) => date.startsWith(key) && date <= today),
                      count = dates.filter((date) => hasActivity(records[date])).length,
                      monthInfo = getHistoryPeriod(records, dates, profile, today),
                      current = key === today.slice(0, 7),
                      future = key > today.slice(0, 7),
                      caption = current ? 'En curso' : null;
                    return (
                      <button
                        className="ah-month history-month"
                        data-month={key}
                        data-activity={count > 0}
                        data-balance={future ? 'empty' : monthInfo.category}
                        data-provisional={monthInfo.provisional}
                        key={key}
                        type="button"
                        disabled={key > today.slice(0, 7)}
                        aria-label={
                          'Ver ' +
                          monthLabel(key + '-01') +
                          (future
                            ? ' · Próximamente'
                            : ' · ' +
                              monthInfo.foodDays +
                              ' de ' +
                              monthInfo.elapsedDays +
                              ' días con comidas' +
                              ' · ' +
                              count +
                              ' días con registros' +
                              (monthInfo.summary.averageBalance !== null
                                ? ' · ' +
                                  monthInfo.label +
                                  ' ' +
                                  signed(monthInfo.summary.averageBalance) +
                                  ' kcal/día · Base ' +
                                  monthInfo.summary.days +
                                  ' días energéticos'
                                : '') +
                              (monthInfo.sports.total
                                ? ' · ' +
                                  countLabel(monthInfo.sports.total, 'entrenamiento', 'entrenamientos') +
                                  ' · ' +
                                  sportsLabel(monthInfo.sports)
                                : ''))
                        }
                        onClick={() => {
                          const next = clampDate(
                            formatDateStr(
                              new Date(
                                year,
                                index,
                                Math.min(
                                  parseISO(selected).getDate(),
                                  endOfMonth(new Date(year, index, 1)).getDate(),
                                ),
                              ),
                            ),
                          );
                          focusRequest.current = next;
                          change({ view: 'month', anchor: next, dateStr: next });
                        }}
                      >
                        <span className="ah-month-heading">
                          <span className="ah-month-name">
                            {format(new Date(year, index, 1), 'MMMM', { locale: es })}
                          </span>
                          {caption && <span className="ah-month-caption">{caption}</span>}
                        </span>
                        {(future || count === 0) && (
                          <strong>{future ? 'Próximamente' : 'Sin registros'}</strong>
                        )}
                        {!future && count > 0 && monthInfo.foodDays === 0 && (
                          <strong>Registro parcial</strong>
                        )}
                        {!future && monthInfo.foodDays > 0 && (
                          <BalanceReading
                            value={monthInfo.summary.averageBalance}
                            category={monthInfo.category}
                            label={
                              monthInfo.provisional
                                ? 'Provisional'
                                : averageLabel(monthInfo).replace(' promedio', '')
                            }
                            unit="kcal/día"
                          />
                        )}
                        {!future && count > 0 && (
                          <span className="ah-month-coverage">
                            Comidas {monthInfo.foodDays}/{monthInfo.elapsedDays} días
                            {monthInfo.summary.days > 0 && (
                              <small>Base: {monthInfo.summary.days} días</small>
                            )}
                          </span>
                        )}
                        {!future && count > 0 && (
                          <span className="ah-month-sports">
                            <span>
                              {monthInfo.sports.total
                                ? monthInfo.sports.total + ' entrenos'
                                : 'Sin entrenos'}
                            </span>
                            <SportMarks sports={monthInfo.sports} counts />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <>
                  {state.view === 'month' && (
                    <div className="ah-compact-week">
                      <p>
                        Semana {activeWeek + 1} de {weeks.length}
                        <span>Deslizá para ver los siete días</span>
                      </p>
                      <div>
                        <button
                          type="button"
                          aria-label="Semana anterior del mes"
                          disabled={
                            activeWeek === 0 ||
                            !weeks[activeWeek - 1]?.some(
                              (date) =>
                                date >= minDate && date <= today && date.startsWith(month.slice(0, 7)),
                            )
                          }
                          onClick={() => moveMonthWeek(-1)}
                        >
                          <CaretLeft aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label="Semana siguiente del mes"
                          disabled={
                            activeWeek === weeks.length - 1 ||
                            !weeks[activeWeek + 1]?.some(
                              (date) =>
                                date >= minDate && date <= today && date.startsWith(month.slice(0, 7)),
                            )
                          }
                          onClick={() => moveMonthWeek(1)}
                        >
                          <CaretRight aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  )}
                  <div
                    className={'ah-calendar-surface ah-calendar-surface--' + state.view}
                    ref={surfaceRef}
                    role="group"
                    aria-label={
                      state.view === 'month'
                        ? 'Calendario de ' + monthLabel(month)
                        : 'Fechas de la semana'
                    }
                    aria-describedby={helpId}
                    onKeyDown={navigateDays}
                  >
                    <div className="ah-weekdays" aria-hidden="true">
                      {weekdays.map((day) => (
                        <span key={day}>{day}</span>
                      ))}
                    </div>
                    {state.view === 'month' ? (
                      weeks.map((week, index) => (
                        <div className="ah-week" key={week[0]} data-active={index === activeWeek}>
                          {week.map(renderDay)}
                        </div>
                      ))
                    ) : (
                      <div className="ah-week">{weekDates.map(renderDay)}</div>
                    )}
                  </div>
                  <div className="ah-key" aria-label="Indicadores del calendario">
                    <span>
                      <ForkKnife aria-hidden="true" />
                      Comida
                    </span>
                    <span>
                      <SoccerBall aria-hidden="true" />
                      Fútbol
                    </span>
                    <span>
                      <Barbell aria-hidden="true" />
                      Gimnasio
                    </span>
                    <span>
                      <Pulse aria-hidden="true" />
                      Otros
                    </span>
                    <span>
                      <i aria-hidden="true" />
                      Sin comidas
                    </span>
                  </div>
                  <p id={helpId} className="sr-only">
                    Flechas para cambiar de fecha; Inicio y Fin para los extremos de la semana; RePág y
                    AvPág para cambiar de mes. Seleccionar no abre ni modifica el registro diario.
                  </p>
                </>
              )}
              {state.view !== 'year' && (
                <div
                  className="ah-period-summary"
                  data-period={state.view}
                  data-provisional={periodInfo.provisional}
                >
                  <BalanceReading
                    value={summary.averageBalance}
                    category={periodInfo.category}
                    label={averageLabel(periodInfo)}
                    unit="kcal/día"
                  />
                  <p>
                    {periodInfo.foodDays}/{periodInfo.elapsedDays} días con comidas · Base:{' '}
                    {summary.days} días con datos energéticos
                  </p>
                  {periodInfo.provisional && (
                    <p>Incluye actividad sin comidas. El balance es provisional.</p>
                  )}
                  {periodInfo.sports.total > 0 && (
                    <p className="ah-period-sports">
                      {countLabel(periodInfo.sports.total, 'entrenamiento', 'entrenamientos')} ·{' '}
                      {sportsLabel(periodInfo.sports)}
                    </p>
                  )}
                </div>
              )}
              <p className="ah-balance-key" aria-label="Lectura del balance">
                <span>
                  <i className={getHeatmapColor(-300)} aria-hidden="true" />
                  Déficit (−)
                </span>
                <span>
                  <i className={getHeatmapColor(0)} aria-hidden="true" />
                  Equilibrio (0)
                </span>
                <span>
                  <i className={getHeatmapColor(300)} aria-hidden="true" />
                  Superávit (+)
                </span>
                <span>Parcial: neutral</span>
              </p>
              <div className="ah-period-note">
                <span>
                  {registeredDays
                    ? countLabel(registeredDays, 'día con registros', 'días con registros')
                    : 'Sin registros en este período'}
                </span>
                <span>
                  {state.view === 'year'
                    ? 'Elegí un mes para explorar'
                    : 'Elegí un día para ver su detalle'}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div
          className="ah-detail history-day-detail"
          ref={detailRef}
          id={detailId}
          role="region"
          aria-label="Detalle del día"
        >
          <div className="ah-detail-heading" aria-live="polite" aria-atomic="true">
            <p className="ah-eyebrow">{selected === today ? 'Hoy' : 'Día seleccionado'}</p>
            <h3>{dateLabel(selected)}</h3>
            <p className="ah-day-status" data-empty={!hasData} data-incomplete={incomplete}>
              {!hasData
                ? 'Sin registros'
                : incomplete
                  ? 'Actividad sin comidas registradas'
                  : countLabel(dayRecord!.meals.length, 'comida', 'comidas') +
                    (dayRecord!.workouts.length
                      ? ' · ' + countLabel(dayRecord!.workouts.length, 'entrenamiento', 'entrenamientos')
                      : '')}
            </p>
          </div>
          {hasData && (
            <BalanceReading
              value={selectedInfo.balance}
              category={selectedInfo.category}
              label={
                selectedInfo.canColorBalance
                  ? selectedInfo.label + ' · Con comidas registradas'
                  : 'Balance provisional · Sin comidas'
              }
            />
          )}
          {!hasData ? (
            <div className="ah-empty">
              <CalendarBlank aria-hidden="true" />
              <p>Este día está por contar.</p>
              <span>Cuando registres comidas, entrenamientos o hábitos, aparecerán acá.</span>
            </div>
          ) : (
            <>
              <ul className="ah-entries">
                {visibleEvents.map((event) => (
                  <li key={event.kind + event.id}>
                    <span className="ah-entry-icon" aria-hidden="true">
                      {event.kind === 'meal' ? <ForkKnife /> : <SportMarks sports={event.sports!} />}
                    </span>
                    <div>
                      <span className="ah-entry-caption">
                        {event.label}
                        {event.time ? ' · ' + event.time : ''}
                      </span>
                      <strong>{event.name}</strong>
                    </div>
                    <span className="ah-entry-metric">{event.metric}</span>
                  </li>
                ))}
              </ul>
              {(dayRecord?.meals.length ?? 0) > 3 && (
                <p className="ah-more">
                  {dayRecord!.meals.length - 3} comidas más en el detalle completo
                </p>
              )}
              <dl className="ah-habits">
                {(dayRecord?.steps ?? 0) > 0 && (
                  <div>
                    <dt>Pasos</dt>
                    <dd>{number(dayRecord!.steps)}</dd>
                  </div>
                )}
                {(dayRecord?.water ?? 0) > 0 && (
                  <div>
                    <dt>Agua</dt>
                    <dd>
                      {number(dayRecord!.water)} <small>ml</small>
                    </dd>
                  </div>
                )}
                {(dayRecord?.weight ?? 0) > 0 && (
                  <div>
                    <dt>Peso</dt>
                    <dd>
                      {number(dayRecord!.weight!)} <small>kg</small>
                    </dd>
                  </div>
                )}
              </dl>
              {incomplete && (
                <p className="ah-incomplete-note">
                  Los registros de este día están incompletos: todavía no hay comidas registradas.
                </p>
              )}
            </>
          )}
          {openDayBlocked && (
            <div className="ah-draft-warning">
              <p role="status" id={blockedId}>
                Guardá o cerrá el registro en edición antes de abrir otro día.
              </p>
              {onReturnToDraft && (
                <button type="button" onClick={onReturnToDraft}>
                  Volver al borrador
                </button>
              )}
            </div>
          )}
          <button
            type="button"
            className="ah-open"
            data-history-open
            aria-describedby={openDayBlocked ? blockedId : undefined}
            disabled={openDayBlocked}
            onClick={() => onSelectDate(selected)}
          >
            Abrir registros del día
            <ArrowUpRight aria-hidden="true" />
          </button>
          <p className="ah-open-hint">
            Abrir cambia el día de Inicio. Explorar el calendario no cambia tus formularios.
          </p>
        </div>
      </div>
      <details className="ah-energy">
        <summary>Ver resumen energético</summary>
        <div>
          <p>
            Promedios de {summary.days}{' '}
            {summary.days === 1 ? 'día con datos energéticos' : 'días con datos energéticos'}. Los días
            sin datos y futuros no se completan.
          </p>
          <dl>
            <div>
              <dt>{periodInfo.provisional ? 'Balance promedio provisional' : 'Balance promedio'}</dt>
              <dd>
                {summary.averageBalance === null
                  ? 'Sin datos'
                  : (summary.averageBalance > 0 ? '+' : '') +
                    number(summary.averageBalance) +
                    ' kcal/día'}
              </dd>
            </div>
            <div>
              <dt>Balance acumulado</dt>
              <dd>
                {summary.balance === null
                  ? 'Sin datos'
                  : (summary.balance > 0 ? '+' : '') + number(summary.balance) + ' kcal'}
              </dd>
            </div>
            <div>
              <dt>Consumidas en el período</dt>
              <dd>{summary.days ? number(summary.consumed) + ' kcal' : 'Sin datos'}</dd>
            </div>
            <div>
              <dt>Gasto estimado del período</dt>
              <dd>{summary.days ? number(summary.expenditure) + ' kcal' : 'Sin datos'}</dd>
            </div>
          </dl>
          <p>
            Un día con pasos o ejercicio puede no incluir todas sus comidas: su balance es provisional.
            Pasos y entrenamiento pueden solaparse.
          </p>
        </div>
      </details>
    </section>
  );
}
