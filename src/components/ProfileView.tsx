import './PremiumViews.css';
import { useState, useEffect } from 'react';
import { useAppStore } from '../hooks/useAppStore';
import type { UserProfile, UserSex } from '../types';
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
  const [isResetting, setIsResetting] = useState(false);
  const [isResetConfirm, setIsResetConfirm] = useState(false);

  const initFromProfile = () => {
    if (activeProfile) {
      setName(activeProfile.name);
      setSex(activeProfile.sex);
      setAge(activeProfile.age);
      setWeight(activeProfile.weight);
      setHeight(activeProfile.height);
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
    activity: activeProfile?.activity,
    goal: activeProfile?.goal || 'Mantenimiento',
    created_at: activeProfile?.created_at || new Date().toISOString(),
    records: activeProfile?.records || {}
  };
  
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
      toast.success('¡Ajustes guardados correctamente!', { style: { background: 'var(--app-toast-bg)', color: 'var(--app-toast-text)' } });
    } catch (err) {
      toast.error('Error al actualizar', { style: { background: 'var(--app-toast-bg)', color: 'var(--app-toast-text)' } });
    }
  };

  const handleReset = async () => {
    if (isResetting) return;
    setIsResetting(true);
    try {
      await resetData();
      setIsResetConfirm(false);
      toast.success('Registros eliminados', { style: { background: 'var(--app-toast-bg)', color: 'var(--app-toast-text)' } });
    } catch {
      toast.error('No se pudieron borrar los registros. Intentá nuevamente.', { style: { background: 'var(--app-toast-bg)', color: 'var(--app-toast-text)' } });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="premium-view dark profile-view flex flex-col gap-7 w-full max-w-5xl mx-auto animate-in fade-in zoom-in-95 duration-300">
      
      {/* Form / Info Column */}
      <div className="flex-1">
        <div className="bg-white dark:bg-[#1e2124] border border-slate-200 dark:border-[#ffffff0d] p-6 rounded-3xl shadow-none flex flex-col gap-6">
          <div className="flex flex-wrap gap-4 items-center justify-between border-b border-slate-200 dark:border-[#ffffff0d] pb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-[#f5a06416] dark:bg-[#f5a06416] rounded-xl text-[#f5a064] dark:text-[#f5a064]">
                <User size={28} weight="fill" />
              </div>
              <div>
                <h2 className="font-bold text-xl text-slate-900 dark:text-white">Datos personales</h2>
                <p className="text-sm text-slate-500 dark:text-gray-400">Tus datos personales</p>
              </div>
            </div>
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-[#151719] hover:bg-slate-200 dark:hover:bg-[#292d30] text-slate-700 dark:text-gray-300 rounded-xl transition-colors text-sm font-medium border border-slate-200 dark:border-[#ffffff0d]"
              >
                <PencilSimple size={18} />
                Editar Perfil
              </button>
            )}
          </div>

          {!isEditing ? (
            /* READ MODE */
            <div className="profile-details grid grid-cols-2 sm:grid-cols-4 gap-6 py-2">
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
                    className="w-full bg-slate-100 text-slate-900 dark:bg-[#191c1f] dark:text-white border border-slate-200 dark:border-[#ffffff0d] rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#f5a064] transition-colors"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1.5">Sexo</label>
                  <select
                    value={sex}
                    onChange={e => setSex(e.target.value as UserSex)}
                    className="w-full bg-slate-100 text-slate-900 dark:bg-[#191c1f] dark:text-white border border-slate-200 dark:border-[#ffffff0d] rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#f5a064] transition-colors"
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
                    className="w-full bg-slate-100 text-slate-900 dark:bg-[#191c1f] dark:text-white border border-slate-200 dark:border-[#ffffff0d] rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#f5a064] transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1.5">Peso (kg)</label>
                  <input
                    required
                    type="number" min="20" max="300" step="0.1"
                    value={weight}
                    onChange={e => setWeight(Number(e.target.value))}
                    className="w-full bg-slate-100 text-slate-900 dark:bg-[#191c1f] dark:text-white border border-slate-200 dark:border-[#ffffff0d] rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#f5a064] transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1.5">Altura (cm)</label>
                  <input
                    required
                    type="number" min="50" max="250"
                    value={height}
                    onChange={e => setHeight(Number(e.target.value))}
                    className="w-full bg-slate-100 text-slate-900 dark:bg-[#191c1f] dark:text-white border border-slate-200 dark:border-[#ffffff0d] rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#f5a064] transition-colors"
                  />
                </div>
                
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-[#ffffff0d] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="px-4 py-2.5 bg-slate-100 dark:bg-[#151719] hover:bg-slate-200 dark:hover:bg-[#292d30] text-slate-700 dark:text-gray-300 font-medium rounded-xl transition-colors flex items-center gap-2 border border-slate-200 dark:border-[#ffffff0d]"
                >
                  <X size={20} />
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[#f5a064] hover:bg-[#f8b17f] text-white font-medium rounded-xl transition-colors flex items-center gap-2 shadow-none"
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
      <div className="w-full flex flex-col gap-7">
        
        <section className="bg-white dark:bg-[#1e2124] border border-slate-200 dark:border-[#ffffff0d] p-6 rounded-3xl text-xs text-slate-500 dark:text-gray-400 space-y-2">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">Cómo calculamos tu gasto</h3>
          <p>TMB: tu gasto en reposo.</p>
          <p>Gasto estimado = TMB + calorías de pasos + calorías de ejercicio registrados.</p>
          <p>Pasos y ejercicio pueden solaparse. Usamos los valores registrados sin correcciones.</p>
        </section>

        {/* Danger Zone (Hidden in Edit Mode to avoid clutter) */}
        {!isEditing && (
          <div className="profile-danger bg-[#1e2124] border border-[#f871711a] p-6 rounded-3xl animate-in fade-in slide-in-from-bottom-4">
            <p className="text-xs text-[#a9abae] mb-3">Cuenta / registros</p>
            <h3 className="font-bold text-red-700 dark:text-red-400 mb-2">Zona de Peligro</h3>
            <p className="text-xs text-red-600/80 dark:text-red-400/80 mb-4">
              Al reiniciar tus datos se perderá todo tu historial de peso, comidas y entrenamientos de forma permanente.
            </p>
            {!isResetConfirm ? (
              <button
                onClick={() => setIsResetConfirm(true)}
                type="button"
                className="w-full py-2 bg-white dark:bg-[#1e2124] text-red-600 dark:text-red-400 font-medium rounded-xl border border-red-200 dark:border-red-900 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors flex items-center justify-center gap-2"
              >
                <Trash size={18} /> Borrar todos los registros
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  disabled={isResetting}
                  onClick={handleReset}
                  type="button"
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-colors"
                >
                  {isResetting ? 'Borrando…' : 'Confirmar'}
                </button>
                <button
                  disabled={isResetting}
                  onClick={() => setIsResetConfirm(false)}
                  type="button"
                  className="flex-1 py-2 bg-white dark:bg-[#1e2124] text-slate-700 dark:text-gray-300 font-medium rounded-xl border border-slate-300 dark:border-[#ffffff0d] hover:bg-slate-100 dark:hover:bg-[#292d30] transition-colors"
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
