import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CaretDown, CaretUp } from '@phosphor-icons/react';
import Heatmap, { type ActivityHistoryState } from './Heatmap';
import DailyPanel from './DailyPanel';
import WeeklyDateNav from './WeeklyDateNav';
import type { UserProfile } from '../types';
import type { RecordWriter } from '../lib/recordFeedback';
import type { HabitDraftController } from '../lib/habitDraft';
import { formatDateStr } from '../utils/helpers';
import { isHomeDate, normalizeHomePresentation, readHomePresentation, saveHomePresentation } from '../utils/homeDateNavigation';
import './HomeVariants.css';
import './HomeMobile.css';

export interface HomeViewState {
  ownerId?: string;
  dailyDateStr: string;
  history: ActivityHistoryState;
  openedFromHistory: boolean;
}

function useLocalToday() {
  const [today, setToday] = useState(() => formatDateStr(new Date()));
  useEffect(() => {
    let timer: number;
    const schedule = () => {
      window.clearTimeout(timer);
      const now = new Date(), midnight = new Date(now);
      midnight.setHours(24, 0, 0, 100);
      timer = window.setTimeout(refresh, Math.max(1000, midnight.getTime() - now.getTime()));
    };
    const refresh = () => { setToday(formatDateStr(new Date())); schedule(); };
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    schedule();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);
  return today;
}

export default function HomeView({ activeProfile, updateRecord, habitDrafts, viewState, onViewStateChange, onEntryActiveChange }: {
  activeProfile: UserProfile;
  updateRecord: RecordWriter;
  habitDrafts?: HabitDraftController | null;
  viewState?: HomeViewState;
  onViewStateChange?: (state: HomeViewState) => void;
  onEntryActiveChange?: (active: boolean) => void;
}) {
  const ownerId = activeProfile.user_id ?? activeProfile.id;
  const today = useLocalToday();
  const restored = useMemo(() => readHomePresentation(ownerId, today), [ownerId, today]);
  const [ownedState, setOwnedState] = useState(() => ({ ownerId, value: restored }));
  const ownerChanged = ownedState.ownerId !== ownerId;
  // Reset this presentation context before committing a new account's view,
  // even when HomeView is mounted without App's existing account key.
  if (ownerChanged) setOwnedState({ ownerId, value: restored });
  const acceptedView = viewState && (!viewState.ownerId || viewState.ownerId === ownerId) ? viewState : undefined;
  const state = useMemo(() => {
    const candidate = acceptedView && !ownerChanged ? acceptedView : ownerChanged ? restored : ownedState.value;
    const normalized = normalizeHomePresentation(candidate, today);
    // A date validly selected in this mounted account cannot retarget an open
    // writer when the annual history boundary advances at midnight. Restore
    // and every NEW selection still validate against the current range.
    if (!ownerChanged && candidate.dailyDateStr === ownedState.value.dailyDateStr) normalized.dailyDateStr = ownedState.value.dailyDateStr;
    return normalized;
  }, [acceptedView, ownerChanged, restored, ownedState.value, today]);
  const setState = (next: HomeViewState) => {
    const value = normalizeHomePresentation(next, today);
    if (next.dailyDateStr === state.dailyDateStr) value.dailyDateStr = state.dailyDateStr;
    setOwnedState({ ownerId, value });
    onViewStateChange?.({ ...value, ownerId });
  };
  const selectedDateStr = state.dailyDateStr;
  const rootRef = useRef<HTMLDivElement>(null);
  const recordsHeadingRef = useRef<HTMLHeadingElement>(null);
  const bindRecordsHeading = useCallback((element: HTMLHeadingElement | null) => { recordsHeadingRef.current = element; }, []);
  const scrollRequest = useRef<'records' | 'history' | null>(null);
  const [entry, setEntry] = useState({ ownerId, active: false });
  const entryActive = entry.ownerId === ownerId && entry.active;
  const [blockedOwner, setBlockedOwner] = useState<string | null>(null);
  const openDayBlocked = blockedOwner === ownerId;
  const [historyDisclosure, setHistoryDisclosure] = useState({ ownerId, expanded: false });
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 767px)').matches);
  const historyExpanded = !mobile || (historyDisclosure.ownerId === ownerId && historyDisclosure.expanded);
  const historyId = useId();
  const entryActivityChanged = useCallback((active: boolean) => {
    setEntry({ ownerId, active });
    onEntryActiveChange?.(active);
    if (!active) setBlockedOwner(null);
  }, [ownerId, onEntryActiveChange]);
  const records = activeProfile.records || {};

  useEffect(() => { saveHomePresentation(ownerId, state, today); }, [ownerId, state, today]);
  useEffect(() => {
    const query = window.matchMedia?.('(max-width: 767px)');
    if (!query) return;
    const changed = () => setMobile(query.matches);
    changed(); query.addEventListener('change', changed);
    return () => query.removeEventListener('change', changed);
  }, []);

  // Browsing the calendar never changes a writer's date. Opening is explicit,
  // and an existing form/editor keeps its original day until the user closes it.
  const selectDay = (dateStr: string, fromHistory = false) => {
    if (!isHomeDate(dateStr, today)) return;
    if (entryActive && dateStr !== selectedDateStr) { setBlockedOwner(ownerId); return; }
    setBlockedOwner(null);
    if (fromHistory) scrollRequest.current = 'records';
    setState({ ...state, dailyDateStr: dateStr, openedFromHistory: fromHistory });
  };
  const returnToHistory = () => {
    setHistoryDisclosure({ ownerId, expanded: true });
    scrollRequest.current = 'history';
    setState({ ...state, openedFromHistory: false });
  };
  const openCalendar = () => {
    setHistoryDisclosure({ ownerId, expanded: true });
    scrollRequest.current = 'history';
    setState({ ...state, history: { view: 'month', dateStr: selectedDateStr, anchor: selectedDateStr } });
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
  }, [state, historyExpanded]);

  return (
    <div ref={rootRef} className="home-variants dark flex flex-col gap-6 w-full max-w-4xl mx-auto">
      <WeeklyDateNav selectedDateStr={selectedDateStr} today={today} onSelectDate={date => selectDay(date)} onOpenCalendar={openCalendar} />
      {openDayBlocked && <div className="home-date-blocked" role="alert">
        <p>Guardá o cerrá el registro en edición antes de cambiar de día. Tu borrador se conserva.</p>
        <button type="button" onClick={event => { event.stopPropagation(); returnToDraft(); }}>Volver al registro en edición</button>
      </div>}
      <DailyPanel
        key={ownerId}
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
      <div className="home-history">
        <button type="button" className="home-history-toggle" aria-expanded={historyExpanded} aria-controls={historyId}
          onClick={() => setHistoryDisclosure({ ownerId, expanded: !historyExpanded })}>
          <span><strong>Historial y tendencias</strong><small>Explorá tus semanas, meses y años</small></span>
          {historyExpanded ? <CaretUp size={19} aria-hidden="true" /> : <CaretDown size={19} aria-hidden="true" />}
        </button>
        <div id={historyId} className="home-history-content" hidden={!historyExpanded}>
          <Heatmap
            records={records}
            selectedDateStr={selectedDateStr}
            onSelectDate={date => selectDay(date, true)}
            profile={activeProfile}
            historyState={state.history}
            onHistoryStateChange={history => { setBlockedOwner(null); setState({ ...state, history }); }}
            openDayBlocked={openDayBlocked}
            onReturnToDraft={returnToDraft}
          />
        </div>
      </div>
    </div>
  );
}
