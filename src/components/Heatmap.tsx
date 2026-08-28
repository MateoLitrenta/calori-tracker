import React, { useMemo, useLayoutEffect, useRef, useState } from 'react';
import { format, parseISO, addDays, subDays, startOfWeek, startOfMonth, endOfMonth, isSameDay, subMonths, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import type { DailyRecordsMap } from '../types';
import { getHeatmapColor, getNetBalance } from '../utils/helpers';

interface HeatmapProps {
  records: DailyRecordsMap;
  selectedDateStr: string;
  onSelectDate: (dateStr: string) => void;
  onSelectGroup?: (type: 'day'|'week'|'month'|'year', label: string, dates: string[]) => void;
  currentBMR: number;
}

type Period = 'day' | 'week' | 'month' | 'year';

const Heatmap: React.FC<HeatmapProps> = ({ records, selectedDateStr, onSelectDate, onSelectGroup, currentBMR }) => {
  const [period, setPeriod] = useState<Period>('day');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handlePeriodChange = (p: Period) => {
    setPeriod(p);
    
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');

    if (p === 'day') {
      onSelectDate(todayStr);
      if (onSelectGroup) onSelectGroup('day', todayStr, [todayStr]);
    } else if (p === 'week') {
      const startOfOneYearAgo = subDays(today, 364);
      const startDate = startOfWeek(startOfOneYearAgo, { weekStartsOn: 0 }); 
      let curr = startDate;
      let weekNum = 1;
      let latestDates: string[] = [];
      let latestLabel = '';
      while (curr <= today) {
        latestDates = [];
        for (let i = 0; i < 7; i++) {
          latestDates.push(format(addDays(curr, i), 'yyyy-MM-dd'));
        }
        latestLabel = `Sem ${weekNum}`;
        weekNum++;
        curr = addDays(curr, 7);
      }
      if (onSelectGroup) onSelectGroup(p, latestLabel, latestDates);
    } else if (p === 'month') {
      const mStart = startOfMonth(today);
      const mEnd = endOfMonth(today);
      const dates = [];
      let curr = mStart;
      while (curr <= mEnd) {
        dates.push(format(curr, 'yyyy-MM-dd'));
        curr = addDays(curr, 1);
      }
      if (onSelectGroup) onSelectGroup(p, format(mStart, 'MMM yyyy', { locale: es }), dates);
    } else if (p === 'year') {
      const currentYear = today.getFullYear();
      const start = new Date(currentYear, 0, 1);
      const end = new Date(currentYear, 11, 31);
      const dates = [];
      let curr = start;
      while (curr <= end) {
        dates.push(format(curr, 'yyyy-MM-dd'));
        curr = addDays(curr, 1);
      }
      if (onSelectGroup) onSelectGroup(p, currentYear.toString(), dates);
    }
  };

  // Scroll to the right when period changes to 'day' or on mount
  useLayoutEffect(() => {
    if (period === 'day' && scrollContainerRef.current) {
      const scrollEl = scrollContainerRef.current;
      scrollEl.scrollLeft = scrollEl.scrollWidth;
      
      const timer = setTimeout(() => {
        if (scrollEl) scrollEl.scrollLeft = scrollEl.scrollWidth;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [period]);

  const handleBoxClick = (dateStr: string) => {
    onSelectDate(dateStr);
  };

  const getAverageBalance = (dates: string[]) => {
    let sum = 0;
    let count = 0;
    dates.forEach(d => {
      const record = records[d];
      if (record) {
        const balance = getNetBalance(record, currentBMR);
        if (balance !== null) {
          sum += balance;
          count++;
        }
      }
    });
    return count === 0 ? null : Math.round(sum / count);
  };

  const { weeksArray, monthLabels, weekDays } = useMemo(() => {
    const today = new Date();
    const wArray: (string | null)[][] = [];
    const labels: { label: string; colIndex: number }[] = [];

    if (period === 'day') {
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
      
      if (labels.length > 1 && labels[0].label === labels[labels.length - 1].label) {
        labels.shift();
      }
    }

    return { weeksArray: wArray, monthLabels: labels, weekDays: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] };
  }, [period]);

  const groupedData = useMemo(() => {
    const today = new Date();
    const currentYear = today.getFullYear();
    
    if (period === 'month') {
      const months = [];
      const endMonth = startOfMonth(today);
      const startMonth = subMonths(endMonth, 11);
      
      let curr = startMonth;
      while (curr <= endMonth) {
        const mStart = startOfMonth(curr);
        const mEnd = endOfMonth(curr);
        const dates = [];
        let d = mStart;
        while (d <= mEnd) {
          dates.push(format(d, 'yyyy-MM-dd'));
          d = addDays(d, 1);
        }
        months.push({ label: format(mStart, 'MMM yyyy', { locale: es }), dates });
        curr = addMonths(curr, 1);
      }
      return months;
    }
    
    if (period === 'week') {
      const startOfOneYearAgo = subDays(today, 364);
      const startDate = startOfWeek(startOfOneYearAgo, { weekStartsOn: 0 }); 
      const weeks = [];
      let curr = startDate;
      let weekNum = 1;
      while (curr <= today) {
        const dates = [];
        for (let i = 0; i < 7; i++) {
          dates.push(format(addDays(curr, i), 'yyyy-MM-dd'));
        }
        weeks.push({ label: `Sem ${weekNum}`, dates });
        weekNum++;
        curr = addDays(curr, 7);
      }
      return weeks;
    }
    
    if (period === 'year') {
      const years = [currentYear - 1, currentYear];
      return years.map(y => {
        const start = new Date(y, 0, 1);
        const end = new Date(y, 11, 31);
        const dates = [];
        let curr = start;
        while (curr <= end) {
          dates.push(format(curr, 'yyyy-MM-dd'));
          curr = addDays(curr, 1);
        }
        return { label: y.toString(), dates };
      });
    }
    
    return [];
  }, [period, records]);

  const renderBox = (dateStr: string | null, sizeClass = '') => {
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

  const renderGroupedBox = (dates: string[], label: string, view: 'week' | 'month' | 'year') => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const pastDates = dates.filter(d => d <= todayStr);
    const avgBalance = getAverageBalance(pastDates);
    const colorClass = getHeatmapColor(avgBalance);
    const balanceText = avgBalance !== null ? `${avgBalance > 0 ? '+' : ''}${avgBalance} kcal/día` : 'Sin datos';

    if (view === 'week') {
      return (
        <button key={label} onClick={() => onSelectGroup?.(view, label, dates)} className="flex flex-col items-center gap-1 focus:outline-none hover:scale-110 transition-transform">
          <div
            className={`w-6 h-6 md:w-8 md:h-8 rounded-sm transition-all flex-shrink-0 shadow-sm ${colorClass}`}
            title={`${label}: ${balanceText}`}
          ></div>
        </button>
      );
    }

    if (view === 'month') {
      return (
        <button key={label} onClick={() => onSelectGroup?.(view, label, dates)} className={`flex flex-col p-4 rounded-xl border border-github-border/50 items-center justify-center gap-2 ${colorClass} focus:outline-none hover:brightness-110 transition-all`}>
          <span className="text-sm font-bold capitalize text-white drop-shadow-md">{label}</span>
          <span className="text-xs text-white/90 font-medium drop-shadow-md text-center">{balanceText}</span>
        </button>
      );
    }

    if (view === 'year') {
      return (
        <button key={label} onClick={() => onSelectGroup?.(view, label, dates)} className={`flex flex-col p-6 md:p-8 rounded-2xl border border-github-border/50 items-center justify-center gap-3 ${colorClass} focus:outline-none hover:brightness-110 transition-all`}>
          <span className="text-3xl font-bold text-white drop-shadow-md">{label}</span>
          <span className="text-lg text-white/90 font-medium drop-shadow-md">{balanceText}</span>
        </button>
      );
    }
  };

  return (
    <div className="p-4 md:p-6 bg-github-card border border-github-border rounded-xl shadow-lg w-full overflow-hidden flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-xl font-bold text-github-text">Historial de Actividad</h2>
        
        <div className="flex bg-[#1c2128] rounded-md p-1 border border-github-border self-end sm:self-auto">
          {(['year', 'month', 'week', 'day'] as Period[]).map((p) => {
            const labels = { year: 'Año', month: 'Mes', week: 'Semana', day: 'Día' };
            return (
              <button
                key={p}
                onClick={() => handlePeriodChange(p)}
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
      
      {period === 'day' ? (
        <div className="flex w-full overflow-x-auto md:overflow-x-hidden custom-scrollbar md:justify-center pb-2" ref={scrollContainerRef}>
          <div className="flex flex-col w-max pr-8 md:pr-0">
            
            <div className="flex mb-1 ml-[24px] md:ml-[32px] relative h-4">
              {monthLabels.map((month, i) => (
                <div 
                  key={i} 
                  className="absolute text-[10px] text-github-muted capitalize"
                  style={{ 
                    left: `calc(${month.colIndex} * var(--col-width, 13px))` 
                  }}
                >
                  {month.label}
                </div>
              ))}
            </div>

            <div className="flex">
              <div className="flex flex-col gap-[2px] md:gap-1 pr-2 mt-[2px]">
                {weekDays.map((day, i) => (
                  <div key={day} className="text-[9px] text-github-muted h-[11px] md:h-2.5 leading-[11px] md:leading-[10px] pr-1 text-right w-5 md:w-7">
                    {i % 2 !== 0 ? day : ''}
                  </div>
                ))}
              </div>

              <div 
                className="flex gap-[2px] md:gap-1"
                style={{ '--col-width': '13px' } as any}
                ref={(el) => {
                  if (el) {
                    el.parentElement?.parentElement?.style.setProperty('--col-width', window.innerWidth >= 768 ? '14px' : '13px');
                  }
                }}
              >
                {weeksArray.map((week, i) => (
                  <div key={i} className="flex flex-col gap-[2px] md:gap-1">
                    {week.map((dateStr, j) => (
                      <React.Fragment key={dateStr || `empty-${i}-${j}`}>
                        {renderBox(dateStr, 'w-[11px] h-[11px] md:w-2.5 md:h-2.5')}
                      </React.Fragment>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : period === 'week' ? (
        <div className="flex w-full overflow-x-auto custom-scrollbar pb-4 pt-2 gap-2 md:gap-3 flex-wrap justify-center">
          {groupedData.map(group => renderGroupedBox(group.dates, group.label, 'week'))}
        </div>
      ) : period === 'month' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 w-full pb-2">
          {groupedData.map(group => renderGroupedBox(group.dates, group.label, 'month'))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full pb-2">
          {groupedData.map(group => renderGroupedBox(group.dates, group.label, 'year'))}
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
