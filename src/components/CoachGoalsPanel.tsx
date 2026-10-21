import { useEffect, useRef, useState } from 'react';
import EntryFormShell from './EntryFormShell';
import CoachGoalCard, { CoachGoalCards } from './CoachGoalCard';
import CoachGoalConfirmation from './CoachGoalConfirmation';
import { CoachGoalsError, confirmCoachGoal } from '../services/coachGoals';
import { goalDates, parseGoalProposal, type CoachGoal, type CoachGoalProposal } from '../utils/coachGoals';
import { goalLabel } from '../utils/coachGoalPresentation';
import type { HabitDay } from '../utils/coachContextContract';
import type { CoachGoalsResource } from '../hooks/useCoachGoals';
import './HomeVariants.css';

export default function CoachGoalsPanel({ resource, history, today, userId, onClose }: {
  resource: CoachGoalsResource; history: HabitDay[]; today: string; userId: string; onClose: () => void;
}) {
  const [editing, setEditing] = useState<CoachGoal | null>(null);
  const [target, setTarget] = useState('');
  const [threshold, setThreshold] = useState('');
  const [proposal, setProposal] = useState<CoachGoalProposal | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const lock = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const reset = () => { setEditing(null); setProposal(null); setError(''); };
  const choose = (goal: CoachGoal, cancel = false) => {
    reset(); setNotice(''); setEditing(goal); setTarget(String(goal.target)); setThreshold(String(goal.stepThreshold ?? ''));
    if (cancel) setProposal({ ...goal, operation: 'cancel', expectedVersion: goal.version });
  };
  const review = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const next = parseGoalProposal({ ...editing, operation: 'update', expectedVersion: editing.version,
      target: Number(target), stepThreshold: editing.type === 'step_days' ? Number(threshold) : null });
    if (!next) { setError('Revisá la meta y el umbral de pasos.'); return; }
    if (next.target === editing.target && next.stepThreshold === editing.stepThreshold) { setError('Ingresá una meta diferente antes de continuar.'); return; }
    setError(''); setProposal(next);
  };
  const stale = editing && (resource.status !== 'ready' || !resource.goals.some(goal => goal.id === editing.id && goal.version === editing.version));
  const confirm = async () => {
    if (!proposal || stale || lock.current) return;
    lock.current = true; setSaving(true); setError('');
    try {
      await confirmCoachGoal(proposal, today, userId);
      if (!mounted.current) return;
      reset(); setNotice(proposal.operation === 'cancel' ? 'Objetivo cancelado.' : 'Objetivo actualizado.');
      await resource.reload();
    } catch (failure) {
      if (!mounted.current) return;
      setError(failure instanceof Error ? failure.message : 'No se pudo guardar el objetivo.');
      if (failure instanceof CoachGoalsError && failure.code === 'goal_conflict') {
        setProposal(null); setEditing(null);
      }
      // Failed reads must clear previous cards, including after a disabled flag or account change.
      await resource.reload();
    } finally { lock.current = false; if (mounted.current) setSaving(false); }
  };
  return <EntryFormShell title="Mis objetivos" onClose={() => { if (!lock.current) onClose(); }} desktopModal>
    <div className="entry-form coach-goals-panel p-4 flex flex-col gap-4" aria-busy={saving}>
      <div className="entry-form-content coach-goals-content">
        {notice && <p role="status">{notice}</p>}
        {error && <p role="alert">{error}</p>}
        {stale ? <><p role="status">El objetivo requiere una nueva consulta antes de confirmar.</p><button type="button" onClick={reset}>Volver a objetivos</button></>
          : editing ? <>
            <CoachGoalCard goal={editing} history={history} today={today} />
            {!proposal ? <form onSubmit={review} className="coach-goal-edit">
              <p>Meta actual: {goalLabel(editing)}. Se conservan el tipo y las fechas.</p>
              <label>Nueva meta ({editing.type === 'workout_sessions' ? 'sesiones' : 'días'})
                <input type="number" inputMode="numeric" min={1} max={editing.type === 'workout_sessions' ? 31 : goalDates(editing).length}
                  step={1} required value={target} onChange={event => setTarget(event.target.value)} />
              </label>
              {editing.type === 'step_days' && <label>Pasos por día
                <input type="number" inputMode="numeric" min={100} max={100000} step={1} required value={threshold} onChange={event => setThreshold(event.target.value)} />
              </label>}
              <div className="coach-goal-actions"><button type="submit">Revisar cambio</button><button type="button" onClick={reset}>Volver</button></div>
            </form> : <>
              {proposal.operation === 'update' && <p>Antes: {goalLabel(editing)}. Nueva meta: {goalLabel({ ...editing, ...proposal })}.</p>}
              <CoachGoalConfirmation proposal={proposal} busy={saving} onConfirm={() => { void confirm(); }} onDismiss={reset} />
            </>}
          </> : resource.status === 'ready' ? <>
            {!resource.goals.length && <p>No tenés objetivos aceptados. Podés proponer uno en Coach y confirmarlo.</p>}
            <div className="coach-goal-list">{resource.goals.map(goal => <CoachGoalCard key={goal.id} goal={goal} history={history} today={today}>
              {goal.status === 'active' && <div className="coach-goal-actions">
                <button type="button" onClick={() => choose(goal)}>Modificar</button>
                <button type="button" onClick={() => choose(goal, true)}>Cancelar objetivo</button>
              </div>}
            </CoachGoalCard>)}</div>
            {resource.hasMore && <p className="coach-goal-note">Hay objetivos anteriores fuera de esta lista. No mostramos todo el historial.</p>}
            <button type="button" onClick={() => { void resource.reload(); }}>Actualizar objetivos</button>
          </> : <CoachGoalCards resource={resource} history={history} today={today} />}
      </div>
    </div>
  </EntryFormShell>;
}
