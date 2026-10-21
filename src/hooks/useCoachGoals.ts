import { useCallback, useEffect, useRef, useState } from 'react';
import { CoachGoalsError, fetchCoachGoals } from '../services/coachGoals';
import type { CoachGoal } from '../utils/coachGoals';

export interface CoachGoalsState {
  ownerId?: string;
  status: 'loading' | 'ready' | 'error' | 'disabled';
  goals: CoachGoal[];
  hasMore: boolean;
  error?: string;
}

export function useCoachGoals(userId?: string) {
  const [state, setState] = useState<CoachGoalsState>({ status: 'loading', goals: [], hasMore: false });
  const request = useRef(0);
  const invalidate = useCallback(() => { request.current++; }, []);
  const reload = useCallback(async () => {
    const sequence = ++request.current;
    if (!userId) return;
    // Mount cleanup can invalidate this request before it publishes any state.
    await Promise.resolve();
    if (request.current !== sequence) return;
    setState({ ownerId: userId, status: 'loading', goals: [], hasMore: false });
    try {
      const result = await fetchCoachGoals(userId);
      if (request.current === sequence) setState({ ...result, ownerId: userId, status: 'ready' });
    } catch (error) {
      if (request.current === sequence) setState({ ownerId: userId, goals: [], hasMore: false,
        status: error instanceof CoachGoalsError && error.code === 'goals_disabled' ? 'disabled' : 'error',
        error: error instanceof Error ? error.message : 'No pudimos consultar tus objetivos.' });
    }
  }, [userId]);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void reload(); });
    const refresh = () => { if (document.visibilityState !== 'hidden') void reload(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      cancelled = true;
      invalidate();
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [reload, invalidate]);
  const current: CoachGoalsState = state.ownerId === userId ? state
    : { ownerId: userId, status: 'loading', goals: [], hasMore: false };
  return { ...current, reload };
}

export type CoachGoalsResource = ReturnType<typeof useCoachGoals>;
