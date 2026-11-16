import type { CoachGoalProposal } from '../utils/coachGoals';

export default function CoachGoalConfirmation({ proposal, busy, onConfirm, onDismiss }: {
  proposal: CoachGoalProposal; busy: boolean; onConfirm: () => void; onDismiss: () => void;
}) {
  return <div className="chat-confirmation coach-goal-confirmation order-last"
    role="group" aria-label="Confirmación de objetivo">
    <p className="coach-goal-confirmation-title">{proposal.operation === 'cancel' ? 'Cancelar objetivo aceptado'
      : proposal.operation === 'update' ? 'Modificar objetivo aceptado' : 'Objetivo propuesto'}</p>
    <p>{proposal.type === 'workout_sessions' ? `${proposal.target} sesiones de entrenamiento`
      : `${proposal.target} días con al menos ${proposal.stepThreshold!.toLocaleString('es-AR')} pasos registrados`}</p>
    <p className="mb-3">Del {proposal.startDate} al {proposal.endDate}.</p>
    {proposal.type === 'workout_sessions' && <p className="mb-3">Cuenta todas las sesiones de entrenamiento registradas del período.</p>}
    <p className="mb-3">{proposal.operation === 'cancel' ? 'Dejarás de seguir este objetivo.'
      : 'Solo se guarda al confirmar. No registra actividades ni cambia tu perfil.'}</p>
    <div className="coach-goal-actions">
      <button type="button" disabled={busy} onClick={onConfirm} className="chat-goal-confirm">
        {proposal.operation === 'cancel' ? 'Confirmar cancelación' : proposal.operation === 'update' ? 'Confirmar modificación' : 'Aceptar objetivo'}
      </button>
      <button type="button" disabled={busy} onClick={onDismiss} className="chat-secondary">Descartar propuesta</button>
    </div>
  </div>;
}
