import { useState, useEffect } from 'react';
import type { UserProfile, DailyRecord } from '../types';
import { generateMockRecords } from '../utils/mockData';
import { generateUUID } from '../utils/helpers';
import * as db from '../lib/db';
import toast from 'react-hot-toast';

const STORAGE_KEY = 'calori_app_state';

interface AppState {
  profiles: UserProfile[];
  activeProfileId: string;
}

const createDefaultProfile = (): UserProfile => ({
  id: generateUUID(),
  name: 'Usuario',
  age: 25,
  sex: 'Masculino',
  height: 175,
  weight: 70,
  goal: 'Mantenimiento',
  records: {},
});

export const useAppStore = () => {
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        parsed.profiles.forEach((p: UserProfile) => {
          Object.values(p.records).forEach((r: any) => {
            r.date = new Date(r.date);
          });
        });
        return parsed as AppState;
      } catch (e) {
        console.error('Failed to parse local storage', e);
      }
    }
    const defProfile = createDefaultProfile();
    return {
      profiles: [defProfile],
      activeProfileId: defProfile.id,
    };
  });

  // Initial Data Load from Supabase
  useEffect(() => {
    let isMounted = true;
    const initDb = async () => {
      const data = await db.fetchAllData();
      if (isMounted && data && data.length > 0) {
        setState(prev => {
          const exists = data.some(p => p.id === prev.activeProfileId);
          return {
            profiles: data,
            activeProfileId: exists ? prev.activeProfileId : data[0].id
          };
        });
      }
    };
    initDb();
    return () => { isMounted = false; };
  }, []);

  // Sync to LocalStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const activeProfile = state.profiles.find(p => p.id === state.activeProfileId) || state.profiles[0];

  const updateProfile = async (updated: UserProfile) => {
    setState(prev => ({
      ...prev,
      profiles: prev.profiles.map(p => p.id === updated.id ? updated : p)
    }));
    await db.syncProfile(updated);
  };

  const createProfile = async (profile: UserProfile) => {
    setState(prev => ({
      ...prev,
      profiles: [...prev.profiles, profile],
      activeProfileId: profile.id
    }));
    await db.syncProfile(profile);
  };

  const switchProfile = (id: string) => {
    setState(prev => ({ ...prev, activeProfileId: id }));
  };

  const updateRecord = async (dateStr: string, record: DailyRecord) => {
    const profile = state.profiles.find(p => p.id === state.activeProfileId);
    if (!profile) return;
    const oldRecord = profile.records[dateStr] || { meals: [], workouts: [] };

    // Optmistic Update
    setState(prev => ({
      ...prev,
      profiles: prev.profiles.map(p => {
        if (p.id === prev.activeProfileId) {
          return { ...p, records: { ...p.records, [dateStr]: record } };
        }
        return p;
      })
    }));

    // Supabase Sync
    try {
      const logId = await db.ensureDailyLog(profile.id, record);
      if (!logId) return;

      const addedMeals = record.meals.filter(m => !oldRecord.meals?.some((o: any) => o.id === m.id));
      const deletedMeals = oldRecord.meals?.filter((o: any) => !record.meals.some(m => m.id === o.id)) || [];
      
      for (const m of addedMeals) await db.syncAddMeal(logId, m);
      for (const m of deletedMeals) await db.syncDeleteMeal(m.id);

      const addedWorkouts = record.workouts.filter(w => !oldRecord.workouts?.some((o: any) => o.id === w.id));
      const deletedWorkouts = oldRecord.workouts?.filter((o: any) => !record.workouts.some(w => w.id === o.id)) || [];

      for (const w of addedWorkouts) await db.syncAddWorkout(logId, w);
      for (const w of deletedWorkouts) await db.syncDeleteWorkout(w.id);

    } catch (e) {
      console.error('Failed to sync record to Supabase', e);
      toast.error('Error al guardar en la nube', { style: { background: '#161b22', color: '#fff' } });
    }
  };

  const loadMockData = () => {
    const records = generateMockRecords(6);
    setState(prev => ({
      ...prev,
      profiles: prev.profiles.map(p => {
        if (p.id === prev.activeProfileId) {
          return { ...p, records };
        }
        return p;
      })
    }));
    // Note: Mock data is not fully synced to DB to prevent API spam, it will remain in LocalStorage until individual days are updated.
  };

  const resetData = () => {
    setState(prev => ({
      ...prev,
      profiles: prev.profiles.map(p => {
        if (p.id === prev.activeProfileId) {
          return { ...p, records: {} };
        }
        return p;
      })
    }));
  };

  return {
    profiles: state.profiles,
    activeProfile,
    switchProfile,
    updateProfile,
    createProfile,
    updateRecord,
    loadMockData,
    resetData,
  };
};
