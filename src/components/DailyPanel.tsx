import React, { useState, useRef, useEffect, useId } from 'react';
import { ForkKnife, Barbell, Drop, Trash, Check, PencilSimple, Scales, Sneaker, CaretRight, Sparkle } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';
import type { DailyRecord, MealEntry, MealType, WorkoutEntry, DailyRecordsMap, UserProfile } from '../types';
import { hasEnergyData, formatDateStr, getCaloriesIngested, generateUUID, aggregateEnergy, getWorkoutCalories, getStepCalories, calculateBMR, calculateDailyExpenditure, getBalanceLabel } from '../utils/helpers';
import { estimateMeal, estimateWorkout } from '../services/aiService';
import { AIRequestError } from '../services/aiTransport';
import { supabase } from '../lib/supabase';
import { changedEntryDayMessage, ensureMealPhotoUploaded, reviewEntryBase, snapshotEntryRecord, type MealPhotoUploadIntent } from '../lib/entrySubmission';
import { MealPhotoPicker, MealThumbnail } from './MealPhoto';
import DiscardDraftDialog from './DiscardDraftDialog';
import EntryFormShell from './EntryFormShell';
import AutoResizeTextarea from './AutoResizeTextarea';
import EntryEstimateResult from './EntryEstimateResult';
import { HabitDraftController } from '../lib/habitDraft';
import type { RecordWriter } from '../lib/recordFeedback';

const workoutCategories = ['Gimnasio', 'Fútbol', 'Correr', 'Natación', 'Caminata'] as const;
type WorkoutCategory = typeof workoutCategories[number];
const exactWorkoutCategory = (activity: string) => workoutCategories.find(category => category.toLowerCase() === activity.trim().toLowerCase()) ?? null;
type EntryEstimate = { calories: number; assumptions: string[]; context: string; inputVersion: number; calorieVersion: number; contextKey: string };

type EntryReceipt = {
  id: string; date: string; name: string; calories: number; estimated: boolean;
} & ({ kind: 'meal'; replacedPhoto: boolean } | { kind: 'workout'; duration: number });

// Only disclosure and explicit row navigation belong here. A date/profile change remounts this small
// presentation component without touching entry forms or pending habit saves.
function DailyRecords({ count, children, receipt, onDismiss }: {
  count: number; children: React.ReactNode; receipt: EntryReceipt | null; onDismiss: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const list = useRef<HTMLUListElement>(null);
  const [destination, setDestination] = useState<EntryReceipt | null>(null);
  useEffect(() => {
    if (!destination) return;
    const row = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[data-entry-id]') ?? [])
      .find(button => button.dataset.entryId === destination.id && button.dataset.entryKind === destination.kind);
    if (!row) return;
    row.focus({ preventScroll: true });
    row.scrollIntoView({ block: 'center', behavior: 'instant' });
    row.dataset.justSaved = 'true';
    const timer = window.setTimeout(() => { delete row.dataset.justSaved; }, 3000);
    return () => { window.clearTimeout(timer); delete row.dataset.justSaved; };
  }, [destination]);
  return <>
    {receipt && <aside className="meal-saved" aria-label={receipt.kind === 'meal' ? 'Confirmación de comida' : 'Confirmación de ejercicio'}>
      <div role="status">
        <span className="meal-saved-label"><Check size={16} aria-hidden="true" /> {receipt.kind === 'meal' ? 'Comida guardada' : 'Ejercicio guardado'}</span>
        <strong>{receipt.name}</strong>
        <span>{receipt.kind === 'workout' && receipt.duration + ' min · '}{receipt.calories.toLocaleString('es-AR')} kcal{receipt.estimated && ' · Estimación con IA'} · {format(new Date(receipt.date + 'T12:00:00'), 'd MMM yyyy', { locale: es })}</span>
        {receipt.kind === 'meal' && receipt.replacedPhoto && <span>La limpieza de la foto anterior queda pendiente.</span>}
      </div>
      <button type="button" className="meal-saved-open" onClick={() => {
        setExpanded(true);
        setDestination(receipt);
        onDismiss();
      }}>Ver registro</button>
      <button type="button" className="meal-saved-close" aria-label="Cerrar confirmación" onClick={onDismiss}>×</button>
    </aside>}
    <ul ref={list} id={listId} data-expanded={expanded}
      className={`daily-records ${count >= 2 ? 'daily-records--columns' : ''} divide-y divide-slate-200 dark:divide-gray-800`}>
      {children}
    </ul>
    {count > 4 && <button type="button" className="daily-records-toggle"
      aria-expanded={expanded} aria-controls={listId} onClick={event => {
        event.stopPropagation();
        setExpanded(value => !value);
      }}>
      {expanded ? 'Mostrar menos' : `Ver todos los registros (${count})`}
    </button>}
  </>;
}

interface DailyPanelProps {
  record: DailyRecord | undefined;
  dateStr: string;
  onUpdateRecord: RecordWriter;
  profile: UserProfile;
  selectedGroup?: { type: 'day'|'week'|'month'|'year', label: string, dates: string[] } | null;
  records?: DailyRecordsMap;
  habitDrafts?: HabitDraftController | null;
  onRecordsHeadingReady?: (element: HTMLHeadingElement | null) => void;
  onEntryActiveChange?: (active: boolean) => void;
  onReturnToHistory?: () => void;
}

const habitRecord = (props: DailyPanelProps, day: string) => snapshotEntryRecord(
  (day === props.dateStr ? props.record : props.records?.[day]) ?? { dateStr: day, date: new Date(day + 'T12:00:00'),
    meals: [], workouts: [], steps: 0, water: 0, version: null }, props.profile.recordGeneration);

const DailyPanel: React.FC<DailyPanelProps> = (props) => {
  const { record, dateStr, onUpdateRecord, profile, selectedGroup, records, habitDrafts, onRecordsHeadingReady, onEntryActiveChange } = props;
  const [activeTab, setActiveTab] = useState<'comida' | 'entrenamiento' | null>(null);
  const dayContextId = useId();

  // Default empty record if none exists for this day
  const currentRecord: DailyRecord = record || {
    dateStr,
    date: new Date(dateStr),
    meals: [],
    workouts: [],
    steps: 0,
    water: 0,
    version: null,
    generation: profile.recordGeneration,
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
  // Presentation only: calculations and their numeric breakdown stay unchanged.
  const noDailyEnergy = !isGroup && !hasEnergyData(currentRecord);
  const provisionalBalance = !isGroup && !noDailyEnergy && currentRecord.meals.length === 0;

  const totalEntries = currentRecord.meals.length + currentRecord.workouts.length;
  const comparisonExpenditure = isGroup ? summary.expenditure : expenditure;
  const scaleMax = Math.max(ingested, comparisonExpenditure, 1);
  const energyRows = [
    { label: 'Calorías consumidas', value: ingested, known: !noDailyEnergy && !provisionalBalance },
    { label: 'Gasto estimado', value: comparisonExpenditure, known: !noDailyEnergy },
  ];

  let panelTitle = "Resumen del día";
  let panelSubtitle = format(new Date(dateStr + 'T12:00:00'), 'd MMM yyyy', { locale: es });
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
    // Storage deletion is not part of the record transaction. A path may also
    // be referenced by another meal/device; retain it until safe cleanup exists.
    toast.success(meal?.photo_path ? 'Comida eliminada. La limpieza de la foto queda pendiente.' : 'Comida eliminada', { style: { background: '#161b22', color: '#fff' }, icon: '🗑️' });
  };

  const handleDeleteWorkout = async (id: string) => {
    try {
      if (!await onUpdateRecord(dateStr, { ...currentRecord, workouts: currentRecord.workouts.filter(w => w.id !== id) })) return;
      toast.success('Entrenamiento eliminado', { style: { background: '#161b22', color: '#fff' }, icon: '🗑️' });
    } catch {
      toast.error('No se pudo eliminar el ejercicio. Intentá nuevamente.');
    }
  };

  const handleAddWater = (amount: number) => {
    habitController.add(dateStr, 'water', amount);
  };

  const handleSetWater = (amount: number) => {
    habitController.set(dateStr, 'water', Math.max(0, amount));
  };

  const handleSetWeight = async (weight: number) => {
    if (savingWeightRef.current) return false;
    savingWeightRef.current = true;
    setSavingWeight(true);
    try {
      const previous = weightDraftBaseRef.current ?? snapshotEntryRecord(currentRecord, profile.recordGeneration);
      const base = reviewEntryBase(previous, currentRecord, profile.recordGeneration, () => window.confirm(changedEntryDayMessage));
      if (!base) return false;
      weightDraftBaseRef.current = base;
      if (!await onUpdateRecord(dateStr, { ...base, weight: Math.max(0, weight) })) throw new Error('Guardado no confirmado');
      weightDraftBaseRef.current = null;
      setIsEditingWeight(false);
      return true;
    } catch {
      toast.error('No se pudo confirmar el peso. Tu valor se conserva para reintentar.');
      return false;
    } finally {
      savingWeightRef.current = false;
      setSavingWeight(false);
    }
  };

  const handleUpdateSteps = (steps: number) => {
    habitController.set(dateStr, 'steps', Math.max(0, steps));
  };

  const handleAddSteps = (amount: number) => {
    habitController.add(dateStr, 'steps', amount);
  };

  // --- Forms State ---
  const [discard, setDiscard] = useState<(() => void) | null>(null);
  const entryChanged = useRef(false);
  const markEntryChanged = () => { entryChanged.current = true; };
  const [mealError, setMealError] = useState('');
  const [entryReceipt, setEntryReceipt] = useState<EntryReceipt | null>(null);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [mealName, setMealName] = useState('');
  const [isEditingWater, setIsEditingWater] = useState(false);
  const [editWaterVal, setEditWaterVal] = useState('');

  const [isEditingWeight, setIsEditingWeight] = useState(false);
  const [editWeightVal, setEditWeightVal] = useState('');
  const savingWeightRef = useRef(false);
  const [savingWeight, setSavingWeight] = useState(false);
  const weightDraftBaseRef = useRef<DailyRecord | null>(null);

  const [isEditingSteps, setIsEditingSteps] = useState(false);
  const [editStepsVal, setEditStepsVal] = useState('');
  const [mealType, setMealType] = useState<MealType>('Almuerzo');
  const [mealCals, setMealCals] = useState<number | ''>('');
  const [mealDetails, setMealDetails] = useState('');
  const [mealTime, setMealTime] = useState('');
  const [mealPhoto, setMealPhoto] = useState<Blob | null>(null);
  const [mealPhotoRemoved, setMealPhotoRemoved] = useState(false);
  const [estimateFailure, setEstimateFailure] = useState<{ message: string; status?: number; retryAfterSeconds?: number } | null>(null);
  const [retryDeadlines, setRetryDeadlines] = useState<Record<string, number>>({});
  const estimateModality = profile.id + (mealPhoto && (activeTab === 'comida' || editingMealId) ? ':image' : ':text');
  const deadline = retryDeadlines[estimateModality] ?? 0;
  useEffect(() => {
    if (!deadline) return;
    const timer = setTimeout(() => setRetryDeadlines(previous => {
      const next = { ...previous };
      if (next[estimateModality] === deadline) delete next[estimateModality];
      return next;
    }), Math.max(0, deadline - Date.now()));
    return () => clearTimeout(timer);
  }, [deadline, estimateModality]);
  const estimationBlocked = deadline > Date.now() || estimateFailure?.status === 401
    || (estimateFailure?.status === 429 && !estimateFailure.retryAfterSeconds);
  const estimationFailed = (error: unknown) => {
    if (error instanceof AIRequestError) {
      setEstimateFailure({ message: error.message, status: error.status, retryAfterSeconds: error.retryAfterSeconds });
      if (error.retryAfterSeconds) {
        const until = Date.now() + error.retryAfterSeconds * 1000;
        setRetryDeadlines(previous => ({ ...previous, [estimateModality]: until }));
      }
    } else setEstimateFailure({ message: 'No pudimos estimar las calorías.' });
  };
  const [workEstimate, setWorkEstimate] = useState<EntryEstimate | null>(null);
  const [mealEstimate, setMealEstimate] = useState<EntryEstimate | null>(null);
  // One synchronous lock across the existing estimator controls; closing never starts a second call.
  const estimateBusyRef = useRef(false);
  const estimateSessionRef = useRef(0);
  const workInputVersion = useRef(0);
  const workCalorieVersion = useRef(0);
  const mealInputVersion = useRef(0);
  const mealCalorieVersion = useRef(0);
  const [estimateVersions, setEstimateVersions] = useState({ workInput: 0, workCalories: 0, mealInput: 0, mealCalories: 0 });
  const estimateContextKey = profile.id + ':' + dateStr;
  const reviseEstimate = (kind: keyof typeof estimateVersions) => {
    markEntryChanged();
    const reference = { workInput: workInputVersion, workCalories: workCalorieVersion, mealInput: mealInputVersion, mealCalories: mealCalorieVersion }[kind];
    const next = ++reference.current;
    setEstimateVersions(previous => ({ ...previous, [kind]: next }));
  };
  const [estimating, setEstimating] = useState(false);
  const [savingMeal, setSavingMeal] = useState(false);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const savingMealRef = useRef(false);
  const mealDraftRef = useRef<{ id: string; base: DailyRecord; upload: MealPhotoUploadIntent | null; fallbackTime?: string } | null>(null);

  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [workActivity, setWorkActivity] = useState('');
  const [workCategory, setWorkCategory] = useState<WorkoutCategory | null>(null);
  const selectedWorkCategory = workCategory ?? exactWorkoutCategory(workActivity);
  const [workDuration, setWorkDuration] = useState<number | ''>('');
  const [workCals, setWorkCals] = useState<number | ''>('');
  const [workDetails, setWorkDetails] = useState('');
  const [workDistance, setWorkDistance] = useState<number | ''>('');
  const [workPace, setWorkPace] = useState('');
  const [workTime, setWorkTime] = useState('');
  const [savingWorkout, setSavingWorkout] = useState(false);
  const savingWorkoutRef = useRef(false);
  const workoutDraftRef = useRef<{ id: string; base: DailyRecord; fallbackTime?: string } | null>(null);

  const entryActive = !!(activeTab || editingMealId || editingWorkoutId || isEditingWater || isEditingSteps || isEditingWeight);
  useEffect(() => { onEntryActiveChange?.(entryActive); }, [entryActive, onEntryActiveChange]);

  const clearEstimates = () => {
    estimateSessionRef.current += 1;
    setEstimateFailure(null);
    setWorkEstimate(null);
    setMealEstimate(null);
  };

  useEffect(() => {
    estimateSessionRef.current += 1;
    return () => { estimateSessionRef.current += 1; };
  }, [dateStr, profile.id]);

  const selectWorkCategory = (category: WorkoutCategory) => {
    reviseEstimate('workInput');
    setWorkCategory(category);
    // Quick labels can replace other quick labels; a free description is always preserved.
    if (!workActivity.trim() || exactWorkoutCategory(workActivity)) setWorkActivity(category);
  };

  const resetForms = () => {
    setEntryReceipt(null);
    setMealError('');
    entryChanged.current = false;
    setMealType('Almuerzo');
    mealDraftRef.current = null;
    workoutDraftRef.current = null;
    clearEstimates();
    setEditingMealId(null);
    setMealName('');
    setMealCals('');
    setMealDetails('');
    setMealTime('');
    setMealPhoto(null);
    setPhotoProcessing(false);
    setMealPhotoRemoved(false);
    setWorkCategory(null);

    setEditingWorkoutId(null);
    setWorkActivity('');
    setWorkDuration('');
    setWorkCals('');
    setWorkDetails('');
    setWorkDistance('');
    setWorkPace('');
    setWorkTime('');
  };

  const openEntry = (tab: 'comida' | 'entrenamiento') => {
    if (entryActive || savingMealRef.current || savingWorkoutRef.current) return;
    resetForms();
    setActiveTab(tab);
    const base = snapshotEntryRecord(currentRecord, profile.recordGeneration);
    if (tab === 'comida') mealDraftRef.current = { id: generateUUID(), base, upload: null };
    else workoutDraftRef.current = { id: generateUUID(), base };
  };

  const requestClose = (close: () => void) => {
    if (entryChanged.current) setDiscard(() => close);
    else close();
  };
  const closeWeight = () => {
    if (savingWeightRef.current) return;
    requestClose(() => {
      setIsEditingWeight(false);
      weightDraftBaseRef.current = null;
      entryChanged.current = false;
    });
  };
  const closeEntry = () => {
    if (savingMealRef.current || savingWorkoutRef.current || photoProcessing) return;
    requestClose(() => {
      resetForms();
      setActiveTab(null);
    });
  };
  const [, setHabitRevision] = useState(0);
  const [habitReview, setHabitReview] = useState<DailyRecord | null>(null);
  const [localHabitDrafts] = useState(() => new HabitDraftController(day => habitRecord(props, day), props.onUpdateRecord));
  const habitController = habitDrafts ?? localHabitDrafts;
  const habit = habitController.view(dateStr, currentRecord);
  const localWater = habit.water;
  const localSteps = habit.steps ? String(habit.steps) : '';
  useEffect(() => { localHabitDrafts.configure(day => habitRecord(props, day), props.onUpdateRecord); }, [localHabitDrafts, props]);
  useEffect(() => { localHabitDrafts.resetOwner(); localHabitDrafts.connect(); }, [localHabitDrafts, profile.id]);
  useEffect(() => {
    habitController.connect();
    const unsubscribe = habitController.subscribe(() => setHabitRevision(value => value + 1));
    return () => { unsubscribe(); if (!habitDrafts) habitController.dispose(); };
  }, [habitController, habitDrafts]);
  useEffect(() => {
    if (activeTab === 'comida' && !editingMealId) {
      setMealTime(format(new Date(), 'HH:mm'));
    } else if (activeTab === 'entrenamiento' && !editingWorkoutId) {
      setWorkTime(format(new Date(), 'HH:mm'));
    }
  }, [activeTab, editingMealId, editingWorkoutId]);

  const handleEstimateMeal = async () => {
    if (estimateBusyRef.current || estimationBlocked) return;
    if (!mealName.trim() && !mealPhoto) { setEstimateFailure({ message: 'Describí la comida o agregá una foto.' }); return; }
    setEstimateFailure(null);
    estimateBusyRef.current = true;
    const session = estimateSessionRef.current;
    const inputVersion = mealInputVersion.current;
    const calorieVersion = mealCalorieVersion.current;
    const context = !mealName ? 'Comida a partir de una foto' : mealName.length > 80 ? 'Comida indicada' : mealName;
    setEstimating(true);
    try {
      const attachment = mealPhoto ? { kind: 'image' as const, mimeType: 'image/jpeg', data: await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = reject; reader.readAsDataURL(mealPhoto);
      }) } : undefined;
      const result = await estimateMeal({ name: mealName, details: mealDetails, type: mealType, attachment });
      if (session !== estimateSessionRef.current) return;
        markEntryChanged();
      setMealEstimate({ calories: result.calories, assumptions: result.assumptions, context, inputVersion, calorieVersion, contextKey: estimateContextKey });
      if (inputVersion === mealInputVersion.current && calorieVersion === mealCalorieVersion.current) {
        setMealCals(result.calories);
        if (!mealName.trim()) setMealName(result.description);
      }
    } catch (error) {
      if (session === estimateSessionRef.current) estimationFailed(error);
    } finally { estimateBusyRef.current = false; setEstimating(false); }
  };

  const handleEstimateWorkout = async () => {
    if (estimateBusyRef.current || estimationBlocked) return;
    if (!workActivity.trim()) { setEstimateFailure({ message: 'Indicá qué ejercicio hiciste.' }); return; }
    if (!workDuration || workDuration <= 0) { setEstimateFailure({ message: 'Indicá cuánto tiempo entrenaste.' }); return; }
    setEstimateFailure(null);
    estimateBusyRef.current = true;
    const session = estimateSessionRef.current;
    const inputVersion = workInputVersion.current;
    const calorieVersion = workCalorieVersion.current;
    const context = (selectedWorkCategory ?? (workActivity.length > 80 ? 'Entrenamiento' : workActivity)) + ' · ' + workDuration + ' minutos';
    const details = workCategory && exactWorkoutCategory(workActivity) !== workCategory
      ? 'Tipo de actividad: ' + workCategory + '. ' + workDetails : workDetails;
    setEstimating(true);
    try {
      const result = await estimateWorkout({ activity: workActivity, duration: Number(workDuration), details,
        profile: { sex: profile.sex, age: profile.age, weight: profile.weight, height: profile.height } });
      if (session !== estimateSessionRef.current) return;
        markEntryChanged();
      setWorkEstimate({ calories: result.calories, assumptions: result.assumptions, context, inputVersion, calorieVersion, contextKey: estimateContextKey });
      if (inputVersion === workInputVersion.current && calorieVersion === workCalorieVersion.current) setWorkCals(result.calories);
    } catch (error) {
      if (session === estimateSessionRef.current) estimationFailed(error);
    } finally { estimateBusyRef.current = false; setEstimating(false); }
  };

  const handleAddMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mealName.trim() || !mealCals || savingMealRef.current || photoProcessing) return;
    savingMealRef.current = true; setSavingMeal(true);
    setMealError('');
    let failureMessage = '';
    try {
      const draft = mealDraftRef.current ??= { id: editingMealId || generateUUID(), base: snapshotEntryRecord(currentRecord, profile.recordGeneration), upload: null };
      const base = reviewEntryBase(draft.base, currentRecord, profile.recordGeneration, () => window.confirm(changedEntryDayMessage));
      if (!base) return;
      draft.base = base;
      const oldMeal = base.meals.find(m => m.id === draft.id);
      if (editingMealId && !oldMeal) { toast.error('La comida ya no está en este día. Tu borrador se conserva; revisá los registros antes de crear otra.'); return; }
      let uploadedPath: string | null = null;
      if (mealPhoto) {
        if (!draft.upload || draft.upload.blob !== mealPhoto) draft.upload = { blob: mealPhoto,
          path: `${profile.user_id}/${dateStr}/${draft.id}-${generateUUID()}.jpg`, attempted: false, uploaded: false };
        uploadedPath = await ensureMealPhotoUploaded(supabase.storage.from('meal-photos'), draft.upload);
      }
      const meal: MealEntry = { id: draft.id, name: mealName, type: mealType, calories: Number(mealCals),
        time: mealTime || (draft.fallbackTime ??= format(new Date(), 'HH:mm')), details: mealDetails,
        photo_path: uploadedPath || (mealPhotoRemoved ? null : oldMeal?.photo_path ?? null) };
      const meals = oldMeal ? base.meals.map(m => m.id === draft.id ? meal : m) : [...base.meals, meal];
      if (!await onUpdateRecord(dateStr, { ...base, meals }, {
        feedback: 'contextual', onFailure: failure => { failureMessage = failure.message; },
      })) throw new Error('No se pudo guardar la comida.');
      resetForms(); setActiveTab(null);
      setEntryReceipt({ kind: 'meal', id: meal.id, date: dateStr, name: meal.name, calories: meal.calories,
        replacedPhoto: !!oldMeal?.photo_path && oldMeal.photo_path !== meal.photo_path,
        estimated: mealEstimate?.contextKey === estimateContextKey && mealEstimate.calories === meal.calories
          && mealEstimate.inputVersion === mealInputVersion.current && mealEstimate.calorieVersion === mealCalorieVersion.current });
    } catch {
      // An ambiguous DB response may already reference the uploaded object.
      // Keep the same entry ID, payload, blob and path for explicit retry.
      setMealError(failureMessage || 'No se pudo confirmar el guardado. Tu comida y su foto se conservan para reintentar.');
    } finally { savingMealRef.current = false; setSavingMeal(false); }
  };

  const startEditMeal = (m: MealEntry) => {
    entryChanged.current = false;
    mealDraftRef.current = { id: m.id, base: snapshotEntryRecord(currentRecord, profile.recordGeneration), upload: null };
    clearEstimates();
    setActiveTab(null);
    setMealError('');
    setEntryReceipt(null);
    setEditingMealId(m.id);
    setMealName(m.name);
    setMealType(m.type);
    setMealCals(m.calories);
    setMealDetails(m.details || '');
    setMealTime(m.time || format(new Date(), 'HH:mm'));
    setMealPhoto(null); setMealPhotoRemoved(false);
  };

  const handleAddWorkout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workActivity || !workDuration || !workCals || savingWorkoutRef.current) return;
    savingWorkoutRef.current = true;
    setSavingWorkout(true);
    try {
      const draft = workoutDraftRef.current ??= { id: editingWorkoutId || generateUUID(), base: snapshotEntryRecord(currentRecord, profile.recordGeneration) };
      const base = reviewEntryBase(draft.base, currentRecord, profile.recordGeneration, () => window.confirm(changedEntryDayMessage));
      if (!base) return;
      draft.base = base;
      const previous = base.workouts.find(w => w.id === draft.id);
      if (editingWorkoutId && !previous) { toast.error('El ejercicio ya no está en este día. Tu borrador se conserva; revisá los registros antes de crear otro.'); return; }
      const workout: WorkoutEntry = { ...previous, id: draft.id, activity: workActivity, duration: Number(workDuration), calories: Number(workCals), muscles: previous?.muscles ?? [], details: workDetails, distance: workDistance ? Number(workDistance) : undefined, pace: workPace || undefined, time: workTime || (draft.fallbackTime ??= format(new Date(), 'HH:mm')) };
      const workouts = previous ? base.workouts.map(w => w.id === draft.id ? workout : w) : [...base.workouts, workout];
      if (!await onUpdateRecord(dateStr, { ...base, workouts }, { feedback: 'contextual' })) throw new Error('Guardado no confirmado');
      resetForms(); setActiveTab(null);
      setEntryReceipt({ kind: 'workout', id: workout.id, date: dateStr, name: workout.activity,
        duration: workout.duration, calories: workout.calories,
        estimated: workEstimate?.contextKey === estimateContextKey && workEstimate.calories === workout.calories
          && workEstimate.inputVersion === workInputVersion.current && workEstimate.calorieVersion === workCalorieVersion.current });
    } catch {
      toast.error('No se pudo confirmar el ejercicio. Tu borrador se conserva para reintentar.');
    } finally {
      savingWorkoutRef.current = false;
      setSavingWorkout(false);
    }
  };

  const startEditWorkout = (w: WorkoutEntry) => {
    entryChanged.current = false;
    workoutDraftRef.current = { id: w.id, base: snapshotEntryRecord(currentRecord, profile.recordGeneration) };
    clearEstimates();
    setWorkCategory(exactWorkoutCategory(w.activity));
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

  const recordOpener = useRef<HTMLButtonElement>(null);
  const [detailModalItem, setDetailModalItem] = useState<(MealEntry & { _type: 'meal' }) | (WorkoutEntry & { _type: 'workout' }) | null>(null);
  const entryDate = <p className="entry-date-context">Día del registro: <time dateTime={dateStr}>{panelSubtitle}</time></p>;
  const mealPhotoPath = mealPhotoRemoved ? null : currentRecord.meals.find(m => m.id === editingMealId)?.photo_path;
  const mealPhotoControls = <MealPhotoPicker blob={mealPhoto}
    path={mealPhotoPath}
    onChange={blob => { reviseEstimate('mealInput'); setMealPhoto(blob); setMealPhotoRemoved(false); }}
    onRemove={() => { reviseEstimate('mealInput'); setMealPhoto(null); setMealPhotoRemoved(true); }} onBusyChange={setPhotoProcessing} />;
  const estimateNotice = (estimateFailure || deadline > Date.now()) && <p role="status" className="text-sm">
    {estimateFailure?.message} {deadline > Date.now() && 'Podés reintentar a las ' + new Date(deadline).toLocaleTimeString('es-AR') + '.'} Podés ingresar las calorías manualmente.
  </p>;
  const mealEstimateControls = <div className="entry-ai-controls flex flex-col gap-1">
    <button type="button" disabled={estimating || estimationBlocked} onClick={() => void handleEstimateMeal()}
      className="entry-ai-action min-h-11 self-start px-4 rounded-[var(--radius-control)] border border-[#f5a064]/50 text-[#b85b22] dark:text-[#f5a064] disabled:opacity-50">
      <Sparkle className="entry-ai-icon" size={18} aria-hidden="true" />
      {estimating ? 'Estimando…' : estimateFailure && !estimationBlocked ? 'Reintentar estimación' : 'Estimar con IA'}
    </button>
    {estimateNotice}
    {mealEstimate?.contextKey === estimateContextKey && <EntryEstimateResult estimate={mealEstimate} adjusted={mealEstimate.calorieVersion !== estimateVersions.mealCalories}
      outdated={mealEstimate.inputVersion !== estimateVersions.mealInput} />}
  </div>;
  const workEstimateControls = <div className="entry-ai-controls flex flex-col gap-1">
    <button type="button" disabled={estimating || estimationBlocked} onClick={() => void handleEstimateWorkout()}
      className="entry-ai-action min-h-11 self-start px-4 rounded-[var(--radius-control)] border border-[#f5a064]/50 text-[#b85b22] dark:text-[#f5a064] disabled:opacity-50">
      <Sparkle className="entry-ai-icon" size={18} aria-hidden="true" />
      {estimating ? 'Estimando gasto energético…' : estimateFailure && !estimationBlocked ? 'Reintentar estimación' : 'Estimar con IA'}
    </button>
    {estimateNotice}
    {workEstimate?.contextKey === estimateContextKey && <EntryEstimateResult estimate={workEstimate} adjusted={workEstimate.calorieVersion !== estimateVersions.workCalories}
      outdated={workEstimate.inputVersion !== estimateVersions.workInput} />}
  </div>;

  const workCategoryControls = <div className="entry-activity-chips flex flex-wrap gap-2" role="group" aria-label="Tipo de entrenamiento">
    {workoutCategories.map(category => <button key={category} type="button" aria-pressed={selectedWorkCategory === category}
      onClick={() => selectWorkCategory(category)}
      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${selectedWorkCategory === category ? 'bg-orange-600 border-orange-500 text-white' : 'bg-slate-100 dark:bg-[#0f141c] border-slate-200 dark:border-gray-800 text-slate-500 dark:text-gray-400 hover:text-white'}`}>
      {category}
    </button>)}
  </div>;

  return (
    <div className="daily-panel flex flex-col gap-6 w-full" data-period={isGroup ? 'group' : 'day'}>
      {discard && <DiscardDraftDialog onKeep={() => setDiscard(null)} onDiscard={() => { setDiscard(null); discard(); }} />}
      <div className="daily-heading flex justify-between items-end border-b border-slate-200 dark:border-gray-800 pb-2">
        <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{panelTitle}</h3>
        <span className="text-slate-500 dark:text-gray-400">{isGroup ? panelSubtitle : <time dateTime={dateStr}>{panelSubtitle}</time>}</span>
      </div>

      <div className="daily-summary">
        <section className="energy-card fitness-score" aria-label={isGroup ? 'Balance acumulado' : 'Resumen energético'}
          data-provisional={provisionalBalance} data-energy-state={isGroup ? 'period' : noDailyEnergy ? 'empty' : provisionalBalance ? 'partial' : 'recorded'}>
          <div className="fitness-readout">
            <h4>{isGroup ? 'Balance acumulado' : provisionalBalance ? 'Balance provisional' : 'Balance energético'}</h4>
            <div className="energy-number">
              {noDailyEnergy ? 'Sin datos de energía' : provisionalBalance ? 'Sin comidas registradas' : balance === null ? 'Sin datos' : <>{balance > 0 ? '+' : ''}{balance.toLocaleString('es-AR')}<small> kcal</small></>}
            </div>
            {!noDailyEnergy && !provisionalBalance && <p className="energy-qualifier">{isGroup ? 'Según los registros disponibles del período.' : 'Según tus registros. El día puede estar incompleto.'}</p>}
            {isGroup && classifiedBalance !== null && <p>Promedio diario: {classifiedBalance > 0 ? '+' : ''}{classifiedBalance.toLocaleString('es-AR')} kcal/día</p>}
          </div>
          <dl className="energy-metrics fitness-comparison" aria-label="Consumo registrado y gasto estimado a la misma escala">
            {energyRows.map(({ label, value, known }) => <div key={label} className="fitness-channel">
              <dt>{label}</dt><dd>{known ? <>{value.toLocaleString('es-AR')} <small>kcal</small></> : <span aria-label="Sin registros">—</span>}</dd>
              <dd className="fitness-track" aria-hidden="true">{known && <span style={{ width: `${100 * Math.max(0, value) / scaleMax}%` }} />}</dd>
            </div>)}
          </dl>
          <p className="fitness-scale-note">Comparación en kcal · misma escala</p>
          {!isGroup && <details className="energy-breakdown fitness-breakdown">
            <summary>Ver desglose <CaretRight size={14} aria-hidden="true" /></summary>
            <div className="fitness-breakdown-body">
              <p className="energy-coverage">{currentRecord.meals.length} {currentRecord.meals.length === 1 ? 'comida' : 'comidas'} · {currentRecord.workouts.length} {currentRecord.workouts.length === 1 ? 'ejercicio' : 'ejercicios'}<span>Según tus registros</span></p>
              {noDailyEnergy && <p>El gasto incluye la estimación basal. Todavía no hay registros de energía.</p>}
              <p>Las dos barras usan la misma escala. La mayor cifra del día ocupa todo el ancho.</p>
              <dl className="fitness-breakdown-values">
                <div><dt>Calorías consumidas</dt><dd>{ingested.toLocaleString('es-AR')} kcal</dd></div>
                <div><dt>Gasto estimado</dt><dd>{expenditure.toLocaleString('es-AR')} kcal</dd></div>
              </dl>
              <div>TMB: {calculateBMR(profile).toLocaleString('es-AR')} kcal</div>
              <div>Pasos: {getStepCalories(currentRecord).toLocaleString('es-AR')} kcal</div>
              <div>Ejercicio: {getWorkoutCalories(currentRecord).toLocaleString('es-AR')} kcal</div>
              {provisionalBalance && balance !== null && <p>Saldo calculado con la ingesta registrada: <strong>{balance.toLocaleString('es-AR')} kcal</strong>. Falta registrar comidas para interpretar el balance del día.</p>}
              {noDailyEnergy && balance !== null && <div>Balance estimado: {balance > 0 ? '+' : ''}{balance.toLocaleString('es-AR')} kcal</div>}
              {!noDailyEnergy && !provisionalBalance && <p className="fitness-balance-category">{balanceLabel}</p>}
            </div>
          </details>}
          {isGroup && <p className="fitness-period-days">{summary.days} días con datos. {balanceLabel}</p>}
        </section>
      </div>

      {habitReview && habitReview.dateStr === dateStr && <EntryFormShell fitness title="Revisar cambios del día" desktopModal onClose={() => setHabitReview(null)}>
        <div className="habit-review p-5 text-slate-900 dark:text-white">
          <p className="text-sm text-slate-600 dark:text-gray-300">{habit.failure?.message}</p>
          <p className="mt-2 text-sm font-medium">{panelSubtitle} · Pasos y agua</p>
          <dl className="habit-review-values mt-4 grid gap-3">
            {(['steps', 'water'] as const).map(field => <div key={field} className="rounded-xl border border-slate-200 dark:border-gray-700 p-3">
              <dt className="text-sm font-semibold">{field === 'steps' ? 'Pasos' : 'Agua'}</dt>
              <dd className="mt-1 text-sm text-slate-500 dark:text-gray-400">Guardado: {habitReview[field].toLocaleString('es-AR')}{field === 'water' ? ' ml' : ''}</dd>
              <dd className="mt-1 text-sm">Tu borrador: {habit[field].toLocaleString('es-AR')}{field === 'water' ? ' ml' : ''}</dd>
            </div>)}
          </dl>
          <p className="mt-4 text-xs text-slate-500 dark:text-gray-400">Sólo se aplicarán los valores que editaste. Los demás registros del día se conservarán.</p>
          <div className="habit-review-actions mt-5 grid gap-2">
            <button type="button" className="habit-review-apply" onClick={() => {
              if (habitController.review(dateStr, habitReview)) setHabitReview(null);
              else setHabitReview(snapshotEntryRecord(currentRecord, profile.recordGeneration));
            }}>Aplicar valores revisados</button>
            <button type="button" className="habit-feedback-action" onClick={() => setHabitReview(null)}>Conservar borrador</button>
            <button type="button" className="habit-feedback-action" onClick={() => { habitController.discard(dateStr); setHabitReview(null); }}>Descartar cambios</button>
          </div>
        </div>
      </EntryFormShell>}

      {!isGroup && (
        <div className="daily-journal contents" data-record-count={totalEntries}>
        <div className="daily-entry flex flex-col gap-4">
          {/* Action Buttons */}
          <div className="daily-quick-actions flex gap-2 mt-2">
            <button 
              onClick={() => openEntry('comida')}
              aria-describedby={dayContextId}
              aria-pressed={activeTab === 'comida'}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors border ${activeTab === 'comida' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white dark:bg-[#161b22] border-slate-200 dark:border-gray-800 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-[#0f141c]'}`}
            >
              + Comida
            </button>
            <button 
              onClick={() => openEntry('entrenamiento')}
              aria-describedby={dayContextId}
              aria-pressed={activeTab === 'entrenamiento'}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors border ${activeTab === 'entrenamiento' ? 'bg-orange-600 border-orange-500 text-white' : 'bg-white dark:bg-[#161b22] border-slate-200 dark:border-gray-800 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-[#0f141c]'}`}
            >
              + Ejercicio
            </button>

          </div>

          {/* Forms Area */}
        {activeTab === 'comida' && (
            <EntryFormShell fitness desktopModal dateContext={entryDate} title="Agregar comida" onClose={closeEntry}>
              <form onChangeCapture={markEntryChanged} onSubmit={handleAddMeal} aria-busy={savingMeal || photoProcessing} className="entry-form bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 p-4 rounded-xl flex flex-col gap-4 animate-in fade-in slide-in-from-top-2">
                <div className="entry-form-content entry-fields-grid entry-meal-fields">
                  <div className="entry-field entry-description">
                    <label className="entry-field-label" htmlFor="add-meal-description">Descripción</label>
                    <AutoResizeTextarea id="add-meal-description"
                      required
                      inputMode="text"
                      placeholder="Ej. pollo con arroz y verduras"
                      value={mealName} onChange={e => { reviseEstimate('mealInput'); setMealName(e.target.value); }}
                      className="flex-1 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="entry-field entry-type">
                    <label className="entry-field-label" htmlFor="add-meal-type">Tipo de comida</label>
                    <select id="add-meal-type"
                      value={mealType} onChange={e => { reviseEstimate('mealInput'); setMealType(e.target.value as MealType); }}
                      className="bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    >
                      <option value="Desayuno">Desayuno</option>
                      <option value="Almuerzo">Almuerzo</option>
                      <option value="Merienda">Merienda</option>
                      <option value="Cena">Cena</option>
                      <option value="Snack">Snack</option>
                    </select>
                  </div>
                  <div className="fitness-field-pair fitness-meal-pair">
                    <div className="entry-field entry-calories">
                      <label className="entry-field-label" htmlFor="add-meal-calories">Calorías</label>
                      <input id="add-meal-calories"
                        required
                        type="number" inputMode="numeric" pattern="[0-9]*" min="0" placeholder="Kcal"
                        value={mealCals} onChange={e => { reviseEstimate('mealCalories'); setMealCals(Number(e.target.value)); }}
                        className="w-24 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>
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
                          onClick={() => { markEntryChanged(); setMealTime(format(new Date(), 'HH:mm')); }}
                          className="entry-time-now bg-slate-100 dark:bg-[#0f141c] border border-slate-200 dark:border-gray-800 p-2 rounded-md hover:text-blue-400 text-slate-500 dark:text-gray-400 transition-colors flex-shrink-0"
                        >
                          Ahora
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="entry-photo-section">
                    <p className="entry-photo-hint">Foto opcional · podés usarla para estimar con IA</p>
                    {mealPhotoControls}
                  </div>
                  {mealEstimateControls}
                  <details className="fitness-extras">
                    <summary>Notas <span>Opcionales</span></summary>
                    <div className="fitness-extra-fields">
                      <div className="entry-field entry-notes">
                        <label className="entry-field-label" htmlFor="add-meal-notes">Notas <span>· Opcional</span></label>
                        <AutoResizeTextarea id="add-meal-notes"
                          placeholder="Agregá detalles si querés."
                          value={mealDetails}
                          onChange={e => { reviseEstimate('mealInput'); setMealDetails(e.target.value); }}
                          className="flex-1 min-w-[200px] bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </details>
                </div>
                {mealError && <p className="meal-write-error" role="alert">{mealError}</p>}
                <div className="entry-form-footer">
                  <button type="button" className="entry-cancel" disabled={savingMeal || photoProcessing} onClick={closeEntry}>Cancelar</button>
                  <button type="submit" disabled={savingMeal || photoProcessing} className="disabled:opacity-50">
                    <Check weight="bold" /> {savingMeal ? 'Guardando…' : photoProcessing ? 'Preparando foto…' : 'Guardar comida'}
                  </button>
                </div>
              </form>
            </EntryFormShell>
        )}

        {activeTab === 'entrenamiento' && (
            <EntryFormShell fitness desktopModal dateContext={entryDate} title="Agregar ejercicio" onClose={closeEntry}>
              <form onChangeCapture={markEntryChanged} onSubmit={handleAddWorkout} aria-busy={savingWorkout} className="entry-form bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 p-4 rounded-xl flex flex-col gap-4 animate-in fade-in slide-in-from-top-2">
                <div className="entry-form-content entry-fields-grid entry-workout-fields">
                  <div className="entry-field entry-description entry-activity">
                    <label className="entry-field-label" htmlFor="add-workout-activity">Actividad</label>
                    <AutoResizeTextarea id="add-workout-activity"
                      required
                      inputMode="text"
                      placeholder="Ej. running, fútbol, gimnasio"
                      value={workActivity} onChange={e => { reviseEstimate('workInput'); setWorkActivity(e.target.value); }}
                      className="flex-1 min-w-[150px] bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  {workCategoryControls}
                  <div className="fitness-field-pair">
                    <div className="entry-field entry-duration">
                      <label className="entry-field-label" htmlFor="add-workout-duration">Duración</label>
                      <div className="entry-unit-control">
                        <input id="add-workout-duration"
                          required
                          type="number" inputMode="numeric" pattern="[0-9]*" min="1" placeholder="Minutos"
                          value={workDuration} onChange={e => { reviseEstimate('workInput'); setWorkDuration(Number(e.target.value)); }}
                          className="w-24 flex-shrink-0 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                        />
                        <span className="entry-unit" aria-hidden="true">min</span></div>
                    </div>
                    <div className="entry-field entry-calories">
                      <label className="entry-field-label" htmlFor="add-workout-calories">Calorías</label>
                      <input id="add-workout-calories"
                        required
                        type="number" inputMode="numeric" pattern="[0-9]*" min="0" placeholder="Kcal"
                        value={workCals} onChange={e => { reviseEstimate('workCalories'); setWorkCals(e.target.value === '' ? '' : Number(e.target.value)); }}
                        className="w-24 flex-shrink-0 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>
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
                        onClick={() => { markEntryChanged(); setWorkTime(format(new Date(), 'HH:mm')); }}
                        className="entry-time-now bg-slate-100 dark:bg-[#0f141c] border border-slate-200 dark:border-gray-800 p-2 rounded-md hover:text-orange-400 text-slate-500 dark:text-gray-400 transition-colors flex-shrink-0"
                      >
                        Ahora
                      </button>
                    </div>
                  </div>
                  {workEstimateControls}
                  {selectedWorkCategory !== null && ['Correr', 'Natación', 'Caminata'].includes(selectedWorkCategory) && (<div className="entry-workout-metrics flex gap-4">
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
                    <label className="entry-field-label" htmlFor="add-workout-notes">{selectedWorkCategory === 'Gimnasio' ? 'Detalle de la rutina' : 'Notas'} <span>· Opcional</span></label>
                    <AutoResizeTextarea id="add-workout-notes"
                      placeholder={selectedWorkCategory === 'Gimnasio' ? "Detalle de la rutina (ej: Pecho y Tríceps / Press banca 4x10...)" : "Agregá detalles si querés."}
                      value={workDetails}
                      onChange={e => { reviseEstimate('workInput'); setWorkDetails(e.target.value); }}
                      className="flex-1 w-full bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500 min-w-[200px]"
                    />
                  </div>

                </div>
                <div className="entry-form-footer flex justify-end">
                  <button type="button" className="entry-cancel" disabled={savingWorkout} onClick={closeEntry}>Cancelar</button>
                  <button type="submit" disabled={savingWorkout} className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-md font-medium text-base transition-colors flex items-center gap-2 disabled:opacity-50">
                    <Check weight="bold" /> {savingWorkout ? 'Guardando…' : 'Guardar ejercicio'}
                  </button>
                </div>
              </form>
            </EntryFormShell>
        )}

        </div>
          <section className="daily-habits-block" aria-label="Agua, pasos y peso">
            <div className="daily-habits-heading"><h4>Hábitos</h4><time dateTime={dateStr}>{dateStr === formatDateStr(new Date()) ? 'Hoy' : panelSubtitle}</time></div>
          <div className="daily-habits grid grid-cols-3 gap-2">
            <div className="habit-card bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 p-3 rounded-xl flex flex-col items-center text-center justify-between gap-2 h-full">
              <div className="habit-header flex flex-col items-center gap-1">
                <Drop size={16} aria-hidden="true" />
                <span className="habit-label text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-gray-400">Agua</span>
              </div>
              <div className="habit-metric text-lg md:text-xl font-bold text-slate-900 dark:text-white flex flex-col items-center">
                {isEditingWater ? (
                  <input
                    type="number"
                    aria-label="Cantidad de agua (ml)"
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
                      habitController.begin(dateStr);
                      setEditWaterVal(localWater ? String(localWater) : '');
                      setIsEditingWater(true);
                    }}
                    title="Editar cantidad"
                    aria-label="Editar cantidad de agua"
                  >
                    {localWater.toLocaleString('es-AR')}
                  </button>
                )}
                <span className="text-[10px] font-normal text-slate-500 dark:text-gray-400 mt-0.5">ml</span>
              </div>
              <div className="habit-controls">
                <button type="button" onClick={() => handleAddWater(-250)} aria-label="Restar 250 ml de agua">−250</button>
                <button type="button" onClick={() => handleAddWater(250)} aria-label="Sumar 250 ml de agua">+250</button>
              </div>
            </div>

            <div className="habit-card bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 p-3 rounded-xl flex flex-col items-center text-center justify-between gap-2 h-full">
              <div className="habit-header flex flex-col items-center gap-1">
                <Sneaker size={16} aria-hidden="true" />
                <span className="habit-label text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-gray-400">Pasos</span>
              </div>
              <div className="habit-metric text-lg md:text-xl font-bold text-slate-900 dark:text-white flex flex-col items-center">
                {isEditingSteps ? (
                  <input
                    type="number"
                    aria-label="Total de pasos"
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
                      habitController.begin(dateStr);
                      setEditStepsVal(localSteps);
                      setIsEditingSteps(true);
                    }}
                    title="Editar pasos"
                    aria-label="Editar total de pasos"
                  >
                    {Number(localSteps || 0).toLocaleString('es-AR')}
                  </button>
                )}
              </div>
              <div className="habit-controls">
                <button type="button" onClick={() => handleAddSteps(-500)} aria-label="Restar 500 pasos">−500</button>
                <button type="button" onClick={() => handleAddSteps(500)} aria-label="Sumar 500 pasos">+500</button>
              </div>
            </div>

            <div className="habit-card bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 p-3 rounded-xl flex flex-col items-center text-center justify-between gap-2 h-full">
              <div className="habit-header flex flex-col items-center gap-1">
                <Scales size={16} aria-hidden="true" />
                <span className="habit-label text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-gray-400">Peso</span>
              </div>
              <div className="habit-metric text-lg md:text-xl font-bold text-slate-900 dark:text-white flex flex-col items-center">
                <span className="hover:text-pink-400 transition-colors">
                  {currentRecord.weight ? currentRecord.weight.toLocaleString('es-AR') : '--'}
                </span>
                <span className="text-[10px] font-normal text-slate-500 dark:text-gray-400 mt-0.5">kg</span>
              </div>
              <button type="button" className="habit-edit"
                onClick={() => {
                  entryChanged.current = false;
                  setEditWeightVal(currentRecord.weight ? String(currentRecord.weight) : '');
                  weightDraftBaseRef.current = snapshotEntryRecord(currentRecord, profile.recordGeneration);
                  setIsEditingWeight(true);
                }} aria-label={currentRecord.weight ? "Editar peso" : undefined}>{currentRecord.weight ? "Editar" : "Registrar peso"}</button>
            </div>
          </div>
            {habit.status && <div className="habit-feedback flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-gray-300"
              role={habit.status === 'conflict' || habit.status === 'unconfirmed' ? 'alert' : 'status'} aria-atomic="true">
              <span>{habit.status === 'editing' ? 'Editando · Cambios pendientes' : habit.status === 'saving' ? 'Guardando… Podés seguir ajustando.' :
                habit.status === 'saved' ? 'Guardado' : habit.status === 'conflict' ? 'Conflicto · Tu borrador se conserva.' : 'No confirmado · Tu borrador se conserva.'}</span>
              {habit.status === 'unconfirmed' && <button type="button" className="habit-feedback-action"
                onClick={() => habitController.retry(dateStr)}>Comprobar y reintentar</button>}
              {habit.status === 'conflict' && <button type="button" className="habit-feedback-action"
                onClick={() => setHabitReview(snapshotEntryRecord(currentRecord, profile.recordGeneration))}>Revisar borrador</button>}
              {(habit.status === 'unconfirmed' || habit.status === 'conflict') && <p className="w-full">{habit.failure?.message}</p>}
            </div>}
          </section>

        {/* Registros en orden cronológico */}
        <div className={`daily-logs ${currentRecord.meals.length === 0 && currentRecord.workouts.length === 0 ? 'daily-logs--empty' : ''} bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 rounded-xl mt-4 overflow-hidden`}>
          <div className="daily-logs-heading bg-slate-100 dark:bg-[#0f141c] px-4 py-3 border-b border-slate-200 dark:border-gray-800">
            <h4 id="fitness-daily-entries" ref={onRecordsHeadingReady} tabIndex={-1} aria-describedby={dayContextId} className="font-bold text-slate-900 dark:text-white">Registros del día</h4>
            <span className="fitness-entry-count">{totalEntries} {totalEntries === 1 ? 'registro' : 'registros'}</span>
            <time id={dayContextId} dateTime={dateStr} className="daily-active-date">
              {dateStr === formatDateStr(new Date()) ? 'Hoy · ' : ''}{panelSubtitle}
            </time>
            {props.onReturnToHistory && <button type="button" className="history-record-return" onClick={event => {
              event.stopPropagation(); props.onReturnToHistory?.();
            }}>← Volver a Tu actividad</button>}
          </div>

          {currentRecord.meals.length === 0 && currentRecord.workouts.length === 0 && (
            <div className="daily-logs-empty p-8 text-center text-slate-500 dark:text-gray-400">
              Todavía no cargaste comidas ni entrenamientos.
            </div>
          )}

        <DailyRecords key={`${profile.id}:${dateStr}:${selectedGroup?.type || 'day'}`}
          receipt={!entryActive && !detailModalItem && entryReceipt?.date === dateStr && (entryReceipt.kind === 'meal' ? currentRecord.meals : currentRecord.workouts).some(entry => entry.id === entryReceipt.id) ? entryReceipt : null}
          onDismiss={() => setEntryReceipt(null)} count={currentRecord.meals.length + currentRecord.workouts.length}>
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
              const meal = item._type === 'meal';
              return (
                <li key={`${item._type}-${item.id}`}>
                  <button type="button" data-entry-kind={item._type} data-entry-id={item.id} data-meal-id={meal ? item.id : undefined} className="daily-record-open" onClick={event => { recordOpener.current = event.currentTarget; setDetailModalItem(item); }}>
                    <span className="fitness-record-mark">
                      {meal && item.photo_path ? <MealThumbnail path={item.photo_path} /> : meal
                        ? <ForkKnife size={17} aria-hidden="true" /> : <Barbell size={17} aria-hidden="true" />}
                    </span>
                    <span className="fitness-record-copy">
                      <span className="daily-record-title">{meal ? item.name : item.activity}</span>
                      <span className="daily-record-meta">{item.time && `${item.time} hs • `}{meal ? item.type : `Ejercicio · ${item.duration} min`}</span>
                    </span>
                    <span className="fitness-record-kcal">{meal ? '+' : '-'}{item.calories} <small>kcal</small></span>
                    <CaretRight size={14} aria-hidden="true" />
                  </button>
                </li>
              );
            })
          }
        </DailyRecords>
      </div>
      </div>
      )}

      {/* Detail Modal */}
      {detailModalItem && (
        <EntryFormShell fitness dateContext={entryDate} title="Detalle del registro" restoreFocusTo={recordOpener} desktopModal closeLabel="Cerrar detalle" onClose={() => setDetailModalItem(null)}>
          <div className="record-detail-modal flex min-h-0 flex-col">
            <div className="record-detail-content entry-form-content p-6 flex flex-col gap-4">

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

            <div className="record-detail-actions p-4 border-t border-slate-200 dark:border-gray-800 flex gap-3 bg-slate-100 dark:bg-[#0f141c]">
              <button 
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const item = detailModalItem;
                  setDetailModalItem(null);
                  if (item._type === 'meal') startEditMeal(item as MealEntry);
                  else startEditWorkout(item as WorkoutEntry);
                }}
                className="record-detail-edit flex-1 bg-slate-100 dark:bg-[#0f141c] border border-slate-200 dark:border-gray-800 hover:bg-slate-200 dark:hover:bg-gray-800/50 text-slate-900 dark:text-white py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <PencilSimple size={18} /> Editar
              </button>
              <button 
                type="button"
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
        </EntryFormShell>
      )}

      {/* Weight uses the same accessible shell and selected-day context as other records. */}
      {isEditingWeight && (
        <EntryFormShell fitness dateContext={entryDate} title={currentRecord.weight ? "Editar peso" : "Registrar peso"} desktopModal onClose={closeWeight}>
          <form className="entry-form entry-weight-form" aria-busy={savingWeight} onChangeCapture={markEntryChanged} onSubmit={async event => {
            event.preventDefault();
            await handleSetWeight(parseFloat(editWeightVal) || 0);
          }}>
            <div className="entry-form-content">

              <div className="entry-field">
                <label className="entry-field-label" htmlFor={dayContextId + '-weight'}>Peso (kg)</label>
                <input id={dayContextId + '-weight'} name="weight" type="text" inputMode="decimal"
                  value={editWeightVal}
                  onChange={event => {
                    const valorLimpio = event.target.value.replace(',', '.');
                    setEditWeightVal(valorLimpio.replace(/[^0-9.]/g, ''));
                  }}
                />
              </div>
            </div>
            <div className="entry-form-footer">
              <button type="button" className="entry-cancel" disabled={savingWeight} onClick={closeWeight}>Cancelar</button>
              <button type="submit" className="entry-weight-save" disabled={savingWeight}><Check size={18} weight="bold" aria-hidden="true" /> {savingWeight ? "Guardando…" : "Guardar peso"}</button>
            </div>
          </form>
        </EntryFormShell>
      )}

      {/* Edit Modal para Comidas */}
      {editingMealId && (
        <EntryFormShell fitness dateContext={entryDate} title="Editar comida" restoreFocusTo={recordOpener} onClose={closeEntry} desktopModal>
          <form onChangeCapture={markEntryChanged} onSubmit={handleAddMeal} aria-busy={savingMeal || photoProcessing} className="entry-form p-4 flex flex-col gap-4">
            <div className="entry-form-content entry-fields-grid entry-meal-fields entry-edit-fields">

              <div className="entry-field entry-description">
                <label className="entry-field-label" htmlFor="edit-meal-description">Descripción</label>
                <AutoResizeTextarea id="edit-meal-description"
                  required
                  inputMode="text"
                  placeholder="Ej. pollo con arroz y verduras"
                  value={mealName} onChange={e => { reviseEstimate('mealInput'); setMealName(e.target.value); }}
                  className="flex-1 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="entry-field entry-type">
                <label className="entry-field-label" htmlFor="edit-meal-type">Tipo de comida</label>
                <select id="edit-meal-type"
                  value={mealType} onChange={e => { reviseEstimate('mealInput'); setMealType(e.target.value as MealType); }}
                  className="bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="Desayuno">Desayuno</option>
                  <option value="Almuerzo">Almuerzo</option>
                  <option value="Merienda">Merienda</option>
                  <option value="Cena">Cena</option>
                  <option value="Snack">Snack</option>
                </select>
              </div>
              <div className="fitness-field-pair fitness-meal-pair">
                <div className="entry-field entry-calories">
                  <label className="entry-field-label" htmlFor="edit-meal-calories">Calorías</label>
                  <input id="edit-meal-calories"
                    required
                    type="number" inputMode="numeric" pattern="[0-9]*" min="0" placeholder="Kcal"
                    value={mealCals} onChange={e => { reviseEstimate('mealCalories'); setMealCals(Number(e.target.value)); }}
                    className="w-24 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
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
                      onClick={() => { markEntryChanged(); setMealTime(format(new Date(), 'HH:mm')); }}
                      className="entry-time-now p-2 bg-slate-100 dark:bg-[#0f141c] border border-slate-200 dark:border-gray-800 rounded-md hover:bg-slate-200 dark:hover:bg-gray-800 text-slate-500 dark:text-gray-400 hover:text-white transition-colors"
                      title="Hora actual"
                    >
                      Ahora
                    </button>
                  </div>
                </div>
              </div>
              <div className="entry-photo-section">
                <p className="entry-photo-hint">Foto opcional · podés usarla para estimar con IA</p>
                {mealPhotoControls}
              </div>
              {mealEstimateControls}
              <details className="fitness-extras">
                <summary>Notas <span>Opcionales</span></summary>
                <div className="fitness-extra-fields">
                  <div className="entry-field entry-notes">
                    <label className="entry-field-label" htmlFor="edit-meal-notes">Notas <span>· Opcional</span></label>
                    <AutoResizeTextarea id="edit-meal-notes"
                      placeholder="Agregá detalles si querés."
                      value={mealDetails} onChange={e => { reviseEstimate('mealInput'); setMealDetails(e.target.value); }}
                      className="flex-[2] bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </details>

            </div>
            {mealError && <p className="meal-write-error" role="alert">{mealError}</p>}
            <div className="entry-form-footer flex justify-end border-t border-slate-200 dark:border-gray-800 pt-4 mt-2">
              <button type="button" className="entry-cancel" disabled={savingMeal || photoProcessing} onClick={closeEntry}>Cancelar</button>
              <button type="submit" disabled={savingMeal || photoProcessing} className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium text-base transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                <Check weight="bold" /> {savingMeal ? 'Guardando…' : photoProcessing ? 'Preparando foto…' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </EntryFormShell>
      )}

      {/* Edit Modal para Entrenamiento */}
      {editingWorkoutId && (
        <EntryFormShell fitness dateContext={entryDate} title="Editar ejercicio" restoreFocusTo={recordOpener} onClose={closeEntry} desktopModal>
          <form onChangeCapture={markEntryChanged} onSubmit={handleAddWorkout} aria-busy={savingWorkout} className="entry-form p-4 flex flex-col gap-4">
            <div className="entry-form-content entry-fields-grid entry-workout-fields entry-edit-fields">

              <div className="entry-field entry-description entry-activity">
                <label className="entry-field-label" htmlFor="edit-workout-activity">Actividad</label>
                <AutoResizeTextarea id="edit-workout-activity"
                  required
                  placeholder="Ej. running, fútbol, gimnasio"
                  value={workActivity} onChange={e => { reviseEstimate('workInput'); setWorkActivity(e.target.value); }}
                  className="flex-1 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                />
              </div>
              {workCategoryControls}
              <div className="fitness-field-pair">
                <div className="entry-field entry-duration">
                  <label className="entry-field-label" htmlFor="edit-workout-duration">Duración</label>
                  <div className="entry-unit-control">
                    <input id="edit-workout-duration"
                      required
                      type="number" inputMode="numeric" pattern="[0-9]*" min="0" placeholder="Minutos"
                      value={workDuration} onChange={e => { reviseEstimate('workInput'); setWorkDuration(Number(e.target.value)); }}
                      className="w-24 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                    />
                    <span className="entry-unit" aria-hidden="true">min</span></div>
                </div>
                <div className="entry-field entry-calories">
                  <label className="entry-field-label" htmlFor="edit-workout-calories">Calorías</label>
                  <input id="edit-workout-calories"
                    required
                    type="number" inputMode="numeric" pattern="[0-9]*" min="0" placeholder="Kcal"
                    value={workCals} onChange={e => { reviseEstimate('workCalories'); setWorkCals(e.target.value === '' ? '' : Number(e.target.value)); }}
                    className="w-24 bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>
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
                    onClick={() => { markEntryChanged(); setWorkTime(format(new Date(), 'HH:mm')); }}
                    className="entry-time-now p-2 bg-slate-100 dark:bg-[#0f141c] border border-slate-200 dark:border-gray-800 rounded-md hover:bg-slate-200 dark:hover:bg-gray-800 text-slate-500 dark:text-gray-400 hover:text-white transition-colors"
                    title="Hora actual"
                  >
                    Ahora
                  </button>
                </div>
              </div>
              {workEstimateControls}
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
                <label className="entry-field-label" htmlFor="edit-workout-notes">{selectedWorkCategory === 'Gimnasio' ? 'Detalle de la rutina' : 'Notas'} <span>· Opcional</span></label>
                <AutoResizeTextarea id="edit-workout-notes"
                  placeholder={selectedWorkCategory === 'Gimnasio' ? "Detalle de la rutina (ej: Pecho y Tríceps / Press banca 4x10...)" : "Agregá detalles si querés."}
                  value={workDetails} onChange={e => { reviseEstimate('workInput'); setWorkDetails(e.target.value); }}
                  className="flex-[2] bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                />
              </div>

            </div>
            <div className="entry-form-footer flex justify-end border-t border-slate-200 dark:border-gray-800 pt-4 mt-2">
              <button type="button" className="entry-cancel" disabled={savingWorkout} onClick={closeEntry}>Cancelar</button>
              <button type="submit" disabled={savingWorkout} className="w-full bg-orange-600 hover:bg-orange-700 text-white px-4 py-2.5 rounded-lg font-medium text-base transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                <Check weight="bold" /> {savingWorkout ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </EntryFormShell>
      )}
    </div>
  );
};

export default DailyPanel;

