import { useState, useEffect } from 'react';
import { useAppStore } from '../hooks/useAppStore';
import { calculateBMR, calculateTDEE, calculateDailyCalorieTarget, formatDateStr } from '../utils/helpers';
import type { UserProfile, UserSex, ActivityLevel, UserGoal } from '../types';
import { User, Check, Trash, PencilSimple, X } from '@phosphor-icons/react';
import toast from 'react-hot-toast';

export default function ProfileView() {
  const { user, activeProfile, updateProfile, resetData } = useAppStore();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [sex, setSex] = useState<UserSex>('Masculino');
  const [age, setAge] = useState<number>(30);
  const [weight, setWeight] = useState<number>(70);
  const [height, setHeight] = useState<number>(170);
  const [activity, setActivity] = useState<ActivityLevel>('Sedentario');
  const [goal, setGoal] = useState<UserGoal>('Mantenimiento');
  const [isResetConfirm, setIsResetConfirm] = useState(false);

  const initFromProfile = () => {
    if (activeProfile) {
      setName(activeProfile.name);
      setSex(activeProfile.sex);
      setAge(activeProfile.age);
      setWeight(activeProfile.weight);
      setHeight(activeProfile.height);
      setActivity(activeProfile.activity || 'Sedentario');
      setGoal(activeProfile.goal || 'Mantenimiento');
    } else if (user) {
      setName(user.email?.split('@')[0] || 'Usuario');
    }
  };

  useEffect(() => {
    initFromProfile();
  }, [activeProfile, user]);

  const cancelEdit = () => {
    initFromProfile();
    setIsEditing(false);
  };

  const previewProfile: UserProfile = {
    id: activeProfile?.id || 'temp',
    user_id: user?.id || 'temp',
    name,
    sex,
    age,
    weight,
    height,
    activity,
    goal,
    created_at: activeProfile?.created_at || new Date().toISOString(),
    records: activeProfile?.records || {}
  };
  
  const calculatedBMR = calculateBMR(previewProfile);
  const calculatedTDEE = calculateTDEE(previewProfile);
  const adjustedTarget = calculateDailyCalorieTarget(previewProfile, previewProfile.records[formatDateStr(new Date())]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    try {
      await updateProfile({
        ...previewProfile,
        id: activeProfile?.id || '', 
        user_id: user.id 
      });
      setIsEditing(false);
      toast.success('¡Ajustes guardados correctamente!', { style: { background: '#161b22', color: '#fff' } });
    } catch (err) {
      toast.error('Error al actualizar', { style: { background: '#161b22', color: '#fff' } });
    }
  };

  const handleReset = () => {
    resetData();
    setIsResetConfirm(false);
    toast.success('Datos reiniciados', { style: { background: '#161b22', color: '#fff' } });
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 w-full max-w-5xl mx-auto animate-in fade-in zoom-in-95 duration-300">
      
      {/* Form / Info Column */}
      <div className="flex-1">
        <div className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-gray-800 p-6 rounded-2xl shadow-sm flex flex-col gap-6">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-gray-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400">
                <User size={28} weight="fill" />
              </div>
              <div>
                <h2 className="font-bold text-xl text-slate-900 dark:text-white">Ajustes de Perfil</h2>
                <p className="text-sm text-slate-500 dark:text-gray-400">Tus datos biométricos y objetivos</p>
              </div>
            </div>
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-[#0f141c] hover:bg-slate-200 dark:hover:bg-gray-800 text-slate-700 dark:text-gray-300 rounded-lg transition-colors text-sm font-medium border border-slate-200 dark:border-gray-800"
              >
                <PencilSimple size={18} />
                Editar Perfil
              </button>
            )}
          </div>

          {!isEditing ? (
            /* READ MODE */
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 py-2">
              <div className="flex flex-col">
                <span className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-1">Nombre</span>
                <span className="font-semibold text-slate-900 dark:text-white text-lg">{name}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-1">Sexo</span>
                <span className="font-semibold text-slate-900 dark:text-white text-lg">{sex}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-1">Edad</span>
                <span className="font-semibold text-slate-900 dark:text-white text-lg">{age} <span className="text-sm font-normal text-slate-500">años</span></span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-1">Peso</span>
                <span className="font-semibold text-slate-900 dark:text-white text-lg">{weight} <span className="text-sm font-normal text-slate-500">kg</span></span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-1">Altura</span>
                <span className="font-semibold text-slate-900 dark:text-white text-lg">{height} <span className="text-sm font-normal text-slate-500">cm</span></span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-1">Nivel Actividad</span>
                <span className="inline-flex items-center mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 self-start">
                  {activity}
                </span>
              </div>
              <div className="flex flex-col sm:col-span-3">
                <span className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-1">Objetivo Actual</span>
                <span className={`inline-flex items-center mt-1 px-3 py-1 rounded-full text-sm font-bold self-start ${
                  goal === 'Déficit' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400' :
                  goal === 'Superávit' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400' :
                  'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400'
                }`}>
                  {goal}
                </span>
              </div>
            </div>
          ) : (
            /* EDIT MODE */
            <form onSubmit={handleSave} className="flex flex-col gap-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1.5">Nombre</label>
                  <input
                    required
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1.5">Sexo</label>
                  <select
                    value={sex}
                    onChange={e => setSex(e.target.value as UserSex)}
                    className="w-full bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value="Masculino">Masculino</option>
                    <option value="Femenino">Femenino</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1.5">Edad</label>
                  <input
                    required
                    type="number" min="1" max="120"
                    value={age}
                    onChange={e => setAge(Number(e.target.value))}
                    className="w-full bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1.5">Peso (kg)</label>
                  <input
                    required
                    type="number" min="20" max="300" step="0.1"
                    value={weight}
                    onChange={e => setWeight(Number(e.target.value))}
                    className="w-full bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1.5">Altura (cm)</label>
                  <input
                    required
                    type="number" min="50" max="250"
                    value={height}
                    onChange={e => setHeight(Number(e.target.value))}
                    className="w-full bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1.5">Nivel de Actividad</label>
                  <select
                    value={activity}
                    onChange={e => setActivity(e.target.value as ActivityLevel)}
                    className="w-full bg-slate-100 text-slate-900 dark:bg-[#0d1117] dark:text-white border border-slate-200 dark:border-gray-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value="Sedentario">Sedentario (Poco o ningún ejercicio)</option>
                    <option value="Moderado">Moderado (Ejercicio ligero 1-3 días/sem)</option>
                    <option value="Activo">Activo (Ejercicio moderado 3-5 días/sem)</option>
                  </select>
                </div>
                
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1.5">Objetivo Físico</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Déficit', 'Mantenimiento', 'Superávit'] as UserGoal[]).map(g => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setGoal(g)}
                        className={`py-2 px-2 text-xs sm:text-sm font-medium rounded-lg border transition-colors ${
                          goal === g
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-slate-100 dark:bg-[#0d1117] border-slate-200 dark:border-gray-800 text-slate-600 dark:text-gray-300 hover:border-slate-300 dark:hover:border-gray-700'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-gray-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="px-4 py-2.5 bg-slate-100 dark:bg-[#0f141c] hover:bg-slate-200 dark:hover:bg-gray-800 text-slate-700 dark:text-gray-300 font-medium rounded-lg transition-colors flex items-center gap-2 border border-slate-200 dark:border-gray-800"
                >
                  <X size={20} />
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 shadow-sm"
                >
                  <Check size={20} weight="bold" />
                  Guardar Cambios
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Summary / Danger Zone Column */}
      <div className="w-full md:w-80 flex flex-col gap-6">
        
        {/* Real-time Summary Card */}
        <div className="bg-slate-50 dark:bg-[#0f141c] border border-slate-200 dark:border-gray-800 p-6 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <User size={100} weight="fill" />
          </div>
          <h3 className="font-bold text-slate-900 dark:text-white mb-4 relative z-10">Proyección Diaria</h3>
          <div className="flex flex-col gap-3 relative z-10">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500 dark:text-gray-400">TMB Estimada:</span>
              <span className="font-semibold text-slate-700 dark:text-gray-200">{calculatedBMR} kcal</span>
            </div>
            <div className="flex justify-between items-center gap-2">
              <span className="text-sm text-slate-500 dark:text-gray-400">TDEE de referencia habitual:</span>
              <span className="font-semibold text-slate-700 dark:text-gray-200 whitespace-nowrap">{calculatedTDEE} kcal</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-gray-400">TDEE es una referencia habitual. La meta de hoy usa TMB, pasos y ejercicio registrados.</p>
            <div className="flex justify-between items-center pt-3 border-t border-slate-200 dark:border-gray-800/50">
              <span className="text-sm text-slate-500 dark:text-gray-400">Meta de hoy:</span>
              <span className={`text-lg font-bold ${
                goal === 'Déficit' ? 'text-blue-600 dark:text-blue-400' :
                goal === 'Superávit' ? 'text-orange-600 dark:text-orange-400' :
                'text-green-600 dark:text-green-400'
              }`}>
                {adjustedTarget} kcal
              </span>
            </div>
          </div>
        </div>

        {/* Danger Zone (Hidden in Edit Mode to avoid clutter) */}
        {!isEditing && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 p-6 rounded-2xl animate-in fade-in slide-in-from-bottom-4">
            <h3 className="font-bold text-red-700 dark:text-red-400 mb-2">Zona de Peligro</h3>
            <p className="text-xs text-red-600/80 dark:text-red-400/80 mb-4">
              Al reiniciar tus datos se perderá todo tu historial de peso, comidas y entrenamientos de forma permanente.
            </p>
            {!isResetConfirm ? (
              <button
                onClick={() => setIsResetConfirm(true)}
                type="button"
                className="w-full py-2 bg-white dark:bg-[#161b22] text-red-600 dark:text-red-400 font-medium rounded-lg border border-red-200 dark:border-red-900 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors flex items-center justify-center gap-2"
              >
                <Trash size={18} /> Borrar todos los registros
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handleReset}
                  type="button"
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
                >
                  Confirmar
                </button>
                <button
                  onClick={() => setIsResetConfirm(false)}
                  type="button"
                  className="flex-1 py-2 bg-white dark:bg-[#161b22] text-slate-700 dark:text-gray-300 font-medium rounded-lg border border-slate-300 dark:border-gray-700 hover:bg-slate-100 dark:hover:bg-[#0f141c] transition-colors"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        )}

      </div>

    </div>
  );
}
