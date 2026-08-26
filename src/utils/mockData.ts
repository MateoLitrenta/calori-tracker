import { addDays, subDays, startOfWeek, endOfWeek } from 'date-fns';
import type { DailyRecordsMap, MealType } from '../types';
import { formatDateStr, generateUUID } from './helpers';

export const generateMockRecords = (months: number): DailyRecordsMap => {
  const records: DailyRecordsMap = {};
  const today = new Date();
  const startDate = startOfWeek(subDays(today, months * 30), { weekStartsOn: 0 }); // Sunday
  const endDate = endOfWeek(today, { weekStartsOn: 0 }); // Saturday

  const daysToGenerate = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const mealTypes: MealType[] = ['Desayuno', 'Almuerzo', 'Merienda', 'Cena', 'Snack'];

  for (let i = 0; i < daysToGenerate; i++) {
    const date = addDays(startDate, i);
    const dateStr = formatDateStr(date);
    
    // Only generate data up to today
    if (date <= today) {
      const hasData = Math.random() > 0.15; // 85% chance of data
      
      if (hasData) {
        // Random amount of meals (2 to 5)
        const mealsCount = Math.floor(Math.random() * 4) + 2;
        const meals = Array.from({ length: mealsCount }).map(() => ({
          id: generateUUID(),
          name: `Comida`,
          type: mealTypes[Math.floor(Math.random() * mealTypes.length)],
          calories: Math.floor(Math.random() * 600) + 200, // 200 - 800
        }));

        // Workouts (0 to 2)
        const workoutsCount = Math.random() > 0.6 ? 1 : (Math.random() > 0.9 ? 2 : 0);
        const workouts = Array.from({ length: workoutsCount }).map(() => ({
          id: generateUUID(),
          activity: 'Entrenamiento',
          duration: Math.floor(Math.random() * 60) + 30, // 30 - 90 mins
          calories: Math.floor(Math.random() * 400) + 200, // 200 - 600
          muscles: ['General'],
        }));

        records[dateStr] = {
          dateStr,
          date,
          meals,
          workouts,
          steps: Math.floor(Math.random() * 10000) + 2000, // 2000 - 12000
          water: Math.floor(Math.random() * 2000) + 1000, // 1000 - 3000 ml
        };
      } else {
        records[dateStr] = {
          dateStr,
          date,
          meals: [],
          workouts: [],
          steps: 0,
          water: 0,
        };
      }
    } else {
      // Future dates empty
      records[dateStr] = {
        dateStr,
        date,
        meals: [],
        workouts: [],
        steps: 0,
        water: 0,
      };
    }
  }

  return records;
};
