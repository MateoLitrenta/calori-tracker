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
} from '@phosphor-icons/react';
import type { DailyRecord, DailyRecordsMap, UserProfile } from '../types';
import { aggregateEnergy, formatDateStr } from '../utils/helpers';
import { buildHistoryPeriods } from '../utils/historyPeriods';
import './ActivityHistory.css';

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
const hasActivity = (record?: DailyRecord) =>
  !!record &&
  (record.meals.length > 0 ||
    record.workouts.length > 0 ||
    record.steps > 0 ||
    record.water > 0 ||
    (record.weight ?? 0) > 0);
const countLabel = (count: number, one: string, many: string) => count + ' ' + (count === 1 ? one : many);
const number = (value: number) => value.toLocaleString('es-AR', { maximumFractionDigits: 20 });
const dateLabel = (date: string) => format(parseISO(date), "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
const monthLabel = (date: string) => format(parseISO(date), "MMMM 'de' yyyy", { locale: es });
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
  const detailRef = useRef<HTMLDivElement>(null);
  const change = (patch: Partial<ActivityHistoryState>) => {
    const next = { ...state, ...patch };
    const detail = detailRef.current;
    if (detail) {
      if (next.view !== state.view) detail.style.minBlockSize = '';
      else if (next.dateStr !== state.dateStr) {
        // Keep the space already on screen before React renders a shorter day.
        // This avoids the browser clamping the page's scroll position near its end.
        // A longer day can still grow naturally; no content is clipped or capped.
        const height = Math.max(detail.getBoundingClientRect().height, parseFloat(detail.style.minBlockSize) || 0);
        if (height > 0) detail.style.minBlockSize = height + 'px';
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
  const summary = aggregateEnergy(records, scopeDates, profile, today);
  const registeredDays = scopeDates.filter((date) => date <= today && hasActivity(records[date])).length;
  const events = [
    ...(dayRecord?.meals ?? []).map((meal) => ({
      id: meal.id,
      kind: 'meal',
      name: meal.name,
      label: meal.type,
      time: meal.time,
      metric: number(meal.calories) + ' kcal',
    })),
    ...(dayRecord?.workouts ?? []).map((workout) => ({
      id: workout.id,
      kind: 'workout',
      name: workout.activity,
      label: 'Entrenamiento',
      time: workout.time,
      metric: number(workout.duration) + ' min',
    })),
  ].sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'));

  useLayoutEffect(() => {
    const detail = detailRef.current;
    if (!detail || typeof ResizeObserver === 'undefined') return;
    let previousWidth = detail.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const width = detail.getBoundingClientRect().width;
      // A measured reserve belongs to its current line wrapping, not another width.
      if (Math.abs(width - previousWidth) > 0.5) detail.style.minBlockSize = '';
      previousWidth = width;
    });
    observer.observe(detail);
    return () => observer.disconnect();
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
      change({
        dateStr:
          available.find((date) => parseISO(date).getDay() === parseISO(selected).getDay()) ?? available[0],
      });
  };
  const renderDay = (date: string) => {
    const record = records[date],
      activity = hasActivity(record),
      missingMeals = activity && !record?.meals.length,
      unavailable = date > today || date < minDate;
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
        disabled={unavailable}
        aria-label={
          dateLabel(date) +
          (date === today ? ' · Hoy' : '') +
          ' · ' +
          (unavailable ? 'Fecha no disponible' : status)
        }
        aria-pressed={date === selected}
        aria-current={date === today ? 'date' : undefined}
        tabIndex={date === selected ? 0 : -1}
        onClick={() => select(date)}
      >
        <span className="ah-day-number">{parseISO(date).getDate()}</span>
        <span className="ah-day-marks" aria-hidden="true">
          {!!record?.meals.length && !unavailable && <ForkKnife weight="fill" />}
          {!!record?.workouts.length && !unavailable && <Barbell weight="fill" />}
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
          {state.view === 'year' ? (
            <div className="ah-year" role="group" aria-label={'Meses de ' + year}>
              {Array.from({ length: 12 }, (_, index) => {
                const key = year + '-' + String(index + 1).padStart(2, '0'),
                  dates = yearDates.filter((date) => date.startsWith(key) && date <= today),
                  count = dates.filter((date) => hasActivity(records[date])).length;
                return (
                  <button
                    className="ah-month history-month"
                    data-month={key}
                    key={key}
                    type="button"
                    disabled={key > today.slice(0, 7)}
                    aria-label={'Ver ' + monthLabel(key + '-01')}
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
                    <span>{format(new Date(year, index, 1), 'MMMM', { locale: es })}</span>
                    <strong>{count ? countLabel(count, 'día', 'días') : 'Sin registros'}</strong>
                    <span className="ah-month-caption">
                      {count ? 'con registros' : key > today.slice(0, 7) ? 'Próximamente' : 'Este mes'}
                    </span>
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
                          (date) => date >= minDate && date <= today && date.startsWith(month.slice(0, 7)),
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
                          (date) => date >= minDate && date <= today && date.startsWith(month.slice(0, 7)),
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
                  state.view === 'month' ? 'Calendario de ' + monthLabel(month) : 'Fechas de la semana'
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
                  <Barbell aria-hidden="true" />
                  Entrenamiento
                </span>
                <span>
                  <i aria-hidden="true" />
                  Sin comidas
                </span>
              </div>
              <p id={helpId} className="sr-only">
                Flechas para cambiar de fecha; Inicio y Fin para los extremos de la semana; RePág y AvPág para
                cambiar de mes. Seleccionar no abre ni modifica el registro diario.
              </p>
            </>
          )}
          <div className="ah-period-note">
            <span>
              {registeredDays
                ? countLabel(registeredDays, 'día con registros', 'días con registros')
                : 'Sin registros en este período'}
            </span>
            <span>
              {state.view === 'year' ? 'Elegí un mes para explorar' : 'Elegí un día para ver su detalle'}
            </span>
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
          {!hasData ? (
            <div className="ah-empty">
              <CalendarBlank aria-hidden="true" />
              <p>Este día está por contar.</p>
              <span>Cuando registres comidas, entrenamientos o hábitos, aparecerán acá.</span>
            </div>
          ) : (
            <>
              <ul className="ah-entries">
                {events.slice(0, 3).map((event) => (
                  <li key={event.kind + event.id}>
                    <span className="ah-entry-icon" aria-hidden="true">
                      {event.kind === 'meal' ? <ForkKnife /> : <Barbell />}
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
              {events.length > 3 && (
                <p className="ah-more">{events.length - 3} registros más en el detalle completo</p>
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
            {summary.days === 1 ? 'día con datos energéticos' : 'días con datos energéticos'}. Los días sin
            datos y futuros no se completan.
          </p>
          <dl>
            <div>
              <dt>Balance promedio</dt>
              <dd>
                {summary.averageBalance === null
                  ? 'Sin datos'
                  : (summary.averageBalance > 0 ? '+' : '') + number(summary.averageBalance) + ' kcal/día'}
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
            Un día con pasos o ejercicio puede no incluir todas sus comidas: su balance es provisional. Pasos
            y entrenamiento pueden solaparse.
          </p>
        </div>
      </details>
    </section>
  );
}
