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

    const snapshot = await fetchRecordSnapshot(userId, true);
    const recordsMap = snapshot.records;

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
      records: recordsMap,
      recordGeneration: snapshot.generation ?? undefined,
      recordProtocol: snapshot.protocol,
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

export type RecordProtocol = 'unavailable' | 'prepared' | 'atomic' | 'read_only';
export interface RecordSnapshot {
  protocol: RecordProtocol;
  generation: string | null;
  records: Record<string, DailyRecord>;
}
export type RecordFailureKind = 'conflict' | 'ambiguous' | 'session' | 'inactive' | 'invalid';
export class RecordPersistenceError extends Error {
  kind: RecordFailureKind;
  constructor(kind: RecordFailureKind, message: string) { super(message); this.name = 'RecordPersistenceError'; this.kind = kind; }
}
export interface RecordReceipt { operation_id: string; generation: string; day_id?: string; version?: string }
export interface RecordIntent {
  mayHaveCommitted?: boolean;
  operationId: string;
  kind: 'save' | 'reset';
  generation: string;
  date?: string;
  expectedVersion?: string | null;
  payload?: ReturnType<typeof recordPayload>;
  fingerprint: string;
}
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const versionPattern = /^[1-9][0-9]*$/;
const unavailableMessage = 'El guardado seguro todavía no está habilitado. Tus datos siguen en el formulario.';

/** Array order is not an entry identity. Canonical ordering keeps explicit retries identical. */
export function recordPayload(record: DailyRecord) {
  return {
    steps: record.steps, water_ml: record.water, weight: record.weight ?? null,
    meals: record.meals.map(m => ({ id: m.id, description: m.name, meal_type: m.type,
      calories: m.calories, time_str: m.time ?? null, meal_details: m.details ?? null,
      photo_path: m.photo_path ?? null })).sort((a, b) => a.id.localeCompare(b.id)),
    workouts: record.workouts.map(w => ({ id: w.id, activity_name: w.activity,
      duration_min: w.duration, calories_burned: w.calories, workout_details: w.details ?? null,
      time_str: w.time ?? null, distance_km: w.distance ?? null, pace_str: w.pace ?? null
    })).sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function mapRecord(row: any, generation: string | null): DailyRecord {
  return {
    dateStr: row.date, date: new Date(row.date), version: row.version == null ? null : String(row.version),
    generation: generation ?? undefined, steps: row.steps, water: row.water_ml, weight: row.weight,
    meals: (row.meals ?? []).map((m: any) => ({ id: m.id, name: m.description, type: m.meal_type,
      calories: m.calories, time: m.time_str, details: m.meal_details, photo_path: m.photo_path })),
    workouts: (row.workouts ?? []).map((w: any) => ({ id: w.id, activity: w.activity_name,
      duration: w.duration_min, calories: w.calories_burned, muscles: [], details: w.workout_details,
      time: w.time_str, distance: w.distance_km, pace: w.pace_str })),
  };
}

/** Bind the request to the initiating session: an account change cannot send A's draft with B's JWT. */
async function ownedRpc(userId: string, name: string, args: Record<string, unknown>) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token || session.user.id !== userId)
    throw new RecordPersistenceError('session', 'La sesión cambió o venció. Volvé a iniciar sesión antes de guardar.');
  const { data: { user }, error } = await supabase.auth.getUser(session.access_token);
  if (error || user?.id !== userId)
    throw new RecordPersistenceError('session', 'No pudimos validar tu sesión. Tus datos siguen en el formulario.');
  return supabase.rpc(name, args).setHeader('Authorization', 'Bearer ' + session.access_token)
    .abortSignal(AbortSignal.timeout(20000));
}

function rpcFailure(error: any, status?: number): RecordPersistenceError {
  if (error?.code === 'PT409' || error?.code === '40001')
    return new RecordPersistenceError('conflict', 'Los registros cambiaron en otra pestaña o dispositivo. Se actualizaron los datos; revisá tu borrador antes de volver a guardar.');
  if (error?.code === 'PT503' || error?.code === 'PGRST202')
    return new RecordPersistenceError('inactive', unavailableMessage);
  if (['28000', 'PGRST301', 'PGRST302', 'PGRST303'].includes(error?.code) || status === 401)
    return new RecordPersistenceError('session', 'La sesión venció. Tus datos siguen en el formulario.');
  if (!status || status >= 500 || status === 408)
    return new RecordPersistenceError('ambiguous', 'No pudimos confirmar el guardado. Reintentá: se conservará el mismo intento para evitar duplicados.');
  return new RecordPersistenceError('invalid', 'No se pudo guardar el registro completo. Revisá los datos; tu borrador se conserva.');
}

/** Read fallback is deliberately read-only; there is never a legacy write fallback. */
export async function fetchRecordSnapshot(userId: string, allowLegacyRead = false): Promise<RecordSnapshot> {
  const response = await ownedRpc(userId, 'calori_record_snapshot_v1', {});
  if (response.error) {
    if (allowLegacyRead && response.error.code === 'PGRST202') {
      const { data, error } = await supabase.from('daily_logs').select('*, meals(*), workouts(*)')
        .or(`profile_id.eq.${userId},user_id.eq.${userId}`);
      if (error) throw error;
      return { protocol: 'unavailable', generation: null,
        records: Object.fromEntries((data ?? []).map((row: any) => [row.date, mapRecord(row, null)])) };
    }
    throw rpcFailure(response.error, response.status);
  }
  const snapshot = response.data;
  if (!snapshot || !['prepared', 'atomic', 'read_only'].includes(snapshot.protocol) ||
      typeof snapshot.generation !== 'string' || !uuidPattern.test(snapshot.generation) || !Array.isArray(snapshot.records))
    throw new RecordPersistenceError('invalid', 'La respuesta del registro no es válida. No se confirmó ningún guardado.');
  const records: Record<string, DailyRecord> = {};
  for (const row of snapshot.records) {
    if (row.user_id !== userId || typeof row.version !== 'string' || !versionPattern.test(row.version) || typeof row.date !== 'string' ||
        !Array.isArray(row.meals) || !Array.isArray(row.workouts) ||
        [...row.meals, ...row.workouts].some((child: any) => child.user_id !== userId || child.daily_log_id !== row.id))
      throw new RecordPersistenceError('invalid', 'No pudimos verificar los registros del usuario activo.');
    records[row.date] = mapRecord(row, snapshot.generation);
  }
  return { protocol: snapshot.protocol, generation: snapshot.generation, records };
}

export function createRecordIntent(record: DailyRecord): RecordIntent {
  if (typeof record.generation !== 'string' || !uuidPattern.test(record.generation) ||
      (record.version != null && (typeof record.version !== 'string' || !versionPattern.test(record.version))))
    throw new RecordPersistenceError('inactive', unavailableMessage);
  const payload = recordPayload(record);
  return { kind: 'save', operationId: crypto.randomUUID(), date: record.dateStr,
    expectedVersion: record.version ?? null, generation: record.generation, payload,
    fingerprint: JSON.stringify({ date: record.dateStr, payload }) };
}
export function createResetIntent(generation?: string): RecordIntent {
  if (typeof generation !== 'string' || !uuidPattern.test(generation)) throw new RecordPersistenceError('inactive', unavailableMessage);
  return { kind: 'reset', operationId: crypto.randomUUID(), generation, fingerprint: 'reset' };
}

/** At most one automatic replay, always the identical durable operation ID and parameters. */
export async function commitRecordIntent(userId: string, intent: RecordIntent): Promise<RecordReceipt> {
  let uncertain = intent.mayHaveCommitted === true;
  for (let attempt = 0; attempt < 2; attempt++) {
    let response;
    try {
      response = await ownedRpc(userId, intent.kind === 'save' ? 'calori_save_daily_record_v1' : 'calori_reset_daily_records_v1',
        intent.kind === 'save' ? { p_operation_id: intent.operationId, p_date: intent.date,
          p_expected_version: intent.expectedVersion, p_generation: intent.generation, p_day: intent.payload }
          : { p_operation_id: intent.operationId, p_generation: intent.generation });
    } catch (error) {
      if (error instanceof RecordPersistenceError && !uncertain) throw error;
      uncertain = true;
      intent.mayHaveCommitted = true;
      if (attempt === 0) continue;
      throw rpcFailure(error);
    }
    if (response.error) {
      const failure = rpcFailure(response.error, response.status);
      // Auth rejection happens before ledger lookup; it cannot disprove a
      // previous attempt whose response was lost.
      if (uncertain && (failure.kind === 'session' || response.error.code === 'PGRST202' || response.error.code === '42501'))
        throw rpcFailure(null);
      if (failure.kind === 'ambiguous') { uncertain = true; intent.mayHaveCommitted = true; }
      if (failure.kind === 'ambiguous' && attempt === 0) continue;
      throw failure;
    }
    const receipt = response.data;
    intent.mayHaveCommitted = true;
    if (!receipt || receipt.operation_id !== intent.operationId || typeof receipt.generation !== 'string' || !uuidPattern.test(receipt.generation) ||
        (intent.kind === 'save' && (typeof receipt.day_id !== 'string' || !uuidPattern.test(receipt.day_id) ||
          typeof receipt.version !== 'string' || !versionPattern.test(receipt.version))))
      throw new RecordPersistenceError('ambiguous', 'El servidor no devolvió una confirmación válida. Reintentá el mismo guardado.');
    return receipt;
  }
  throw new RecordPersistenceError('ambiguous', 'No pudimos confirmar el guardado. Tu borrador se conserva.');
}
