import React, { useState, useRef, useEffect } from 'react';
import { ForkKnife, Flame, Barbell, Drop, Trash, Check, PencilSimple, Scales, Sneaker } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
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
      document.addEventListener('click', handleClickOutside as EventListener);
    }
    return () => {
      document.removeEventListener('click', handleClickOutside as EventListener);
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

  const handleSetWeight = (weight: number) => {
    const newWeight = Math.max(0, weight);
    onUpdateRecord(dateStr, { ...currentRecord, weight: newWeight });
  };

  const handleUpdateSteps = (steps: number) => {
    onUpdateRecord(dateStr, { ...currentRecord, steps: Math.max(0, steps) });
  };

  const handleAddSteps = (amount: number) => {
    const newSteps = Math.max(0, currentRecord.steps + amount);
    onUpdateRecord(dateStr, { ...currentRecord, steps: newSteps });
  };

  // --- Forms State ---
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [mealName, setMealName] = useState('');
  const [isEditingWater, setIsEditingWater] = useState(false);
  const [editWaterVal, setEditWaterVal] = useState('');
  
  const [isEditingWeight, setIsEditingWeight] = useState(false);
  const [editWeightVal, setEditWeightVal] = useState('');
  
  const [isEditingSteps, setIsEditingSteps] = useState(false);
  const [editStepsVal, setEditStepsVal] = useState('');
  const [mealType, setMealType] = useState<MealType>('Almuerzo');
  const [mealCals, setMealCals] = useState<number | ''>('');

  const [localSteps, setLocalSteps] = useState(currentRecord.steps === 0 ? '' : String(currentRecord.steps));
  const stepsInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== stepsInputRef.current) {
      setLocalSteps(currentRecord.steps === 0 ? '' : String(currentRecord.steps));
    }
  }, [currentRecord.steps]);

  const handleAddMeal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mealName || !mealCals) return;
    
    if (editingMealId) {
      const updatedMeals = currentRecord.meals.map(m => 
        m.id === editingMealId ? { ...m, name: mealName, type: mealType, calories: Number(mealCals) } : m
      );
      onUpdateRecord(dateStr, { ...currentRecord, meals: updatedMeals });
      setEditingMealId(null);
    } else {
      const newMeal: MealEntry = { id: generateUUID(), name: mealName, type: mealType, calories: Number(mealCals), time: format(new Date(), 'HH:mm') };
      onUpdateRecord(dateStr, { ...currentRecord, meals: [...currentRecord.meals, newMeal] });
    }
    
    setMealName('');
    setMealCals('');
    setActiveTab(null);
  };

  const startEditMeal = (m: MealEntry) => {
    setActiveTab('comida');
    setEditingMealId(m.id);
    setMealName(m.name);
    setMealType(m.type);
    setMealCals(m.calories);
  };

  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [workActivity, setWorkActivity] = useState('');
  const [workDuration, setWorkDuration] = useState<number | ''>('');
  const [workCals, setWorkCals] = useState<number | ''>('');
  const [workDetails, setWorkDetails] = useState('');

  const handleAddWorkout = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workActivity || !workDuration || !workCals) return;
    
    if (editingWorkoutId) {
      const updatedWorkouts = currentRecord.workouts.map(w => 
        w.id === editingWorkoutId ? { ...w, activity: workActivity, duration: Number(workDuration), calories: Number(workCals), details: workDetails } : w
      );
      onUpdateRecord(dateStr, { ...currentRecord, workouts: updatedWorkouts });
      setEditingWorkoutId(null);
    } else {
      const newWorkout: WorkoutEntry = { 
        id: generateUUID(), activity: workActivity, duration: Number(workDuration), calories: Number(workCals), muscles: [], details: workDetails, time: format(new Date(), 'HH:mm')
      };
      onUpdateRecord(dateStr, { ...currentRecord, workouts: [...currentRecord.workouts, newWorkout] });
    }
    
    setWorkActivity('');
    setWorkDuration('');
    setWorkCals('');
    setWorkDetails('');
    setActiveTab(null);
  };

  const startEditWorkout = (w: WorkoutEntry) => {
    setActiveTab('entrenamiento');
    setEditingWorkoutId(w.id);
    setWorkActivity(w.activity);
    setWorkDuration(w.duration);
    setWorkCals(w.calories);
    setWorkDetails(w.details || '');
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex justify-between items-end border-b border-github-border pb-2">
        <h3 className="text-2xl font-bold text-github-text capitalize">{panelTitle}</h3>
        <span className="text-github-muted capitalize">{panelSubtitle}</span>
      </div>

      {/* Summary Cards */}
      <div className="flex flex-col gap-4">
        {/* Hero Card de Calorías */}
        <div className="bg-github-card border border-github-border rounded-xl p-4 md:p-6 flex flex-col items-center gap-4">
          <div className="flex flex-col items-center text-center">
            <div className="flex items-center gap-2 text-github-muted text-sm font-semibold mb-1">
              <Barbell size={20} className="text-purple-400" /> Balance Neto
            </div>
            <div className="text-4xl md:text-5xl font-bold text-white mb-2 tabular-nums">
              {balance !== null ? (balance > 0 ? `+${balance.toLocaleString('es-AR')}` : balance.toLocaleString('es-AR')) : 0}
            </div>
            <div className={`text-xs px-3 py-1 rounded-full font-medium ${getPillColor(balance)}`}>
              {balanceLabel || 'Mantenimiento'}
            </div>
          </div>

          <div className="w-full flex justify-between md:justify-around items-center border-t border-github-border/30 pt-4 mt-2">
            <div className="flex flex-col items-center gap-1 flex-1">
              <div className="flex items-center gap-1 text-github-muted text-xs font-semibold">
                <ForkKnife size={16} className="text-blue-400" /> Ingeridas
              </div>
              <div className="text-xl font-bold text-white tabular-nums">{ingested.toLocaleString('es-AR')} <span className="text-xs font-normal text-github-muted">kcal</span></div>
            </div>
            
            <div className="h-10 w-px bg-github-border/50"></div>
            
            <div className="flex flex-col items-center gap-1 flex-1">
              <div className="flex items-center gap-1 text-github-muted text-xs font-semibold">
                <Flame size={16} className="text-orange-400" /> Quemadas
              </div>
              <div className="text-xl font-bold text-white tabular-nums">{Math.round(burned).toLocaleString('es-AR')} <span className="text-xs font-normal text-github-muted">kcal</span></div>
            </div>
          </div>
          
          {!isGroup && (
            <div className="text-[10px] text-github-muted leading-tight text-center mt-2 max-w-xs opacity-75">
              TMB: {currentBMR.toLocaleString('es-AR')} + Pasos: {Math.round(currentRecord.steps * 0.04).toLocaleString('es-AR')} + Ejercicio: {currentRecord.workouts.reduce((s,w)=>s+w.calories,0).toLocaleString('es-AR')}
            </div>
          )}
        </div>

        {/* Hábitos Compactos */}
        {!isGroup && (
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-github-card border border-github-border p-3 rounded-xl flex flex-col items-center text-center justify-between gap-2 h-full">
              <div className="flex flex-col items-center gap-1">
                <Drop size={20} className="text-cyan-400" />
                <span className="text-[10px] uppercase tracking-wider font-semibold text-github-muted">Agua</span>
              </div>
              <div className="text-lg md:text-xl font-bold text-white flex flex-col items-center">
                {isEditingWater ? (
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min="0"
                    autoFocus
                    value={editWaterVal}
                    onChange={(e) => setEditWaterVal(e.target.value)}
                    onBlur={() => {
                      handleSetWater(Number(editWaterVal) || 0);
                      setIsEditingWater(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSetWater(Number(editWaterVal) || 0);
                        setIsEditingWater(false);
                      }
                    }}
                    className="w-16 bg-github-bg border border-github-border rounded-md px-1 py-0.5 text-center text-sm md:text-base focus:outline-none focus:border-cyan-500"
                  />
                ) : (
                  <span 
                    className="cursor-pointer hover:text-cyan-400 transition-colors" 
                    onClick={() => {
                      setEditWaterVal(currentRecord.water ? String(currentRecord.water) : '');
                      setIsEditingWater(true);
                    }}
                    title="Editar cantidad"
                  >
                    {currentRecord.water.toLocaleString('es-AR')}
                  </span>
                )}
                <span className="text-[10px] font-normal text-github-muted mt-0.5">ml</span>
              </div>
            </div>

            <div className="bg-github-card border border-github-border p-3 rounded-xl flex flex-col items-center text-center justify-between gap-2 h-full">
              <div className="flex flex-col items-center gap-1">
                <Sneaker size={20} className="text-green-400" />
                <span className="text-[10px] uppercase tracking-wider font-semibold text-github-muted">Pasos</span>
              </div>
              <div className="text-lg md:text-xl font-bold text-white flex flex-col items-center">
                {isEditingSteps ? (
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min="0"
                    autoFocus
                    value={editStepsVal}
                    onChange={(e) => setEditStepsVal(e.target.value)}
                    onBlur={() => {
                      handleUpdateSteps(Number(editStepsVal) || 0);
                      setIsEditingSteps(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleUpdateSteps(Number(editStepsVal) || 0);
                        setIsEditingSteps(false);
                      }
                    }}
                    className="w-16 bg-github-bg border border-github-border rounded-md px-1 py-0.5 text-center text-sm md:text-base focus:outline-none focus:border-green-500"
                  />
                ) : (
                  <span 
                    className="cursor-pointer hover:text-green-400 transition-colors" 
                    onClick={() => {
                      setEditStepsVal(currentRecord.steps ? String(currentRecord.steps) : '');
                      setIsEditingSteps(true);
                    }}
                    title="Editar pasos"
                  >
                    {currentRecord.steps.toLocaleString('es-AR')}
                  </span>
                )}
                <span className="text-[10px] font-normal text-github-muted mt-0.5">pasos</span>
              </div>
            </div>

            <div className="bg-github-card border border-github-border p-3 rounded-xl flex flex-col items-center text-center justify-between gap-2 h-full">
              <div className="flex flex-col items-center gap-1">
                <Scales size={20} className="text-pink-400" />
                <span className="text-[10px] uppercase tracking-wider font-semibold text-github-muted">Peso</span>
              </div>
              <div className="text-lg md:text-xl font-bold text-white flex flex-col items-center">
                {isEditingWeight ? (
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min="0"
                    autoFocus
                    value={editWeightVal}
                    onChange={(e) => setEditWeightVal(e.target.value)}
                    onBlur={() => {
                      handleSetWeight(Number(editWeightVal) || 0);
                      setIsEditingWeight(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSetWeight(Number(editWeightVal) || 0);
                        setIsEditingWeight(false);
                      }
                    }}
                    className="w-16 bg-github-bg border border-github-border rounded-md px-1 py-0.5 text-center text-sm md:text-base focus:outline-none focus:border-pink-500"
                  />
                ) : (
                  <span 
                    className="cursor-pointer hover:text-pink-400 transition-colors" 
                    onClick={() => {
                      setEditWeightVal(currentRecord.weight ? String(currentRecord.weight) : '');
                      setIsEditingWeight(true);
                    }}
                    title="Editar peso"
                  >
                    {currentRecord.weight ? currentRecord.weight.toLocaleString('es-AR') : '--'}
                  </span>
                )}
                <span className="text-[10px] font-normal text-github-muted mt-0.5">kg</span>
              </div>
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
            
            <div className="flex flex-wrap gap-2">
              {['Gimnasio', 'Fútbol', 'Correr', 'Natación', 'Caminata'].map(act => (
                <button
                  key={act}
                  type="button"
                  onClick={() => setWorkActivity(act)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${workActivity.toLowerCase() === act.toLowerCase() ? 'bg-orange-600 border-orange-500 text-white' : 'bg-github-bg border-github-border text-github-muted hover:text-white'}`}
                >
                  {act}
                </button>
              ))}
            </div>

            <div className="flex gap-4 flex-wrap">
              <input 
                required
                type="text"
                inputMode="text"
                placeholder="Actividad (ej: Running)" 
                value={workActivity} onChange={e => setWorkActivity(e.target.value)}
                className="flex-1 min-w-[150px] bg-github-bg border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
              />
              <input 
                required
                type="number" inputMode="numeric" pattern="[0-9]*" min="1" placeholder="Minutos" 
                value={workDuration} onChange={e => setWorkDuration(Number(e.target.value))}
                className="w-24 flex-shrink-0 bg-github-bg border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
              />
              <input 
                required
                type="number" inputMode="numeric" pattern="[0-9]*" min="0" placeholder="Kcal" 
                value={workCals} onChange={e => setWorkCals(Number(e.target.value))}
                className="w-24 flex-shrink-0 bg-github-bg border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
              />
            </div>

            {workActivity.toLowerCase() === 'gimnasio' && (
              <textarea
                placeholder="Detalle de la rutina (ej: Pecho y Tríceps / Press banca 4x10...)"
                value={workDetails}
                onChange={e => setWorkDetails(e.target.value)}
                className="w-full bg-github-bg border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500 min-h-[60px] resize-y"
              />
            )}

            <div className="flex justify-end">
              <button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-md font-medium text-sm transition-colors flex items-center gap-2">
                <Check weight="bold" /> Guardar
              </button>
            </div>
          </form>
        )}

        {activeTab === 'pasos-agua' && (
          <div className="bg-[#1c2128] border border-github-border p-4 rounded-xl flex flex-col md:flex-row gap-8 animate-in fade-in slide-in-from-top-2">
            <div className="flex-1 flex flex-col gap-3">
              <h4 className="font-bold flex items-center gap-2"><Sneaker className="text-orange-400" /> Pasos del Día</h4>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button onClick={() => handleAddSteps(1000)} className="flex-1 bg-github-bg border border-github-border hover:border-orange-500 hover:text-orange-400 py-2 rounded-md text-sm transition-colors">
                    + 1.000
                  </button>
                  <button onClick={() => handleAddSteps(5000)} className="flex-1 bg-github-bg border border-github-border hover:border-orange-500 hover:text-orange-400 py-2 rounded-md text-sm transition-colors">
                    + 5.000
                  </button>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleAddSteps(-1000)} className="w-1/3 bg-github-bg border border-github-border hover:border-red-500 hover:text-red-400 py-2 rounded-md text-sm transition-colors">
                    - 1.000
                  </button>
                  <input 
                    ref={stepsInputRef}
                    type="number" inputMode="numeric" pattern="[0-9]*" min="0" placeholder="Editar manual..."
                    value={localSteps}
                    onChange={e => setLocalSteps(e.target.value)}
                    onBlur={e => handleUpdateSteps(Number(e.target.value) || 0)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        handleUpdateSteps(Number(localSteps) || 0);
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="flex-1 bg-github-bg border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500 min-w-0"
                  />
                </div>
              </div>
            </div>
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
              <div className="flex flex-col flex-1 min-w-0 pr-2">
                <span className="font-medium truncate">{meal.name}</span>
                <span className="text-xs text-github-muted truncate">
                  {meal.time ? `${meal.time} hs • ` : ''}{meal.type}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-semibold text-blue-400 whitespace-nowrap">+{meal.calories} kcal</span>
                <div className="flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all">
                  <button 
                    onClick={() => startEditMeal(meal)}
                    className="text-github-muted hover:text-blue-400 p-1"
                    title="Editar"
                  >
                    <PencilSimple size={18} />
                  </button>
                  <button 
                    onClick={() => handleDeleteMeal(meal.id)}
                    className="text-github-muted hover:text-red-500 p-1"
                    title="Eliminar"
                  >
                    <Trash size={18} />
                  </button>
                </div>
              </div>
            </li>
          ))}

          {currentRecord.workouts.map(workout => (
            <li key={workout.id} className="p-4 hover:bg-[#1c2128] flex justify-between items-center group transition-colors">
              <div className="flex flex-col flex-1 min-w-0 pr-2">
                <span className="font-medium truncate">{workout.activity}</span>
                <span className="text-xs text-github-muted truncate">
                  {workout.time ? `${workout.time} hs • ` : ''}{workout.duration} min
                </span>
                {workout.details && workout.activity.toLowerCase() === 'gimnasio' && (
                  <span className="text-xs text-github-muted/70 mt-1 line-clamp-2 whitespace-pre-wrap">{workout.details}</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-semibold text-orange-400 whitespace-nowrap">-{workout.calories} kcal</span>
                <div className="flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all">
                  <button 
                    onClick={() => startEditWorkout(workout)}
                    className="text-github-muted hover:text-orange-400 p-1"
                    title="Editar"
                  >
                    <PencilSimple size={18} />
                  </button>
                  <button 
                    onClick={() => handleDeleteWorkout(workout.id)}
                    className="text-github-muted hover:text-red-500 p-1"
                    title="Eliminar"
                  >
                    <Trash size={18} />
                  </button>
                </div>
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
