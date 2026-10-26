import React, { useMemo, useLayoutEffect, useRef, useState, useId, type CSSProperties, type KeyboardEvent } from 'react';
import './PeriodSelector.css';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale/es';
import type { DailyRecordsMap, UserProfile } from '../types';
import { getHeatmapColor, getNetBalance, getBalanceLabel, aggregateEnergy, formatDateStr } from '../utils/helpers';
import { getHeatmapActivities, getHeatmapBorder } from '../utils/heatmapActivity';
import { buildHistoryPeriods, type HistoryPeriod } from '../utils/historyPeriods';

interface HeatmapProps {
  records: DailyRecordsMap;
  selectedDateStr: string;
  onSelectDate: (dateStr: string) => void;
  profile: UserProfile;
}

const scales: HistoryPeriod[] = ['year', 'month', 'week', 'day'];
const scaleLabels = { year: 'Año', month: 'Mes', week: 'Semana', day: 'Día' };
const number = (value: number | null) => value === null ? 'Sin datos' : value.toLocaleString('es-AR');
const signed = (value: number | null) => value === null ? 'Sin datos' : (value > 0 ? '+' : '') + number(value);

const Heatmap: React.FC<HeatmapProps> = ({ records, selectedDateStr, onSelectDate, profile }) => {
  const [period, setPeriod] = useState<HistoryPeriod>('day');
  // Scale and interval selection belong to the history, never to DailyPanel.
  // Remember an independent interval for each scale when exploring and returning.
  const [selection, setSelection] = useState<Partial<Record<HistoryPeriod, string>>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const groupScrollRef = useRef<HTMLDivElement>(null);
  const [detailExpanded, setDetailExpanded] = useState(false);
  const detailId = useId();
  const dateInputId = useId();
  const helpId = useId();
  const scrollPositions = useRef<Record<string, number>>({});
  const requestedDayReveal = useRef(false);
  const selectDay = (date: string, reveal = false) => {
    requestedDayReveal.current = reveal;
    onSelectDate(date);
  };
  const todayStr = formatDateStr(new Date());
  const calendar = useMemo(() => buildHistoryPeriods(parseISO(todayStr)), [todayStr]);
  const groups = useMemo(() => period === 'day' ? [] : calendar[period].map(interval => ({
    ...interval,
    summary: aggregateEnergy(records, interval.dates, profile, todayStr),
    elapsed: interval.dates.filter(date => date <= todayStr).length,
    inProgress: interval.dates.at(-1)! > todayStr,
  })), [calendar, period, records, profile, todayStr]);
  const selected = groups.find(group => group.key === selection[period]) || groups.at(-1);
  const detail = selected?.summary || aggregateEnergy(records, [selectedDateStr], profile, todayStr);
  const detailLabel = selected?.label || format(parseISO(selectedDateStr), 'd MMMM yyyy', { locale: es });
  const coverage = selected
    ? detail.days + ' de ' + selected.elapsed + ' días transcurridos con datos'
    : detail.days ? 'Con datos energéticos' : 'Sin datos energéticos';
  const provisional = detail.days > 0 && (selected ? selected.dates : [selectedDateStr])
    .some(date => date <= todayStr && getNetBalance(records[date], profile) !== null && !records[date]?.meals.length);
  const status = provisional ? 'Sin comidas registradas en ' + (selected ? 'algunos días con actividad' : 'este día') : '';
  const partial = selected && detail.days > 0 && detail.days < selected.elapsed;
  const scrollKey = (surface: string) => surface + (window.matchMedia('(max-width: 1023px)').matches ? '-compact' : '-wide');
  const rememberScroll = (surface: string, element: HTMLDivElement) => {
    if (element.clientWidth && element.scrollWidth > element.clientWidth) scrollPositions.current[scrollKey(surface)] = element.scrollLeft;
  };
  const moveRibbon = (direction: number) => {
    const element = period === 'day' ? scrollContainerRef.current : groupScrollRef.current;
    if (element) element.scrollLeft += direction * Math.max(48, element.clientWidth * .8);
  };
  const heatmapUnit = period === 'day' ? 'kcal' : 'kcal/día';

  // Restore each exploration surface; selecting never recenters a manually scrolled ribbon.
  useLayoutEffect(() => {
    const surfaces: [string, HTMLDivElement | null][] = period === 'day'
      ? [['day-calendar', scrollContainerRef.current]]
      : [[period, groupScrollRef.current]];
    const restore = () => {
      for (const [surface, scroll] of surfaces) {
        const key = scrollKey(surface);
        if (!scroll || !scroll.clientWidth) continue;
        if (scrollPositions.current[key] !== undefined) scroll.scrollLeft = scrollPositions.current[key];
        else {
          const button = scroll.querySelector<HTMLElement>('[aria-pressed="true"]');
          if (button && scroll.scrollWidth > scroll.clientWidth) scroll.scrollLeft += button.getBoundingClientRect().left
            - scroll.getBoundingClientRect().left - (scroll.clientWidth - button.offsetWidth) / 2;
        }
      }
    };
    restore();
    window.addEventListener('resize', restore);
    return () => window.removeEventListener('resize', restore);
  }, [period]);

  // Explicit date jumps reveal the selection once; cell taps keep manual exploration.
  useLayoutEffect(() => {
    const scroll = scrollContainerRef.current;
    if (!requestedDayReveal.current || period !== 'day' || !scroll?.clientWidth) return;
    const button = scroll.querySelector<HTMLElement>('[data-date="' + selectedDateStr + '"]');
    if (button) {
      const bounds = button.getBoundingClientRect();
      const viewport = scroll.getBoundingClientRect();
      if (bounds.left < viewport.left || bounds.right > viewport.right) scroll.scrollLeft += bounds.left - viewport.left - (scroll.clientWidth - button.offsetWidth) / 2;
      requestedDayReveal.current = false;
    }
  }, [selectedDateStr, period]);

  const navigate = (event: KeyboardEvent<HTMLDivElement>, daily = false) => {
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    const style = getComputedStyle(event.currentTarget);
    const columns = Number(style.getPropertyValue('--history-grid-columns')) || 1;
    const rows = Number(style.getPropertyValue('--history-grid-rows')) || 1;
    const columnFlow = style.gridAutoFlow.startsWith('column');
    const steps: Record<string, number> = daily
      ? { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }
      : columnFlow ? { ArrowLeft: -rows, ArrowRight: rows, ArrowUp: -1, ArrowDown: 1 }
      : { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns };
    const candidate = index + steps[event.key];
    const crossesRow = daily && ((event.key === 'ArrowUp' && index % 7 === 0)
      || (event.key === 'ArrowDown' && index % 7 === 6) || candidate < 0 || candidate >= buttons.length);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : event.key in steps ? Math.max(0, Math.min(buttons.length - 1, crossesRow ? index : candidate)) : null;
    if (next === null) return;
    event.preventDefault();
    buttons[next].focus();
  };

  const renderDay = (dateStr: string | null, index: number) => {
    if (!dateStr) return <span key={'empty-' + index} className="heatmap-date invisible" aria-hidden="true" />;
    const record = records[dateStr];
    const balance = getNetBalance(record, profile);
    const isSelected = selectedDateStr === dateStr;
    const activities = getHeatmapActivities(record?.workouts);
    const border = getHeatmapBorder(activities, isSelected);
    const activityText = (activities.gym ? ' · Gimnasio' : '') + (activities.football ? ' · Fútbol' : '');
    const stateText = getBalanceLabel(balance) + activityText + (isSelected ? ' · Seleccionado' : '');
    const description = dateStr + ': ' + stateText + (balance !== null ? ' · ' + balance + ' kcal' : '');
    return <button key={dateStr} type="button" onClick={() => selectDay(dateStr)}
      className="heatmap-date"
      data-date={dateStr} data-border={border} title={description}
      aria-label={'Seleccionar ' + dateStr + ' · ' + stateText + (balance !== null ? ' · ' + balance + ' kcal' : '')}
      aria-pressed={isSelected} tabIndex={isSelected ? 0 : -1}>
      <span className={'heatmap-cell ' + getHeatmapColor(balance)} data-border={border} aria-hidden="true" />
    </button>;
  };

  return (
    <section className="activity-history" aria-label="Historial de Actividad" onClick={event => event.stopPropagation()}>
      <div className="activity-history-header">
        <div>
          <h2>Historial de actividad</h2>
          <p className="history-scope">{period === 'year' ? 'Dos años · cobertura real de registros' : 'Último año · ' + (period === 'day' ? 'balance diario' : 'balance promedio por día registrado')}</p>
        </div>
        {period === 'day' && <div className="history-navigation">
          <label htmlFor={dateInputId}>Día del resumen
            <input id={dateInputId} type="date" value={selectedDateStr}
              min={calendar.columns[0][0]!} max={todayStr}
              onChange={event => {
                const value = event.target.value;
                if (value && value >= calendar.columns[0][0]! && value <= todayStr) selectDay(value, true);
              }} />
          </label>
        </div>}
        <div className="period-switch period-selector" role="group" aria-label="Período del historial"
          style={{ '--active-index': scales.indexOf(period), '--period-count': 4, '--period-total-gap': '20px' } as CSSProperties}>
          <span className="period-switch-indicator" aria-hidden="true" />
          {scales.map(scale => <button key={scale} type="button"
            onClick={event => { event.stopPropagation(); setPeriod(scale); }} aria-pressed={period === scale}>{scaleLabels[scale]}</button>)}
        </div>
      </div>

      <div className="history-detail" role="region" aria-label="Detalle del historial" aria-live="polite" aria-atomic="true">
        <div className="history-detail-heading">
          <h3>{detailLabel}</h3>
          <p>{coverage}{partial ? ' · Cobertura parcial' : ''}{(selected?.inProgress || (period === 'day' && selectedDateStr === todayStr)) ? ' · En curso, hasta ' + format(parseISO(todayStr), 'd MMM', { locale: es }) : ''}{status && ' · ' + status}</p>
        </div>
        <div className="history-detail-body" data-period={period}>
          <dl className="history-detail-primary">
            <div><dt>{provisional ? (period === 'day' ? 'Balance provisional' : 'Balance promedio provisional') : period === 'day' ? 'Balance del día' : 'Balance promedio'}</dt><dd>{signed(detail.averageBalance)}{detail.averageBalance !== null && <small> {heatmapUnit}</small>}</dd></div>
            <div><dt>Consumidas</dt><dd>{detail.days ? number(detail.consumed) : 'Sin datos'}{detail.days > 0 && <small> kcal{provisional && !detail.consumed ? ' registradas' : ''}</small>}</dd></div>
            <div><dt>Gasto estimado</dt><dd>{detail.days ? number(detail.expenditure) : 'Sin datos'}{detail.days > 0 && <small> kcal</small>}</dd></div>
          </dl>
        </div>
      </div>

      <div className="history-visualization">
        {period === 'day' && <div className="history-calendar-navigation"><p>Deslizá para explorar el año</p><div className="history-strip-actions">
          <button type="button" aria-label="Ver días anteriores" onClick={() => moveRibbon(-1)}>←</button>
          <button type="button" aria-label="Ver días siguientes" onClick={() => moveRibbon(1)}>→</button>
        </div></div>}
        {period === 'week' && <div className="history-ribbon-navigation history-week-navigation"><p>53 semanas · deslizá para explorar</p><div className="history-strip-actions">
          <button type="button" aria-label="Ver semanas anteriores" onClick={() => moveRibbon(-1)}>←</button>
          <button type="button" aria-label="Ver semanas siguientes" onClick={() => moveRibbon(1)}>→</button>
        </div></div>}

        <div className="heatmap-frame" data-period={period}
          style={{ '--history-columns': calendar.columns.length } as CSSProperties}>
          {period === 'day' ? <div className="history-annual-calendar"><div className="heatmap-layout">
            <div className="heatmap-weekdays" aria-hidden="true">
              {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((day, i) => <span key={day}>{i % 2 !== 0 ? day : ''}</span>)}
            </div>
            <div className="heatmap-scroll custom-scrollbar" ref={scrollContainerRef}
              tabIndex={0} role="region" aria-label="Fechas del historial de actividad"
              onScroll={event => rememberScroll('day-calendar', event.currentTarget)}>
              <div className="heatmap-content">
                <div className="heatmap-months">
                  {calendar.monthLabels.map(month => <span key={month.colIndex}
                    style={{ left: 'calc(2px + ' + month.colIndex + ' * (var(--history-cell) + var(--history-gap)))' }}>{month.label}</span>)}
                </div>
                <div className="heatmap-grid" aria-describedby={helpId} onKeyDown={event => navigate(event, true)}>
                  {calendar.columns.map((week, i) => <div key={i} className="heatmap-column">
                    {week.map((day, j) => renderDay(day, j))}
                  </div>)}
                </div>
              </div>
            </div>
          </div></div> : <div ref={groupScrollRef} className={'history-period-grid custom-scrollbar history-period-grid--' + period}
            role="group" onScroll={event => rememberScroll(period, event.currentTarget)} aria-describedby={helpId} aria-label={'Períodos por ' + scaleLabels[period].toLowerCase()} onKeyDown={event => navigate(event)}>
            {groups.map(group => {
              const isSelected = selected?.key === group.key;
              const value = group.summary.averageBalance;
              const description = group.label + ' · ' + getBalanceLabel(value) + ' · '
                + (value === null ? 'Sin datos' : signed(value) + ' kcal/día') + ' · '
                + group.summary.days + ' de ' + group.elapsed + ' días transcurridos con datos'
                + (group.inProgress ? ' · En curso, hasta ' + todayStr : '');
              return <button key={group.key} type="button" className="history-period"
                aria-label={'Seleccionar ' + description} title={description} aria-pressed={isSelected}
                tabIndex={isSelected ? 0 : -1} data-empty={value === null}
                onClick={event => { event.stopPropagation(); setSelection(previous => ({ ...previous, [period]: group.key })); }}>
                <span className="history-period-heading"><span className="history-period-name">
                  <span className="history-period-label-full">{group.shortLabel}</span>
                  {period === 'week' && <span className="history-week-range">{format(parseISO(group.key), 'd MMM', { locale: es })} – {format(parseISO(group.dates.at(-1)!), 'd MMM', { locale: es })}<small>{group.secondaryLabel}</small></span>}
                  {period === 'month' && <span className="history-period-label-compact" aria-hidden="true">{format(parseISO(group.key), 'MMM', { locale: es })}</span>}
                </span>
                  {period !== 'week' && <span className="history-period-secondary">{group.secondaryLabel}</span>}
                </span>
                {period === 'year' && <span className="history-year-balance">{signed(value)}{value !== null && <small> kcal/día</small>}</span>}
                <span className="history-period-coverage">{group.summary.days} / {group.elapsed}<span className="history-period-coverage-text"> días con datos{group.inProgress ? ' · En curso' : ''}</span></span>
                <span className={'history-period-swatch ' + getHeatmapColor(value)} aria-hidden="true" />
              </button>;
            })}
          </div>}
        </div>

      </div>

      <div className="history-explore">
        <button type="button" className="history-detail-toggle" aria-expanded={detailExpanded} aria-controls={detailId}
          onClick={() => setDetailExpanded(value => !value)}>{detailExpanded ? 'Ocultar explicación' : 'Cómo leer estos datos'}</button>
      </div>
      <div id={detailId} className="history-detail-extra" data-expanded={detailExpanded} hidden={!detailExpanded}>
        {period !== 'day' && <dl className="history-detail-metrics"><div><dt>Balance acumulado</dt><dd>{signed(detail.balance)}{detail.balance !== null && <small> kcal</small>}</dd></div></dl>}
        <p className="history-method">El balance usa las calorías registradas y el gasto estimado. Los promedios incluyen solo días con datos energéticos; no se completan días ausentes. Un día con pasos o ejercicio puede tener comidas sin registrar: su balance es provisional.</p>
        <div className="activity-history-footer">
          <div className="activity-legend">
            <div className="activity-legend-empty"><span className="history-legend-swatch bg-slate-200 dark:bg-[#2d333b]" aria-hidden="true" /><span>Sin datos</span></div>
            <div className="activity-legend-scale"><span>Déficit</span><div className="history-legend-colors">
              {[
                ['deficit-high', '< -500'], ['deficit-medium', '-500 a < -250'], ['deficit-low', '-250 a < 0'],
                ['neutral', '0'], ['surplus-low', '> 0 a +250'], ['surplus-medium', '> +250 a +500'], ['surplus-high', '> +500'],
              ].map(([category, label]) => <span key={category} className={'history-legend-swatch bg-heatmap-' + category} title={label + ' ' + heatmapUnit} aria-label={label + ' ' + heatmapUnit} />)}
            </div><span>Superávit <span className="history-legend-unit">({heatmapUnit})</span></span></div>
          </div>
          <div className="activity-border-legend">
            <span className="history-key"><span className="heatmap-border-key" data-border="selected" aria-hidden="true" />Seleccionado</span>
            {period === 'day' && <><span className="history-key"><span className="heatmap-border-key" data-border="gym" aria-hidden="true" />Gimnasio</span>
              <span className="history-key"><span className="heatmap-border-key" data-border="football" aria-hidden="true" />Fútbol</span></>}
          </div>
        </div>
      </div>
      <p id={helpId} className={'history-help' + (detailExpanded ? '' : ' sr-only')}>Flechas para recorrer · Inicio / Fin · Enter o Espacio para seleccionar{period === 'day' ? '. También podés elegir una fecha en Día del resumen.' : ''}</p>
    </section>
  );
};

export default Heatmap;
