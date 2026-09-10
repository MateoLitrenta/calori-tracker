export type MealType = 'Desayuno' | 'Almuerzo' | 'Merienda' | 'Cena' | 'Snack';
export type UserSex = 'Masculino' | 'Femenino';
export type UserGoal = 'Déficit' | 'Mantenimiento' | 'Superávit';
export type ActivityLevel = 'Sedentario' | 'Moderado' | 'Activo';

export interface MealEntry {
  id: string;
  name: string;
  type: MealType;
  calories: number;
  time?: string; // Format: HH:mm
  details?: string;
}

export interface WorkoutEntry {
  id: string;
  activity: string;
  duration: number;
  calories: number;
  muscles: string[]; // optional tags
  details?: string; // routine details
  time?: string; // Format: HH:mm
  distance?: number; // km
  pace?: string; // min/km
}

export interface DailyRecord {
  dateStr: string; // Format: YYYY-MM-DD
  date: Date;
  meals: MealEntry[];
  workouts: WorkoutEntry[];
  steps: number;
  water: number; // ml
  weight?: number; // kg
}

export type DailyRecordsMap = Record<string, DailyRecord>;

export interface UserProfile {
  id: string;
  user_id?: string;
  name: string;
  age: number;
  sex: UserSex;
  height: number;
  weight: number;
  goal: UserGoal;
  activity?: ActivityLevel;
  records: DailyRecordsMap;
  created_at?: string;
}
