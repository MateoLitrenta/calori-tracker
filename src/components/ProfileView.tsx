import SegmentedControl from './SegmentedControl';
import './FitnessProfile.css';
import { useState, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { useAppStore } from '../hooks/useAppStore';
import { useTheme } from './ThemeProvider';
import type { UserProfile, UserSex } from '../types';
import { Check, Camera, Trash, PencilSimple, LockKey, SignOut, Info, CaretDown, SlidersHorizontal } from '@phosphor-icons/react';
import { supabase } from '../lib/supabase';
import { prepareAvatar } from '../lib/avatar';
import UserAvatar from './UserAvatar';
import ViewSkeleton from './ViewSkeleton';
import DiscardDraftDialog from './DiscardDraftDialog';
import toast from 'react-hot-toast';

const themeOptions = [
  { value: 'system', label: 'Sistema' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
] as const;

type Personal = Pick<UserProfile, 'name' | 'sex' | 'age' | 'weight' | 'height'>;
type LeaveGuard = (leave: () => void) => void;

declare const __CALORI_PREVIEW_COMMIT__: string;

export default function ProfileView({ beforeLeave }: { beforeLeave?: RefObject<LeaveGuard | null> }) {
  const { user, activeProfile, avatarRevision, updateProfile, updateAvatarPath, resetData, signOut } = useAppStore();
  const { theme, setTheme } = useTheme();

  const [base, setBase] = useState<Personal | null>(null);
  const [changes, setChanges] = useState<Partial<Personal>>({});
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const mounted = useRef(true);
  const restoreEditFocus = useRef(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const [discard, setDiscard] = useState<(() => void) | null>(null);
  const isEditing = base !== null;
  const dirty = Object.keys(changes).length > 0;
  const [resetError, setResetError] = useState('');
  const resetLock = useRef(false);
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

  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useLayoutEffect(() => {
    if (!beforeLeave) return;
    beforeLeave.current = leave => {
      if (saveLock.current || photoBusy || passwordBusy || isResetting || isSigningOut) {
        toast.error('Esperá a que termine la operación antes de cambiar de sección.');
      } else if (dirty || draftAvatar || newPassword || repeatPassword) {
        setDiscard(() => leave);
      } else leave();
    };
    return () => { beforeLeave.current = null; };
  }, [beforeLeave, dirty, draftAvatar, photoBusy, passwordBusy, isResetting, isSigningOut, newPassword, repeatPassword]);

  useLayoutEffect(() => {
    if (isEditing) nameInput.current?.focus({ preventScroll: true });
    else if (restoreEditFocus.current) {
      editButton.current?.focus({ preventScroll: true });
      restoreEditFocus.current = false;
    }
  }, [isEditing]);

  if (!user || !activeProfile || activeProfile.user_id !== user.id) return <ViewSkeleton view="profile" />;
  const { name, sex, age, weight, height } = { ...(base ?? activeProfile), ...changes };
  if (sex == null || age == null || weight == null || height == null) return <ViewSkeleton view="profile" />;

  function change<K extends keyof Personal>(key: K, value: Personal[K]) {
    setChanges(previous => {
      const next = { ...previous, [key]: value };
      if (base?.[key] === value) delete next[key];
      return next;
    });
  }

  const finishEdit = () => {
    setBase(null);
    setChanges({});
    restoreEditFocus.current = true;
  };
  const cancelEdit = () => {
    if (dirty) setDiscard(() => finishEdit);
    else finishEdit();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saveLock.current || photoBusy) return;
    saveLock.current = true;
    setSaving(true);
    try {
      await updateProfile({ ...activeProfile, ...changes });
      if (mounted.current) {
        finishEdit();
        toast.success('Datos personales guardados.');
      }
    } catch {
      if (mounted.current) toast.error('No se pudieron guardar los datos. Tu borrador se conserva.');
    } finally {
      saveLock.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  const handleReset = async () => {
    if (resetLock.current) return;
    resetLock.current = true;
    setIsResetting(true);
    setResetError('');
    try {
      await resetData();
      if (mounted.current) {
        setIsResetConfirm(false);
        toast.success('Registros eliminados');
      }
    } catch {
      if (mounted.current) setResetError('No se pudieron borrar los registros. Intentá nuevamente.');
    } finally {
      resetLock.current = false;
      if (mounted.current) setIsResetting(false);
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
      toast.error('No pudimos cerrar la sesión. Intentá nuevamente.');
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div data-editing={isEditing} className="profile-view">
      <h1 className="screen-title profile-page-title">Perfil</h1>

      <section className="profile-panel profile-personal-panel" aria-labelledby="profile-name">
        <div className="profile-identity">
          {draftAvatar ? (
            <img src={draftAvatar.url} alt="Vista previa de la foto de perfil" className="profile-avatar" />
          ) : (
            <UserAvatar userId={user.id} path={activeProfile.avatar_path} revision={avatarRevision} size={72} className="profile-avatar" />
          )}
          <div className="profile-identity-copy">
            <h2 id="profile-name">{activeProfile.name}</h2>
          </div>
        </div>
        <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden
          aria-label="Elegir foto de perfil" onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            void handlePhotoSelected(file);
          }} />
        <div className="profile-actions profile-photo-actions">
          {!draftAvatar ? (
            <button type="button" disabled={photoBusy || saving} onClick={() => photoInputRef.current?.click()}
              className="profile-button profile-button-neutral">
              <Camera size={17} aria-hidden="true" />{photoBusy ? 'Preparando…' : 'Cambiar foto'}
            </button>
          ) : (
            <>
              <button type="button" disabled={photoBusy || saving} onClick={handleSavePhoto}
                className="profile-button profile-button-primary">
                {photoBusy ? 'Guardando…' : 'Guardar foto'}
              </button>
              <button type="button" disabled={photoBusy || saving} onClick={() => setDraftAvatar(null)}
                className="profile-button profile-button-neutral">Cancelar foto</button>
            </>
          )}
          {!draftAvatar && activeProfile.avatar_path && (
            <button type="button" disabled={photoBusy || saving} onClick={handleRemovePhoto}
              className="profile-button profile-button-quiet">Eliminar foto</button>
          )}
        </div>

        {!isEditing ? (
          <div className="profile-personal">
            <div className="profile-personal-heading">
              <h3 className="profile-subheading">Datos personales</h3>
              <button type="button" ref={editButton} disabled={isResetting} onClick={() => setBase({ name, sex, age, weight, height })}
                className="profile-button profile-button-quiet">
                <PencilSimple size={16} aria-hidden="true" /> Editar perfil
              </button>
            </div>
            <dl className="profile-facts">
              <div><dt>Edad</dt><dd>{age} <span>años</span></dd></div>
              <div><dt>Peso de perfil</dt><dd>{weight} <span>kg</span></dd></div>
              <div><dt>Altura</dt><dd>{height} <span>cm</span></dd></div>
              <div><dt>Sexo</dt><dd>{sex}</dd></div>
            </dl>
            <p className="profile-muted profile-weight-note">Este peso se usa para estimar tu gasto. Las mediciones diarias se registran en Inicio.</p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="profile-form profile-personal">
            <h3 className="profile-subheading">Editar datos personales</h3>
            <fieldset disabled={saving} className="profile-field-grid">
              <label className="profile-field sm:col-span-2">Nombre
                <input ref={nameInput} required type="text" value={name} onChange={e => change('name', e.target.value)} />
              </label>
              <label className="profile-field">Sexo
                <select value={sex} onChange={e => change('sex', e.target.value as UserSex)}>
                  <option value="Masculino">Masculino</option>
                  <option value="Femenino">Femenino</option>
                </select>
              </label>
              <label className="profile-field">Edad
                <input required type="number" min="1" max="120" value={age} onChange={e => change('age', Number(e.target.value))} />
              </label>
              <label className="profile-field">Peso de perfil (kg)
                <input required type="number" min="20" max="300" aria-describedby="profile-weight-help" step="0.1" value={weight} onChange={e => change('weight', Number(e.target.value))} />
              </label>
              <label className="profile-field">Altura (cm)
                <input required type="number" min="50" max="250" value={height} onChange={e => change('height', Number(e.target.value))} />
              </label>
            </fieldset>
            <p id="profile-weight-help" className="profile-muted profile-weight-note">Editar este peso actualiza tus estimaciones. Las mediciones diarias se registran en Inicio.</p>
            <div className="profile-actions profile-form-actions">
              <button type="button" disabled={saving} onClick={cancelEdit} className="profile-button profile-button-neutral">Cancelar</button>
              <button type="submit" disabled={saving || photoBusy} aria-busy={saving} className="profile-button profile-button-primary">
                <Check size={18} aria-hidden="true" /> {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="profile-information" aria-labelledby="profile-information-heading">
        <h2 id="profile-information-heading" className="profile-section-title"><SlidersHorizontal size={20} aria-hidden="true" /> Apariencia</h2>
        <div className="profile-appearance-row">
          <p className="profile-muted profile-appearance-copy">Elegí cómo querés ver Calori.</p>
          <SegmentedControl className="profile-theme-control" label="Apariencia" options={themeOptions}
            value={theme} onChange={setTheme} />
        </div>
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

      <section className="profile-panel profile-account-panel" aria-labelledby="profile-account-heading">
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
        }} disabled={isSigningOut || saving || photoBusy || isResetting} aria-busy={isSigningOut}
          className="profile-button profile-button-neutral profile-signout">
          <SignOut size={20} aria-hidden="true" />
          {isSigningOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </button>
      </section>

      {!isEditing && (
        <details className="profile-panel profile-management" onToggle={event => { if (!event.currentTarget.open) setIsResetConfirm(false); }}>
          <summary className="profile-section-title" onClick={event => { if (isResetting) event.preventDefault(); }}><Trash size={18} aria-hidden="true" /> Gestión de datos <CaretDown size={18} aria-hidden="true" /></summary>
          <p>Podés borrar de forma permanente las comidas, ejercicios, pasos, agua y mediciones de peso de todos los días de esta cuenta.</p>
          {isResetConfirm && <p><strong>¿Borrar todos tus registros diarios?</strong></p>}
          {isResetConfirm && resetError && <p role="alert" className="profile-reset-error">{resetError}</p>}
          {!isResetConfirm ? (
            <button onClick={() => { setResetError(''); setIsResetConfirm(true); }} type="button" className="profile-button profile-button-danger w-full">
              Borrar todos los registros
            </button>
          ) : (
            <div className="profile-actions">
              <button disabled={isResetting} onClick={() => setIsResetConfirm(false)} type="button" className="profile-button profile-button-neutral flex-1">
                Cancelar
              </button>
              <button disabled={isResetting} onClick={handleReset} type="button" className="profile-button profile-button-danger flex-1">
                {isResetting ? 'Borrando…' : 'Borrar registros'}
              </button>
            </div>
          )}
        </details>
      )}

      {typeof __CALORI_PREVIEW_COMMIT__ !== 'undefined' && __CALORI_PREVIEW_COMMIT__ && (
        <details className="profile-muted text-xs">
          <summary>Versión de Preview · <code>{__CALORI_PREVIEW_COMMIT__.slice(0, 8)}</code></summary>
          {document.documentElement.dataset.keyboardDiagnostics === 'active'
            ? <><button type="button" onClick={() => window.dispatchEvent(new Event('calori-export-geometry'))}>Descargar geometría del teclado</button> · <a href="?">Finalizar diagnóstico</a></>
            : <a href="?diagnostico=teclado">Activar diagnóstico local del teclado</a>}
        </details>
      )}

      {discard && <DiscardDraftDialog onKeep={() => setDiscard(null)} onDiscard={() => { setDiscard(null); discard(); }} />}
      <dialog ref={signOutDialogRef} role="dialog" aria-modal="true" aria-labelledby="signout-title" aria-describedby="signout-description"
        onCancel={event => { if (isSigningOut) event.preventDefault(); }}
        onClick={event => {
          if (!isSigningOut && event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="profile-dialog">
        <div className="profile-dialog-body">
          <h2 id="signout-title" className="profile-section-title">¿Cerrar sesión?</h2>
          <p id="signout-description" className="profile-muted">Vas a salir de tu cuenta en este dispositivo.{(dirty || draftAvatar || newPassword || repeatPassword) && ' Se perderán los cambios sin guardar.'}</p>
          <div className="profile-actions profile-form-actions">
            <button ref={signOutCancelRef} type="button" disabled={isSigningOut} onClick={() => signOutDialogRef.current?.close()}
              className="profile-button profile-button-neutral">
              Cancelar
            </button>
            <button type="button" onClick={handleSignOut} disabled={isSigningOut} aria-busy={isSigningOut}
              className="profile-button profile-button-primary">
              {isSigningOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </button>
          </div>
        </div>
      </dialog>

    </div>
  );
}
