import { supabase } from './supabase';
import type { UserProfile, DailyRecord, MealEntry, WorkoutEntry } from '../types';
import { generateUUID } from '../utils/helpers';

export const fetchUserData = async (userId: string, userEmail?: string): Promise<UserProfile | null> => {
  try {
    let { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('*')
      .or(`id.eq.${userId},user_id.eq.${userId}`)
      .maybeSingle();

    if (pErr) throw pErr;

    if (!profile) {
      // Auto-crear perfil si no existe
      const defaultName = userEmail ? userEmail.split('@')[0] : 'Usuario';
      const { data: newProfile, error: insertErr } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          user_id: userId,
          name: defaultName,
          age: 25,
          weight_kg: 70,
          height_cm: 170,
          gender: 'Masculino',
          goal: 'Mantenimiento'
        })
        .select()
        .single();
        
      if (insertErr) throw insertErr;
      profile = newProfile;
    }

    const { data: logs, error: lErr } = await supabase.from('daily_logs').select('*, meals(*), exercises(*)').eq('profile_id', userId);
    if (lErr) throw lErr;

    const recordsMap: Record<string, DailyRecord> = {};
    
    logs.forEach(l => {
       recordsMap[l.date] = {
         dateStr: l.date,
         date: new Date(l.date),
         steps: l.steps,
         water: l.water_ml,
         meals: l.meals.map((m: any) => ({
           id: m.id, name: m.description, type: m.meal_type, calories: m.calories
         })),
         workouts: l.exercises.map((e: any) => ({
           id: e.id, activity: e.activity_name, duration: e.duration_min, calories: e.calories_burned, muscles: []
         }))
       };
    });

    return {
      id: profile.id,
      name: profile.name,
      age: profile.age,
      sex: profile.gender as any,
      height: profile.height_cm,
      weight: profile.weight_kg,
      goal: profile.goal as any,
      records: recordsMap
    };
  } catch (e) {
    console.error('Supabase fetch error:', e);
    return null;
  }
};

export const syncProfile = async (p: UserProfile) => {
  const { error } = await supabase.from('profiles').update({
    name: p.name, 
    age: p.age, 
    gender: p.sex, 
    height_cm: p.height, 
    weight_kg: p.weight, 
    goal: p.goal
  }).or(`id.eq.${p.id},user_id.eq.${p.id}`);
  
  if (error) {
    console.error('Error syncing profile:', error);
    throw error;
  }
};

export const ensureDailyLog = async (profileId: string, record: DailyRecord) => {
  try {
    let { data: log, error: searchErr } = await supabase.from('daily_logs')
      .select('id').eq('profile_id', profileId).eq('date', record.dateStr).maybeSingle();
    
    if (searchErr) throw searchErr;

    if (!log) {
      const newId = generateUUID();
      const { error: insertErr } = await supabase.from('daily_logs').insert({
        id: newId,
        profile_id: profileId, 
        date: record.dateStr, 
        steps: record.steps, 
        water_ml: record.water
      });
      if (insertErr) throw insertErr;
      return newId;
    } else {
      const { error: updateErr } = await supabase.from('daily_logs').update({
        steps: record.steps, water_ml: record.water
      }).eq('id', log.id);
      if (updateErr) throw updateErr;
      return log.id;
    }
  } catch (e) {
    console.error('Error ensuring daily log:', e);
    return null;
  }
};

export const syncAddMeal = async (logId: string, meal: MealEntry) => {
  const { error } = await supabase.from('meals').insert({
    id: meal.id, daily_log_id: logId, description: meal.name, meal_type: meal.type, calories: meal.calories
  });
  if (error) console.error('Error adding meal:', error);
};

export const syncDeleteMeal = async (mealId: string) => {
  const { error } = await supabase.from('meals').delete().eq('id', mealId);
  if (error) console.error('Error deleting meal:', error);
};

export const syncAddWorkout = async (logId: string, w: WorkoutEntry) => {
  const { error } = await supabase.from('exercises').insert({
    id: w.id, daily_log_id: logId, activity_name: w.activity, duration_min: w.duration, calories_burned: w.calories
  });
  if (error) console.error('Error adding workout:', error);
};

export const syncDeleteWorkout = async (wId: string) => {
  const { error } = await supabase.from('exercises').delete().eq('id', wId);
  if (error) console.error('Error deleting workout:', error);
};
