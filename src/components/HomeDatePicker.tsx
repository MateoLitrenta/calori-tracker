import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { addDays, format, parseISO, startOfISOWeek } from 'date-fns';
import { es } from 'date-fns/locale/es';
import EntryFormShell from './EntryFormShell';
import { formatDateStr } from '../utils/helpers';
import { homeDateBounds, homeMonth, isHomeDate, moveHomeMonth } from '../utils/homeDateNavigation';
import './HomeDatePicker.css';

const weekdays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export default function HomeDatePicker({ selectedDateStr, today, onSelectDate, onClose }: {
  selectedDateStr: string;
  today: string;
  onSelectDate: (date: string) => boolean;
  onClose: () => void;
}) {
  const initial = isHomeDate(selectedDateStr, today) ? selectedDateStr : today;
  const [cursor, setCursor] = useState(initial);
  const [blocked, setBlocked] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const focusRequest = useRef<string | null>(initial);
  const titleId = useId(), helpId = useId();
  const { min } = homeDateBounds(today), month = cursor.slice(0, 7);
  const weeks = homeMonth(cursor);
  const move = (date: string, focusDate = true) => {
    if (!isHomeDate(date, today)) return;
    setBlocked(false); focusRequest.current = focusDate ? date : null; setCursor(date);
  };
  const choose = (date: string) => {
    if (!isHomeDate(date, today)) return;
    if (onSelectDate(date)) onClose();
    else setBlocked(true);
  };
  const keydown = (event: KeyboardEvent<HTMLButtonElement>, date: string) => {
    const parsed = parseISO(date), start = startOfISOWeek(parsed);
    let next: string | undefined;
    switch (event.key) {
      case 'ArrowLeft': next = formatDateStr(addDays(parsed, -1)); break;
      case 'ArrowRight': next = formatDateStr(addDays(parsed, 1)); break;
      case 'ArrowUp': next = formatDateStr(addDays(parsed, -7)); break;
      case 'ArrowDown': next = formatDateStr(addDays(parsed, 7)); break;
      case 'Home': next = formatDateStr(start); break;
      case 'End': next = formatDateStr(addDays(start, 6)); break;
      case 'PageUp': next = moveHomeMonth(date, event.shiftKey ? -12 : -1, today); break;
      case 'PageDown': next = moveHomeMonth(date, event.shiftKey ? 12 : 1, today); break;
    }
    if (!next) return;
    event.preventDefault();
    // Keyboard navigation explores/focuses dates; Enter/Space explicitly selects.
    move(next < min ? min : next > today ? today : next);
  };
  useEffect(() => {
    const date = focusRequest.current;
    if (!date) return;
    focusRequest.current = null;
    contentRef.current?.querySelector<HTMLButtonElement>(`[data-calendar-day="${date}"]`)?.focus({ preventScroll: true });
  }, [cursor]);
  return <EntryFormShell title="Elegir fecha" fitness desktopModal closeLabel="Cerrar calendario" onClose={onClose}>
    <div ref={contentRef} className="home-date-picker">
      <div className="home-month-heading">
        <button type="button" aria-label="Mes anterior" disabled={month <= min.slice(0, 7)} onClick={() => move(moveHomeMonth(cursor, -1, today), false)}>
          <CaretLeft size={20} aria-hidden="true" />
        </button>
        <h4 id={titleId} aria-live="polite">{format(parseISO(cursor), "MMMM 'de' yyyy", { locale: es })}</h4>
        <button type="button" aria-label="Mes siguiente" disabled={month >= today.slice(0, 7)} onClick={() => move(moveHomeMonth(cursor, 1, today), false)}>
          <CaretRight size={20} aria-hidden="true" />
        </button>
      </div>
      <p id={helpId} className="sr-only">Flechas para recorrer fechas; Inicio y Fin para los extremos de la semana; RePág y AvPág para cambiar de mes. Enter o espacio selecciona. Escape cierra sin cambiar el día.</p>
      <div className="home-month-grid" role="grid" aria-labelledby={titleId} aria-describedby={helpId}>
        <div className="home-month-row home-month-weekdays" role="row">
          {weekdays.map(day => <span key={day} role="columnheader" aria-label={day}>{day.slice(0, 3)}</span>)}
        </div>
        {weeks.map(week => <div className="home-month-row" role="row" key={week[0]}>
          {week.map(day => <div role="gridcell" key={day} aria-selected={day === selectedDateStr}>
            <button type="button" data-calendar-day={day} data-outside-month={!day.startsWith(month)}
              disabled={!isHomeDate(day, today)} tabIndex={day === cursor ? 0 : -1}
              aria-current={day === today ? 'date' : undefined}
              aria-label={`${format(parseISO(day), "EEEE d 'de' MMMM 'de' yyyy", { locale: es })}${day === today ? ' · Hoy' : ''}${day > today ? ' · Fecha futura, no disponible' : ''}`}
              onKeyDown={event => keydown(event, day)} onClick={() => choose(day)}>
              {format(parseISO(day), 'd')}
            </button>
          </div>)}
        </div>)}
      </div>
      {blocked && <p className="home-calendar-blocked" role="alert">El día no cambió. Cerrá el calendario y guardá o cerrá el registro en edición antes de elegir otra fecha.</p>}
      <div className="home-calendar-footer">
        <span>Seleccionado: {format(parseISO(selectedDateStr), 'd MMM yyyy', { locale: es })}</span>
        <button type="button" data-calendar-today onClick={() => choose(today)}>Hoy</button>
      </div>
    </div>
  </EntryFormShell>;
}
