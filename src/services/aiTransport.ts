import { supabase } from '../lib/supabase.ts';

export class AIRequestError extends Error {
  status: number;
  code: string;
  retryAfterSeconds?: number;
  constructor(message: string, status: number, code: string, retryAfterSeconds?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const failure = (status: number, retryAfterSeconds?: number) => {
  const message = status === 401 ? 'Tu sesión expiró. Volvé a iniciar sesión.'
    : status === 429 ? 'Alcanzaste el límite de consultas por hoy para esta modalidad.'
      : status === 400 ? 'Revisá los datos enviados e intentá nuevamente.'
        : 'No pudimos conectar con el asistente. Intentá nuevamente.';
  return new AIRequestError(message, status, status === 401 ? 'unauthorized'
    : status === 429 ? 'quota_exceeded' : 'service_unavailable', retryAfterSeconds);
};

export async function requestAI(body: Record<string, unknown>): Promise<any> {
  let token: string | undefined;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw failure(error.status === 400 || error.status === 401 || error.status === 403 ? 401 : 503);
    token = data.session?.access_token;
  } catch (error) {
    if (error instanceof AIRequestError) throw error;
    throw failure(503);
  }
  if (!token) throw failure(401);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch('/api/ai/chat', { method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => undefined);
    if (!response.ok) {
      const seconds = Number(response.headers.get('Retry-After'));
      throw failure(response.status, Number.isInteger(seconds) && seconds > 0 ? seconds : undefined);
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw failure(502);
    return payload;
  } catch (error) {
    if (error instanceof AIRequestError) throw error;
    throw failure(503);
  } finally { clearTimeout(timer); }
}
