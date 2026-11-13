import { useId, useRef, type KeyboardEvent } from 'react';
import { CalendarBlank, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { addDays, format, parseISO, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { formatDateStr } from '../utils/helpers';
import { homeDateBounds, homeWeek, isHomeDate, moveHomeWeek } from '../utils/homeDateNavigation';
import './WeeklyDateNav.css';

export default function WeeklyDateNav({ selectedDateStr, today, onSelectDate, onOpenCalendar }: {
  selectedDateStr: string;
  today: string;
  onSelectDate: (date: string) => void;
  onOpenCalendar: () => void;
}) {
  const days = homeWeek(selectedDateStr), { min } = homeDateBounds(today);
  const date = parseISO(selectedDateStr), titleId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const label = format(date, selectedDateStr.slice(0, 4) === today.slice(0, 4) ? "EEEE d 'de' MMMM" : "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, current: string) => {
    const index = days.indexOf(current);
    const next = event.key === 'ArrowLeft' ? formatDateStr(addDays(parseISO(current), -1))
      : event.key === 'ArrowRight' ? formatDateStr(addDays(parseISO(current), 1))
        : event.key === 'Home' ? days.find(day => isHomeDate(day, today))
          : event.key === 'End' ? [...days].reverse().find(day => isHomeDate(day, today)) : undefined;
    if (!next) return;
    event.preventDefault();
    // Arrow keys move through the seven visible controls without changing the
    // writer's date. Enter/Space is the explicit selection, just like a click.
    if (isHomeDate(next, today) && days.includes(next)) rootRef.current?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus();
    else if (index >= 0) event.currentTarget.focus();
  };
  const currentWeek = formatDateStr(startOfWeek(parseISO(today), { weekStartsOn: 0 }));
  const firstWeek = formatDateStr(startOfWeek(parseISO(min), { weekStartsOn: 0 }));
  return <section ref={rootRef} className="home-date-nav" aria-label="Fecha de Inicio">
    <div className="home-date-heading">
      <div className="home-date-context" aria-live="polite" aria-atomic="true">
        <span className="home-date-kicker">{selectedDateStr === today ? 'Hoy' : 'Fecha anterior'}</span>
        <h2 id={titleId}><time dateTime={selectedDateStr}>{label}</time></h2>
      </div>
      <div className="home-date-shortcuts">
        <button type="button" className="home-date-today" onClick={() => onSelectDate(today)} disabled={selectedDateStr === today}>Hoy</button>
        <button type="button" className="home-date-calendar" aria-label="Abrir calendario mensual" onClick={onOpenCalendar}>
          <CalendarBlank size={21} aria-hidden="true" />
        </button>
      </div>
    </div>
    <div className="home-week-heading">
      <button type="button" aria-label="Semana anterior" disabled={days[0] <= firstWeek} onClick={() => onSelectDate(moveHomeWeek(selectedDateStr, -1, today))}>
        <CaretLeft size={19} aria-hidden="true" />
      </button>
      <span>{format(parseISO(days[0]), 'd MMM', { locale: es })} – {format(parseISO(days[6]), 'd MMM yyyy', { locale: es })}</span>
      <button type="button" aria-label="Semana siguiente" disabled={days[0] >= currentWeek} onClick={() => onSelectDate(moveHomeWeek(selectedDateStr, 1, today))}>
        <CaretRight size={19} aria-hidden="true" />
      </button>
    </div>
    <div className="home-week-days" role="group" aria-labelledby={titleId}>
      {days.map(day => <button type="button" key={day} data-day={day}
        disabled={!isHomeDate(day, today)} aria-pressed={day === selectedDateStr}
        aria-current={day === today ? 'date' : undefined}
        aria-label={`${format(parseISO(day), "EEEE d 'de' MMMM 'de' yyyy", { locale: es })}${day === today ? ' · Hoy' : ''}${day > today ? ' · Fecha futura, no disponible' : ''}`}
        onKeyDown={event => moveFocus(event, day)} onClick={() => onSelectDate(day)}>
        <span>{format(parseISO(day), 'EEE', { locale: es })}</span>
        <strong>{format(parseISO(day), 'd')}</strong>
        <i aria-hidden="true" />
      </button>)}
    </div>
  </section>;
}
