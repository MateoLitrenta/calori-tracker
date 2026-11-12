import { createContext, createElement, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import type { UserProfile, DailyRecord } from '../types';
import * as db from '../lib/db';
import { supabase } from '../lib/supabase';
import { normalizeActivityLevel } from '../utils/helpers';
import toast from 'react-hot-toast';
import type { User } from '@supabase/supabase-js';
import type { RecordWriteFailure, RecordWriteOptions } from '../lib/recordFeedback';
import { HabitDraftController } from '../lib/habitDraft';

const useAppStoreState = () => {
  const [user, setUser] = useState<User | null>(null);
  const [activeProfile, setActiveProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [avatarRevision, setAvatarRevision] = useState(0);
  const userId = user?.id;
  const userEmail = user?.email;
  const pendingRecordWrites = useRef(new Set<string>());
  const pendingIntents = useRef(new Map<string, db.RecordIntent>());
  const identity = useRef({ userId: null as string | null, epoch: 0 });
  const profileRef = useRef(activeProfile);
  const [habitDrafts] = useState(() => new HabitDraftController(day => ({ dateStr: day,
    date: new Date(day + 'T12:00:00'), meals: [], workouts: [], steps: 0, water: 0, version: null }), async () => false));
  useEffect(() => { profileRef.current = activeProfile; }, [activeProfile]);

  // Auth & Initial Data Load
  useEffect(() => {
    let isMounted = true;
    let sessionUserId: string | null = null;
    let authEventObserved = false;
    const applyUser = (nextUser: User | null) => {
      if (!isMounted) return;
      if (identity.current.userId !== (nextUser?.id ?? null)) {
        identity.current = { userId: nextUser?.id ?? null, epoch: identity.current.epoch + 1 };
        pendingIntents.current.clear();
        habitDrafts.resetOwner();
      }
      if (nextUser && nextUser.id !== sessionUserId) {
        setLoading(true);
        setActiveProfile(null);
      }
      sessionUserId = nextUser?.id ?? null;
      setUser(nextUser);
      if (!nextUser) {
        setActiveProfile(null);
        setLoading(false);
      }
    };
    
    // Check active session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!authEventObserved) applyUser(session?.user ?? null);
    }).catch(() => { if (!authEventObserved) applyUser(null); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventObserved = true;
      applyUser(session?.user ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [habitDrafts]);

  // Fetch profile when user changes
  useEffect(() => {
    let isMounted = true;
    const loadProfile = async () => {
      if (!userId) return;
      const epoch = identity.current.epoch;
      setLoading(true);
      const data = await db.fetchUserData(userId, userEmail);
      if (!isMounted || identity.current.userId !== userId || identity.current.epoch !== epoch) return;
      if (data && data.user_id === userId) {
        setActiveProfile(data);
      }
      setLoading(false);
    };

    loadProfile();
    return () => { isMounted = false; };
  }, [userId, userEmail]);

  useEffect(() => {
    if (!user) return;
    const onAvatarUpdated = (event: Event) => {
      const { userId, path } = (event as CustomEvent<{ userId: string; path: string | null }>).detail;
      if (userId !== user.id) return;
      setActiveProfile(prev => prev?.user_id === userId ? { ...prev, avatar_path: path } : prev);
      setAvatarRevision(value => value + 1);
    };
    window.addEventListener('calori-avatar-updated', onAvatarUpdated);
    return () => window.removeEventListener('calori-avatar-updated', onAvatarUpdated);
  }, [user]);

  const updateProfile = async (updated: UserProfile) => {
    if (!user || !activeProfile || activeProfile.user_id !== user.id ||
        updated.id !== activeProfile.id || updated.user_id !== user.id) throw new Error('No hay un perfil activo');
    await db.syncProfile(updated);
    setActiveProfile(prev => prev && prev.id === updated.id
      ? { ...prev, ...updated, activity: normalizeActivityLevel(updated.activity), records: prev.records,
        recordGeneration: prev.recordGeneration, recordProtocol: prev.recordProtocol }
      : prev);
  };

  const updateAvatarPath = async (path: string | null) => {
    if (!user || !activeProfile || activeProfile.user_id !== user.id) throw new Error('No hay un perfil activo');
    await db.syncAvatarPath(user.id, path);
    window.dispatchEvent(new CustomEvent('calori-avatar-updated', { detail: { userId: user.id, path } }));
  };

  const completeOnboarding = async (details: Pick<UserProfile, 'name' | 'age' | 'sex' | 'height' | 'weight'>) => {
    if (!user || activeProfile?.user_id !== user.id) throw new Error('No hay un perfil activo');
    await db.completeOnboarding(user.id, details);
    setActiveProfile(prev => prev?.user_id === user.id
      ? { ...prev, ...details, name: details.name.trim(), onboarding_completed: true }
      : prev);
  };

  const sameSession = (owner: string, epoch: number) =>
    identity.current.userId === owner && identity.current.epoch === epoch;

  const publishSnapshot = (owner: string, epoch: number, snapshot: db.RecordSnapshot) => {
    if (!sameSession(owner, epoch) || profileRef.current?.user_id !== owner) return false;
    const fields = { records: snapshot.records, recordGeneration: snapshot.generation ?? undefined,
      recordProtocol: snapshot.protocol };
    profileRef.current = { ...profileRef.current, ...fields };
    setActiveProfile(prev => sameSession(owner, epoch) && prev?.user_id === owner ? { ...prev, ...fields } : prev);
    return true;
  };

  const reportRecordFailure = (key: string, failure: RecordWriteFailure, options?: RecordWriteOptions) => {
    options?.onFailure?.(failure);
    if (options?.feedback !== 'contextual') toast.error(failure.message, { id: 'record-write-' + key });
  };

  const persistIntent = async (owner: string, epoch: number, key: string, intent: db.RecordIntent, options?: RecordWriteOptions) => {
    let acknowledged = false;
    try {
      const receipt = await db.commitRecordIntent(owner, intent);
      acknowledged = true;
      const snapshot = await db.fetchRecordSnapshot(owner);
      if (!publishSnapshot(owner, epoch, snapshot)) return false;
      pendingIntents.current.delete(key);
      // A replay acknowledges the original commit, not a promise that no one
      // changed/reset that day afterwards. Never resurrect its old snapshot.
      if ((intent.kind === 'save' && (snapshot.records[intent.date!]?.version !== String(receipt.version) || snapshot.generation !== receipt.generation)) ||
          (intent.kind === 'reset' && snapshot.generation !== receipt.generation)) {
        reportRecordFailure(key, { kind: 'conflict', message: 'El guardado anterior se confirmó, pero los registros cambiaron después. Revisá los datos actualizados antes de continuar.' }, options);
        return false;
      }
      if (intent.kind === 'save' && snapshot.generation) options?.onConfirmed?.(snapshot.records[intent.date!], snapshot.generation);
      return true;
    } catch (error) {
      if (!sameSession(owner, epoch)) return false;
      const failure = error as { kind?: db.RecordFailureKind; message?: string };
      const keepIntent = acknowledged || failure.kind === 'ambiguous' ||
        (intent.mayHaveCommitted && (failure.kind === 'session' || failure.kind === 'inactive'));
      if (keepIntent) intent.mayHaveCommitted = true;
      else pendingIntents.current.delete(key);
      if (failure.kind === 'conflict') {
        try { publishSnapshot(owner, epoch, await db.fetchRecordSnapshot(owner)); } catch { /* Keep the draft and old CAS tokens; do not guess a new baseline. */ }
      }
      reportRecordFailure(key, { kind: keepIntent ? 'ambiguous' : failure.kind ?? 'invalid',
        message: failure.message || 'No pudimos confirmar el guardado. Tu borrador se conserva.' }, options);
      return false;
    }
  };

  const updateRecord = async (dateStr: string, record: DailyRecord, options?: RecordWriteOptions) => {
    const profile = profileRef.current, owner = identity.current.userId, epoch = identity.current.epoch;
    if (!owner || user?.id !== owner || profile?.user_id !== owner || record.dateStr !== dateStr) return false;
    const key = owner + ':' + epoch;
    // Generation also protects reset and other days. Only one local intention
    // is in flight per account; other devices are checked by the server CAS.
    if (pendingRecordWrites.current.has(key)) {
      reportRecordFailure(key, { kind: 'busy', message: 'Hay un guardado en curso. Tu borrador se conserva; esperá a que termine para reintentar.' }, options);
      return false;
    }
    pendingRecordWrites.current.add(key);
    try {
      if (profile.recordProtocol !== 'atomic') {
        publishSnapshot(owner, epoch, await db.fetchRecordSnapshot(owner));
        reportRecordFailure(key, { kind: 'inactive', message: 'El guardado seguro no estaba habilitado. Revisá los datos actualizados antes de reintentar; tu formulario se conserva.' }, options);
        return false;
      }
      const candidate = db.createRecordIntent(record);
      const pending = pendingIntents.current.get(key);
      if (pending && (pending.kind !== 'save' || pending.fingerprint !== candidate.fingerprint)) {
        if (await persistIntent(owner, epoch, key, pending, { ...options, onConfirmed: undefined }))
          reportRecordFailure(key, { kind: 'conflict', message: 'Se confirmó el intento anterior. Tu cambio nuevo todavía no se guardó; revisalo antes de volver a enviarlo.' }, options);
        return false;
      }
      const intent = pending ?? candidate;
      pendingIntents.current.set(key, intent);
      return await persistIntent(owner, epoch, key, intent, options);
    } catch (error) {
      if (sameSession(owner, epoch)) reportRecordFailure(key, { kind: 'invalid',
        message: (error as Error).message || 'No pudimos preparar el guardado. Tu borrador se conserva.' }, options);
      return false;
    } finally { pendingRecordWrites.current.delete(key); }
  };

  const resetData = async () => {
    const owner = identity.current.userId, epoch = identity.current.epoch, profile = profileRef.current;
    if (!owner || user?.id !== owner || profile?.user_id !== owner) throw new Error('No hay una sesión activa');
    const key = owner + ':' + epoch;
    if (pendingRecordWrites.current.has(key)) throw new Error('Hay un guardado en curso. Esperá antes de reiniciar los registros.');
    pendingRecordWrites.current.add(key);
    try {
      if (profile.recordProtocol !== 'atomic') {
        publishSnapshot(owner, epoch, await db.fetchRecordSnapshot(owner));
        throw new Error('El guardado seguro no estaba habilitado. Revisá los datos actualizados antes de confirmar el reinicio.');
      }
      const pending = pendingIntents.current.get(key);
      if (pending && pending.kind !== 'reset') {
        await persistIntent(owner, epoch, key, pending, { feedback: 'contextual' });
        throw new Error('Revisá el guardado anterior antes de confirmar el reinicio.');
      }
      const intent = pending ?? db.createResetIntent(profile.recordGeneration);
      pendingIntents.current.set(key, intent);
      if (!await persistIntent(owner, epoch, key, intent, { feedback: 'contextual' })) throw new Error('No se confirmó el reinicio. Revisá los registros antes de reintentar.');
    } finally { pendingRecordWrites.current.delete(key); }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    toast.success('Sesión cerrada', { style: { background: '#161b22', color: '#fff' } });
  };

  // UI subscriptions can unmount while the account's draft and writer stay alive.
  // Bind callbacks after render; only Auth identity changes clear the owner epoch.
  useEffect(() => {
    habitDrafts.configure(day => {
      const profile = profileRef.current;
      return { ...(profile?.records[day] ?? { dateStr: day, date: new Date(day + 'T12:00:00'), meals: [], workouts: [], steps: 0, water: 0, version: null }),
        generation: profile?.recordGeneration };
    }, updateRecord);
  });
  useEffect(() => {
    if (userId && activeProfile?.user_id === userId) habitDrafts.connect();
    else habitDrafts.dispose();
  }, [habitDrafts, userId, activeProfile?.user_id]);
  useEffect(() => () => habitDrafts.dispose(), [habitDrafts]);

  return {
    user,
    activeProfile,
    avatarRevision,
    loading,
    updateProfile,
    updateAvatarPath,
    completeOnboarding,
    updateRecord,
    habitDrafts,
    resetData,
    signOut
  };
};

// One owner for Auth, profile and records. Calling useAppStore from another
// screen subscribes to this state rather than creating another local copy.
const AppStoreContext = createContext<ReturnType<typeof useAppStoreState> | null>(null);

export const AppStoreProvider = ({ children }: { children: ReactNode }) =>
  createElement(AppStoreContext.Provider, { value: useAppStoreState() }, children);

export const useAppStore = () => {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error('useAppStore debe usarse dentro de AppStoreProvider');
  return store;
};
