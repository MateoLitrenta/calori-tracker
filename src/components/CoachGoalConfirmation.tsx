import type { CoachGoalProposal } from '../utils/coachGoals';

export default function CoachGoalConfirmation({ proposal, busy, onConfirm, onDismiss }: {
  proposal: CoachGoalProposal; busy: boolean; onConfirm: () => void; onDismiss: () => void;
}) {
  return <div className="chat-confirmation order-last rounded-xl border border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/20 p-4 text-sm"
    role="group" aria-label="Confirmación de objetivo">
    <p className="font-semibold mb-2">{proposal.operation === 'cancel' ? 'Cancelar objetivo aceptado'
      : proposal.operation === 'update' ? 'Modificar objetivo aceptado' : 'Objetivo propuesto'}</p>
    <p>{proposal.type === 'workout_sessions' ? `${proposal.target} sesiones de entrenamiento`
      : `${proposal.target} días con al menos ${proposal.stepThreshold!.toLocaleString('es-AR')} pasos registrados`}</p>
    <p className="mb-3">Del {proposal.startDate} al {proposal.endDate}.</p>
    {proposal.type === 'workout_sessions' && <p className="mb-3">Cuenta todas las sesiones de entrenamiento registradas del período.</p>}
    <p className="mb-3">{proposal.operation === 'cancel' ? 'Dejarás de seguir este objetivo.'
      : 'Solo se guarda al confirmar. No registra actividades ni cambia tu perfil.'}</p>
    <div className="flex gap-3">
      <button type="button" disabled={busy} onClick={onConfirm} className="rounded-lg px-3 py-2 bg-orange-500 text-white disabled:opacity-50">
        {proposal.operation === 'cancel' ? 'Confirmar cancelación' : proposal.operation === 'update' ? 'Confirmar modificación' : 'Aceptar objetivo'}
      </button>
      <button type="button" disabled={busy} onClick={onDismiss} className="rounded-lg px-3 py-2 border disabled:opacity-50">Descartar propuesta</button>
    </div>
  </div>;
}
