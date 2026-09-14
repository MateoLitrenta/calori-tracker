import './PremiumViews.css';
import { useState, useMemo } from 'react';
import { useAppStore } from '../hooks/useAppStore';
import { aggregateEnergy, formatDateStr } from '../utils/helpers';
import { ChartBar, CheckCircle, Fire, TrendUp } from '@phosphor-icons/react';
import { format, subWeeks, subMonths, startOfWeek, addDays, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';

import { calculateMealStats } from '../utils/mealStats';

type Period = 'Semana' | 'Mes' | 'Año';

export default function ChartsView() {
  const { activeProfile } = useAppStore();
  const [period, setPeriod] = useState<Period>('Semana');

  const records = activeProfile?.records || {};

  // Compute stats and dynamic chart data
  const { stats, barChartData } = useMemo(() => {
    const stats = calculateMealStats(records, formatDateStr(new Date()));

    // Dynamic Chart Data Generation
    const today = new Date();
    const chartData: { day: string; consumed: number; expenditure: number; hasData: boolean }[] = [];

    const addBucket = (day: string, dates: string[]) => {
      if (!activeProfile) return;
      const summary = aggregateEnergy(records, dates.filter(date => date <= formatDateStr(today) && records[date]?.meals.length > 0), activeProfile);
      chartData.push({ day, consumed: summary.days ? Math.round(summary.consumed / summary.days) : 0,
        expenditure: summary.days ? Math.round(summary.expenditure / summary.days) : 0, hasData: summary.days > 0 });
    };
    if (period === 'Semana') {
      const start = startOfWeek(today, { weekStartsOn: 1 });
      for (let i = 0; i < 7; i++) {
        const day = addDays(start, i);
        addBucket(format(day, 'EEE', { locale: es }), [formatDateStr(day)]);
      }
    } else if (period === 'Mes') {
      // Preserve the existing four-week view; average only days with data.
      for (let i = 3; i >= 0; i--) {
        const start = startOfWeek(subWeeks(today, i), { weekStartsOn: 1 });
        addBucket(`Sem ${4 - i}`, Array.from({ length: 7 }, (_, j) => formatDateStr(addDays(start, j))));
      }
    } else {
      for (let i = 11; i >= 0; i--) {
        const day = subMonths(today, i);
        const start = startOfMonth(day);
        addBucket(format(day, 'MMM', { locale: es }),
          Array.from({ length: endOfMonth(day).getDate() }, (_, j) => formatDateStr(addDays(start, j))));
      }
    }
    return { stats, barChartData: chartData };
  }, [records, activeProfile, period]);

  const maxCals = Math.max(1, ...barChartData.map(d => Math.max(d.consumed, d.expenditure))) * 1.1; // Add 10% headroom

  return (
    <div className="premium-view dark charts-view flex flex-col gap-6 w-full max-w-4xl mx-auto animate-in fade-in zoom-in-95 duration-300">
      {/* Header & Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#1e2124] border border-slate-200 dark:border-[#ffffff0d] p-4 rounded-3xl shadow-none">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#f5a06416] dark:bg-[#f5a06416] rounded-xl text-[#f5a064] dark:text-[#f5a064]">
            <ChartBar size={24} weight="fill" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-slate-900 dark:text-white">Tu evolución</h2>
            <p className="text-xs text-slate-500 dark:text-gray-400">Estadísticas de días con comidas registradas</p>
          </div>
        </div>
        
        <div className="flex bg-slate-100 dark:bg-[#151719] rounded-xl p-1 border border-slate-200 dark:border-[#ffffff0d]">
          {(['Semana', 'Mes', 'Año'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                period === p 
                  ? 'bg-[#f5a06416] text-[#f5a064] shadow-none dark:bg-[#f5a06416] dark:text-[#f5a064]' 
                  : 'text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="chart-stats grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-[#1e2124] border border-slate-200 dark:border-[#ffffff0d] p-5 rounded-3xl shadow-none flex items-center gap-4">
          <div className="p-3 bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-500 rounded-xl">
            <Fire size={24} weight="fill" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-gray-400">Promedio Diario</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.avgCalories === null ? 'Sin datos' : <>{stats.avgCalories} <span className="text-sm font-normal text-slate-500">kcal</span></>}</p>
          </div>
        </div>
        
        <div className="bg-white dark:bg-[#1e2124] border border-slate-200 dark:border-[#ffffff0d] p-5 rounded-3xl shadow-none flex items-center gap-4">
          <div className="p-3 bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-500 rounded-xl">
            <CheckCircle size={24} weight="fill" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-gray-400">Días registrados</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.registeredDays}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-[#1e2124] border border-slate-200 dark:border-[#ffffff0d] p-5 rounded-3xl shadow-none flex items-center gap-4">
          <div className="p-3 bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-500 rounded-xl">
            <TrendUp size={24} weight="fill" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-gray-400">Racha Actual</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.currentStreak} <span className="text-sm font-normal text-slate-500">días</span></p>
          </div>
        </div>
      </div>

      {/* Main Bar Chart */}
      <div className="bg-white dark:bg-[#1e2124] border border-slate-200 dark:border-[#ffffff0d] p-6 rounded-3xl shadow-none">
        <h3 className="font-bold text-slate-900 dark:text-white mb-6">Consumidas vs Gasto estimado ({period})</h3>
        
        <div className="chart-plot flex items-end justify-between gap-1 sm:gap-2 h-48 mt-4">
          {barChartData.map((d, i) => {
            const consumedHeight = `${(d.consumed / maxCals) * 100}%`;
            const expenditureHeight = `${(d.expenditure / maxCals) * 100}%`;

            return (
              <div key={i} className="flex flex-col items-center gap-2 flex-1 h-full group">
                <div className="relative w-full max-w-[3.5rem] flex-1 flex items-end justify-center gap-1">
                  <div className="w-1/2 h-full flex items-end">
                    <div className="w-full rounded-t-md bg-[#f5a064] transition-all duration-500 relative" style={{ height: consumedHeight }}>
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
                        {d.hasData ? `${d.consumed} kcal` : 'Sin datos'}
                      </div>
                    </div>
                  </div>
                  <div className="w-1/2 h-full flex items-end">
                    <div className="w-full rounded-t-md bg-slate-400 dark:bg-slate-500 transition-all duration-500" style={{ height: expenditureHeight }} />
                  </div>
                </div>
                <span className="text-[10px] sm:text-xs text-slate-500 dark:text-gray-400 truncate w-full text-center">{d.day}</span>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4 mt-8 pt-4 border-t border-slate-100 dark:border-[#ffffff0d] text-sm">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#f5a064]"></span>
            <span className="text-slate-600 dark:text-gray-400">Consumidas</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-slate-400"></span>
            <span className="text-slate-600 dark:text-gray-400">Gasto estimado</span>
          </div>
          <div className="flex items-center gap-2 hidden sm:flex">
          </div>
        </div>
      </div>

    </div>
  );
}
