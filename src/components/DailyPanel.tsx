import React, { useState, useRef, useEffect } from 'react';
import { ForkKnife, Flame, Barbell, Drop, Trash, Check, PencilSimple, Scales, Sneaker, X, CaretRight, Clock } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import type { DailyRecord, MealEntry, MealType, WorkoutEntry, DailyRecordsMap } from '../types';
import { getCaloriesIngested, getBalanceLabel, generateUUID, aggregateEnergy, getRemainingCalories, getRemainingLabel, getWorkoutCalories } from '../utils/helpers';

interface DailyPanelProps {
  record: DailyRecord | undefined;
  dateStr: string;
  onUpdateRecord: (dateStr: string, updatedRecord: DailyRecord) => void;
  dailyTDEE: number;
  dailyTarget: number;
  selectedGroup?: { type: 'day'|'week'|'month'|'year', label: string, dates: string[] } | null;
  records?: DailyRecordsMap;
}

const DailyPanel: React.FC<DailyPanelProps> = ({ record, dateStr, onUpdateRecord, dailyTDEE, dailyTarget, selectedGroup, records }) => {
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

  const summary = aggregateEnergy(records || {}, isGroup ? selectedGroup.dates : [dateStr], dailyTDEE);
  const ingested = isGroup ? summary.consumed : getCaloriesIngested(currentRecord);
  const balance = summary.balance;
  const remaining = getRemainingCalories(currentRecord, dailyTarget);
  const balanceLabel = isGroup ? getBalanceLabel(summary.averageBalance) : getRemainingLabel(remaining);

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
    if (bal === null) return 'bg-slate-200 dark:bg-gray-800 text-slate-900 dark:text-white';
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
  const [mealDetails, setMealDetails] = useState('');
  const [mealTime, setMealTime] = useState('');

  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [workActivity, setWorkActivity] = useState('');
  const [workDuration, setWorkDuration] = useState<number | ''>('');
  const [workCals, setWorkCals] = useState<number | ''>('');
  const [workDetails, setWorkDetails] = useState('');
  const [workDistance, setWorkDistance] = useState<number | ''>('');
  const [workPace, setWorkPace] = useState('');
  const [workTime, setWorkTime] = useState('');

  const resetForms = () => {
    setEditingMealId(null);
    setMealName('');
    setMealCals('');
    setMealDetails('');
    setMealTime('');
    
    setEditingWorkoutId(null);
    setWorkActivity('');
    setWorkDuration('');
    setWorkCals('');
    setWorkDetails('');
    setWorkDistance('');
    setWorkPace('');
    setWorkTime('');
  };

  const handleTabToggle = (tab: 'comida' | 'entrenamiento' | 'pasos-agua') => {
    if (activeTab === tab) {
      setActiveTab(null);
      resetForms();
    } else {
      setActiveTab(tab);
      resetForms();
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      // Ignore clicks on elements that have been removed from the DOM (like the modal buttons)
      if (!document.contains(event.target as Node)) return;
      
      // Also ignore clicks inside any modal (which we give a special class or check by closest)
      // Actually, checking if it's inside the tabContainer is enough, BUT if they click inside the modal
      // and it's NOT removed from the DOM, we also want to ignore it!
      const target = event.target as Element;
      if (target.closest('.fixed.inset-0')) return; // Ignore clicks inside modals

      if (tabContainerRef.current && !tabContainerRef.current.contains(event.target as Node)) {
        setActiveTab(null);
        resetForms();
      }
    };
    if (activeTab) {
      document.addEventListener('click', handleClickOutside as EventListener);
    }
    return () => {
      document.removeEventListener('click', handleClickOutside as EventListener);
    };
  }, [activeTab]);
  const [localSteps, setLocalSteps] = useState(currentRecord.steps === 0 ? '' : String(currentRecord.steps));
  const stepsInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== stepsInputRef.current) {
      setLocalSteps(currentRecord.steps === 0 ? '' : String(currentRecord.steps));
    }
  }, [currentRecord.steps]);

  useEffect(() => {
    if (activeTab === 'comida' && !editingMealId) {
      setMealTime(format(new Date(), 'HH:mm'));
    } else if (activeTab === 'entrenamiento' && !editingWorkoutId) {
      setWorkTime(format(new Date(), 'HH:mm'));
    }
  }, [activeTab, editingMealId, editingWorkoutId]);

  const handleAddMeal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mealName || !mealCals) return;
    
    if (editingMealId) {
      const updatedMeals = currentRecord.meals.map(m => 
        m.id === editingMealId ? { ...m, name: mealName, type: mealType, calories: Number(mealCals), details: mealDetails, time: mealTime || format(new Date(), 'HH:mm') } : m
      );
      onUpdateRecord(dateStr, { ...currentRecord, meals: updatedMeals });
      setEditingMealId(null);
    } else {
      const newMeal: MealEntry = { id: generateUUID(), name: mealName, type: mealType, calories: Number(mealCals), time: mealTime || format(new Date(), 'HH:mm'), details: mealDetails };
      onUpdateRecord(dateStr, { ...currentRecord, meals: [...currentRecord.meals, newMeal] });
    }
    
    setMealName('');
    setMealCals('');
    setMealDetails('');
    setMealTime('');
    setActiveTab(null);
  };

  const startEditMeal = (m: MealEntry) => {
    setActiveTab(null);
    setEditingMealId(m.id);
    setMealName(m.name);
    setMealType(m.type);
    setMealCals(m.calories);
    setMealDetails(m.details || '');
    setMealTime(m.time || format(new Date(), 'HH:mm'));
  };

  const handleAddWorkout = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workActivity || !workDuration || !workCals) return;
    
    if (editingWorkoutId) {
      const updatedWorkouts = currentRecord.workouts.map(w => 
        w.id === editingWorkoutId ? { ...w, activity: workActivity, duration: Number(workDuration), calories: Number(workCals), details: workDetails, distance: workDistance ? Number(workDistance) : undefined, pace: workPace || undefined, time: workTime || format(new Date(), 'HH:mm') } : w
      );
      onUpdateRecord(dateStr, { ...currentRecord, workouts: updatedWorkouts });
      setEditingWorkoutId(null);
    } else {
      const newWorkout: WorkoutEntry = { 
        id: generateUUID(), activity: workActivity, duration: Number(workDuration), calories: Number(workCals), muscles: [], details: workDetails, time: workTime || format(new Date(), 'HH:mm'), distance: workDistance ? Number(workDistance) : undefined, pace: workPace || undefined
      };
      onUpdateRecord(dateStr, { ...currentRecord, workouts: [...currentRecord.workouts, newWorkout] });
    }
    
    setWorkActivity('');
    setWorkDuration('');
    setWorkCals('');
    setWorkDetails('');
    setWorkDistance('');
    setWorkPace('');
    setWorkTime('');
    setActiveTab(null);
  };

  const startEditWorkout = (w: WorkoutEntry) => {
    setActiveTab(null);
    setEditingWorkoutId(w.id);
    setWorkActivity(w.activity);
    setWorkDuration(w.duration);
    setWorkCals(w.calories);
    setWorkDetails(w.details || '');
    setWorkDistance(w.distance || '');
    setWorkPace(w.pace || '');
    setWorkTime(w.time || format(new Date(), 'HH:mm'));
  };

  const [detailModalItem, setDetailModalItem] = useState<(MealEntry & { _type: 'meal' }) | (WorkoutEntry & { _type: 'workout' }) | null>(null);

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex justify-between items-end border-b border-slate-200 dark:border-gray-800 pb-2">
        <h3 className="text-2xl font-bold text-slate-900 dark:text-white capitalize">{panelTitle}</h3>
        <span className="text-slate-500 dark:text-gray-400 capitalize">{panelSubtitle}</span>
      </div>

      {/* Summary Cards */}
      <div className="flex flex-col gap-4">
        {/* Hero Card de Calorías */}
        <div className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 rounded-xl p-4 md:p-6 flex flex-col items-center gap-4">
          <div className="flex flex-col items-center text-center">
            <div className="flex items-center gap-2 text-slate-500 dark:text-gray-400 text-sm font-semibold mb-1">
              <Barbell size={20} className="text-purple-400" /> {isGroup ? 'Balance energético estimado' : getRemainingLabel(remaining)}
            </div>
            <div className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-2 tabular-nums">
              {isGroup ? (balance === null ? 'Sin datos' : `${balance > 0 ? '+' : ''}${balance.toLocaleString('es-AR')} kcal`) : `${Math.abs(remaining).toLocaleString('es-AR')} kcal`}
            </div>
            <div className={`text-xs px-3 py-1 rounded-full font-medium ${getPillColor(isGroup ? summary.averageBalance : -remaining)}`}>
              {balanceLabel || 'Mantenimiento'}
            </div>
          </div>

          <div className="w-full flex justify-between md:justify-around items-center border-t border-slate-200 dark:border-gray-800/30 pt-4 mt-2">
            <div className="flex flex-col items-center gap-1 flex-1">
              <div className="flex items-center gap-1 text-slate-500 dark:text-gray-400 text-xs font-semibold">
                <ForkKnife size={16} className="text-blue-400" /> Consumidas
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">{ingested.toLocaleString('es-AR')} <span className="text-xs font-normal text-slate-500 dark:text-gray-400">kcal</span></div>
            </div>
            
            <div className="h-10 w-px bg-slate-200 dark:bg-gray-800/50"></div>
            
            <div className="flex flex-col items-center gap-1 flex-1">
              <div className="flex items-center gap-1 text-slate-500 dark:text-gray-400 text-xs font-semibold">
                <Flame size={16} className="text-orange-400" /> {isGroup ? 'Gasto estimado' : 'Meta diaria'}
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">{(isGroup ? summary.expenditure : dailyTarget).toLocaleString('es-AR')} <span className="text-xs font-normal text-slate-500 dark:text-gray-400">kcal</span></div>
            </div>
          </div>
          
          {isGroup && <p className="text-xs text-slate-500 dark:text-gray-400">{summary.days} días con datos. Balance = consumidas − TDEE; se usa el perfil actual.</p>}
          {!isGroup && (
            <div className="text-[10px] text-slate-500 dark:text-gray-400 leading-tight text-center mt-2 max-w-xs opacity-75">
              Gasto diario estimado: {dailyTDEE.toLocaleString('es-AR')} kcal. Ejercicio registrado: {getWorkoutCalories(currentRecord).toLocaleString('es-AR')} kcal (no modifica la meta).
            </div>
          )}
        </div>

        {/* Hábitos Compactos */}
        {!isGroup && (
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 p-3 rounded-xl flex flex-col items-center text-center justify-between gap-2 h-full">
              <div className="flex flex-col items-center gap-1">
                <Drop size={20} className="text-cyan-400" />
                <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-gray-400">Agua</span>
              </div>
              <div className="text-lg md:text-xl font-bold text-slate-900 dark:text-white flex flex-col items-center">
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
                    className="w-16 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-1 py-0.5 text-center text-sm md:text-base focus:outline-none focus:border-cyan-500"
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
                <span className="text-[10px] font-normal text-slate-500 dark:text-gray-400 mt-0.5">ml</span>
              </div>
            </div>

            <div className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 p-3 rounded-xl flex flex-col items-center text-center justify-between gap-2 h-full">
              <div className="flex flex-col items-center gap-1">
                <Sneaker size={20} className="text-green-400" />
                <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-gray-400">Pasos</span>
              </div>
              <div className="text-lg md:text-xl font-bold text-slate-900 dark:text-white flex flex-col items-center">
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
                    className="w-16 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-1 py-0.5 text-center text-sm md:text-base focus:outline-none focus:border-green-500"
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
                <span className="text-[10px] font-normal text-slate-500 dark:text-gray-400 mt-0.5">pasos</span>
              </div>
            </div>

            <div className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 p-3 rounded-xl flex flex-col items-center text-center justify-between gap-2 h-full cursor-pointer hover:border-pink-500/50 transition-colors"
                 onClick={() => {
                   setEditWeightVal(currentRecord.weight ? String(currentRecord.weight) : '');
                   setIsEditingWeight(true);
                 }}
                 title="Registrar peso"
            >
              <div className="flex flex-col items-center gap-1">
                <Scales size={20} className="text-pink-400" />
                <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-gray-400">Peso</span>
              </div>
              <div className="text-lg md:text-xl font-bold text-slate-900 dark:text-white flex flex-col items-center">
                <span className="hover:text-pink-400 transition-colors">
                  {currentRecord.weight ? currentRecord.weight.toLocaleString('es-AR') : '--'}
                </span>
                <span className="text-[10px] font-normal text-slate-500 dark:text-gray-400 mt-0.5">kg</span>
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
              onClick={() => handleTabToggle('comida')}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors border ${activeTab === 'comida' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white dark:bg-[#161b22] border-slate-200 dark:border-gray-800 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-[#0f141c]'}`}
            >
              + Comida
            </button>
            <button 
              onClick={() => handleTabToggle('entrenamiento')}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors border ${activeTab === 'entrenamiento' ? 'bg-orange-600 border-orange-500 text-white' : 'bg-white dark:bg-[#161b22] border-slate-200 dark:border-gray-800 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-[#0f141c]'}`}
            >
              + Ejercicio
            </button>
            <button 
              onClick={() => handleTabToggle('pasos-agua')}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors border ${activeTab === 'pasos-agua' ? 'bg-cyan-600 border-cyan-500 text-white' : 'bg-white dark:bg-[#161b22] border-slate-200 dark:border-gray-800 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-[#0f141c]'}`}
            >
              Pasos/Agua
            </button>
          </div>

          {/* Forms Area */}
        {activeTab === 'comida' && (
          <form onSubmit={handleAddMeal} className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 p-4 rounded-xl flex flex-col gap-4 animate-in fade-in slide-in-from-top-2">
            <h4 className="font-bold text-slate-900 dark:text-white">Agregar Comida</h4>
            <div className="flex gap-4 flex-wrap">
              <input 
                required
                type="text"
                inputMode="text"
                placeholder="Descripción (ej: Ensalada)" 
                value={mealName} onChange={e => setMealName(e.target.value)}
                className="flex-1 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
              <select 
                value={mealType} onChange={e => setMealType(e.target.value as MealType)}
                className="bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
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
                className="w-24 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium text-base transition-colors flex items-center gap-2">
                <Check weight="bold" /> Guardar
              </button>
            </div>
            <div className="flex gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <input 
                  type="time" 
                  required 
                  value={mealTime} 
                  onChange={e => setMealTime(e.target.value)}
                  className="bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
                <button 
                  type="button" 
                  title="Hora actual" 
                  onClick={() => setMealTime(format(new Date(), 'HH:mm'))}
                  className="bg-slate-100 dark:bg-[#0f141c] border border-slate-200 dark:border-gray-800 p-2 rounded-md hover:text-blue-400 text-slate-500 dark:text-gray-400 transition-colors flex-shrink-0"
                >
                  <Clock size={18} />
                </button>
              </div>
              <input
                type="text"
                placeholder="Notas / Detalles opcionales (ej: Acompañamientos, ingredientes...)"
                value={mealDetails}
                onChange={e => setMealDetails(e.target.value)}
                className="flex-1 min-w-[200px] bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </form>
        )}

        {activeTab === 'entrenamiento' && (
          <form onSubmit={handleAddWorkout} className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 p-4 rounded-xl flex flex-col gap-4 animate-in fade-in slide-in-from-top-2">
            <h4 className="font-bold text-slate-900 dark:text-white">Agregar Entrenamiento</h4>
            
            <div className="flex flex-wrap gap-2">
              {['Gimnasio', 'Fútbol', 'Correr', 'Natación', 'Caminata'].map(act => (
                <button
                  key={act}
                  type="button"
                  onClick={() => setWorkActivity(act)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${workActivity.toLowerCase() === act.toLowerCase() ? 'bg-orange-600 border-orange-500 text-white' : 'bg-slate-100 dark:bg-[#0f141c] border-slate-200 dark:border-gray-800 text-slate-500 dark:text-gray-400 hover:text-white'}`}
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
                className="flex-1 min-w-[150px] bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
              />
              <input 
                required
                type="number" inputMode="numeric" pattern="[0-9]*" min="1" placeholder="Minutos" 
                value={workDuration} onChange={e => setWorkDuration(Number(e.target.value))}
                className="w-24 flex-shrink-0 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
              />
              <input 
                required
                type="number" inputMode="numeric" pattern="[0-9]*" min="0" placeholder="Kcal" 
                value={workCals} onChange={e => setWorkCals(Number(e.target.value))}
                className="w-24 flex-shrink-0 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
              />
            </div>

            <div className="flex gap-4 flex-wrap items-start">
              <div className="flex items-center gap-2">
                <input 
                  type="time" 
                  required 
                  value={workTime} 
                  onChange={e => setWorkTime(e.target.value)}
                  className="bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                />
                <button 
                  type="button" 
                  title="Hora actual" 
                  onClick={() => setWorkTime(format(new Date(), 'HH:mm'))}
                  className="bg-slate-100 dark:bg-[#0f141c] border border-slate-200 dark:border-gray-800 p-2 rounded-md hover:text-orange-400 text-slate-500 dark:text-gray-400 transition-colors flex-shrink-0"
                >
                  <Clock size={18} />
                </button>
              </div>
              <textarea
                placeholder={workActivity.toLowerCase() === 'gimnasio' ? "Detalle de la rutina (ej: Pecho y Tríceps / Press banca 4x10...)" : "Notas o detalles adicionales..."}
                value={workDetails}
                onChange={e => setWorkDetails(e.target.value)}
                className="flex-1 w-full bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500 min-h-[42px] resize-y min-w-[200px]"
              />
            </div>

            {['correr', 'natación', 'caminata'].includes(workActivity.toLowerCase()) && (
              <div className="flex gap-4">
                <input 
                  type="number" step="0.01" min="0" placeholder="Distancia (km) opc." 
                  value={workDistance} onChange={e => setWorkDistance(e.target.value === '' ? '' : Number(e.target.value))}
                  className="flex-1 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500 min-w-0"
                />
                <input 
                  type="text" placeholder="Ritmo (ej: 5:30) opc." 
                  value={workPace} onChange={e => setWorkPace(e.target.value)}
                  className="flex-1 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500 min-w-0"
                />
              </div>
            )}

            <div className="flex justify-end">
              <button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-md font-medium text-base transition-colors flex items-center gap-2">
                <Check weight="bold" /> Guardar
              </button>
            </div>
          </form>
        )}

        {activeTab === 'pasos-agua' && (
          <div className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 p-4 rounded-xl flex flex-col md:flex-row gap-8 animate-in fade-in slide-in-from-top-2">
            <div className="flex-1 flex flex-col gap-3">
              <h4 className="font-bold flex items-center gap-2"><Sneaker className="text-orange-400" /> Pasos del Día</h4>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button onClick={() => handleAddSteps(500)} className="flex-1 bg-slate-100 dark:bg-[#0f141c] border border-slate-200 dark:border-gray-800 hover:border-orange-500 hover:text-orange-400 py-2 rounded-md text-sm transition-colors">
                    + 500
                  </button>
                  <button onClick={() => handleAddSteps(1000)} className="flex-1 bg-slate-100 dark:bg-[#0f141c] border border-slate-200 dark:border-gray-800 hover:border-orange-500 hover:text-orange-400 py-2 rounded-md text-sm transition-colors">
                    + 1.000
                  </button>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleAddSteps(-500)} className="flex-1 bg-slate-100 dark:bg-[#0f141c] border border-slate-200 dark:border-gray-800 hover:border-red-500 hover:text-red-400 py-2 rounded-md text-sm transition-colors">
                    - 500
                  </button>
                  <button onClick={() => handleAddSteps(-1000)} className="flex-1 bg-slate-100 dark:bg-[#0f141c] border border-slate-200 dark:border-gray-800 hover:border-red-500 hover:text-red-400 py-2 rounded-md text-sm transition-colors">
                    - 1.000
                  </button>
                </div>
                <div className="flex gap-2 mt-1">
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
                    className="flex-1 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500 min-w-0"
                  />
                </div>
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-3">
              <h4 className="font-bold flex items-center gap-2"><Drop className="text-cyan-400" /> Registro de Agua</h4>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button onClick={() => handleAddWater(250)} className="flex-1 bg-slate-100 dark:bg-[#0f141c] border border-slate-200 dark:border-gray-800 hover:border-cyan-500 hover:text-cyan-400 py-2 rounded-md text-sm transition-colors">
                    + 250 ml
                  </button>
                  <button onClick={() => handleAddWater(500)} className="flex-1 bg-slate-100 dark:bg-[#0f141c] border border-slate-200 dark:border-gray-800 hover:border-cyan-500 hover:text-cyan-400 py-2 rounded-md text-sm transition-colors">
                    + 500 ml
                  </button>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleAddWater(-250)} className="flex-1 bg-slate-100 dark:bg-[#0f141c] border border-slate-200 dark:border-gray-800 hover:border-red-500 hover:text-red-400 py-2 rounded-md text-sm transition-colors">
                    - 250 ml
                  </button>
                  <button onClick={() => handleAddWater(-500)} className="flex-1 bg-slate-100 dark:bg-[#0f141c] border border-slate-200 dark:border-gray-800 hover:border-red-500 hover:text-red-400 py-2 rounded-md text-sm transition-colors">
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
        <div className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 rounded-xl mt-4 overflow-hidden">
          <div className="bg-slate-100 dark:bg-[#0f141c] px-4 py-3 border-b border-slate-200 dark:border-gray-800">
            <h4 className="font-bold text-slate-900 dark:text-white">Registros del Día</h4>
          </div>
          
          {currentRecord.meals.length === 0 && currentRecord.workouts.length === 0 && (
            <div className="p-8 text-center text-slate-500 dark:text-gray-400">
              No hay registros para este día.
            </div>
          )}

        <ul className="divide-y divide-slate-200 dark:divide-gray-800">
          {
            [
              ...currentRecord.meals.map(m => ({ ...m, _type: 'meal' as const })),
              ...currentRecord.workouts.map(w => ({ ...w, _type: 'workout' as const }))
            ]
            .sort((a, b) => {
              const timeA = a.time || '00:00';
              const timeB = b.time || '00:00';
              return timeA.localeCompare(timeB);
            })
            .map(item => {
              if (item._type === 'meal') {
                const meal = item as (MealEntry & { _type: 'meal' });
                return (
                  <li 
                    key={`meal-${meal.id}`} 
                    onClick={() => setDetailModalItem(meal)}
                    className="p-3.5 hover:bg-white dark:bg-[#161b22] flex flex-col gap-1.5 group transition-colors cursor-pointer"
                  >
                    <div className="w-full font-medium text-wrap break-words leading-tight">
                      {meal.name}
                    </div>
                    <div className="flex justify-between items-center text-xs mt-1 text-slate-500 dark:text-gray-400 opacity-80 group-hover:opacity-100 transition-opacity">
                      <span>
                        {meal.time ? `${meal.time} hs • ` : ''}{meal.type}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-blue-400 whitespace-nowrap text-sm">+{meal.calories} kcal</span>
                        <CaretRight size={14} className="text-slate-500 dark:text-gray-400 group-hover:text-white transition-colors" />
                      </div>
                    </div>
                  </li>
                );
              } else {
                const workout = item as (WorkoutEntry & { _type: 'workout' });
                return (
                  <li 
                    key={`workout-${workout.id}`} 
                    onClick={() => setDetailModalItem(workout)}
                    className="p-3.5 hover:bg-white dark:bg-[#161b22] flex flex-col gap-1.5 group transition-colors cursor-pointer"
                  >
                    <div className="w-full font-medium text-wrap break-words leading-tight">
                      {workout.activity}
                    </div>
                    <div className="flex justify-between items-center text-xs mt-1 text-slate-500 dark:text-gray-400 opacity-80 group-hover:opacity-100 transition-opacity">
                      <span>
                        {workout.time ? `${workout.time} hs • ` : ''}{workout.duration} min
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-orange-400 whitespace-nowrap text-sm">-{workout.calories} kcal</span>
                        <CaretRight size={14} className="text-slate-500 dark:text-gray-400 group-hover:text-white transition-colors" />
                      </div>
                    </div>
                  </li>
                );
              }
            })
          }
        </ul>
      </div>
      )}

      {/* Detail Modal */}
      {detailModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 w-full max-w-sm rounded-2xl shadow-xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-200 dark:border-gray-800 flex justify-between items-center bg-slate-100 dark:bg-[#0f141c]">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">Detalle del Registro</h3>
              <button 
                onClick={() => setDetailModalItem(null)}
                className="text-slate-500 dark:text-gray-400 hover:text-white transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 flex flex-col gap-4">
              <div className="flex flex-col gap-1 text-center">
                <span className="text-xl font-bold text-white break-words">
                  {detailModalItem._type === 'meal' ? detailModalItem.name : detailModalItem.activity}
                </span>
                <span className="text-sm text-slate-500 dark:text-gray-400">
                  {detailModalItem.time ? `${detailModalItem.time} hs • ` : ''}
                  {detailModalItem._type === 'meal' ? detailModalItem.type : `${detailModalItem.duration} min`}
                </span>
              </div>
              
              <div className="text-center py-2">
                <span className={`text-3xl font-black tracking-tight ${detailModalItem._type === 'meal' ? 'text-blue-400' : 'text-orange-400'}`}>
                  {detailModalItem._type === 'meal' ? '+' : '-'}{detailModalItem.calories} <span className="text-lg font-medium text-slate-500 dark:text-gray-400">kcal</span>
                </span>
              </div>

              {detailModalItem.details && (
                <div className="bg-slate-100 dark:bg-[#0f141c] border border-slate-200 dark:border-gray-800 rounded-lg p-3 text-sm text-slate-900 dark:text-white whitespace-pre-wrap">
                  {detailModalItem.details}
                </div>
              )}

              {detailModalItem._type === 'workout' && (detailModalItem.distance || detailModalItem.pace) && (
                <div className="flex gap-4 bg-slate-100 dark:bg-[#0f141c] border border-slate-200 dark:border-gray-800 rounded-lg p-3">
                  {detailModalItem.distance && (
                    <div className="flex-1 flex flex-col items-center">
                      <span className="text-[10px] uppercase text-slate-500 dark:text-gray-400 font-bold tracking-wider mb-1">Distancia</span>
                      <span className="font-medium">{detailModalItem.distance} km</span>
                    </div>
                  )}
                  {detailModalItem.distance && detailModalItem.pace && (
                    <div className="w-[1px] bg-slate-200 dark:bg-gray-800"></div>
                  )}
                  {detailModalItem.pace && (
                    <div className="flex-1 flex flex-col items-center">
                      <span className="text-[10px] uppercase text-slate-500 dark:text-gray-400 font-bold tracking-wider mb-1">Ritmo</span>
                      <span className="font-medium">{detailModalItem.pace} /km</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-slate-200 dark:border-gray-800 flex gap-3 bg-slate-100 dark:bg-[#0f141c]">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  const item = detailModalItem;
                  setDetailModalItem(null);
                  if (item._type === 'meal') startEditMeal(item as MealEntry);
                  else startEditWorkout(item as WorkoutEntry);
                }}
                className="flex-1 bg-slate-100 dark:bg-[#0f141c] border border-slate-200 dark:border-gray-800 hover:bg-slate-200 dark:hover:bg-gray-800/50 text-white py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <PencilSimple size={18} /> Editar
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  if (detailModalItem._type === 'meal') handleDeleteMeal(detailModalItem.id);
                  else handleDeleteWorkout(detailModalItem.id);
                  setDetailModalItem(null);
                }}
                className="flex-1 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Trash size={18} /> Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Peso Modal */}
      {isEditingWeight && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 w-full max-w-xs rounded-2xl shadow-xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-200 dark:border-gray-800 flex justify-between items-center bg-slate-100 dark:bg-[#0f141c]">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">Registrar Peso</h3>
              <button 
                onClick={() => setIsEditingWeight(false)}
                className="text-slate-500 dark:text-gray-400 hover:text-white transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 flex flex-col items-center gap-4">
               <input
                 type="text"
                 inputMode="decimal"
                 autoFocus
                 value={editWeightVal}
                 onChange={(e) => {
                   const valorLimpio = e.target.value.replace(',', '.');
                   const filtrado = valorLimpio.replace(/[^0-9.]/g, '');
                   setEditWeightVal(filtrado);
                 }}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter') {
                     handleSetWeight(parseFloat(editWeightVal) || 0);
                     setIsEditingWeight(false);
                   }
                 }}
                 className="w-32 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-lg px-4 py-3 text-center text-xl focus:outline-none focus:border-pink-500"
               />
               <span className="text-sm text-slate-500 dark:text-gray-400">kilogramos</span>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-gray-800 flex gap-3 bg-slate-100 dark:bg-[#0f141c]">
              <button 
                onClick={() => {
                  handleSetWeight(parseFloat(editWeightVal) || 0);
                  setIsEditingWeight(false);
                }}
                className="flex-1 bg-pink-600 hover:bg-pink-700 text-white py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Check size={18} weight="bold" /> Guardar
              </button>
            </div>
          </div>
        </div>
      )}

    
      {/* Edit Modal para Comidas */}
      {editingMealId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 w-full max-w-sm rounded-2xl shadow-xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-200 dark:border-gray-800 flex justify-between items-center bg-slate-100 dark:bg-[#0f141c]">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">Editar Comida</h3>
              <button 
                type="button"
                onClick={() => resetForms()}
                className="text-slate-500 dark:text-gray-400 hover:text-white transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddMeal} className="p-4 flex flex-col gap-4">
              <div className="flex gap-4 flex-wrap">
                <input 
                  required
                  type="text"
                  inputMode="text"
                  placeholder="Descripción (ej: Ensalada)" 
                  value={mealName} onChange={e => setMealName(e.target.value)}
                  className="flex-1 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
                <select 
                  value={mealType} onChange={e => setMealType(e.target.value as any)}
                  className="bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
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
                  className="w-24 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex gap-4 flex-wrap">
                <div className="flex-1 flex items-center gap-2">
                  <input 
                    type="time" 
                    value={mealTime} 
                    onChange={e => setMealTime(e.target.value)}
                    className="w-full bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                  <button 
                    type="button"
                    onClick={() => setMealTime(new Date().toLocaleTimeString('es-AR', {hour: '2-digit', minute:'2-digit'}))}
                    className="p-2 bg-slate-100 dark:bg-[#0f141c] border border-slate-200 dark:border-gray-800 rounded-md hover:bg-slate-200 dark:hover:bg-gray-800 text-slate-500 dark:text-gray-400 hover:text-white transition-colors"
                    title="Hora actual"
                  >
                    <Clock size={16} />
                  </button>
                </div>
                <input 
                  type="text"
                  placeholder="Notas / Detalles (opcional)" 
                  value={mealDetails} onChange={e => setMealDetails(e.target.value)}
                  className="flex-[2] bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex justify-end border-t border-slate-200 dark:border-gray-800 pt-4 mt-2">
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium text-base transition-colors flex items-center justify-center gap-2">
                  <Check weight="bold" /> Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal para Entrenamiento */}
      {editingWorkoutId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 w-full max-w-sm rounded-2xl shadow-xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-200 dark:border-gray-800 flex justify-between items-center bg-slate-100 dark:bg-[#0f141c]">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">Editar Entrenamiento</h3>
              <button 
                type="button"
                onClick={() => resetForms()}
                className="text-slate-500 dark:text-gray-400 hover:text-white transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddWorkout} className="p-4 flex flex-col gap-4">
              <div className="flex gap-4 flex-wrap">
                <input 
                  required
                  type="text"
                  placeholder="Actividad (ej: Correr)" 
                  value={workActivity} onChange={e => setWorkActivity(e.target.value)}
                  className="flex-1 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                />
                <input 
                  required
                  type="number" inputMode="numeric" pattern="[0-9]*" min="0" placeholder="Minutos" 
                  value={workDuration} onChange={e => setWorkDuration(Number(e.target.value))}
                  className="w-24 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                />
                <input 
                  required
                  type="number" inputMode="numeric" pattern="[0-9]*" min="0" placeholder="Kcal" 
                  value={workCals} onChange={e => setWorkCals(Number(e.target.value))}
                  className="w-24 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex gap-4 flex-wrap">
                <div className="flex-1 flex items-center gap-2">
                  <input 
                    type="time" 
                    value={workTime} 
                    onChange={e => setWorkTime(e.target.value)}
                    className="w-full bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                  />
                  <button 
                    type="button"
                    onClick={() => setWorkTime(new Date().toLocaleTimeString('es-AR', {hour: '2-digit', minute:'2-digit'}))}
                    className="p-2 bg-slate-100 dark:bg-[#0f141c] border border-slate-200 dark:border-gray-800 rounded-md hover:bg-slate-200 dark:hover:bg-gray-800 text-slate-500 dark:text-gray-400 hover:text-white transition-colors"
                    title="Hora actual"
                  >
                    <Clock size={16} />
                  </button>
                </div>
                <input 
                  type="text"
                  placeholder="Notas / Detalles (opcional)" 
                  value={workDetails} onChange={e => setWorkDetails(e.target.value)}
                  className="flex-[2] bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex gap-4">
                <input 
                  type="number" step="0.1" inputMode="decimal" placeholder="Distancia (km) opcional" 
                  value={workDistance} onChange={e => setWorkDistance(Number(e.target.value))}
                  className="flex-1 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                />
                <input 
                  type="text" placeholder="Ritmo (min/km) opcional" 
                  value={workPace} onChange={e => setWorkPace(e.target.value)}
                  className="flex-1 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex justify-end border-t border-slate-200 dark:border-gray-800 pt-4 mt-2">
                <button type="submit" className="w-full bg-orange-600 hover:bg-orange-700 text-white px-4 py-2.5 rounded-lg font-medium text-base transition-colors flex items-center justify-center gap-2">
                  <Check weight="bold" /> Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DailyPanel;

