import type { DailyRecord } from '../types';

export interface RecordWriteFailure {
  kind: 'conflict' | 'ambiguous' | 'session' | 'inactive' | 'invalid' | 'busy';
  message: string;
}

export interface RecordWriteOptions {
  feedback?: 'contextual';
  onFailure?: (failure: RecordWriteFailure) => void;
  /** Canonical data only, after the receipt and reread have both been verified. */
  onConfirmed?: (record: DailyRecord, generation: string) => void;
}

export type RecordWriter = (date: string, record: DailyRecord, options?: RecordWriteOptions) => Promise<boolean>;
