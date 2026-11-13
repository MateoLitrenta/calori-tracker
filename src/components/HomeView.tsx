import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import Heatmap, { type ActivityHistoryState } from './Heatmap';
import DailyPanel from './DailyPanel';
import type { UserProfile } from '../types';
import type { RecordWriter } from '../lib/recordFeedback';
import type { HabitDraftController } from '../lib/habitDraft';
import { formatDateStr } from '../utils/helpers';
import './HomeVariants.css';

export interface HomeViewState {
  dailyDateStr: string;
  history: ActivityHistoryState;
  openedFromHistory: boolean;
}

export default function HomeView({ activeProfile, updateRecord, habitDrafts, viewState, onViewStateChange, onEntryActiveChange }: {
  activeProfile: UserProfile;
  updateRecord: RecordWriter;
  habitDrafts?: HabitDraftController | null;
  viewState?: HomeViewState;
  onViewStateChange?: (state: HomeViewState) => void;
  onEntryActiveChange?: (active: boolean) => void;
}) {
  const [localState, setLocalState] = useState<HomeViewState>(() => {
    const today = formatDateStr(new Date());
    return { dailyDateStr: today, history: { view: 'month', dateStr: today, anchor: today }, openedFromHistory: false };
  });
  const state = viewState ?? localState;
  const setState = onViewStateChange ?? setLocalState;
  const selectedDateStr = state.dailyDateStr;
  const rootRef = useRef<HTMLDivElement>(null);
  const recordsHeadingRef = useRef<HTMLHeadingElement>(null);
  const bindRecordsHeading = useCallback((element: HTMLHeadingElement | null) => { recordsHeadingRef.current = element; }, []);
  const scrollRequest = useRef<'records' | 'history' | null>(null);
  const [entryActive, setEntryActive] = useState(false);
  const [openDayBlocked, setOpenDayBlocked] = useState(false);
  const entryActivityChanged = useCallback((active: boolean) => {
    setEntryActive(active);
    onEntryActiveChange?.(active);
    if (!active) setOpenDayBlocked(false);
  }, [onEntryActiveChange]);
  const records = activeProfile.records || {};

  // Browsing the calendar never changes a writer's date. Opening is explicit,
  // and an existing form/editor keeps its original day until the user closes it.
  const openDay = (dateStr: string) => {
    if (entryActive && dateStr !== selectedDateStr) { setOpenDayBlocked(true); return; }
    setOpenDayBlocked(false);
    scrollRequest.current = 'records';
    setState({ ...state, dailyDateStr: dateStr, openedFromHistory: true });
  };
  const returnToHistory = () => {
    scrollRequest.current = 'history';
    setState({ ...state, openedFromHistory: false });
  };
  const returnToDraft = () => {
    const field = rootRef.current?.querySelector<HTMLElement>('form textarea, form input, form button, .daily-habits input');
    field?.scrollIntoView?.({ block: 'center', behavior: 'instant' });
    field?.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    if (!scrollRequest.current) return;
    const target = scrollRequest.current === 'records' ? recordsHeadingRef.current
      : rootRef.current?.querySelector<HTMLElement>('[data-history-root]');
    scrollRequest.current = null;
    target?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
    target?.focus({ preventScroll: true });
  }, [state]);

  return (
    <div ref={rootRef} className="home-variants dark flex flex-col gap-6 w-full max-w-4xl mx-auto">
      <DailyPanel
        record={records[selectedDateStr]}
        dateStr={selectedDateStr}
        onUpdateRecord={updateRecord}
        profile={activeProfile}
        records={records}
        habitDrafts={habitDrafts}
        onRecordsHeadingReady={bindRecordsHeading}
        onEntryActiveChange={entryActivityChanged}
        onReturnToHistory={state.openedFromHistory ? returnToHistory : undefined}
      />
      <Heatmap
        records={records}
        selectedDateStr={selectedDateStr}
        onSelectDate={openDay}
        profile={activeProfile}
        historyState={state.history}
        onHistoryStateChange={history => { setOpenDayBlocked(false); setState({ ...state, history }); }}
        openDayBlocked={openDayBlocked}
        onReturnToDraft={returnToDraft}
      />
    </div>
  );
}
