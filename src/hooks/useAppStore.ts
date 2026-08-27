import { useState, useEffect } from 'react';
import type { UserProfile, DailyRecord } from '../types';
import * as db from '../lib/db';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import type { User } from '@supabase/supabase-js';

export const useAppStore = () => {
  const [user, setUser] = useState<User | null>(null);
  const [activeProfile, setActiveProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Auth & Initial Data Load
  useEffect(() => {
    let isMounted = true;
    
    // Check active session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isMounted) {
        setUser(session?.user ?? null);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        setUser(session?.user ?? null);
        if (!session?.user) {
          setActiveProfile(null); // Clear state on logout
        }
      }
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
      if (!user) return;
      setLoading(true);
      const data = await db.fetchUserData(user.id, user.email);
      if (isMounted && data) {
        setActiveProfile(data);
      }
      if (isMounted) setLoading(false);
    };

    loadProfile();
    return () => { isMounted = false; };
  }, [user]);

  const updateProfile = async (updated: UserProfile) => {
    await db.syncProfile(updated);
    if (user) {
      const refreshed = await db.fetchUserData(user.id, user.email);
      if (refreshed) setActiveProfile(refreshed);
    }
  };

  const updateRecord = async (dateStr: string, record: DailyRecord) => {
    if (!activeProfile || !user) return;
    const oldRecord = activeProfile.records[dateStr] || { meals: [], workouts: [] };

    // Optmistic Update
    setActiveProfile(prev => {
      if (!prev) return prev;
      return { ...prev, records: { ...prev.records, [dateStr]: record } };
    });

    // Supabase Sync
    try {
      const logId = await db.ensureDailyLog(user.id, record);
      if (!logId) return;

      const addedMeals = record.meals.filter(m => !oldRecord.meals?.some((o: any) => o.id === m.id));
      const deletedMeals = oldRecord.meals?.filter((o: any) => !record.meals.some(m => m.id === o.id)) || [];
      
      for (const m of addedMeals) await db.syncAddMeal(user.id, logId, m, dateStr);
      for (const m of deletedMeals) await db.syncDeleteMeal(m.id);

      const addedWorkouts = record.workouts.filter(w => !oldRecord.workouts?.some((o: any) => o.id === w.id));
      const deletedWorkouts = oldRecord.workouts?.filter((o: any) => !record.workouts.some(w => w.id === o.id)) || [];

      for (const w of addedWorkouts) await db.syncAddWorkout(user.id, logId, w, dateStr);
      for (const w of deletedWorkouts) await db.syncDeleteWorkout(w.id);

      // Refresh log directly from DB
      const refreshedLog = await db.fetchDailyLog(user.id, dateStr);
      if (refreshedLog) {
        setActiveProfile(prev => {
          if (!prev) return prev;
          return { ...prev, records: { ...prev.records, [dateStr]: refreshedLog } };
        });
      }

    } catch (e) {
      console.error('Failed to sync record to Supabase', e);
      toast.error('Error al guardar en la nube', { style: { background: '#161b22', color: '#fff' } });
    }
  };

  const resetData = () => {
    if (!activeProfile) return;
    setActiveProfile(prev => {
      if (!prev) return prev;
      return { ...prev, records: {} };
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success('Sesión cerrada', { style: { background: '#161b22', color: '#fff' } });
  };

  return {
    user,
    activeProfile,
    loading,
    updateProfile,
    updateRecord,
    resetData,
    signOut
  };
};
