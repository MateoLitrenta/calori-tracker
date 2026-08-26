import React, { useMemo, useEffect, useRef } from 'react';
import { format, parseISO, addDays, subDays, startOfWeek, endOfWeek } from 'date-fns';
import type { DailyRecordsMap } from '../types';
import { getHeatmapColor, getNetBalance } from '../utils/helpers';

interface HeatmapProps {
  records: DailyRecordsMap;
  selectedDateStr: string;
  onSelectDate: (dateStr: string) => void;
  currentBMR: number;
}

const Heatmap: React.FC<HeatmapProps> = ({ records, selectedDateStr, onSelectDate, currentBMR }) => {
  const weeks = useMemo(() => {
    const today = new Date();
    const startDate = startOfWeek(subDays(today, 6 * 30), { weekStartsOn: 0 }); // 6 months ago Sunday
    const endDate = endOfWeek(today, { weekStartsOn: 0 }); // this Saturday
    const daysToGenerate = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const allDates: string[] = [];
    for (let i = 0; i < daysToGenerate; i++) {
      allDates.push(format(addDays(startDate, i), 'yyyy-MM-dd'));
    }

    const weeksArray: string[][] = [];
    let currentWeek: string[] = [];
    
    allDates.forEach((dateStr, index) => {
      currentWeek.push(dateStr);
      if (currentWeek.length === 7 || index === allDates.length - 1) {
        weeksArray.push(currentWeek);
        currentWeek = [];
      }
    });
    return weeksArray;
  }, []);

  const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  const monthLabels = useMemo(() => {
    const labels: { label: string; colIndex: number }[] = [];
    let currentMonth = -1;
    
    weeks.forEach((week, index) => {
      const firstDayKey = week[0];
      const date = parseISO(firstDayKey);
      if (date.getMonth() !== currentMonth) {
        labels.push({
          label: format(date, 'MMM'),
          colIndex: index,
        });
        currentMonth = date.getMonth();
      }
    });
    return labels;
  }, [weeks]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to the end (right side) on mount to show the most recent days
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
    }
  }, []);

  return (
    <div className="p-6 bg-github-card border border-github-border rounded-xl shadow-lg w-full overflow-hidden">
      <h2 className="text-xl font-bold mb-4 text-github-text">Historial de Balance Calórico</h2>
      
      <div className="flex w-full overflow-x-auto pb-4 custom-scrollbar" ref={scrollContainerRef}>
        <div className="flex flex-col min-w-max">
          
          {/* Months Header */}
          <div className="flex mb-2 ml-[30px] relative h-5">
            {monthLabels.map((month, i) => (
              <div 
                key={i} 
                className="absolute text-xs text-github-muted capitalize"
                style={{ left: `${month.colIndex * (12 + 4)}px` }} // 12px width + 4px gap
              >
                {month.label}
              </div>
            ))}
          </div>

          <div className="flex">
            {/* Weekdays Side Labels */}
            <div className="flex flex-col gap-1 pr-2 mt-[2px]">
              {weekDays.map((day, i) => (
                <div key={day} className="text-[10px] text-github-muted h-3 leading-3 pr-1 text-right w-6">
                  {i % 2 !== 0 ? day : ''}
                </div>
              ))}
            </div>

            {/* Grid */}
            <div className="flex gap-1">
              {weeks.map((week, i) => (
                <div key={i} className="flex flex-col gap-1">
                  {week.map((dateStr) => {
                    const record = records[dateStr];
                    const balance = getNetBalance(record, currentBMR);
                    const isSelected = selectedDateStr === dateStr;
                    
                    return (
                      <button
                        key={dateStr}
                        onClick={() => onSelectDate(dateStr)}
                        className={`w-3 h-3 rounded-[2px] transition-all focus:outline-none 
                        ${getHeatmapColor(balance)} 
                        ${isSelected ? 'ring-2 ring-white scale-110 z-10' : 'hover:ring-1 hover:ring-gray-400'}`}
                        title={`${dateStr}: ${balance !== null ? balance + ' kcal' : 'Sin datos'}`}
                        aria-label={`Seleccionar ${dateStr}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex justify-end items-center mt-4 text-xs text-github-muted gap-2">
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
