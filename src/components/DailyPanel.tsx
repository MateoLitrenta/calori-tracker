import React, { useState } from 'react';
import { ForkKnife, Flame, Barbell, Drop, Trash, Check } from '@phosphor-icons/react';
import type { DailyRecord, MealEntry, MealType, WorkoutEntry } from '../types';
import { getCaloriesIngested, getCaloriesBurned, getNetBalance, getBalanceLabel, generateUUID } from '../utils/helpers';

interface DailyPanelProps {
  record: DailyRecord | undefined;
  dateStr: string;
  onUpdateRecord: (dateStr: string, updatedRecord: DailyRecord) => void;
  currentBMR: number;
}

const DailyPanel: React.FC<DailyPanelProps> = ({ record, dateStr, onUpdateRecord, currentBMR }) => {
  const [activeTab, setActiveTab] = useState<'comida' | 'entrenamiento' | 'pasos-agua' | null>(null);

  // Default empty record if none exists for this day
  const currentRecord: DailyRecord = record || {
    dateStr,
    date: new Date(dateStr),
    meals: [],
    workouts: [],
    steps: 0,
    water: 0,
  };

  const ingested = getCaloriesIngested(currentRecord);
  const burned = getCaloriesBurned(currentRecord, currentBMR);
  const balance = getNetBalance(currentRecord, currentBMR);
  const balanceLabel = getBalanceLabel(balance);

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
  };

  const handleDeleteWorkout = (id: string) => {
    onUpdateRecord(dateStr, { ...currentRecord, workouts: currentRecord.workouts.filter(w => w.id !== id) });
  };

  const handleAddWater = (amount: number) => {
    onUpdateRecord(dateStr, { ...currentRecord, water: currentRecord.water + amount });
  };

  const handleUpdateSteps = (steps: number) => {
    onUpdateRecord(dateStr, { ...currentRecord, steps });
  };

  // --- Forms State ---
  const [mealName, setMealName] = useState('');
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
        <h3 className="text-2xl font-bold text-github-text">Resumen del Día</h3>
        <span className="text-github-muted">{dateStr}</span>
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
          <div className="text-[10px] text-github-muted leading-tight">
            TMB: {currentBMR} + Pasos: {Math.round(currentRecord.steps * 0.04)} + Ejercicio: {currentRecord.workouts.reduce((s,w)=>s+w.calories,0)}
          </div>
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

        <div className="bg-github-card border border-github-border p-4 rounded-xl flex flex-col gap-2 col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 text-github-muted text-sm font-semibold">
            <Drop size={20} className="text-cyan-400" /> Agua Ingerida
          </div>
          <div className="text-2xl font-bold text-white">{currentRecord.water} <span className="text-sm font-normal text-github-muted">/ 2500 ml</span></div>
        </div>
      </div>

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
              type="number" min="0" placeholder="Kcal" 
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
              placeholder="Actividad (ej: Running)" 
              value={workActivity} onChange={e => setWorkActivity(e.target.value)}
              className="flex-1 bg-github-bg border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
            />
            <input 
              required
              type="number" min="1" placeholder="Minutos" 
              value={workDuration} onChange={e => setWorkDuration(Number(e.target.value))}
              className="w-24 bg-github-bg border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
            />
            <input 
              required
              type="number" min="0" placeholder="Kcal" 
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
            <div className="flex gap-2">
              <button onClick={() => handleAddWater(250)} className="flex-1 bg-github-bg border border-github-border hover:border-cyan-500 hover:text-cyan-400 py-2 rounded-md text-sm transition-colors">
                + 250 ml
              </button>
              <button onClick={() => handleAddWater(500)} className="flex-1 bg-github-bg border border-github-border hover:border-cyan-500 hover:text-cyan-400 py-2 rounded-md text-sm transition-colors">
                + 500 ml
              </button>
            </div>
          </div>
          <div className="flex-1 flex flex-col gap-3">
            <h4 className="font-bold flex items-center gap-2"><Flame className="text-orange-400" /> Pasos del Día</h4>
            <div className="flex gap-2">
              <input 
                type="number" min="0"
                value={currentRecord.steps}
                onChange={e => handleUpdateSteps(Number(e.target.value))}
                className="flex-1 bg-github-bg border border-github-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Logs List */}
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

    </div>
  );
};

export default DailyPanel;
