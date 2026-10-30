import { supabase } from './supabase';

export async function deleteUserRecords(): Promise<void> {
  const { data, error } = await supabase.rpc('delete_my_daily_records');
  if (error) throw error;
  if (data !== true) throw new Error('El backend no confirmó el borrado');
}
import type { UserProfile, DailyRecord, MealEntry, WorkoutEntry } from '../types';
import { generateUUID, normalizeActivityLevel } from '../utils/helpers';

// PostgREST can return no error for an UPDATE/DELETE hidden by RLS or a
// concurrently removed row. Require one returned identity before confirming.
function confirmWrite(data: { id: string } | null, error: unknown): void {
  if (error) throw error;
  if (!data?.id) throw new Error('No pudimos confirmar el guardado. Revisá la conexión e intentá de nuevo.');
}

export const fetchUserData = async (userId: string, userEmail?: string): Promise<UserProfile | null> => {
  try {
    let { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('*')
      .or(`id.eq.${userId},user_id.eq.${userId}`)
      .maybeSingle();

    if (pErr) throw pErr;

    if (!profile) {
      const defaultName = userEmail ? userEmail.split('@')[0] : 'Usuario';
      const { data: newProfile, error: insertErr } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          user_id: userId,
          name: defaultName,
          age: 25,
          weight_kg: 70,
          height_cm: 170,
          gender: 'Masculino',
          goal: 'Mantenimiento',
          activity_level: 'Sedentario',
          onboarding_completed: false
        }, { onConflict: 'id', ignoreDuplicates: true })
        .select()
        .maybeSingle();
        
      if (insertErr) throw insertErr;
      profile = newProfile;
      // Another tab may have initialized this profile after our first read.
      // DO NOTHING preserves its settings; read the winning row instead.
      if (!profile) {
        const { data, error } = await supabase.from('profiles').select('*')
          .or(`id.eq.${userId},user_id.eq.${userId}`).single();
        if (error) throw error;
        profile = data;
      }
      if (!profile) throw new Error('No pudimos confirmar el perfil');
    }

    const { data: logs, error: lErr } = await supabase
      .from('daily_logs')
      .select('*, meals(*), workouts(*)')
      .or(`profile_id.eq.${userId},user_id.eq.${userId}`);
      
    if (lErr) throw lErr;

    const recordsMap: Record<string, DailyRecord> = {};
    
    logs.forEach(l => {
       recordsMap[l.date] = {
         dateStr: l.date,
         date: new Date(l.date),
         steps: l.steps,
         water: l.water_ml,
         weight: l.weight,
         meals: (l.meals || []).map((m: any) => ({
           id: m.id, name: m.description, type: m.meal_type, calories: m.calories, time: m.time_str, details: m.meal_details, photo_path: m.photo_path
         })),
         workouts: (l.workouts || []).map((e: any) => ({
           id: e.id, activity: e.activity_name, duration: e.duration_min, calories: e.calories_burned, muscles: [], details: e.workout_details, time: e.time_str, distance: e.distance_km, pace: e.pace_str
         }))
       };
    });

    return {
      id: profile.id,
      user_id: userId,
      avatar_path: profile.avatar_path ?? null,
      onboarding_completed: profile.onboarding_completed !== false,
      name: profile.name,
      age: profile.age,
      sex: profile.gender as any,
      height: profile.height_cm,
      weight: profile.weight_kg,
      goal: profile.goal as any,
      activity: normalizeActivityLevel(profile.activity_level),
      records: recordsMap
    };
  } catch (e) {
    console.error('Supabase fetch error:', e);
    return null;
  }
};

export const fetchDailyLog = async (userId: string, dateStr: string): Promise<DailyRecord | null> => {
  try {
    const { data: l, error } = await supabase
      .from('daily_logs')
      .select('*, meals(*), workouts(*)')
      .eq('user_id', userId)
      .eq('date', dateStr)
      .maybeSingle();

    if (error) throw error;
    if (!l) return null;

    return {
      dateStr: l.date,
      date: new Date(l.date),
      steps: l.steps,
      water: l.water_ml,
      weight: l.weight,
      meals: (l.meals || []).map((m: any) => ({
        id: m.id, name: m.description, type: m.meal_type, calories: m.calories, time: m.time_str, details: m.meal_details, photo_path: m.photo_path
      })),
      workouts: (l.workouts || []).map((e: any) => ({
        id: e.id, activity: e.activity_name, duration: e.duration_min, calories: e.calories_burned, muscles: [], details: e.workout_details, time: e.time_str, distance: e.distance_km, pace: e.pace_str
      }))
    };
  } catch (e) {
    console.error('Fetch daily log error:', e);
    return null;
  }
};

export const syncProfile = async (p: UserProfile) => {
  const { data, error } = await supabase.from('profiles').update({
    name: p.name, 
    age: p.age, 
    gender: p.sex, 
    height_cm: p.height, 
    weight_kg: p.weight, 
    goal: p.goal,
    activity_level: normalizeActivityLevel(p.activity)
  }).or(`id.eq.${p.id},user_id.eq.${p.id}`).select('id').single();
  confirmWrite(data, error);
};

export const syncAvatarPath = async (userId: string, avatarPath: string | null) => {
  const { data, error } = await supabase.from('profiles')
    .update({ avatar_path: avatarPath })
    .or(`id.eq.${userId},user_id.eq.${userId}`)
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('No se pudo actualizar la foto del perfil');
};

export const completeOnboarding = async (userId: string, details: Pick<UserProfile, 'name' | 'age' | 'sex' | 'height' | 'weight'>) => {
  if (!details.name.trim() || !Number.isInteger(details.age) || details.age <= 0 ||
      !['Masculino', 'Femenino'].includes(details.sex) ||
      !Number.isFinite(details.height) || details.height <= 0 || !Number.isFinite(details.weight) || details.weight <= 0) {
    throw new Error('Revisá tus datos personales antes de continuar.');
  }
  const { data, error } = await supabase.from('profiles').update({
    name: details.name.trim(), age: details.age, gender: details.sex,
    height_cm: details.height, weight_kg: details.weight, onboarding_completed: true,
  }).or(`id.eq.${userId},user_id.eq.${userId}`).select('id,onboarding_completed').single();
  if (error) throw error;
  if (data?.onboarding_completed !== true) throw new Error('No pudimos confirmar el guardado. Intentá de nuevo.');
};

export const ensureDailyLog = async (userId: string, record: DailyRecord) => {
  try {
    let { data: log, error: searchErr } = await supabase.from('daily_logs')
      .select('id').eq('user_id', userId).eq('date', record.dateStr).maybeSingle();
    
    if (searchErr) throw searchErr;

    if (!log) {
      const newId = generateUUID();
      const { data, error: insertErr } = await supabase.from('daily_logs').insert({
        id: newId,
        user_id: userId,
        profile_id: userId, 
        date: record.dateStr, 
        steps: record.steps, 
        water_ml: record.water,
        weight: record.weight
      }).select('id').single();
      confirmWrite(data, insertErr);
      return newId;
    } else {
      const { data, error: updateErr } = await supabase.from('daily_logs').update({
        steps: record.steps, water_ml: record.water, weight: record.weight
      }).eq('id', log.id).select('id').single();
      confirmWrite(data, updateErr);
      return log.id;
    }
  } catch (e) {
    console.error('Error ensuring daily log:', e);
    return null;
  }
};

export const syncAddMeal = async (userId: string, logId: string, meal: MealEntry, dateStr: string) => {
  const { data, error } = await supabase.from('meals').insert({
    id: meal.id, 
    user_id: userId,
    daily_log_id: logId, 
    date: dateStr,
    description: meal.name, 
    meal_type: meal.type, 
    calories: meal.calories,
    time_str: meal.time || null,
    meal_details: meal.details || null,
    photo_path: meal.photo_path ?? null
  }).select('id').single();
  confirmWrite(data, error);
};

export const syncDeleteMeal = async (mealId: string) => {
  const { data, error } = await supabase.from('meals').delete().eq('id', mealId).select('id').single();
  confirmWrite(data, error);
};

export const syncAddWorkout = async (userId: string, logId: string, w: WorkoutEntry, dateStr: string) => {
  const { data, error } = await supabase.from('workouts').insert({
    id: w.id, 
    user_id: userId,
    daily_log_id: logId, 
    date: dateStr,
    activity_name: w.activity, 
    duration_min: w.duration, 
    calories_burned: w.calories,
    workout_details: w.details || null,
    time_str: w.time || null,
    distance_km: w.distance || null,
    pace_str: w.pace || null
  }).select('id').single();
  confirmWrite(data, error);
};

export const syncDeleteWorkout = async (wId: string) => {
  const { data, error } = await supabase.from('workouts').delete().eq('id', wId).select('id').single();
  confirmWrite(data, error);
};

export const syncUpdateMeal = async (meal: MealEntry) => {
  const { data, error } = await supabase.from('meals').update({
    description: meal.name, 
    meal_type: meal.type, 
    calories: meal.calories,
    time_str: meal.time || null,
    meal_details: meal.details || null,
    photo_path: meal.photo_path ?? null
  }).eq('id', meal.id).select('id').single();
  confirmWrite(data, error);
};

export const syncUpdateWorkout = async (w: WorkoutEntry) => {
  const { data, error } = await supabase.from('workouts').update({
    activity_name: w.activity, 
    duration_min: w.duration, 
    calories_burned: w.calories,
    workout_details: w.details || null,
    time_str: w.time || null,
    distance_km: w.distance || null,
    pace_str: w.pace || null
  }).eq('id', w.id).select('id').single();
  confirmWrite(data, error);
};
