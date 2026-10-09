import { supabaseUrl, supabasePublishableKey } from '../src/lib/supabaseConfig.ts';

export type AIModality = 'text' | 'image' | 'audio';
export interface AIRequestState {
  startedAt: number;
  mode?: 'chat' | 'estimate' | 'transcribe';
  modality?: AIModality;
  providerCalls: number;
  promptTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  usageReportedCalls: number;
}

export class AIError extends Error {
  code: string;
  status: number;
  retryAfterSeconds?: number;
  constructor(code: string, status: number, message: string, retryAfterSeconds?: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function aiErrorResponse(error: unknown): Response {
  const safe = error instanceof AIError ? error : new AIError('internal_error', 500,
    'Ocurrió un error en el asistente. Intentá nuevamente.');
  return Response.json({ error: safe.message, code: safe.code,
    ...(safe.retryAfterSeconds ? { retryAfterSeconds: safe.retryAfterSeconds } : {}) }, {
    status: safe.status,
    headers: { 'Cache-Control': 'no-store', ...(safe.retryAfterSeconds ? { 'Retry-After': String(safe.retryAfterSeconds) } : {}) },
  });
}

async function timedJSON(url: string, options: RequestInit, timeoutMs: number, code: string) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    // Error bodies may contain provider messages, prompts or secrets. Ignore them.
    const data: any = response.ok ? await response.json() : undefined;
    return { response, data };
  } catch (error) {
    throw new AIError(timedOut ? `${code}_timeout` : error instanceof SyntaxError ? `${code}_invalid_response` : `${code}_unavailable`,
      !timedOut && error instanceof SyntaxError && code === 'provider' ? 502 : 503,
      'No pudimos conectar con el asistente. Intentá nuevamente.', 30);
  } finally { clearTimeout(timer); }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function authenticateAIRequest(request: Request): Promise<string> {
  const header = request.headers.get('Authorization') || '';
  const unauthorized = () => new AIError('unauthorized', 401, 'Tu sesión expiró. Volvé a iniciar sesión.');
  if (header.length > 8192) throw unauthorized();
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(header);
  if (!match) throw unauthorized();
  const token = match[1];
  // Official Auth server verification supports both symmetric and asymmetric
  // Supabase signing keys. Never authorize from locally decoded claims alone.
  const { response, data } = await timedJSON(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabasePublishableKey, Authorization: `Bearer ${token}` },
  }, 8000, 'auth');
  if (response.status === 401 || response.status === 403) throw unauthorized();
  if (!response.ok) throw new AIError('auth_unavailable', 503,
    'No pudimos verificar tu sesión. Intentá nuevamente.', 30);
  try {
    // Additional application claim restrictions AFTER provider verification.
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!uuid.test(data?.id) || data.id !== claims.sub || claims.iss !== `${supabaseUrl}/auth/v1`
      || !audience.includes('authenticated') || claims.role !== 'authenticated'
      || !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000
      || (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > Date.now() / 1000))) throw unauthorized();
    return data.id;
  } catch { throw unauthorized(); }
}

const quotaVariables = { text: 'AI_TEXT_DAILY_LIMIT', image: 'AI_IMAGE_DAILY_LIMIT', audio: 'AI_AUDIO_DAILY_LIMIT' };
export async function reserveAIQuota(userId: string, modality: AIModality): Promise<void> {
  const value = process.env[quotaVariables[modality]];
  const limit = value && /^\d+$/.test(value) ? Number(value) : NaN;
  const key = process.env.SUPABASE_AI_SECRET_KEY;
  if (!key || (!key.startsWith('sb_secret_') && key.split('.').length !== 3)
    || !Number.isSafeInteger(limit) || limit < 0 || limit > 2147483647) {
    throw new AIError('ai_configuration', 503, 'El asistente no está disponible temporalmente. Intentá nuevamente.', 60);
  }
  // Only the server's private role may call this RPC or choose limits/identity.
  // Never send the browser's bearer token to the quota RPC.
  const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: key };
  if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
  const { response, data } = await timedJSON(`${supabaseUrl}/rest/v1/rpc/reserve_ai_quota`, {
    method: 'POST', headers, body: JSON.stringify({ p_user_id: userId, p_category: modality, p_limit: limit }),
  }, 5000, 'quota');
  if (!response.ok || typeof data?.allowed !== 'boolean' || !Number.isInteger(data.retry_after_seconds)
    || data.retry_after_seconds < 1 || data.retry_after_seconds > 86400) {
    throw new AIError('quota_unavailable', 503, 'No pudimos verificar tu cupo. Intentá nuevamente.', 60);
  }
  if (!data.allowed) throw new AIError('quota_exceeded', 429,
    'Alcanzaste el límite de consultas por hoy para esta modalidad.', data.retry_after_seconds);
}

export async function fetchGemini(userId: string, modality: AIModality, state: AIRequestState,
  url: string, options: RequestInit): Promise<Response> {
  const configuredTimeout = process.env.AI_GEMINI_TIMEOUT_MS;
  const timeoutMs = configuredTimeout === undefined ? 30000 : Number(configuredTimeout);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) {
    throw new AIError('ai_configuration', 503, 'El asistente no está disponible temporalmente. Intentá nuevamente.', 60);
  }
  const remaining = 55000 - (Date.now() - state.startedAt);
  if (remaining < 5000) throw new AIError('provider_timeout', 503,
    'El asistente tardó demasiado. Intentá nuevamente.', 30);
  await reserveAIQuota(userId, modality);
  if (Date.now() - state.startedAt >= 55000) throw new AIError('provider_timeout', 503,
    'El asistente tardó demasiado. Intentá nuevamente.', 30);
  state.providerCalls++;
  const { response, data } = await timedJSON(url, options,
    Math.max(1, Math.min(timeoutMs, 55000 - (Date.now() - state.startedAt))), 'provider');
  if (!response.ok) {
    const retry = Number(response.headers.get('Retry-After'));
    const seconds = Number.isInteger(retry) && retry > 0 ? Math.min(retry, 3600) : 30;
    throw new AIError(response.status === 429 ? 'provider_rate_limited' : 'provider_unavailable',
      response.status >= 500 || response.status === 429 || response.status === 401 || response.status === 403 ? 503 : 502,
      'El asistente no está disponible temporalmente. Intentá nuevamente.', seconds);
  }
  for (const [field, destination] of [
    ['promptTokenCount', 'promptTokens'], ['candidatesTokenCount', 'outputTokens'], ['totalTokenCount', 'totalTokens'],
  ] as const) {
    const count = data?.usageMetadata?.[field];
    if (Number.isSafeInteger(count) && count >= 0) state[destination] = (state[destination] ?? 0) + count;
  }
  if (['promptTokenCount', 'candidatesTokenCount', 'totalTokenCount'].every(field =>
    Number.isSafeInteger(data?.usageMetadata?.[field]) && data.usageMetadata[field] >= 0)) state.usageReportedCalls++;
  // The existing handler still validates the model-specific payload/schema.
  return Response.json(data);
}

export async function readAIRequest(request: Request): Promise<unknown> {
  if (!request.body) throw new AIError('invalid_request', 400, 'Solicitud inválida.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, 10000);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (timedOut) throw new AIError('invalid_request', 400, 'La solicitud tardó demasiado. Intentá nuevamente.');
      if (done) break;
      size += value.byteLength;
      if (size > 4400000) {
        await reader.cancel();
        throw new AIError('invalid_request', 400, 'La solicitud supera el tamaño permitido.');
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof AIError) throw error;
    throw new AIError('invalid_request', 400, 'Solicitud inválida.');
  } finally { clearTimeout(timer); reader.releaseLock(); }
}

export function logAIRequest(state: AIRequestState, response: Response, code?: string): void {
  // No identity, bearer/key, prompt, history, nutrition data or raw exceptions.
  console.info(JSON.stringify({ event: 'ai_request', endpoint: '/api/ai/chat', status: response.status,
    durationMs: Math.max(0, Date.now() - state.startedAt), mode: state.mode || 'unknown', modality: state.modality || 'unknown',
    result: response.ok ? 'ok' : 'error', category: code || (response.ok ? 'success' : 'invalid_response'),
    providerCalls: state.providerCalls, tokens: { prompt: state.promptTokens, output: state.outputTokens, total: state.totalTokens },
    tokenCoverage: state.usageReportedCalls === 0 ? 'unavailable' : state.usageReportedCalls === state.providerCalls ? 'complete' : 'partial' }));
}
