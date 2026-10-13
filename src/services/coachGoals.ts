import { supabase } from '../lib/supabase.ts';
import { parseCoachGoal, parseGoalProposal, type CoachGoalProposal } from '../utils/coachGoals.ts';

export async function confirmCoachGoal(proposal: CoachGoalProposal, today: string, expectedUserId: string) {
  const safe = parseGoalProposal(proposal);
  if (!safe) throw new Error('Revisá el objetivo antes de confirmar.');
  let accessToken: string;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token || data.session.user?.id !== expectedUserId) throw new Error();
    accessToken = data.session.access_token;
  } catch { throw new Error('Tu sesión cambió o no pudo verificarse. Volvé a consultar el objetivo antes de confirmar.'); }
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch('/api/coach/goals', { method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ today, proposal: safe }) });
    const payload = await response.json().catch(() => undefined);
    if (!response.ok) throw new Error(response.status === 409
      ? 'El objetivo cambió o ya existe. Consultalo nuevamente antes de confirmar.'
      : response.status === 401 ? 'Tu sesión expiró. Volvé a iniciar sesión.'
        : 'No se pudo guardar el objetivo. No se confirmó ningún cambio; intentá nuevamente.');
    const goal = parseCoachGoal(payload?.goal);
    if (!goal || goal.id !== safe.id || (safe.expectedVersion !== undefined && goal.version !== safe.expectedVersion + 1)
      || (safe.operation === 'cancel' ? goal.status !== 'cancelled'
      : goal.status !== 'active' || goal.type !== safe.type || goal.target !== safe.target || goal.stepThreshold !== safe.stepThreshold
        || goal.startDate !== safe.startDate || goal.endDate !== safe.endDate)) throw new Error('El servidor no confirmó el objetivo. Consultalo antes de reintentar.');
    return goal;
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith('El objetivo') || error.message.startsWith('Tu sesión')
      || error.message.startsWith('No se pudo') || error.message.startsWith('El servidor'))) throw error;
    throw new Error('No se pudo confirmar el guardado. Consultá tus objetivos antes de reintentar.');
  } finally { clearTimeout(timer); }
}
