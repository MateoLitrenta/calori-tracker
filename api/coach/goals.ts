import { authenticateAIRequest, aiErrorResponse, AIError, readAIRequest } from '../../server/aiSecurity.ts';
import { coachGoalsEnabled, readCoachGoals, saveCoachGoal } from '../../server/coachGoals.ts';
import { isGoalDate } from '../../src/utils/coachGoals.ts';

export default { async fetch(request: Request): Promise<Response> {
  try {
    if (!['GET', 'POST'].includes(request.method)) throw new AIError('method_not_allowed', 405, 'Método no permitido.');
    const userId = await authenticateAIRequest(request);
    if (!coachGoalsEnabled()) throw new AIError('goals_disabled', 503, 'Los objetivos persistentes todavía no están habilitados.');
    const result = request.method === 'GET' ? await readCoachGoals(request, userId) : await (async () => {
      if (Number(request.headers.get('Content-Length')) > 4096) throw new AIError('invalid_goal', 400, 'Solicitud de objetivo demasiado grande.');
      const body = await readAIRequest(request) as { today?: unknown; proposal?: unknown };
      if (!body || typeof body !== 'object' || JSON.stringify(body).length > 4096 || !isGoalDate(body.today)) {
        throw new AIError('invalid_goal', 400, 'Solicitud de objetivo inválida.');
      }
      return { goal: await saveCoachGoal(request, userId, body.proposal, body.today) };
    })();
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return aiErrorResponse(error); }
} };
