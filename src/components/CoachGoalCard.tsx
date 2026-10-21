import type { ReactNode } from 'react';
import type { HabitDay } from '../utils/coachContextContract';
import { evaluateCoachGoal, type CoachGoal } from '../utils/coachGoals';
import type { CoachGoalsResource } from '../hooks/useCoachGoals';
import { goalLabel } from '../utils/coachGoalPresentation';
import './CoachGoals.css';

const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });

export default function CoachGoalCard({ goal, history, today, children }: {
  goal: CoachGoal; history: HabitDay[]; today: string; children?: ReactNode;
}) {
  const progress = evaluateCoachGoal(goal, history, today);
  const percent = progress.registered === null ? null : Math.min(100, Math.round(progress.registered / goal.target * 100));
  const unit = goal.type === 'workout_sessions' ? 'sesiones' : 'días';
  const remainingUnit = progress.remainingToRegister === 1 ? goal.type === 'workout_sessions' ? 'sesión pendiente' : 'día pendiente' : `${unit} pendientes`;
  const state = goal.status === 'cancelled' ? 'Cancelado' : progress.classification === 'history_unavailable' ? 'Progreso no disponible'
    : progress.classification === 'registered_target_reached' ? 'Meta alcanzada'
      : progress.phase === 'ended' ? 'Período finalizado' : progress.phase === 'not_started' ? 'Por empezar' : 'En curso';
  return <article className="coach-goal-card" aria-label={goalLabel(goal)}>
    <div className="coach-goal-top"><span>{goal.type === 'workout_sessions' ? 'Entrenamiento' : 'Pasos'}</span><span className="coach-goal-state">{state}</span></div>
    <h3>{goalLabel(goal)}</h3>
    <p className="coach-goal-period">{dateLabel(goal.startDate)} – {dateLabel(goal.endDate)}</p>
    {progress.registered === null ? <p>No hay registros verificables para evaluar todo este período.</p> : <>
      <div className="coach-goal-count"><strong>{progress.registered}/{goal.target}</strong><span>{unit} con registros · {percent} %</span></div>
      <progress max={100} value={percent!} aria-label={`Progreso de ${goalLabel(goal)}`} />
      <p>{progress.remainingToRegister === 0 ? 'Meta cubierta con tus registros.' : `${progress.remainingToRegister} ${remainingUnit} de registrar.`}</p>
      {progress.unknownDays > 0 && <p className="coach-goal-note">{progress.unknownDays} {progress.unknownDays === 1 ? 'día' : 'días'} sin registros de {goal.type === 'workout_sessions' ? 'entrenamiento' : 'pasos'}. No confirman incumplimiento.</p>}
    </>}
    {progress.phase === 'ended' && state !== 'Período finalizado' && <p className="coach-goal-note">Período finalizado.</p>}
    {children}
  </article>;
}

export function CoachGoalCards({ resource, history, today, type, limit, children }: {
  resource: CoachGoalsResource; history: HabitDay[]; today: string; type?: CoachGoal['type']; limit?: number; children?: ReactNode;
}) {
  if (resource.status === 'loading') return <p role="status">Cargando objetivos…</p>;
  if (resource.status === 'disabled') return <p role="status">Los objetivos persistentes todavía no están habilitados.</p>;
  if (resource.status === 'error') return <div role="alert" className="coach-goal-list"><p>{resource.error}</p><button type="button" onClick={() => { void resource.reload(); }}>Volver a consultar</button></div>;
  const goals = resource.goals.filter(goal => (!limit || goal.status === 'active') && (!type || goal.type === type));
  return <div className="coach-goal-list">
    <p className="coach-goal-note">Progreso actual · registros al {dateLabel(today)}</p>
    {!goals.length && <p>No tenés objetivos {type === 'step_days' ? 'de pasos ' : type === 'workout_sessions' ? 'de entrenamiento ' : ''}aceptados{limit ? ' activos' : ''}.</p>}
    {goals.slice(0, limit).map(goal => <CoachGoalCard key={goal.id} goal={goal} history={history} today={today} />)}
    {(resource.hasMore || (limit && goals.length > limit)) && <p className="coach-goal-note">Mostramos una selección de tus objetivos. Consultá «Mis objetivos» para ver los disponibles.</p>}
    {children}
  </div>;
}
