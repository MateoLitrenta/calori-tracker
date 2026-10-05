import './PremiumViews.css';
import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../hooks/useAppStore';
import type { UserProfile, UserSex } from '../types';
import { Check, Trash, PencilSimple, LockKey, SignOut, Info, CaretDown } from '@phosphor-icons/react';
import { supabase } from '../lib/supabase';
import { prepareAvatar } from '../lib/avatar';
import UserAvatar from './UserAvatar';
import ViewSkeleton from './ViewSkeleton';
import toast from 'react-hot-toast';

export default function ProfileView() {
  const { user, activeProfile, avatarRevision, updateProfile, updateAvatarPath, resetData, signOut } = useAppStore();

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
  const [isSigningOut, setIsSigningOut] = useState(false);
  const signOutDialogRef = useRef<HTMLDialogElement>(null);
  const signOutCancelRef = useRef<HTMLButtonElement>(null);
  const [showEnergyInfo, setShowEnergyInfo] = useState(false);

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
    return <ViewSkeleton view="profile" />;
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

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
      signOutDialogRef.current?.close();
    } catch {
      signOutDialogRef.current?.close();
      toast.error('No pudimos cerrar la sesión. Intentá nuevamente.', { style: { background: 'var(--app-toast-bg)', color: 'var(--app-toast-text)' } });
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className="premium-view dark profile-view profile-v2 flex flex-col w-full max-w-4xl mx-auto animate-in fade-in duration-300">
      <h1 className="profile-page-title">Perfil</h1>

      <section className="profile-panel" aria-labelledby="profile-name">
        <div className="profile-identity">
          {draftAvatar ? (
            <img src={draftAvatar.url} alt="Vista previa de la foto de perfil" className="w-20 h-20 flex-none rounded-full object-cover" />
          ) : (
            <UserAvatar userId={user.id} path={activeProfile.avatar_path} revision={avatarRevision} size={80} />
          )}
          <div className="profile-identity-copy">
            <h2 id="profile-name">{activeProfile.name}</h2>
            <p className="profile-muted profile-email">{user.email}</p>
          </div>
        </div>
        <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
          aria-label="Elegir foto de perfil" onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            void handlePhotoSelected(file);
          }} />
        <div className="profile-actions profile-photo-actions">
          {!draftAvatar ? (
            <>
              <button type="button" disabled={photoBusy} onClick={() => photoInputRef.current?.click()}
                className="profile-button profile-button-accent">
                {photoBusy ? 'Preparando…' : 'Cambiar foto'}
              </button>
            </>
          ) : (
            <>
              <button type="button" disabled={photoBusy} onClick={handleSavePhoto}
                className="profile-button profile-button-primary">
                {photoBusy ? 'Guardando…' : 'Guardar'}
              </button>
              <button type="button" disabled={photoBusy} onClick={() => setDraftAvatar(null)}
                className="profile-button profile-button-neutral">Cancelar</button>
            </>
          )}
          {!isEditing && (
            <button type="button" onClick={() => { initFromProfile(); setIsEditing(true); }}
              className="profile-button profile-button-neutral">
              <PencilSimple size={18} aria-hidden="true" /> Editar perfil
            </button>
          )}
          {!draftAvatar && activeProfile.avatar_path && (
            <button type="button" disabled={photoBusy} onClick={handleRemovePhoto}
              className="profile-button profile-button-quiet">Eliminar foto</button>
          )}
        </div>

        {!isEditing ? (
          <div className="profile-personal">
            <h3 className="profile-subheading">Datos personales</h3>
            <dl className="profile-facts">
              <div><dt>Edad</dt><dd>{age} <span>años</span></dd></div>
              <div><dt>Peso</dt><dd>{weight} <span>kg</span></dd></div>
              <div><dt>Altura</dt><dd>{height} <span>cm</span></dd></div>
              <div><dt>Sexo</dt><dd>{sex}</dd></div>
            </dl>
          </div>
        ) : (
          <form onSubmit={handleSave} className="profile-form profile-personal">
            <h3 className="profile-subheading">Datos personales</h3>
            <div className="profile-field-grid">
              <label className="profile-field sm:col-span-2">Nombre
                <input required type="text" value={name} onChange={e => setName(e.target.value)} />
              </label>
              <label className="profile-field">Sexo
                <select value={sex} onChange={e => setSex(e.target.value as UserSex)}>
                  <option value="Masculino">Masculino</option>
                  <option value="Femenino">Femenino</option>
                </select>
              </label>
              <label className="profile-field">Edad
                <input required type="number" min="1" max="120" value={age} onChange={e => setAge(Number(e.target.value))} />
              </label>
              <label className="profile-field">Peso (kg)
                <input required type="number" min="20" max="300" step="0.1" value={weight} onChange={e => setWeight(Number(e.target.value))} />
              </label>
              <label className="profile-field">Altura (cm)
                <input required type="number" min="50" max="250" value={height} onChange={e => setHeight(Number(e.target.value))} />
              </label>
            </div>
            <div className="profile-actions profile-form-actions">
              <button type="button" onClick={cancelEdit} className="profile-button profile-button-neutral">Cancelar</button>
              <button type="submit" className="profile-button profile-button-primary">
                <Check size={18} aria-hidden="true" /> Guardar cambios
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="profile-panel" aria-labelledby="profile-account-heading">
        <h2 id="profile-account-heading" className="profile-section-title"><LockKey size={20} aria-hidden="true" /> Cuenta y seguridad</h2>
        <div className="profile-setting-row">
          <div className="min-w-0"><p className="profile-label">Email</p><p className="profile-setting-value profile-email">{user.email}</p></div>
        </div>
        <div className="profile-setting-row profile-password-row">
          {!showPasswordForm ? (
            <>
              <div><p className="profile-label">Contraseña</p><p className="profile-setting-value">••••••••</p></div>
              <button type="button" aria-label="Cambiar contraseña" onClick={() => setShowPasswordForm(true)}
                className="profile-button profile-button-neutral">Cambiar</button>
            </>
          ) : (
            <form onSubmit={handlePasswordChange} className="profile-form w-full">
              <div className="profile-field-grid">
                <label className="profile-field">Nueva contraseña
                  <input type="password" autoComplete="new-password" required minLength={8} value={newPassword}
                    onChange={event => setNewPassword(event.target.value)} />
                </label>
                <label className="profile-field">Repetir nueva contraseña
                  <input type="password" autoComplete="new-password" required minLength={8} value={repeatPassword}
                    onChange={event => setRepeatPassword(event.target.value)} />
                </label>
              </div>
              <div className="profile-actions profile-form-actions">
                <button type="button" disabled={passwordBusy} onClick={() => {
                  setNewPassword(''); setRepeatPassword(''); setShowPasswordForm(false);
                }} className="profile-button profile-button-neutral">Cancelar</button>
                <button type="submit" disabled={passwordBusy} className="profile-button profile-button-primary">
                  {passwordBusy ? 'Guardando…' : 'Guardar contraseña'}
                </button>
              </div>
            </form>
          )}
        </div>
        <button type="button" onClick={() => {
          signOutDialogRef.current?.showModal();
          signOutCancelRef.current?.focus();
        }} disabled={isSigningOut} aria-busy={isSigningOut}
          className="profile-button profile-button-neutral profile-signout">
          <SignOut size={20} aria-hidden="true" />
          {isSigningOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </button>
      </section>

      <section className="profile-information" aria-labelledby="profile-information-heading">
        <h2 id="profile-information-heading" className="profile-section-title">Información</h2>
        <button type="button" className="profile-info-toggle" aria-expanded={showEnergyInfo} aria-controls="profile-energy-details"
          onClick={() => setShowEnergyInfo(value => !value)}>
          <Info size={20} aria-hidden="true" />
          <span className="flex-1 min-w-0">
            <span className="block">Cómo calculamos tu gasto</span>
            <span className="block profile-muted">TMB + pasos + ejercicio registrado</span>
          </span>
          <CaretDown size={18} aria-hidden="true" className={showEnergyInfo ? 'rotate-180' : ''} />
        </button>
        {showEnergyInfo && (
          <div id="profile-energy-details" className="profile-energy-details profile-muted">
            <p>TMB: tu gasto en reposo.</p>
            <p>Gasto estimado = TMB + calorías de pasos + calorías de ejercicio registrados.</p>
            <p>Pasos y ejercicio pueden solaparse. Usamos los valores registrados sin correcciones.</p>
          </div>
        )}
      </section>

      {!isEditing && (
        <div className="profile-danger profile-v2-danger">
          <h2 className="profile-section-title"><Trash size={18} aria-hidden="true" /> Zona de peligro</h2>
          <p>Se eliminará tu historial de peso, comidas y entrenamientos de forma permanente.</p>
          {!isResetConfirm ? (
            <button onClick={() => setIsResetConfirm(true)} type="button" className="profile-button profile-button-danger w-full">
              Borrar todos los registros
            </button>
          ) : (
            <div className="profile-actions">
              <button disabled={isResetting} onClick={handleReset} type="button" className="profile-button profile-button-danger flex-1">
                {isResetting ? 'Borrando…' : 'Confirmar'}
              </button>
              <button disabled={isResetting} onClick={() => setIsResetConfirm(false)} type="button" className="profile-button profile-button-neutral flex-1">
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}

      <dialog ref={signOutDialogRef} role="dialog" aria-modal="true" aria-labelledby="signout-title" aria-describedby="signout-description"
        onCancel={event => { if (isSigningOut) event.preventDefault(); }}
        onClick={event => {
          if (!isSigningOut && event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="fixed inset-0 m-auto w-[calc(100vw_-_2rem)] max-w-sm max-h-[calc(100dvh_-_2rem)] overflow-y-auto p-0 bg-white dark:bg-[#1e2124] border border-slate-200 dark:border-[#ffffff0d] rounded-[var(--radius-panel)] backdrop:bg-black/50">
        <div className="p-6">
          <h2 id="signout-title" className="text-xl text-slate-900 dark:text-white">¿Cerrar sesión?</h2>
          <p id="signout-description" className="mt-3 text-sm text-slate-500 dark:text-gray-400">Vas a salir de tu cuenta en este dispositivo.</p>
          <div className="mt-6 flex gap-3">
            <button ref={signOutCancelRef} type="button" disabled={isSigningOut} onClick={() => signOutDialogRef.current?.close()}
              className="flex-1 min-h-11 px-3 py-3 bg-slate-50 dark:bg-[#191c1f] border border-slate-200 dark:border-[#ffffff0d] text-slate-700 dark:text-gray-300 rounded-[var(--radius-control)] hover:bg-slate-100 dark:hover:bg-[#292d30] disabled:opacity-50 disabled:cursor-not-allowed">
              Cancelar
            </button>
            <button type="button" onClick={handleSignOut} disabled={isSigningOut} aria-busy={isSigningOut}
              className="flex-1 min-h-11 px-3 py-3 bg-[#f5a064] text-[#241a13] rounded-[var(--radius-control)] hover:bg-[#e58b4f] disabled:opacity-50 disabled:cursor-not-allowed">
              {isSigningOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </button>
          </div>
        </div>
      </dialog>

    </div>
  );
}
