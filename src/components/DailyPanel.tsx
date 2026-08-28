import React, { useState, useRef, useEffect } from 'react';
import { ForkKnife, Flame, Barbell, Drop, Trash, Check } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import type { DailyRecord, MealEntry, MealType, WorkoutEntry, DailyRecordsMap } from '../types';
import { getCaloriesIngested, getCaloriesBurned, getNetBalance, getBalanceLabel, generateUUID } from '../utils/helpers';

interface DailyPanelProps {
  record: DailyRecord | undefined;
  dateStr: string;
  onUpdateRecord: (dateStr: string, updatedRecord: DailyRecord) => void;
  currentBMR: number;
  selectedGroup?: { type: 'day'|'week'|'month'|'year', label: string, dates: string[] } | null;
  records?: DailyRecordsMap;
}

const DailyPanel: React.FC<DailyPanelProps> = ({ record, dateStr, onUpdateRecord, currentBMR, selectedGroup, records }) => {
  const [activeTab, setActiveTab] = useState<'comida' | 'entrenamiento' | 'pasos-agua' | null>(null);
  const tabContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (tabContainerRef.current && !tabContainerRef.current.contains(event.target as Node)) {
        setActiveTab(null);
      }
    };
    if (activeTab) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [activeTab]);

  // Default empty record if none exists for this day
  const currentRecord: DailyRecord = record || {
    dateStr,
    date: new Date(dateStr),
    meals: [],
    workouts: [],
    steps: 0,
    water: 0,
  };

  const isGroup = selectedGroup && selectedGroup.type !== 'day';

  let ingested = 0;
  let burned = 0;
  let balance: number | null = 0;
  
  if (isGroup && records) {
    let totalBal = 0;
    selectedGroup.dates.forEach(d => {
      const rec = records[d];
      if (rec) {
        ingested += getCaloriesIngested(rec);
        burned += getCaloriesBurned(rec, currentBMR);
        totalBal += getNetBalance(rec, currentBMR) || 0;
      }
    });
    balance = selectedGroup.dates.length > 0 ? totalBal : null;
  } else {
    ingested = getCaloriesIngested(currentRecord);
    burned = getCaloriesBurned(currentRecord, currentBMR);
    balance = getNetBalance(currentRecord, currentBMR);
  }

  const balanceLabel = getBalanceLabel(balance);

  let panelTitle = "Resumen del Día";
  let panelSubtitle = dateStr;
  if (selectedGroup) {
    if (selectedGroup.type === 'week') {
      panelTitle = `Resumen de la Semana`;
      panelSubtitle = selectedGroup.label;
    } else if (selectedGroup.type === 'month') {
      panelTitle = `Resumen del Mes`;
      panelSubtitle = selectedGroup.label;
    } else if (selectedGroup.type === 'year') {
      panelTitle = `Resumen del Año`;
      panelSubtitle = selectedGroup.label;
    }
  }

  const getPillColor = (bal: number | null) => {
    if (bal === null) return 'bg-github-border text-github-text';
    if (bal < -500) return 'bg-heatmap-deficit-high text-white';
    if (bal >= -500 && bal < -250) return 'bg-heatmap-deficit-medium text-black';
    if (bal >= -250 && bal < -100) return 'bg-heatmap-deficit-low text-black';
    if (bal >= -100 && bal <= 100) return 'bg-heatmap-neutral text-white';
    if (bal > 100 && bal <= 250) return 'bg-heatmap-surplus-low text-black';
    if (bal > 250 && bal <= 500) return 'bg-heatmap-surplus-medium text-white';
    return 'bg-heatmap-surplus-high text-white';
  };

  // --- Handlers ---
  const handleDeleteMeal = (id: string) => {
    onUpdateRecord(dateStr, { ...currentRecord, meals: currentRecord.meals.filter(m => m.id !== id) });
    toast.success('Comida eliminada', { style: { background: '#161b22', color: '#fff' }, icon: '🗑️' });
  };

  const handleDeleteWorkout = (id: string) => {
    onUpdateRecord(dateStr, { ...currentRecord, workouts: currentRecord.workouts.filter(w => w.id !== id) });
    toast.success('Entrenamiento eliminado', { style: { background: '#161b22', color: '#fff' }, icon: '🗑️' });
  };

  const handleAddWater = (amount: number) => {
    const newWater = Math.max(0, currentRecord.water + amount);
    onUpdateRecord(dateStr, { ...currentRecord, water: newWater });
  };

  const handleSetWater = (amount: number) => {
    const newWater = Math.max(0, amount);
    onUpdateRecord(dateStr, { ...currentRecord, water: newWater });
  };

  const handleUpdateSteps = (steps: number) => {
    onUpdateRecord(dateStr, { ...currentRecord, steps: Math.max(0, steps) });
  };

  // --- Forms State ---
  const [mealName, setMealName] = useState('');
  const [isEditingWater, setIsEditingWater] = useState(false);
  const [mealType, setMealType] = useState<MealType>('Almuerzo');
  const [mealCals, setMealCals] = useState<number | ''>('');

  const handleAddMeal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mealName || !mealCals) return;
    const newMeal: MealEntry = { id: generateUUID(), name: mealName, type: mealType, calories: Number(mealCals) };
    onUpdateRecord(dateStr, { ...currentRecord, meals: [...currentRecord.meals, newMeal] });
    setMealName('');
    setMealCals('');
    setActiveTab(null);
  };

  const [workActivity, setWorkActivity] = useState('');
  const [workDuration, setWorkDuration] = useState<number | ''>('');
  const [workCals, setWorkCals] = useState<number | ''>('');

  const handleAddWorkout = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workActivity || !workDuration || !workCals) return;
    const newWorkout: WorkoutEntry = { 
      id: generateUUID(), activity: workActivity, duration: Number(workDuration), calories: Number(workCals), muscles: [] 
    };
    onUpdateRecord(dateStr, { ...currentRecord, workouts: [...currentRecord.workouts, newWorkout] });
    setWorkActivity('');
    setWorkDuration('');
    setWorkCals('');
    setActiveTab(null);
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex justify-between items-end border-b border-github-border pb-2">
        <h3 className="text-2xl font-bold text-github-text capitalize">{panelTitle}</h3>
        <span className="text-github-muted capitalize">{panelSubtitle}</span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-github-card border border-github-border p-4 rounded-xl flex flex-col gap-2">
          <div className="flex items-center gap-2 text-github-muted text-sm font-semibold">
            <ForkKnife size={20} className="text-blue-400" /> Ingeridas
          </div>
          <div className="text-2xl font-bold text-white">{ingested} kcal</div>
        </div>

        <div className="bg-github-card border border-github-border p-4 rounded-xl flex flex-col gap-2">
          <div className="flex items-center gap-2 text-github-muted text-sm font-semibold">
            <Flame size={20} className="text-orange-400" /> Quemadas
          </div>
          <div className="text-2xl font-bold text-white">{Math.round(burned)} kcal</div>
          {!isGroup && (
            <div className="text-[10px] text-github-muted leading-tight">
              TMB: {currentBMR} + Pasos: {Math.round(currentRecord.steps * 0.04)} + Ejercicio: {currentRecord.workouts.reduce((s,w)=>s+w.calories,0)}
            </div>
          )}
        </div>

        <div className="bg-github-card border border-github-border p-4 rounded-xl flex flex-col gap-2 col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 text-github-muted text-sm font-semibold">
            <Barbell size={20} className="text-purple-400" /> Balance Neto
          </div>
          <div className="text-2xl font-bold text-white">
            {balance !== null ? (balance > 0 ? `+${balance}` : balance) : 0} kcal
          </div>
          <div className={`text-xs px-2 py-1 rounded-full w-max mt-1 font-medium ${getPillColor(balance)}`}>
            {balanceLabel || 'Mantenimiento'}
          </div>
        </div>

        {!isGroup && (
          <div className="bg-github-card border border-github-border p-4 rounded-xl flex flex-col gap-2 col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 text-github-muted text-sm font-semibold">
              <Drop size={20} className="text-cyan-400" /> Agua Ingerida
            </div>
            <div className="text-2xl font-bold text-white flex items-center gap-1">
              {isEditingWater ? (
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min="0"
                  autoFocus
                  defaultValue={currentRecord.water}
                  onBlur={(e) => {
                    handleSetWater(Number(e.target.value));
                    setIsEditingWater(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSetWater(Number(e.currentTarget.value));
                      setIsEditingWater(false);
                    }
                  }}
                  className="w-20 bg-github-bg border border-github-border rounded-md px-2 py-1 text-lg focus:outline-none focus:border-cyan-500"
                />
              ) : (
                <span 
                  className="cursor-pointer hover:text-cyan-400 transition-colors" 
                  onClick={() => setIsEditingWater(true)}
                  title="Editar cantidad"
                >
                  {currentRecord.water}
                </span>
              )}
              <span className="text-sm font-normal text-github-muted">/ 2500 ml</span>
            </div>
          </div>
        )}
      </div>

      {!isGroup && (
        <div ref={tabContainerRef} className="flex flex-col gap-4">
          {/* Action Buttons */}
          <div className="flex gap-2 mt-2">
            <button 
              onClick={() => setActiveTab(activeTab === 'comida' ? null : 'comida')}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors border ${activeTab === 'comida' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-github-card border-github-border text-github-text hover:bg-[#21262d]'}`}
            >
              + Comida
            </button>
            <button 
              onClick={() => setActiveTab(activeTab === 'entrenamiento' ? null : 'entrenamiento')}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors border ${activeTab === 'entrenamiento' ? 'bg-orange-600 border-orange-500 text-white' : 'bg-github-card border-github-border text-github-text hover:bg-[#21262d]'}`}
            >
              + Ejercicio
            </button>
            <button 
              onClick={() => setActiveTab(activeTab === 'pasos-agua' ? null : 'pasos-agua')}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors border ${activeTab === 'pasos-agua' ? 'bg-cyan-600 border-cyan-500 text-white' : 'bg-github-card border-github-border text-github-text hover:bg-[#21262d]'}`}
            >
              Pasos/Agua
            </button>
          </div>

          {/* Forms Area */}
        {activeTab === 'comida' && (
          <form onSubmit={handleAddMeal} className="bg-[#1c2128] border border-github-border p-4 rounded-xl flex flex-col gap-4 animate-in fade-in slide-in-from-top-2">
            <h4 className="font-bold">Agregar Comida</h4>
            <div className="flex gap-4 flex-wrap">
              <input 
                required
                type="text"
                inputMode="text"
                placeholder="Descripción (ej: Ensalada)" 
                value={mealName} onChange={e => setMealName(e.target.value)}
                className="flex-1 bg-github-bg border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
              <select 
                value={mealType} onChange={e => setMealType(e.target.value as MealType)}
                className="bg-github-bg border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="Desayuno">Desayuno</option>
                <option value="Almuerzo">Almuerzo</option>
                <option value="Merienda">Merienda</option>
                <option value="Cena">Cena</option>
                <option value="Snack">Snack</option>
              </select>
              <input 
                required
                type="number" inputMode="numeric" pattern="[0-9]*" min="0" placeholder="Kcal" 
                value={mealCals} onChange={e => setMealCals(Number(e.target.value))}
                className="w-24 bg-github-bg border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium text-sm transition-colors flex items-center gap-2">
                <Check weight="bold" /> Guardar
              </button>
            </div>
          </form>
        )}

        {activeTab === 'entrenamiento' && (
          <form onSubmit={handleAddWorkout} className="bg-[#1c2128] border border-github-border p-4 rounded-xl flex flex-col gap-4 animate-in fade-in slide-in-from-top-2">
            <h4 className="font-bold">Agregar Entrenamiento</h4>
            <div className="flex gap-4 flex-wrap">
              <input 
                required
                type="text"
                inputMode="text"
                placeholder="Actividad (ej: Running)" 
                value={workActivity} onChange={e => setWorkActivity(e.target.value)}
                className="flex-1 bg-github-bg border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
              />
              <input 
                required
                type="number" inputMode="numeric" pattern="[0-9]*" min="1" placeholder="Minutos" 
                value={workDuration} onChange={e => setWorkDuration(Number(e.target.value))}
                className="w-24 bg-github-bg border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
              />
              <input 
                required
                type="number" inputMode="numeric" pattern="[0-9]*" min="0" placeholder="Kcal" 
                value={workCals} onChange={e => setWorkCals(Number(e.target.value))}
                className="w-24 bg-github-bg border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
              />
              <button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-md font-medium text-sm transition-colors flex items-center gap-2">
                <Check weight="bold" /> Guardar
              </button>
            </div>
          </form>
        )}

        {activeTab === 'pasos-agua' && (
          <div className="bg-[#1c2128] border border-github-border p-4 rounded-xl flex flex-col md:flex-row gap-8 animate-in fade-in slide-in-from-top-2">
            <div className="flex-1 flex flex-col gap-3">
              <h4 className="font-bold flex items-center gap-2"><Drop className="text-cyan-400" /> Registro de Agua</h4>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button onClick={() => handleAddWater(250)} className="flex-1 bg-github-bg border border-github-border hover:border-cyan-500 hover:text-cyan-400 py-2 rounded-md text-sm transition-colors">
                    + 250 ml
                  </button>
                  <button onClick={() => handleAddWater(500)} className="flex-1 bg-github-bg border border-github-border hover:border-cyan-500 hover:text-cyan-400 py-2 rounded-md text-sm transition-colors">
                    + 500 ml
                  </button>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleAddWater(-250)} className="flex-1 bg-github-bg border border-github-border hover:border-red-500 hover:text-red-400 py-2 rounded-md text-sm transition-colors">
                    - 250 ml
                  </button>
                  <button onClick={() => handleAddWater(-500)} className="flex-1 bg-github-bg border border-github-border hover:border-red-500 hover:text-red-400 py-2 rounded-md text-sm transition-colors">
                    - 500 ml
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-3">
              <h4 className="font-bold flex items-center gap-2"><Flame className="text-orange-400" /> Pasos del Día</h4>
              <div className="flex gap-2">
                <input 
                  type="number" inputMode="numeric" pattern="[0-9]*" min="0"
                  value={currentRecord.steps}
                  onChange={e => handleUpdateSteps(Number(e.target.value))}
                  className="flex-1 bg-github-bg border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>
          </div>
        )}
        </div>
      )}

      {/* Logs List */}
      {!isGroup && (
        <div className="bg-github-card border border-github-border rounded-xl mt-4 overflow-hidden">
          <div className="bg-[#21262d] px-4 py-3 border-b border-github-border">
            <h4 className="font-bold">Registros del Día</h4>
          </div>
          
          {currentRecord.meals.length === 0 && currentRecord.workouts.length === 0 && (
            <div className="p-8 text-center text-github-muted">
              No hay registros para este día.
            </div>
          )}

        <ul className="divide-y divide-github-border">
          {currentRecord.meals.map(meal => (
            <li key={meal.id} className="p-4 hover:bg-[#1c2128] flex justify-between items-center group transition-colors">
              <div className="flex flex-col">
                <span className="font-medium">{meal.name}</span>
                <span className="text-xs text-github-muted">{meal.type}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-semibold text-blue-400">+{meal.calories} kcal</span>
                <button 
                  onClick={() => handleDeleteMeal(meal.id)}
                  className="text-github-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash size={18} />
                </button>
              </div>
            </li>
          ))}

          {currentRecord.workouts.map(workout => (
            <li key={workout.id} className="p-4 hover:bg-[#1c2128] flex justify-between items-center group transition-colors">
              <div className="flex flex-col">
                <span className="font-medium">{workout.activity}</span>
                <span className="text-xs text-github-muted">{workout.duration} min</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-semibold text-orange-400">-{workout.calories} kcal</span>
                <button 
                  onClick={() => handleDeleteWorkout(workout.id)}
                  className="text-github-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash size={18} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      )}

    </div>
  );
};

export default DailyPanel;
