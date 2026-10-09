import { supabase } from '../../src/lib/supabase.ts';
import { supabaseUrl } from '../../src/lib/supabaseConfig.ts';

export const testUserId = '00000000-0000-0000-0000-000000000001';
export const testAccessToken = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({
  sub: testUserId, iss: `${supabaseUrl}/auth/v1`, role: 'authenticated', aud: 'authenticated',
  exp: Math.floor(Date.now() / 1000) + 3600,
})).toString('base64url'), 'synthetic_signature'].join('.');

// Provider mocks are intentionally restricted to these two infrastructure URLs.
// Authorization itself is tested against the unwrapped handler in ai-security.
process.env.SUPABASE_AI_SECRET_KEY = 'sb_secret_test_only';
process.env.AI_TEXT_DAILY_LIMIT = '30';
process.env.AI_IMAGE_DAILY_LIMIT = '10';
process.env.AI_AUDIO_DAILY_LIMIT = '10';
supabase.auth.getSession = async () => ({ data: { session: { access_token: testAccessToken } }, error: null });

export function withAIInfrastructure(modelFetch) {
  return async (url, options) => {
    if (url === `${supabaseUrl}/auth/v1/user`) return Response.json({ id: testUserId });
    if (url === `${supabaseUrl}/rest/v1/rpc/reserve_ai_quota`) return Response.json({ allowed: true, retry_after_seconds: 3600 });
    return modelFetch(url, options);
  };
}

export function authorizedAIHandler(handler) {
  return { async fetch(request) {
    const headers = new Headers(request.headers);
    headers.set('Authorization', `Bearer ${testAccessToken}`);
    const authenticated = request instanceof Request ? new Request(request, { headers }) : { ...request, headers };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = withAIInfrastructure(originalFetch);
    try { return await handler.fetch(authenticated); }
    finally { globalThis.fetch = originalFetch; }
  } };
}
