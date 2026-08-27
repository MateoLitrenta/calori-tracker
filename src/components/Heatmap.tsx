import React, { useMemo, useLayoutEffect, useRef, useState } from 'react';
import { format, parseISO, addDays, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import type { DailyRecordsMap } from '../types';
import { getHeatmapColor, getNetBalance } from '../utils/helpers';

interface HeatmapProps {
  records: DailyRecordsMap;
  selectedDateStr: string;
  onSelectDate: (dateStr: string) => void;
  currentBMR: number;
}

type Period = 'day' | 'week' | 'month' | 'year';

const Heatmap: React.FC<HeatmapProps> = ({ records, selectedDateStr, onSelectDate, currentBMR }) => {
  const [period, setPeriod] = useState<Period>('year');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to the right when period changes to 'year' or on mount
  useLayoutEffect(() => {
    if ((period === 'year' || period === 'month') && scrollContainerRef.current) {
      const scrollEl = scrollContainerRef.current;
      scrollEl.scrollLeft = scrollEl.scrollWidth;
      
      // Respaldo en caso de que el layout tarde un poco más en mobile
      const timer = setTimeout(() => {
        if (scrollEl) scrollEl.scrollLeft = scrollEl.scrollWidth;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [period]);

  const handleBoxClick = (dateStr: string) => {
    onSelectDate(dateStr);
    setPeriod('day');
  };

  const { weeksArray, monthLabels, weekDays } = useMemo(() => {
    const today = new Date();
    const anchorDate = parseISO(selectedDateStr) || today;
    
    let allDates: (string | null)[] = [];
    const wArray: (string | null)[][] = [];
    const labels: { label: string; colIndex: number }[] = [];

    if (period === 'year') {
      const todayStr = format(today, 'yyyy-MM-dd');
      const startOfOneYearAgo = subDays(today, 364);
      const startDate = startOfWeek(startOfOneYearAgo, { weekStartsOn: 0 }); // Empieza en Domingo
      
      let curr = startDate;
      let currentWeek: (string | null)[] = [];
      let reachedToday = false;
      
      while (!reachedToday) {
        const dateStr = format(curr, 'yyyy-MM-dd');
        currentWeek.push(dateStr);
        if (dateStr === todayStr) {
          reachedToday = true;
        }
        
        curr = addDays(curr, 1);
        
        if (currentWeek.length === 7 || reachedToday) {
          if (reachedToday) {
            while (currentWeek.length < 7) {
              currentWeek.push(null);
            }
          }
          wArray.push(currentWeek);
          currentWeek = [];
        }
      }
    } else if (period === 'month') {
      const startDate = startOfWeek(startOfMonth(anchorDate), { weekStartsOn: 0 });
      const endDate = endOfWeek(endOfMonth(anchorDate), { weekStartsOn: 0 });
      
      let curr = startDate;
      let currentWeek: (string | null)[] = [];
      while (curr <= endDate) {
        currentWeek.push(format(curr, 'yyyy-MM-dd'));
        curr = addDays(curr, 1);
        if (currentWeek.length === 7) {
          wArray.push(currentWeek);
          currentWeek = [];
        }
      }
    } else if (period === 'week') {
      const startDate = startOfWeek(anchorDate, { weekStartsOn: 0 });
      for (let i = 0; i < 7; i++) {
        allDates.push(format(addDays(startDate, i), 'yyyy-MM-dd'));
      }
      wArray.push(allDates);
    } else {
      // Day view
      allDates.push(selectedDateStr);
      wArray.push(allDates);
    }

    if (period === 'year' || period === 'month') {
      let currentMonth = -1;
      wArray.forEach((week, index) => {
        const firstValid = week.find(d => d !== null);
        if (firstValid) {
          const date = parseISO(firstValid);
          if (date.getMonth() !== currentMonth) {
            labels.push({
              label: format(date, 'MMM', { locale: es }),
              colIndex: index,
            });
            currentMonth = date.getMonth();
          }
        }
      });
      
      // Ocultar etiqueta duplicada del primer mes si coincide con el último
      if (period === 'year' && labels.length > 1) {
        if (labels[0].label === labels[labels.length - 1].label) {
          labels.shift();
        }
      }
    }

    return { weeksArray: wArray, monthLabels: labels, weekDays: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] };
  }, [period, selectedDateStr]);

  const renderBox = (dateStr: string | null, sizeClass = '') => {
    // Si no hay fecha (días futuros o padding inicial), renderizamos un bloque invisible
    if (!dateStr) return <div className={`${sizeClass} invisible`} />;
    
    const record = records[dateStr];
    const balance = getNetBalance(record, currentBMR);
    const isSelected = selectedDateStr === dateStr;
    const isToday = isSameDay(parseISO(dateStr), new Date());
    
    return (
      <button
        key={dateStr}
        onClick={() => handleBoxClick(dateStr)}
        className={`${sizeClass} rounded-[2px] transition-all focus:outline-none flex-shrink-0 
        ${getHeatmapColor(balance)} 
        ${isSelected ? 'ring-1 ring-white scale-125 z-10' : 'hover:ring-1 hover:ring-gray-400'}
        ${isToday && !isSelected ? 'ring-1 ring-blue-500' : ''}`}
        title={`${dateStr}: ${balance !== null ? balance + ' kcal' : 'Sin datos'}`}
        aria-label={`Seleccionar ${dateStr}`}
      />
    );
  };

  return (
    <div className="p-4 md:p-6 bg-github-card border border-github-border rounded-xl shadow-lg w-full overflow-hidden flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-xl font-bold text-github-text">Historial de Actividad</h2>
        
        {/* Period Selector */}
        <div className="flex bg-[#1c2128] rounded-md p-1 border border-github-border self-end sm:self-auto">
          {(['day', 'week', 'month', 'year'] as Period[]).map((p) => {
            const labels = { day: 'Día', week: 'Semana', month: 'Mes', year: 'Año' };
            return (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${
                  period === p ? 'bg-github-bg text-white shadow' : 'text-github-muted hover:text-white'
                }`}
              >
                {labels[p]}
              </button>
            );
          })}
        </div>
      </div>
      
      {period !== 'day' ? (
        <div className="flex w-full overflow-x-auto md:overflow-x-hidden custom-scrollbar md:justify-center pb-2" ref={scrollContainerRef}>
          <div className="flex flex-col w-max">
            
            {/* Months Header (only for year/month) */}
            {(period === 'year' || period === 'month') && (
              <div className="flex mb-1 ml-[24px] md:ml-[32px] relative h-4">
                {monthLabels.map((month, i) => (
                  <div 
                    key={i} 
                    className="absolute text-[10px] text-github-muted capitalize"
                    style={{ 
                      // Mobile: 11px box + 2px gap = 13px. Desktop: 10px box + 4px gap = 14px.
                      left: `calc(${month.colIndex} * var(--col-width, 13px))` 
                    }}
                  >
                    {month.label}
                  </div>
                ))}
              </div>
            )}

            <div className="flex">
              {/* Weekdays Side Labels */}
              {period !== 'week' && (
                <div className="flex flex-col gap-[2px] md:gap-1 pr-2 mt-[2px]">
                  {weekDays.map((day, i) => (
                    <div key={day} className="text-[9px] text-github-muted h-[11px] md:h-2.5 leading-[11px] md:leading-[10px] pr-1 text-right w-5 md:w-7">
                      {i % 2 !== 0 ? day : ''}
                    </div>
                  ))}
                </div>
              )}

              {/* Grid */}
              <div 
                className={`flex gap-[2px] md:gap-1 ${period === 'week' ? 'w-full justify-around' : ''}`}
                style={{ '--col-width': '13px' } as any}
                ref={(el) => {
                  if (el) {
                    // Update variable for desktop labels in a simple way
                    el.parentElement?.parentElement?.style.setProperty('--col-width', window.innerWidth >= 768 ? '14px' : '13px');
                  }
                }}
              >
                {period === 'week' ? (
                  // Week view
                  weeksArray[0].map((dateStr, i) => (
                    <div key={dateStr || i} className="flex flex-col items-center gap-2">
                      <span className="text-xs text-github-muted">{weekDays[i]}</span>
                      {renderBox(dateStr, 'w-8 h-8 rounded-md')}
                      {dateStr && <span className="text-[10px] text-github-muted">{format(parseISO(dateStr), 'dd')}</span>}
                    </div>
                  ))
                ) : (
                  // Year/Month view
                  weeksArray.map((week, i) => (
                    <div key={i} className="flex flex-col gap-[2px] md:gap-1">
                      {week.map((dateStr, j) => (
                        <React.Fragment key={dateStr || `empty-${i}-${j}`}>
                          {renderBox(dateStr, period === 'year' ? 'w-[11px] h-[11px] md:w-2.5 md:h-2.5' : 'w-3 h-3 md:w-4 md:h-4')}
                        </React.Fragment>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        // Day View summary
        <div className="flex items-center justify-center p-8 bg-[#1c2128] rounded-lg border border-github-border">
          <div className="text-center flex flex-col items-center gap-2">
            <span className="text-sm text-github-muted capitalize">{format(parseISO(selectedDateStr), "EEEE, d 'de' MMMM yyyy", { locale: es })}</span>
            {renderBox(selectedDateStr, 'w-12 h-12 rounded-lg')}
            <span className="text-xs text-github-muted mt-2">Los detalles de este día se muestran abajo</span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex justify-end items-center mt-2 text-xs text-github-muted gap-2 flex-wrap">
        <span>Déficit</span>
        <div className="flex gap-1">
          <div className="w-3 h-3 rounded-[2px] bg-heatmap-deficit-high" title="< -500 kcal"></div>
          <div className="w-3 h-3 rounded-[2px] bg-heatmap-deficit-medium" title="-500 a -250 kcal"></div>
          <div className="w-3 h-3 rounded-[2px] bg-heatmap-deficit-low" title="-250 a -100 kcal"></div>
          <div className="w-3 h-3 rounded-[2px] bg-heatmap-neutral" title="-100 a +100 kcal"></div>
          <div className="w-3 h-3 rounded-[2px] bg-heatmap-surplus-low" title="+100 a +250 kcal"></div>
          <div className="w-3 h-3 rounded-[2px] bg-heatmap-surplus-medium" title="+250 a +500 kcal"></div>
          <div className="w-3 h-3 rounded-[2px] bg-heatmap-surplus-high" title="> +500 kcal"></div>
        </div>
        <span>Superávit</span>
      </div>
    </div>
  );
};

export default Heatmap;
