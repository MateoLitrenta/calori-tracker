import type { DailyRecord } from '../types';

export const changedEntryDayMessage = 'El día cambió en otro dispositivo o se actualizó después del intento anterior. Revisá tus datos. ¿Aplicar tu cambio sobre el registro actualizado?';

export function snapshotEntryRecord(record: DailyRecord, generation?: string): DailyRecord {
  return { ...record, generation: record.generation ?? generation,
    meals: record.meals.map(meal => ({ ...meal })),
    workouts: record.workouts.map(workout => ({ ...workout })) };
}

export function reviewEntryBase(base: DailyRecord, latest: DailyRecord, generation: string | undefined,
  confirm: () => boolean): DailyRecord | null {
  if (base.dateStr !== latest.dateStr || base.generation !== generation || (base.version ?? null) !== (latest.version ?? null)) {
    return confirm() ? snapshotEntryRecord(latest, generation) : null;
  }
  return base;
}

export interface MealPhotoUploadIntent {
  blob: Blob;
  path: string;
  attempted: boolean;
  uploaded: boolean;
}

interface PhotoStorage {
  upload(path: string, blob: Blob, options: { contentType: string }): PromiseLike<{ error: unknown }>;
  download(path: string): PromiseLike<{ data: Blob | null; error: unknown }>;
}

export async function ensureMealPhotoUploaded(storage: PhotoStorage, intent: MealPhotoUploadIntent): Promise<string> {
  if (intent.uploaded) return intent.path;
  const retry = intent.attempted;
  intent.attempted = true;
  let uploadError: unknown;
  try { uploadError = (await storage.upload(intent.path, intent.blob, { contentType: 'image/jpeg' })).error; }
  catch (error) { uploadError = error; }
  if (uploadError) {
    // A previous upload may have committed before its response was lost. Never
    // overwrite its immutable path; on explicit retry verify its exact bytes.
    if (retry) {
      const existing = await storage.download(intent.path);
      if (!existing.error && existing.data) {
        const [wanted, stored] = await Promise.all([intent.blob.arrayBuffer(), existing.data.arrayBuffer()]);
        const a = new Uint8Array(wanted), b = new Uint8Array(stored);
        if (a.length === b.length && a.every((byte, index) => byte === b[index])) {
          intent.uploaded = true;
          return intent.path;
        }
      }
    }
    throw new Error('No se pudo confirmar la subida de la foto. Tu borrador se conserva.');
  }
  intent.uploaded = true;
  return intent.path;
}
