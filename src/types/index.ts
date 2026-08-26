export type MealType = 'Desayuno' | 'Almuerzo' | 'Merienda' | 'Cena' | 'Snack';
export type Sex = 'Masculino' | 'Femenino';
export type Goal = 'Definición/Pérdida' | 'Mantenimiento' | 'Volumen/Ganancia';

export interface MealEntry {
  id: string;
  name: string;
  type: MealType;
  calories: number;
}

export interface WorkoutEntry {
  id: string;
  activity: string;
  duration: number;
  calories: number;
  muscles: string[]; // optional tags
}

export interface DailyRecord {
  dateStr: string; // Format: YYYY-MM-DD
  date: Date;
  meals: MealEntry[];
  workouts: WorkoutEntry[];
  steps: number;
  water: number; // ml
}

export type DailyRecordsMap = Record<string, DailyRecord>;

export interface UserProfile {
  id: string;
  name: string;
  age: number;
  sex: Sex;
  height: number;
  weight: number;
  goal: Goal;
  records: DailyRecordsMap;
}
