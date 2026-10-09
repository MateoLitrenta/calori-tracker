import { createContext, createElement, useContext, useState, useEffect, type ReactNode } from 'react';
import type { UserProfile, DailyRecord } from '../types';
import * as db from '../lib/db';
import { supabase } from '../lib/supabase';
import { normalizeActivityLevel } from '../utils/helpers';
import toast from 'react-hot-toast';
import type { User } from '@supabase/supabase-js';

const useAppStoreState = () => {
  const [user, setUser] = useState<User | null>(null);
  const [activeProfile, setActiveProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [avatarRevision, setAvatarRevision] = useState(0);
  const userId = user?.id;
  const userEmail = user?.email;

  // Auth & Initial Data Load
  useEffect(() => {
    let isMounted = true;
    let sessionUserId: string | null = null;
    const applyUser = (nextUser: User | null) => {
      if (!isMounted) return;
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
      applyUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Fetch profile when user changes
  useEffect(() => {
    let isMounted = true;
    const loadProfile = async () => {
      if (!userId) return;
      setLoading(true);
      const data = await db.fetchUserData(userId, userEmail);
      if (isMounted && data) {
        setActiveProfile(data);
      }
      if (isMounted) setLoading(false);
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
    await db.syncProfile(updated);
    setActiveProfile(prev => prev && prev.id === updated.id
      ? { ...prev, ...updated, activity: normalizeActivityLevel(updated.activity), records: prev.records }
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

  const updateRecord = async (dateStr: string, record: DailyRecord) => {
    if (!activeProfile || !user || activeProfile.user_id !== user.id) return false;
    const oldRecord = activeProfile.records[dateStr] || { meals: [], workouts: [] };

    // Optimistic update, scoped to the profile that initiated the save.
    setActiveProfile(prev => {
      if (!prev || prev.id !== activeProfile.id || prev.user_id !== user.id) return prev;
      return { ...prev, records: { ...prev.records, [dateStr]: record } };
    });

    // Supabase Sync
    try {
      const logId = await db.ensureDailyLog(user.id, record);
      if (!logId) throw new Error('No se pudo guardar el registro diario');

      const addedMeals = record.meals.filter(m => !oldRecord.meals?.some((o: any) => o.id === m.id));
      const deletedMeals = oldRecord.meals?.filter((o: any) => !record.meals.some(m => m.id === o.id)) || [];
      const modifiedMeals = record.meals.filter(m => {
        const old = oldRecord.meals?.find((o: any) => o.id === m.id);
        return old && JSON.stringify(old) !== JSON.stringify(m);
      });
      
      for (const m of addedMeals) await db.syncAddMeal(user.id, logId, m, dateStr);
      for (const m of deletedMeals) await db.syncDeleteMeal(m.id);
      for (const m of modifiedMeals) await db.syncUpdateMeal(m);

      const addedWorkouts = record.workouts.filter(w => !oldRecord.workouts?.some((o: any) => o.id === w.id));
      const deletedWorkouts = oldRecord.workouts?.filter((o: any) => !record.workouts.some(w => w.id === o.id)) || [];
      const modifiedWorkouts = record.workouts.filter(w => {
        const old = oldRecord.workouts?.find((o: any) => o.id === w.id);
        return old && JSON.stringify(old) !== JSON.stringify(w);
      });

      for (const w of addedWorkouts) await db.syncAddWorkout(user.id, logId, w, dateStr);
      for (const w of deletedWorkouts) await db.syncDeleteWorkout(w.id);
      for (const w of modifiedWorkouts) await db.syncUpdateWorkout(w);

      // Refresh log directly from DB
      const refreshedLog = await db.fetchDailyLog(user.id, dateStr);
      if (refreshedLog) {
        setActiveProfile(prev => {
          if (!prev || prev.id !== activeProfile.id || prev.user_id !== user.id) return prev;
          return { ...prev, records: { ...prev.records, [dateStr]: refreshedLog } };
        });
      }

      return true;
    } catch (e) {
      console.error('Failed to sync record to Supabase', e);
      toast.error('Error al guardar en la nube', { style: { background: '#161b22', color: '#fff' } });
      const saved = await db.fetchDailyLog(user.id, dateStr);
      setActiveProfile(prev => {
        if (!prev || prev.id !== activeProfile.id || prev.user_id !== user.id) return prev;
        const records = { ...prev.records };
        if (saved) records[dateStr] = saved;
        else if (activeProfile.records[dateStr]) records[dateStr] = activeProfile.records[dateStr];
        else delete records[dateStr];
        return { ...prev, records };
      });
      return false;
    }
  };

  const resetData = async () => {
    if (!activeProfile || !user) throw new Error('No hay una sesión activa');
    await db.deleteUserRecords();
    setActiveProfile(prev => {
      if (!prev || prev.id !== activeProfile.id) return prev;
      return { ...prev, records: {} };
    });
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    toast.success('Sesión cerrada', { style: { background: '#161b22', color: '#fff' } });
  };

  return {
    user,
    activeProfile,
    avatarRevision,
    loading,
    updateProfile,
    updateAvatarPath,
    completeOnboarding,
    updateRecord,
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
