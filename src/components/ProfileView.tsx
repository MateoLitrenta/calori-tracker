import './PremiumViews.css';
import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../hooks/useAppStore';
import type { UserProfile, UserSex } from '../types';
import { User, Check, Trash, PencilSimple, X, LockKey } from '@phosphor-icons/react';
import { supabase } from '../lib/supabase';
import { prepareAvatar } from '../lib/avatar';
import UserAvatar from './UserAvatar';
import toast from 'react-hot-toast';

export default function ProfileView() {
  const { user, activeProfile, avatarRevision, updateProfile, updateAvatarPath, resetData } = useAppStore();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(activeProfile?.name ?? '');
  const [sex, setSex] = useState<UserSex | null>(activeProfile?.sex ?? null);
  const [age, setAge] = useState<number | null>(activeProfile?.age ?? null);
  const [weight, setWeight] = useState<number | null>(activeProfile?.weight ?? null);
  const [height, setHeight] = useState<number | null>(activeProfile?.height ?? null);
  const [isResetting, setIsResetting] = useState(false);
  const [isResetConfirm, setIsResetConfirm] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [draftAvatar, setDraftAvatar] = useState<{ blob: Blob; url: string } | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);

  useEffect(() => () => {
    if (draftAvatar) URL.revokeObjectURL(draftAvatar.url);
  }, [draftAvatar]);

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

  if (!user || !activeProfile || activeProfile.user_id !== user.id || sex === null || age === null || weight === null || height === null) {
    return (
      <div className="premium-view dark profile-view w-full max-w-5xl mx-auto">
        <div role="status" aria-live="polite" className="profile-loading rounded-3xl border border-slate-200 dark:border-[#ffffff0d] bg-white dark:bg-[#1e2124] p-6 min-h-80">
          <p className="text-sm text-slate-500 dark:text-gray-400">Cargando perfil…</p>
        </div>
      </div>
    );
  }

  const previewProfile: UserProfile = {
    id: activeProfile?.id || 'temp',
    user_id: user?.id || 'temp',
    avatar_path: activeProfile.avatar_path,
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

  const handlePhotoSelected = async (file?: File) => {
    if (!file || photoBusy) return;
    setPhotoBusy(true);
    try {
      const blob = await prepareAvatar(file);
      setDraftAvatar({ blob, url: URL.createObjectURL(blob) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No pudimos preparar la foto.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleSavePhoto = async () => {
    if (!draftAvatar || photoBusy) return;
    setPhotoBusy(true);
    const previousPath = activeProfile.avatar_path;
    const path = `${user.id}/profile.${draftAvatar.blob.type === 'image/webp' ? 'webp' : 'jpg'}`;
    try {
      const { error } = await supabase.storage.from('avatars').upload(path, draftAvatar.blob, {
        upsert: true, contentType: draftAvatar.blob.type, cacheControl: '0'
      });
      if (error) throw error;
      await updateAvatarPath(path);
      setDraftAvatar(null);
      if (previousPath && previousPath !== path) {
        const { error: cleanupError } = await supabase.storage.from('avatars').remove([previousPath]);
        if (cleanupError) toast.error('Foto guardada, pero no se pudo borrar la anterior.');
      }
      toast.success('Foto actualizada.');
    } catch {
      toast.error('No pudimos guardar la foto. Intentá nuevamente.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleRemovePhoto = async () => {
    const previousPath = activeProfile.avatar_path;
    if (!previousPath || photoBusy) return;
    setPhotoBusy(true);
    try {
      await updateAvatarPath(null);
      const { error } = await supabase.storage.from('avatars').remove([previousPath]);
      if (error) {
        await updateAvatarPath(previousPath);
        throw error;
      }
      toast.success('Foto eliminada.');
    } catch {
      toast.error('No pudimos eliminar la foto. Intentá nuevamente.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const handlePasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    if (passwordBusy) return;
    if (newPassword.trim().length === 0 || newPassword.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (newPassword !== repeatPassword) {
      toast.error('Las contraseñas no coinciden.');
      return;
    }
    setPasswordBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setRepeatPassword('');
      setShowPasswordForm(false);
      toast.success('Contraseña actualizada.');
    } catch {
      toast.error('No pudimos actualizar la contraseña. Intentá nuevamente.');
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <div className="premium-view dark profile-view flex flex-col gap-7 w-full max-w-5xl mx-auto animate-in fade-in zoom-in-95 duration-300">
      <section className="profile-identity bg-white dark:bg-[#1e2124] border border-slate-200 dark:border-[#ffffff0d] rounded-[var(--radius-panel)] flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
        {draftAvatar ? (
          <img src={draftAvatar.url} alt="Vista previa de la foto de perfil" className="w-24 h-24 flex-none rounded-full object-cover" />
        ) : (
          <UserAvatar userId={user.id} path={activeProfile.avatar_path} revision={avatarRevision} size={96} />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white break-words">{activeProfile.name}</h1>
          <p className="text-sm text-slate-500 dark:text-gray-400 break-all">{user.email}</p>
          <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
            aria-label="Elegir foto de perfil" onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              void handlePhotoSelected(file);
            }} />
          <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-2">
            {!draftAvatar ? (
              <>
                <button type="button" disabled={photoBusy} onClick={() => photoInputRef.current?.click()}
                  className="min-h-11 px-4 bg-[#f5a064] hover:bg-[#e58b4f] text-[#241a13] font-medium disabled:opacity-50">
                  {photoBusy ? 'Preparando…' : 'Cambiar foto'}
                </button>
                {activeProfile.avatar_path && (
                  <button type="button" disabled={photoBusy} onClick={handleRemovePhoto}
                    className="min-h-11 px-3 border border-slate-200 dark:border-[#ffffff0d] text-slate-600 dark:text-gray-300 disabled:opacity-50">
                    Eliminar foto
                  </button>
                )}
              </>
            ) : (
              <>
                <button type="button" disabled={photoBusy} onClick={handleSavePhoto}
                  className="min-h-11 px-4 bg-[#f5a064] hover:bg-[#e58b4f] text-[#241a13] font-medium disabled:opacity-50">
                  {photoBusy ? 'Guardando…' : 'Guardar'}
                </button>
                <button type="button" disabled={photoBusy} onClick={() => setDraftAvatar(null)}
                  className="min-h-11 px-4 border border-slate-200 dark:border-[#ffffff0d] text-slate-700 dark:text-gray-300 disabled:opacity-50">
                  Cancelar
                </button>
              </>
            )}
          </div>
        </div>
      </section>

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
                onClick={() => { initFromProfile(); setIsEditing(true); }}
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

        <section className="bg-white dark:bg-[#1e2124] border border-slate-200 dark:border-[#ffffff0d] rounded-[var(--radius-panel)] text-slate-700 dark:text-gray-300">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-3 bg-[#f5a06416] rounded-[var(--radius-widget)] text-[#f5a064]"><LockKey size={24} /></div>
            <h2 className="text-xl text-slate-900 dark:text-white">Seguridad</h2>
          </div>
          <div className="mb-5">
            <p className="text-xs text-slate-500 dark:text-gray-400">Email</p>
            <p className="text-sm text-slate-900 dark:text-white break-all">{user.email}</p>
          </div>
          {!showPasswordForm ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-slate-500 dark:text-gray-400">Contraseña</p>
                <p className="text-sm text-slate-900 dark:text-white">••••••••</p>
              </div>
              <button type="button" onClick={() => setShowPasswordForm(true)}
                className="min-h-11 px-4 border border-slate-200 dark:border-[#ffffff0d] text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-[#292d30]">
                Cambiar contraseña
              </button>
            </div>
          ) : (
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block text-sm">Nueva contraseña
                  <input type="password" autoComplete="new-password" required minLength={8} value={newPassword}
                    onChange={event => setNewPassword(event.target.value)}
                    className="mt-1.5 w-full bg-white dark:bg-[#191c1f] border border-slate-300 dark:border-[#ffffff0d] text-slate-900 dark:text-white px-4 py-2.5" />
                </label>
                <label className="block text-sm">Repetir nueva contraseña
                  <input type="password" autoComplete="new-password" required minLength={8} value={repeatPassword}
                    onChange={event => setRepeatPassword(event.target.value)}
                    className="mt-1.5 w-full bg-white dark:bg-[#191c1f] border border-slate-300 dark:border-[#ffffff0d] text-slate-900 dark:text-white px-4 py-2.5" />
                </label>
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                <button type="button" disabled={passwordBusy} onClick={() => {
                  setNewPassword(''); setRepeatPassword(''); setShowPasswordForm(false);
                }} className="min-h-11 px-4 border border-slate-200 dark:border-[#ffffff0d] text-slate-700 dark:text-gray-300 disabled:opacity-50">
                  Cancelar
                </button>
                <button type="submit" disabled={passwordBusy}
                  className="min-h-11 px-4 bg-[#f5a064] hover:bg-[#e58b4f] text-[#241a13] font-medium disabled:opacity-50">
                  {passwordBusy ? 'Guardando…' : 'Guardar contraseña'}
                </button>
              </div>
            </form>
          )}
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
