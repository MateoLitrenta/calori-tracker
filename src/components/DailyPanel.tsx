import React, { useState, useRef, useEffect } from 'react';
import { ForkKnife, Flame, Barbell, Drop, Trash, Check, PencilSimple, Scales, Sneaker, X, CaretRight, Clock, Sparkle } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import type { DailyRecord, MealEntry, MealType, WorkoutEntry, DailyRecordsMap, UserProfile } from '../types';
import { hasEnergyData, formatDateStr, getCaloriesIngested, generateUUID, aggregateEnergy, getWorkoutCalories, getStepCalories, calculateBMR, calculateDailyExpenditure, getBalanceLabel, getBalancePillColor } from '../utils/helpers';
import { estimateMeal, estimateWorkout } from '../services/aiService';
import { AIRequestError } from '../services/aiTransport';
import { supabase } from '../lib/supabase';
import { MealPhotoPicker, MealThumbnail } from './MealPhoto';
import EntryFormShell from './EntryFormShell';

interface DailyPanelProps {
  record: DailyRecord | undefined;
  dateStr: string;
  onUpdateRecord: (dateStr: string, updatedRecord: DailyRecord) => Promise<boolean>;
  profile: UserProfile;
  selectedGroup?: { type: 'day'|'week'|'month'|'year', label: string, dates: string[] } | null;
  records?: DailyRecordsMap;
}

const DailyPanel: React.FC<DailyPanelProps> = ({ record, dateStr, onUpdateRecord, profile, selectedGroup, records }) => {
  const [activeTab, setActiveTab] = useState<'comida' | 'entrenamiento' | 'pasos-agua' | null>(null);
  const tabContainerRef = useRef<HTMLDivElement>(null);

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

  const isHistorical = dateStr < formatDateStr(new Date());
  const emptyHistory = !isGroup && isHistorical && !hasEnergyData(currentRecord);
  const expenditure = calculateDailyExpenditure(profile, currentRecord);
  const summary = aggregateEnergy(records || {}, isGroup ? selectedGroup.dates : [dateStr], profile);
  const ingested = isGroup ? summary.consumed : getCaloriesIngested(currentRecord);
  const balance = emptyHistory ? null : isGroup ? summary.balance : Math.round(ingested - expenditure);
  const classifiedBalance = isGroup ? summary.averageBalance : balance;
  const balanceLabel = getBalanceLabel(classifiedBalance);

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

  // --- Handlers ---
  const handleDeleteMeal = async (id: string) => {
    const meal = currentRecord.meals.find(m => m.id === id);
    if (!await onUpdateRecord(dateStr, { ...currentRecord, meals: currentRecord.meals.filter(m => m.id !== id) })) return;
    toast.success('Comida eliminada', { style: { background: '#161b22', color: '#fff' }, icon: '🗑️' });
    if (meal?.photo_path) await removePhoto(meal.photo_path);
  };

  const removePhoto = async (path: string) => {
    try {
      const { error } = await supabase.storage.from('meal-photos').remove([path]);
      if (error) throw error;
    } catch (error) { console.error('Meal photo cleanup failed:', error); toast.error('No se pudo borrar la foto de Storage.'); }
  };

  const handleDeleteWorkout = (id: string) => {
    onUpdateRecord(dateStr, { ...currentRecord, workouts: currentRecord.workouts.filter(w => w.id !== id) });
    toast.success('Entrenamiento eliminado', { style: { background: '#161b22', color: '#fff' }, icon: '🗑️' });
  };

  const handleAddWater = (amount: number) => {
    const newWater = Math.max(0, waterValueRef.current + amount);
    waterValueRef.current = newWater;
    setLocalWater(newWater);
    scheduleWaterSave(newWater);
  };

  const handleSetWater = (amount: number) => {
    const newWater = Math.max(0, amount);
    waterValueRef.current = newWater;
    setLocalWater(newWater);
    scheduleWaterSave(newWater);
  };

  const handleSetWeight = (weight: number) => {
    const newWeight = Math.max(0, weight);
    onUpdateRecord(dateStr, { ...currentRecord, weight: newWeight });
  };

  const handleUpdateSteps = (steps: number) => {
    const nextSteps = Math.max(0, steps);
    setLocalSteps(nextSteps ? String(nextSteps) : '');
    stepsValueRef.current = nextSteps;
    scheduleStepsSave(nextSteps);
  };

  const handleAddSteps = (amount: number) => {
    const newSteps = Math.max(0, stepsValueRef.current + amount);
    stepsValueRef.current = newSteps;
    setLocalSteps(newSteps ? String(newSteps) : '');
    scheduleStepsSave(newSteps);
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
  const [mealPhoto, setMealPhoto] = useState<Blob | null>(null);
  const [mealPhotoRemoved, setMealPhotoRemoved] = useState(false);
  const [mealEstimated, setMealEstimated] = useState(false);
  const [workEstimated, setWorkEstimated] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [savingMeal, setSavingMeal] = useState(false);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const savingMealRef = useRef(false);

  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [workActivity, setWorkActivity] = useState('');
  const [workDuration, setWorkDuration] = useState<number | ''>('');
  const [workCals, setWorkCals] = useState<number | ''>('');
  const [workDetails, setWorkDetails] = useState('');
  const [workDistance, setWorkDistance] = useState<number | ''>('');
  const [workPace, setWorkPace] = useState('');
  const [workTime, setWorkTime] = useState('');
  const [savingWorkout, setSavingWorkout] = useState(false);
  const savingWorkoutRef = useRef(false);

  const resetForms = () => {
    setEditingMealId(null);
    setMealName('');
    setMealCals('');
    setMealDetails('');
    setMealTime('');
    setMealPhoto(null);
    setPhotoProcessing(false);
    setMealPhotoRemoved(false);
    setMealEstimated(false);
    setWorkEstimated(false);
    
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

  const closeEntry = () => {
    resetForms();
    setActiveTab(null);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if ((activeTab === 'comida' || activeTab === 'entrenamiento') && window.matchMedia('(max-width: 767px)').matches) return;
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
  const [localWater, setLocalWater] = useState(currentRecord.water);
  const waterValueRef = useRef(currentRecord.water);
  const waterDateRef = useRef(dateStr);
  const latestRecordsRef = useRef(records);
  useEffect(() => {
    latestRecordsRef.current = records;
  }, [records]);
  const waterSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleWaterSave = (water: number) => {
    if (waterSaveTimerRef.current) clearTimeout(waterSaveTimerRef.current);
    const saveDate = dateStr;
    const fallbackRecord = currentRecord;
    waterSaveTimerRef.current = setTimeout(() => {
      const latestRecord = latestRecordsRef.current?.[saveDate] || fallbackRecord;
      const pendingSteps = stepsSaveTimerRef.current && saveDate === stepsDateRef.current ? stepsValueRef.current : undefined;
      if (stepsSaveTimerRef.current && pendingSteps !== undefined) {
        clearTimeout(stepsSaveTimerRef.current);
        stepsSaveTimerRef.current = null;
      }
      onUpdateRecord(saveDate, { ...latestRecord, ...(pendingSteps !== undefined ? { steps: pendingSteps } : {}), water });
      waterSaveTimerRef.current = null;
    }, 400);
  };

  useEffect(() => {
    if (waterDateRef.current !== dateStr) {
      waterDateRef.current = dateStr;
      waterValueRef.current = currentRecord.water;
      setLocalWater(currentRecord.water);
    } else if (!waterSaveTimerRef.current && waterValueRef.current !== currentRecord.water) {
      waterValueRef.current = currentRecord.water;
      setLocalWater(currentRecord.water);
    }
  }, [dateStr, currentRecord.water]);
  useEffect(() => () => {
    if (waterSaveTimerRef.current) clearTimeout(waterSaveTimerRef.current);
  }, []);

  const [localSteps, setLocalSteps] = useState(currentRecord.steps === 0 ? '' : String(currentRecord.steps));
  const stepsInputRef = useRef<HTMLInputElement>(null);
  const stepsValueRef = useRef(currentRecord.steps);
  const stepsDateRef = useRef(dateStr);
  const stepsSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleStepsSave = (steps: number) => {
    if (stepsSaveTimerRef.current) clearTimeout(stepsSaveTimerRef.current);
    const saveDate = dateStr;
    stepsDateRef.current = saveDate;
    const fallbackRecord = currentRecord;
    stepsSaveTimerRef.current = setTimeout(() => {
      const latestRecord = latestRecordsRef.current?.[saveDate] || fallbackRecord;
      const pendingWater = waterSaveTimerRef.current && saveDate === waterDateRef.current ? waterValueRef.current : undefined;
      if (waterSaveTimerRef.current && pendingWater !== undefined) {
        clearTimeout(waterSaveTimerRef.current);
        waterSaveTimerRef.current = null;
      }
      onUpdateRecord(saveDate, { ...latestRecord, ...(pendingWater !== undefined ? { water: pendingWater } : {}), steps });
      stepsSaveTimerRef.current = null;
    }, 400);
  };

  useEffect(() => {
    if (document.activeElement !== stepsInputRef.current && !stepsSaveTimerRef.current) {
      stepsValueRef.current = currentRecord.steps;
      setLocalSteps(currentRecord.steps === 0 ? '' : String(currentRecord.steps));
    }
  }, [currentRecord.steps]);
  useEffect(() => () => {
    if (stepsSaveTimerRef.current) clearTimeout(stepsSaveTimerRef.current);
  }, []);

  useEffect(() => {
    if (activeTab === 'comida' && !editingMealId) {
      setMealTime(format(new Date(), 'HH:mm'));
    } else if (activeTab === 'entrenamiento' && !editingWorkoutId) {
      setWorkTime(format(new Date(), 'HH:mm'));
    }
  }, [activeTab, editingMealId, editingWorkoutId]);

  const handleEstimateMeal = async () => {
    if (estimating || (!mealName.trim() && !mealPhoto)) { toast.error('Describí la comida o agregá una foto.'); return; }
    setEstimating(true);
    try {
      const attachment = mealPhoto ? { kind: 'image' as const, mimeType: 'image/jpeg', data: await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = reject; reader.readAsDataURL(mealPhoto);
      }) } : undefined;
      const result = await estimateMeal({ name: mealName, details: mealDetails, type: mealType, attachment });
      setMealCals(result.calories);
      if (!mealName.trim()) setMealName(result.description);
      setMealEstimated(true);
      if (result.assumptions.length) toast(result.assumptions.join(' · '));
    } catch (error) { toast.error(error instanceof AIRequestError ? error.message : 'No pude estimar las calorías. Agregá más detalle o intentá nuevamente.'); }
    finally { setEstimating(false); }
  };

  const handleEstimateWorkout = async () => {
    if (estimating) return;
    if (!workActivity.trim()) { toast.error('Indicá qué ejercicio hiciste.'); return; }
    if (!workDuration || workDuration <= 0) { toast.error('Indicá cuánto tiempo entrenaste.'); return; }
    setEstimating(true);
    try {
      const result = await estimateWorkout({ activity: workActivity, duration: Number(workDuration), details: workDetails,
        profile: { sex: profile.sex, age: profile.age, weight: profile.weight, height: profile.height } });
      setWorkCals(result.calories); setWorkEstimated(true);
      if (result.assumptions.length) toast(result.assumptions.join(' · '));
    } catch (error) { toast.error(error instanceof AIRequestError ? error.message : 'No pude estimar el gasto. Revisá actividad y duración.'); }
    finally { setEstimating(false); }
  };

  const handleAddMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mealName.trim() || !mealCals || savingMealRef.current || photoProcessing) return;
    savingMealRef.current = true; setSavingMeal(true);
    const oldMeal = editingMealId ? currentRecord.meals.find(m => m.id === editingMealId) : undefined;
    const mealId = editingMealId || generateUUID();
    let uploadedPath: string | null = null;
    try {
      if (mealPhoto) {
        uploadedPath = `${profile.user_id}/${dateStr}/${mealId}-${generateUUID()}.jpg`;
        const { error } = await supabase.storage.from('meal-photos').upload(uploadedPath, mealPhoto, { contentType: 'image/jpeg' });
        if (error) throw error;
      }
      const meal: MealEntry = { id: mealId, name: mealName, type: mealType, calories: Number(mealCals),
        time: mealTime || format(new Date(), 'HH:mm'), details: mealDetails,
        photo_path: uploadedPath || (mealPhotoRemoved ? null : oldMeal?.photo_path ?? null) };
      const meals = oldMeal ? currentRecord.meals.map(m => m.id === mealId ? meal : m) : [...currentRecord.meals, meal];
      if (!await onUpdateRecord(dateStr, { ...currentRecord, meals })) throw new Error('No se pudo guardar la comida.');
      if (oldMeal?.photo_path && oldMeal.photo_path !== meal.photo_path) await removePhoto(oldMeal.photo_path);
      resetForms(); setActiveTab(null);
    } catch {
      if (uploadedPath) await removePhoto(uploadedPath);
      toast.error('No se pudo guardar la comida con su foto. Intentá nuevamente.');
    } finally { savingMealRef.current = false; setSavingMeal(false); }
  };

  const startEditMeal = (m: MealEntry) => {
    setActiveTab(null);
    setEditingMealId(m.id);
    setMealName(m.name);
    setMealType(m.type);
    setMealCals(m.calories);
    setMealDetails(m.details || '');
    setMealTime(m.time || format(new Date(), 'HH:mm'));
    setMealPhoto(null); setMealPhotoRemoved(false); setMealEstimated(false);
  };

  const handleAddWorkout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workActivity || !workDuration || !workCals || savingWorkoutRef.current) return;
    savingWorkoutRef.current = true;
    setSavingWorkout(true);
    try {
      if (editingWorkoutId) {
        const updatedWorkouts = currentRecord.workouts.map(w =>
          w.id === editingWorkoutId ? { ...w, activity: workActivity, duration: Number(workDuration), calories: Number(workCals), details: workDetails, distance: workDistance ? Number(workDistance) : undefined, pace: workPace || undefined, time: workTime || format(new Date(), 'HH:mm') } : w
        );
        if (!await onUpdateRecord(dateStr, { ...currentRecord, workouts: updatedWorkouts })) return;
      } else {
        const newWorkout: WorkoutEntry = {
          id: generateUUID(), activity: workActivity, duration: Number(workDuration), calories: Number(workCals), muscles: [], details: workDetails, time: workTime || format(new Date(), 'HH:mm'), distance: workDistance ? Number(workDistance) : undefined, pace: workPace || undefined
        };
        if (!await onUpdateRecord(dateStr, { ...currentRecord, workouts: [...currentRecord.workouts, newWorkout] })) return;
      }
      closeEntry();
    } catch {
      toast.error('No se pudo guardar el ejercicio. Intentá nuevamente.');
    } finally {
      savingWorkoutRef.current = false;
      setSavingWorkout(false);
    }
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
  const mealPhotoControls = <MealPhotoPicker blob={mealPhoto}
    path={mealPhotoRemoved ? null : currentRecord.meals.find(m => m.id === editingMealId)?.photo_path}
    onChange={blob => { setMealPhoto(blob); setMealPhotoRemoved(false); }}
    onRemove={() => { setMealPhoto(null); setMealPhotoRemoved(true); }} onBusyChange={setPhotoProcessing} />;
  const mealEstimateControls = <div className="entry-ai-controls flex flex-col gap-1">
    <button type="button" disabled={estimating} onClick={() => void handleEstimateMeal()}
      className="entry-ai-action min-h-11 self-start px-4 rounded-[var(--radius-control)] border border-[#f5a064]/50 text-[#b85b22] dark:text-[#f5a064] disabled:opacity-50">
      <Sparkle className="entry-ai-icon" size={18} aria-hidden="true" />
      {estimating ? 'Estimando…' : 'Estimar con IA'}
    </button>
    {mealEstimated && <span className="self-start text-xs px-2 py-1 rounded-[var(--radius-pill)] bg-orange-100 text-orange-800 dark:bg-orange-400/10 dark:text-orange-200">Estimado por IA</span>}
  </div>;
  const workEstimateControls = <div className="entry-ai-controls flex flex-col gap-1">
    <button type="button" disabled={estimating} onClick={() => void handleEstimateWorkout()}
      className="entry-ai-action min-h-11 self-start px-4 rounded-[var(--radius-control)] border border-[#f5a064]/50 text-[#b85b22] dark:text-[#f5a064] disabled:opacity-50">
      <Sparkle className="entry-ai-icon" size={18} aria-hidden="true" />
      {estimating ? 'Estimando…' : 'Estimar con IA'}
    </button>
    {workEstimated && <span className="self-start text-xs px-2 py-1 rounded-[var(--radius-pill)] bg-orange-100 text-orange-800 dark:bg-orange-400/10 dark:text-orange-200">Estimado por IA</span>}
  </div>;

  return (
    <div className="daily-panel flex flex-col gap-6 w-full">
      <div className="daily-heading flex justify-between items-end border-b border-slate-200 dark:border-gray-800 pb-2">
        <h3 className="text-2xl font-bold text-slate-900 dark:text-white capitalize">{panelTitle}</h3>
        <span className="text-slate-500 dark:text-gray-400 capitalize">{panelSubtitle}</span>
      </div>

      {/* Summary Cards */}
      <div className="flex flex-col gap-4">
        {/* Hero Card de Calorías */}
        <div className="energy-card bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 rounded-xl p-4 md:p-6 flex flex-col items-center gap-4">
          <div className="energy-headline flex flex-col items-center text-center">
            <div className="flex items-center gap-2 text-slate-500 dark:text-gray-400 text-sm font-semibold mb-1">
              <Barbell size={20} className="text-purple-400" /> {isGroup ? 'Balance acumulado' : 'Balance energético'}
            </div>
            <div className="energy-number text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-2 tabular-nums">
              {balance === null ? 'Sin datos' : `${balance > 0 ? '+' : ''}${balance.toLocaleString('es-AR')} kcal`}
            </div>
            {isGroup && classifiedBalance !== null && (
              <div className="text-xs text-slate-500 dark:text-gray-400 tabular-nums mb-2">
                Promedio diario: {classifiedBalance > 0 ? '+' : ''}{classifiedBalance.toLocaleString('es-AR')} kcal/día
              </div>
            )}
            <div className={`energy-status text-xs px-3 py-1 rounded-full font-medium ${getBalancePillColor(classifiedBalance)}`}>
              {balanceLabel}
            </div>
          </div>

          <div className="energy-metrics w-full flex justify-between md:justify-around items-start border-t border-slate-200 dark:border-gray-800/30 pt-4 mt-2">
            <div className="flex flex-col items-center gap-1 flex-1">
              <div className="flex items-center gap-1 text-slate-500 dark:text-gray-400 text-xs font-semibold">
                <ForkKnife size={16} className="text-blue-400" /> Calorías consumidas
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">{ingested.toLocaleString('es-AR')} <span className="text-xs font-normal text-slate-500 dark:text-gray-400">kcal</span></div>
            </div>
            
            <div className="h-10 w-px bg-slate-200 dark:bg-gray-800/50"></div>
            
            <div className="flex flex-col items-center gap-1 flex-1">
              <div className="flex items-center gap-1 text-slate-500 dark:text-gray-400 text-xs font-semibold">
                <Flame size={16} className="text-orange-400" /> Gasto estimado
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">{(isGroup ? summary.expenditure : expenditure).toLocaleString('es-AR')} <span className="text-xs font-normal text-slate-500 dark:text-gray-400">kcal</span></div>
              {!isGroup && (
                <details className="text-xs text-slate-500 dark:text-gray-400 text-center mt-2">
                  <summary className="cursor-pointer font-medium">Ver desglose</summary>
                  <div className="space-y-1 mt-2">
                    <div>TMB: {calculateBMR(profile).toLocaleString('es-AR')} kcal</div>
                    <div>Pasos: {getStepCalories(currentRecord).toLocaleString('es-AR')} kcal</div>
                    <div>Ejercicio: {getWorkoutCalories(currentRecord).toLocaleString('es-AR')} kcal</div>
                  </div>
                </details>
              )}
            </div>
          </div>
          
          {isGroup && <p className="text-xs text-slate-500 dark:text-gray-400">{summary.days} días con datos.</p>}

        </div>

        {/* Hábitos Compactos */}
        {!isGroup && (
          <div className="daily-habits grid grid-cols-3 gap-2">
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
                  <button type="button"
                    className="habit-value cursor-pointer hover:text-cyan-400 transition-colors"
                    onClick={() => {
                      setEditWaterVal(localWater ? String(localWater) : '');
                      setIsEditingWater(true);
                    }}
                    title="Editar cantidad"
                  >
                    {localWater.toLocaleString('es-AR')}
                  </button>
                )}
                <span className="text-[10px] font-normal text-slate-500 dark:text-gray-400 mt-0.5">ml</span>
              </div>
              <div className="habit-controls">
                <button type="button" onClick={() => handleAddWater(-250)} aria-label="Restar 250 ml de agua">−</button>
                <button type="button" onClick={() => handleAddWater(250)} aria-label="Sumar 250 ml de agua">+250</button>
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
                  <button type="button"
                    className="habit-value cursor-pointer hover:text-green-400 transition-colors"
                    onClick={() => {
                      setEditStepsVal(currentRecord.steps ? String(currentRecord.steps) : '');
                      setIsEditingSteps(true);
                    }}
                    title="Editar pasos"
                  >
                    {Number(localSteps || 0).toLocaleString('es-AR')}
                  </button>
                )}
                <span className="text-[10px] font-normal text-slate-500 dark:text-gray-400 mt-0.5">pasos</span>
              </div>
              <div className="habit-controls">
                <button type="button" onClick={() => handleAddSteps(-500)} aria-label="Restar 500 pasos">−</button>
                <button type="button" onClick={() => handleAddSteps(500)} aria-label="Sumar 500 pasos">+500</button>
              </div>
            </div>

            <div className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 p-3 rounded-xl flex flex-col items-center text-center justify-between gap-2 h-full">
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
              <button type="button" className="habit-edit"
                onClick={() => {
                  setEditWeightVal(currentRecord.weight ? String(currentRecord.weight) : '');
                  setIsEditingWeight(true);
                }} title="Registrar peso">Editar</button>
            </div>
          </div>
        )}
      </div>

      {!isGroup && (
        <div ref={tabContainerRef} className="flex flex-col gap-4">
          {/* Action Buttons */}
          <div className="daily-quick-actions flex gap-2 mt-2">
            <button 
              onClick={() => handleTabToggle('comida')}
              aria-pressed={activeTab === 'comida'}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors border ${activeTab === 'comida' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white dark:bg-[#161b22] border-slate-200 dark:border-gray-800 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-[#0f141c]'}`}
            >
              + Comida
            </button>
            <button 
              onClick={() => handleTabToggle('entrenamiento')}
              aria-pressed={activeTab === 'entrenamiento'}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors border ${activeTab === 'entrenamiento' ? 'bg-orange-600 border-orange-500 text-white' : 'bg-white dark:bg-[#161b22] border-slate-200 dark:border-gray-800 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-[#0f141c]'}`}
            >
              + Ejercicio
            </button>
            <button 
              onClick={() => handleTabToggle('pasos-agua')}
              aria-pressed={activeTab === 'pasos-agua'}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors border ${activeTab === 'pasos-agua' ? 'bg-cyan-600 border-cyan-500 text-white' : 'bg-white dark:bg-[#161b22] border-slate-200 dark:border-gray-800 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-[#0f141c]'}`}
            >
              Pasos/Agua
            </button>
          </div>

          {/* Forms Area */}
        {activeTab === 'comida' && (
            <EntryFormShell title="Agregar comida" onClose={closeEntry}>
              <form onSubmit={handleAddMeal} className="entry-form bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 p-4 rounded-xl flex flex-col gap-4 animate-in fade-in slide-in-from-top-2">
                <div className="entry-form-content entry-fields-grid entry-meal-fields">
                  <h4 className="entry-form-title font-bold text-slate-900 dark:text-white">Agregar Comida</h4>
                  <div className="entry-field entry-description">
                    <label className="entry-field-label" htmlFor="add-meal-description">Descripción</label>
                    <input id="add-meal-description"
                      required
                      type="text"
                      inputMode="text"
                      placeholder="Ej. pollo con arroz y verduras"
                      value={mealName} onChange={e => setMealName(e.target.value)}
                      className="flex-1 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="entry-field entry-type">
                    <label className="entry-field-label" htmlFor="add-meal-type">Tipo de comida</label>
                    <select id="add-meal-type"
                      value={mealType} onChange={e => setMealType(e.target.value as MealType)}
                      className="bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    >
                      <option value="Desayuno">Desayuno</option>
                      <option value="Almuerzo">Almuerzo</option>
                      <option value="Merienda">Merienda</option>
                      <option value="Cena">Cena</option>
                      <option value="Snack">Snack</option>
                    </select>
                  </div>
                  <div className="entry-calorie-block">
                    <div className="entry-field entry-calories">
                      <label className="entry-field-label" htmlFor="add-meal-calories">Calorías</label>
                      <input id="add-meal-calories"
                        required
                        type="number" inputMode="numeric" pattern="[0-9]*" min="0" placeholder="Kcal"
                        value={mealCals} onChange={e => { setMealCals(Number(e.target.value)); setMealEstimated(false); }}
                        className="w-24 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    {mealEstimateControls}
                  </div>
                  <div className="entry-photo-section">
                    <div className="entry-photo-heading">
                      <span className="entry-field-label">Foto de la comida</span>
                      <span className="entry-photo-hint">Opcional · ayuda a estimar mejor</span></div><span className="entry-desktop-photo-label text-xs text-slate-500 dark:text-gray-400">Foto opcional</span>
                    {mealPhotoControls}
                  </div>
                  <div className="entry-secondary-fields">
                    <div className="entry-field entry-time">
                      <label className="entry-field-label" htmlFor="add-meal-time">Hora</label>
                      <div className="entry-time-row flex items-center gap-2">
                        <input id="add-meal-time"
                          type="time"
                          required
                          value={mealTime}
                          onChange={e => setMealTime(e.target.value)}
                          className="bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                        />
                        <button
                          type="button" aria-label="Usar hora actual"
                          title="Hora actual"
                          onClick={() => setMealTime(format(new Date(), 'HH:mm'))}
                          className="entry-time-now bg-slate-100 dark:bg-[#0f141c] border border-slate-200 dark:border-gray-800 p-2 rounded-md hover:text-blue-400 text-slate-500 dark:text-gray-400 transition-colors flex-shrink-0"
                        >
                          <Clock size={18} />
                        </button>
                      </div>
                    </div>
                    <div className="entry-field entry-notes">
                      <label className="entry-field-label" htmlFor="add-meal-notes">Notas <span>· Opcional</span></label>
                      <textarea id="add-meal-notes"
                        placeholder="Agregá detalles si querés."
                        value={mealDetails}
                        onChange={e => setMealDetails(e.target.value)}
                        className="flex-1 min-w-[200px] bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <button type="submit" disabled={savingMeal || photoProcessing} className="entry-inline-submit bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium text-base transition-colors flex items-center gap-2 disabled:opacity-50">
                    <Check weight="bold" /> Guardar
                  </button>
                </div>
                <div className="entry-form-footer entry-mobile-footer">
                  <button type="submit" disabled={savingMeal || photoProcessing} className="disabled:opacity-50">
                    <Check weight="bold" /> {savingMeal ? 'Guardando…' : 'Guardar comida'}
                  </button>
                </div>
              </form>
            </EntryFormShell>
        )}

        {activeTab === 'entrenamiento' && (
            <EntryFormShell title="Agregar ejercicio" onClose={closeEntry}>
              <form onSubmit={handleAddWorkout} className="entry-form bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 p-4 rounded-xl flex flex-col gap-4 animate-in fade-in slide-in-from-top-2">
                <div className="entry-form-content entry-fields-grid entry-workout-fields">
                  <h4 className="entry-form-title font-bold text-slate-900 dark:text-white">Agregar Entrenamiento</h4>
                  <div className="entry-field entry-activity">
                    <label className="entry-field-label" htmlFor="add-workout-activity">Actividad</label>
                    <input id="add-workout-activity"
                      required
                      type="text"
                      inputMode="text"
                      placeholder="Ej. running, fútbol, gimnasio"
                      value={workActivity} onChange={e => setWorkActivity(e.target.value)}
                      className="flex-1 min-w-[150px] bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div className="entry-activity-chips flex flex-wrap gap-2">
                    {['Gimnasio', 'Fútbol', 'Correr', 'Natación', 'Caminata'].map(act => (
                      <button
                        key={act}
                        aria-pressed={workActivity.toLowerCase() === act.toLowerCase()}
                        type="button"
                        onClick={() => setWorkActivity(act)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${workActivity.toLowerCase() === act.toLowerCase() ? 'bg-orange-600 border-orange-500 text-white' : 'bg-slate-100 dark:bg-[#0f141c] border-slate-200 dark:border-gray-800 text-slate-500 dark:text-gray-400 hover:text-white'}`}
                      >
                        {act}
                      </button>
                    ))}
                  </div>
                  <div className="entry-field entry-duration">
                    <label className="entry-field-label" htmlFor="add-workout-duration">Duración</label>
                    <div className="entry-unit-control">
                      <input id="add-workout-duration"
                        required
                        type="number" inputMode="numeric" pattern="[0-9]*" min="1" placeholder="Minutos"
                        value={workDuration} onChange={e => setWorkDuration(Number(e.target.value))}
                        className="w-24 flex-shrink-0 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                      />
                      <span className="entry-unit" aria-hidden="true">min</span></div>
                  </div>
                  <div className="entry-calorie-block">
                    <div className="entry-field entry-calories">
                      <label className="entry-field-label" htmlFor="add-workout-calories">Calorías</label>
                      <input id="add-workout-calories"
                        required
                        type="number" inputMode="numeric" pattern="[0-9]*" min="0" placeholder="Kcal"
                        value={workCals} onChange={e => { setWorkCals(Number(e.target.value)); setWorkEstimated(false); }}
                        className="w-24 flex-shrink-0 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                      />
                    </div>
                    {workEstimateControls}
                  </div>
                  <div className="entry-secondary-fields">
                    <div className="entry-field entry-time">
                      <label className="entry-field-label" htmlFor="add-workout-time">Hora</label>
                      <div className="entry-time-row flex items-center gap-2">
                        <input id="add-workout-time"
                          type="time"
                          required
                          value={workTime}
                          onChange={e => setWorkTime(e.target.value)}
                          className="bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                        />
                        <button
                          type="button" aria-label="Usar hora actual"
                          title="Hora actual"
                          onClick={() => setWorkTime(format(new Date(), 'HH:mm'))}
                          className="entry-time-now bg-slate-100 dark:bg-[#0f141c] border border-slate-200 dark:border-gray-800 p-2 rounded-md hover:text-orange-400 text-slate-500 dark:text-gray-400 transition-colors flex-shrink-0"
                        >
                          <Clock size={18} />
                        </button>
                      </div>
                    </div>
                    {['correr', 'natación', 'caminata'].includes(workActivity.toLowerCase()) && (<div className="entry-workout-metrics flex gap-4">
                      <div className="entry-field entry-distance">
                        <label className="entry-field-label" htmlFor="add-workout-distance">Distancia</label>
                        <input id="add-workout-distance"
                          type="number" step="0.01" min="0" placeholder="Distancia (km) opc."
                          value={workDistance} onChange={e => setWorkDistance(e.target.value === '' ? '' : Number(e.target.value))}
                          className="flex-1 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500 min-w-0"
                        />
                      </div>
                      <div className="entry-field entry-pace">
                        <label className="entry-field-label" htmlFor="add-workout-pace">Ritmo</label>
                        <input id="add-workout-pace"
                          type="text" placeholder="Ritmo (ej: 5:30) opc."
                          value={workPace} onChange={e => setWorkPace(e.target.value)}
                          className="flex-1 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500 min-w-0"
                        />
                      </div>
                    </div>)}
                    <div className="entry-field entry-notes">
                      <label className="entry-field-label" htmlFor="add-workout-notes">{workActivity.toLowerCase() === 'gimnasio' ? 'Detalle de la rutina' : 'Notas'} <span>· Opcional</span></label>
                      <textarea id="add-workout-notes"
                        placeholder={workActivity.toLowerCase() === 'gimnasio' ? "Detalle de la rutina (ej: Pecho y Tríceps / Press banca 4x10...)" : "Agregá detalles si querés."}
                        value={workDetails}
                        onChange={e => setWorkDetails(e.target.value)}
                        className="flex-1 w-full bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500 min-h-[42px] resize-y min-w-[200px]"
                      />
                    </div>
                  </div>

                </div>
                <div className="entry-form-footer flex justify-end">
                  <button type="submit" disabled={savingWorkout} className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-md font-medium text-base transition-colors flex items-center gap-2 disabled:opacity-50">
                    <Check weight="bold" /> {savingWorkout ? 'Guardando…' : <><span className="entry-desktop-copy">Guardar</span><span className="entry-mobile-copy">Guardar ejercicio</span></>}
                  </button>
                </div>
              </form>
            </EntryFormShell>
        )}

        {activeTab === 'pasos-agua' && (
          <div className="habit-adjustments bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 p-4 rounded-xl flex flex-col md:flex-row gap-8 animate-in fade-in slide-in-from-top-2">
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
        <div className={`daily-logs ${currentRecord.meals.length === 0 && currentRecord.workouts.length === 0 ? 'daily-logs--empty' : ''} bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 rounded-xl mt-4 overflow-hidden`}>
          <div className="bg-slate-100 dark:bg-[#0f141c] px-4 py-3 border-b border-slate-200 dark:border-gray-800">
            <h4 className="font-bold text-slate-900 dark:text-white">Registros del día</h4>
          </div>
          
          {currentRecord.meals.length === 0 && currentRecord.workouts.length === 0 && (
            <div className="daily-logs-empty p-8 text-center text-slate-500 dark:text-gray-400">
              Todavía no cargaste comidas ni entrenamientos.
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
                    <div className="flex items-center gap-3 w-full font-medium text-wrap break-words leading-tight">
                      {meal.photo_path && <MealThumbnail path={meal.photo_path} />}
                      <span><ForkKnife size={18} className="inline-block mr-2 text-orange-400" aria-hidden="true" />{meal.name}</span>
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
                      <Barbell size={18} className="inline-block mr-2 text-orange-400" aria-hidden="true" />{workout.activity}
                    </div>
                    <div className="flex justify-between items-center text-xs mt-1 text-slate-500 dark:text-gray-400 opacity-80 group-hover:opacity-100 transition-opacity">
                      <span>
                        {workout.time ? `${workout.time} hs • ` : ''}Ejercicio · {workout.duration} min
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
          <div className="record-detail-modal bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 w-full max-w-sm rounded-2xl shadow-xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
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
                <span className="record-detail-main text-xl font-bold text-white break-words">
                  {detailModalItem._type === 'meal' ? detailModalItem.name : detailModalItem.activity}
                </span>
                <span className="record-detail-secondary text-sm text-slate-500 dark:text-gray-400">
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
                <div className="record-detail-details bg-slate-100 dark:bg-[#0f141c] border border-slate-200 dark:border-gray-800 rounded-lg p-3 text-sm text-slate-900 dark:text-white whitespace-pre-wrap">
                  {detailModalItem.details}
                </div>
              )}

              {detailModalItem._type === 'workout' && (detailModalItem.distance || detailModalItem.pace) && (
                <div className="record-detail-meta flex gap-4 bg-slate-100 dark:bg-[#0f141c] border border-slate-200 dark:border-gray-800 rounded-lg p-3">
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
                className="record-detail-edit flex-1 bg-slate-100 dark:bg-[#0f141c] border border-slate-200 dark:border-gray-800 hover:bg-slate-200 dark:hover:bg-gray-800/50 text-white py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
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
        <EntryFormShell title="Editar comida" onClose={closeEntry} desktopModal>
          <form onSubmit={handleAddMeal} className="entry-form p-4 flex flex-col gap-4">
            <div className="entry-form-content entry-fields-grid entry-meal-fields entry-edit-fields">
              <div className="entry-field entry-description">
                <label className="entry-field-label" htmlFor="edit-meal-description">Descripción</label>
                <input id="edit-meal-description"
                  required
                  type="text"
                  inputMode="text"
                  placeholder="Ej. pollo con arroz y verduras"
                  value={mealName} onChange={e => setMealName(e.target.value)}
                  className="flex-1 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="entry-field entry-type">
                <label className="entry-field-label" htmlFor="edit-meal-type">Tipo de comida</label>
                <select id="edit-meal-type"
                  value={mealType} onChange={e => setMealType(e.target.value as any)}
                  className="bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="Desayuno">Desayuno</option>
                  <option value="Almuerzo">Almuerzo</option>
                  <option value="Merienda">Merienda</option>
                  <option value="Cena">Cena</option>
                  <option value="Snack">Snack</option>
                </select>
              </div>
              <div className="entry-calorie-block">
                <div className="entry-field entry-calories">
                  <label className="entry-field-label" htmlFor="edit-meal-calories">Calorías</label>
                  <input id="edit-meal-calories"
                    required
                    type="number" inputMode="numeric" pattern="[0-9]*" min="0" placeholder="Kcal"
                    value={mealCals} onChange={e => { setMealCals(Number(e.target.value)); setMealEstimated(false); }}
                    className="w-24 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                {mealEstimateControls}
              </div>
              <div className="entry-photo-section">
                <div className="entry-photo-heading">
                  <span className="entry-field-label">Foto de la comida</span>
                  <span className="entry-photo-hint">Opcional · ayuda a estimar mejor</span></div>
                {mealPhotoControls}
              </div>
              <div className="entry-secondary-fields">
                <div className="entry-field entry-time">
                  <label className="entry-field-label" htmlFor="edit-meal-time">Hora</label>
                  <div className="entry-time-row flex items-center gap-2">
                    <input id="edit-meal-time"
                      type="time"
                      value={mealTime}
                      onChange={e => setMealTime(e.target.value)}
                      className="w-full bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button" aria-label="Usar hora actual"
                      onClick={() => setMealTime(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }))}
                      className="entry-time-now p-2 bg-slate-100 dark:bg-[#0f141c] border border-slate-200 dark:border-gray-800 rounded-md hover:bg-slate-200 dark:hover:bg-gray-800 text-slate-500 dark:text-gray-400 hover:text-white transition-colors"
                      title="Hora actual"
                    >
                      <Clock size={16} />
                    </button>
                  </div>
                </div>
                <div className="entry-field entry-notes">
                  <label className="entry-field-label" htmlFor="edit-meal-notes">Notas <span>· Opcional</span></label>
                  <textarea id="edit-meal-notes"
                    placeholder="Agregá detalles si querés."
                    value={mealDetails} onChange={e => setMealDetails(e.target.value)}
                    className="flex-[2] bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

            </div>
            <div className="entry-form-footer flex justify-end border-t border-slate-200 dark:border-gray-800 pt-4 mt-2">
              <button type="submit" disabled={savingMeal || photoProcessing} className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium text-base transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                <Check weight="bold" /> {savingMeal ? 'Guardando…' : <><span className="entry-desktop-copy">Guardar Cambios</span><span className="entry-mobile-copy">Guardar cambios</span></>}
              </button>
            </div>
          </form>
        </EntryFormShell>
      )}

      {/* Edit Modal para Entrenamiento */}
      {editingWorkoutId && (
        <EntryFormShell title="Editar ejercicio" onClose={closeEntry} desktopModal>
          <form onSubmit={handleAddWorkout} className="entry-form p-4 flex flex-col gap-4">
            <div className="entry-form-content entry-fields-grid entry-workout-fields entry-edit-fields">
              <div className="entry-field entry-activity">
                <label className="entry-field-label" htmlFor="edit-workout-activity">Actividad</label>
                <input id="edit-workout-activity"
                  required
                  type="text"
                  placeholder="Ej. running, fútbol, gimnasio"
                  value={workActivity} onChange={e => setWorkActivity(e.target.value)}
                  className="flex-1 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                />
              </div>
              <div className="entry-field entry-duration">
                <label className="entry-field-label" htmlFor="edit-workout-duration">Duración</label>
                <div className="entry-unit-control">
                  <input id="edit-workout-duration"
                    required
                    type="number" inputMode="numeric" pattern="[0-9]*" min="0" placeholder="Minutos"
                    value={workDuration} onChange={e => setWorkDuration(Number(e.target.value))}
                    className="w-24 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                  />
                  <span className="entry-unit" aria-hidden="true">min</span></div>
              </div>
              <div className="entry-calorie-block">
                <div className="entry-field entry-calories">
                  <label className="entry-field-label" htmlFor="edit-workout-calories">Calorías</label>
                  <input id="edit-workout-calories"
                    required
                    type="number" inputMode="numeric" pattern="[0-9]*" min="0" placeholder="Kcal"
                    value={workCals} onChange={e => { setWorkCals(Number(e.target.value)); setWorkEstimated(false); }}
                    className="w-24 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
                {workEstimateControls}
              </div>
              <div className="entry-secondary-fields">
                <div className="entry-field entry-time">
                  <label className="entry-field-label" htmlFor="edit-workout-time">Hora</label>
                  <div className="entry-time-row flex items-center gap-2">
                    <input id="edit-workout-time"
                      type="time"
                      value={workTime}
                      onChange={e => setWorkTime(e.target.value)}
                      className="w-full bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                    />
                    <button
                      type="button" aria-label="Usar hora actual"
                      onClick={() => setWorkTime(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }))}
                      className="entry-time-now p-2 bg-slate-100 dark:bg-[#0f141c] border border-slate-200 dark:border-gray-800 rounded-md hover:bg-slate-200 dark:hover:bg-gray-800 text-slate-500 dark:text-gray-400 hover:text-white transition-colors"
                      title="Hora actual"
                    >
                      <Clock size={16} />
                    </button>
                  </div>
                </div>
                <div className="entry-workout-metrics flex gap-4">
                  <div className="entry-field entry-distance">
                    <label className="entry-field-label" htmlFor="edit-workout-distance">Distancia</label>
                    <input id="edit-workout-distance"
                      type="number" step="0.1" inputMode="decimal" placeholder="Distancia (km) opcional"
                      value={workDistance} onChange={e => setWorkDistance(Number(e.target.value))}
                      className="flex-1 max-md:min-w-0 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div className="entry-field entry-pace">
                    <label className="entry-field-label" htmlFor="edit-workout-pace">Ritmo</label>
                    <input id="edit-workout-pace"
                      type="text" placeholder="Ritmo (min/km) opcional"
                      value={workPace} onChange={e => setWorkPace(e.target.value)}
                      className="flex-1 max-md:min-w-0 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>
                <div className="entry-field entry-notes">
                  <label className="entry-field-label" htmlFor="edit-workout-notes">{workActivity.toLowerCase() === 'gimnasio' ? 'Detalle de la rutina' : 'Notas'} <span>· Opcional</span></label>
                  <textarea id="edit-workout-notes"
                    placeholder={workActivity.toLowerCase() === 'gimnasio' ? "Detalle de la rutina (ej: Pecho y Tríceps / Press banca 4x10...)" : "Agregá detalles si querés."}
                    value={workDetails} onChange={e => setWorkDetails(e.target.value)}
                    className="flex-[2] bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

            </div>
            <div className="entry-form-footer flex justify-end border-t border-slate-200 dark:border-gray-800 pt-4 mt-2">
              <button type="submit" disabled={savingWorkout} className="w-full bg-orange-600 hover:bg-orange-700 text-white px-4 py-2.5 rounded-lg font-medium text-base transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                <Check weight="bold" /> {savingWorkout ? 'Guardando…' : <><span className="entry-desktop-copy">Guardar Cambios</span><span className="entry-mobile-copy">Guardar cambios</span></>}
              </button>
            </div>
          </form>
        </EntryFormShell>
      )}
    </div>
  );
};

export default DailyPanel;

