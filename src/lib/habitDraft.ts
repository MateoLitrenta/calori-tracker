import type { DailyRecord } from '../types';
import type { RecordWriteFailure, RecordWriter } from './recordFeedback';
import { snapshotEntryRecord } from './entrySubmission.ts';

type Field = 'steps' | 'water';
type Status = 'editing' | 'saving' | 'saved' | 'unconfirmed' | 'conflict';
interface Draft {
  base: DailyRecord;
  values: Pick<DailyRecord, Field>;
  dirty: Set<Field>;
  status: Status;
  lastEdit: number;
  retry: DailyRecord | null;
  failure?: RecordWriteFailure;
}
export const sameHabitVersion = (a: DailyRecord, b: DailyRecord) =>
  a.dateStr === b.dateStr && a.generation === b.generation && (a.version ?? null) === (b.version ?? null);

/** One local writer for both controls. Server CAS and operation receipts remain authoritative. */
export class HabitDraftController {
  private read: (date: string) => DailyRecord;
  private save: RecordWriter;
  private changed: () => void;
  private drafts = new Map<string, Draft>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private disposed = false;
  private listeners = new Set<() => void>();
  private epoch = 0;

  constructor(read: (date: string) => DailyRecord, save: RecordWriter, changed: () => void = () => {}) {
    this.read = read; this.save = save;
    this.changed = () => { changed(); this.listeners.forEach(listener => listener()); };
  }

  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  configure(read: (date: string) => DailyRecord, save: RecordWriter) { this.read = read; this.save = save; }

  view(date: string, canonical?: DailyRecord) {
    const current = canonical ?? this.read(date), draft = this.drafts.get(date);
    return { steps: draft?.dirty.has('steps') ? draft.values.steps : current.steps,
      water: draft?.dirty.has('water') ? draft.values.water : current.water,
      status: draft?.status, failure: draft?.failure };
  }

  begin(date: string) {
    const previous = this.drafts.get(date);
    if (this.disposed || (previous && previous.status !== 'saved')) return;
    const base = snapshotEntryRecord(this.read(date));
    this.drafts.set(date, { base, values: { steps: base.steps, water: base.water }, dirty: new Set(),
      status: 'editing', lastEdit: Date.now(), retry: null });
    this.changed();
  }

  set(date: string, field: Field, value: number) {
    if (this.disposed) return;
    if (value === this.view(date)[field]) {
      const unchanged = this.drafts.get(date);
      if (unchanged?.status === 'editing' && !unchanged.dirty.size) { this.drafts.delete(date); this.changed(); }
      return;
    }
    let draft = this.drafts.get(date);
    if (!draft || (draft.status === 'saved' && draft.dirty.size === 0)) {
      const base = snapshotEntryRecord(this.read(date));
      draft = { base, values: { steps: base.steps, water: base.water }, dirty: new Set(),
        status: 'editing', lastEdit: Date.now(), retry: null };
      this.drafts.set(date, draft);
    }
    draft.values[field] = Math.max(0, value);
    draft.dirty.add(field); draft.lastEdit = Date.now();
    if (draft.status !== 'saving' && draft.status !== 'conflict' && draft.status !== 'unconfirmed') draft.status = 'editing';
    this.changed(); this.schedule();
  }

  add(date: string, field: Field, amount: number) { this.set(date, field, Math.max(0, this.view(date)[field] + amount)); }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.disposed || this.running) return;
    const next = [...this.drafts.entries()].find(([, draft]) => draft.status === 'editing' && draft.dirty.size);
    if (next) this.timer = setTimeout(() => { this.timer = null; void this.flush(next[0]); },
      Math.max(0, 400 - (Date.now() - next[1].lastEdit)));
  }

  private async flush(date: string, retry = false) {
    const draft = this.drafts.get(date);
    if (!draft || this.running || this.disposed) return;
    const epoch = this.epoch;
    const current = this.read(date);
    if (!(retry && draft.failure?.kind === 'ambiguous') && !sameHabitVersion(draft.base, current)) {
      draft.status = 'conflict'; draft.failure = { kind: 'conflict',
        message: 'El día cambió después de empezar tu edición. Revisá los valores guardados antes de aplicar tu borrador.' };
      this.changed(); this.schedule(); return;
    }
    const candidate = retry && draft.failure?.kind === 'ambiguous' && draft.retry ? draft.retry : { ...snapshotEntryRecord(draft.base),
      ...(draft.dirty.has('steps') ? { steps: draft.values.steps } : {}),
      ...(draft.dirty.has('water') ? { water: draft.values.water } : {}) };
    this.running = true; draft.status = 'saving'; draft.failure = undefined;
    draft.retry = snapshotEntryRecord(candidate); this.changed();
    const acknowledgement: { record: DailyRecord | null } = { record: null };
    let failure: RecordWriteFailure | undefined;
    try {
      const saved = await this.save(date, candidate, { feedback: 'contextual',
        onFailure: value => { failure = value; },
        onConfirmed: (record, generation) => { acknowledgement.record = snapshotEntryRecord(record, generation); } });
      if (this.disposed || epoch !== this.epoch) return;
      const confirmed = acknowledgement.record;
      // Never derive a new version from a boolean or an optimistic UI value.
      if (saved && confirmed) {
        draft.base = confirmed; draft.retry = null;
        for (const field of ['steps', 'water'] as const) {
          if (!draft.dirty.has(field)) draft.values[field] = confirmed[field];
          if (draft.values[field] === confirmed[field]) draft.dirty.delete(field);
        }
        draft.status = draft.dirty.size ? 'editing' : 'saved';
      } else {
        draft.failure = failure ?? { kind: 'ambiguous', message: 'No pudimos confirmar el guardado. Tu borrador se conserva.' };
        draft.status = draft.failure.kind === 'conflict' ? 'conflict' : 'unconfirmed';
        if (draft.status === 'conflict') draft.retry = null;
      }
    } catch {
      if (!this.disposed && epoch === this.epoch) { draft.status = 'unconfirmed'; draft.failure = { kind: 'ambiguous',
        message: 'No pudimos confirmar el guardado. Tu borrador se conserva.' }; }
    } finally {
      if (epoch === this.epoch) {
        this.running = false;
        if (!this.disposed) { this.changed(); this.schedule(); }
      }
    }
  }

  retry(date: string) { if (this.drafts.get(date)?.status === 'unconfirmed') void this.flush(date, true); }

  review(date: string, displayed: DailyRecord) {
    const draft = this.drafts.get(date);
    if (!draft || draft.status !== 'conflict') return false;
    if (!sameHabitVersion(displayed, this.read(date))) {
      draft.failure = { kind: 'conflict', message: 'El día volvió a cambiar. Revisá nuevamente los valores actualizados.' };
      this.changed(); return false;
    }
    draft.base = snapshotEntryRecord(displayed); draft.retry = null; draft.failure = undefined;
    draft.status = 'editing'; draft.lastEdit = Date.now();
    this.changed(); this.schedule(); return true;
  }

  discard(date: string) {
    // An uncertain commit must be reconciled, never discarded as though it could not have happened.
    if (this.drafts.get(date)?.status !== 'conflict') return;
    this.drafts.delete(date); this.changed(); this.schedule();
  }

  connect() { this.disposed = false; this.schedule(); }
  dispose() { this.disposed = true; if (this.timer) clearTimeout(this.timer); this.timer = null; }
  resetOwner() {
    this.epoch++; this.dispose(); this.running = false; this.drafts.clear(); this.changed();
  }
}
